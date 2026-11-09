package com.npt.orderservice.service;

import com.npt.orderservice.client.UserResilientClient;
import com.npt.orderservice.dto.DemoResult;
import com.npt.orderservice.dto.UserResponseDTO;
import feign.FeignException;
import io.github.resilience4j.bulkhead.BulkheadFullException;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.decorators.Decorators;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import static com.npt.orderservice.service.ResilienceKit.unwrap;

/**
 * 5 demo:
 *   1. TIMEOUT          - TimeLimiter
 *   2. RETRY            - Retry + exponential backoff
 *   3. BULKHEAD         - Semaphore bulkhead (giới hạn số request đồng thời)
 *   4. CIRCUIT BREAKER  - ngắt mạch khi user-service sập
 *   5. COMBINED         - Retry( CircuitBreaker( TimeLimiter( ThreadPoolBulkhead( call ) ) ) ) + fallback
 */
@Service
public class ResilienceDemoService {

    private static final Logger log = LoggerFactory.getLogger(ResilienceDemoService.class);

    /** Một lần chạy demo: có thể ném bất kỳ lỗi nào, kết quả là user. */
    @FunctionalInterface
    private interface Execution {
        UserResponseDTO run() throws Exception;
    }

    private final UserResilientClient userClient;
    private final com.npt.orderservice.client.UserConvergeClient convergeClient;
    private final ResilienceKit kit;
    private final org.springframework.web.client.RestClient restClient;
    private final org.springframework.retry.support.RetryTemplate springRetryTemplate;

    public ResilienceDemoService(UserResilientClient userClient,
                                 com.npt.orderservice.client.UserConvergeClient convergeClient,
                                 ResilienceKit kit,
                                 org.springframework.web.client.RestClient restClient,
                                 org.springframework.retry.support.RetryTemplate springRetryTemplate) {
        this.userClient = userClient;
        this.convergeClient = convergeClient;
        this.kit = kit;
        this.restClient = restClient;
        this.springRetryTemplate = springRetryTemplate;
    }

    // =====================================================================
    // DEMO 0: KHÔNG BẢO VỆ (Baseline - Để đối chứng khi thiếu Resilience)
    // Gọi thẳng sang user-service không bọc bất kỳ cơ chế bảo vệ nào.
    // =====================================================================
    public DemoResult noProtection(Long userId) {
        AtomicInteger attempts = new AtomicInteger();
        return run("0-NO-PROTECTION", attempts, false, userId, () -> {
            return callUser("no-protection", userId, attempts);
        });
    }

    // =====================================================================
    // DEMO 1a: FEIGN TIMEOUT (Read Timeout 3s - Đúng chuẩn Topic 1)
    // Gọi thẳng OpenFeign client không qua Decorator nào; khi User Service trễ 4s,
    // Feign tự cắt sau 3s (readTimeout) và trả lỗi 504 FEIGN_TIMEOUT.
    // =====================================================================
    public DemoResult feignTimeout(Long userId) {
        AtomicInteger attempts = new AtomicInteger();
        return run("1a-FEIGN-TIMEOUT", attempts, false, userId, () -> {
            return callUser("feign-timeout", userId, attempts);
        });
    }

    // =====================================================================
    // DEMO 1c: RESTCLIENT TIMEOUT (Read Timeout 2.5s qua Spring 6 RestClient)
    // Minh họa trọn vẹn chủ đề "Feign / RestClient timeout":
    // Dùng SimpleClientHttpRequestFactory cấu hình readTimeout 2500ms.
    // =====================================================================
    public DemoResult restClientTimeout(Long userId) {
        AtomicInteger attempts = new AtomicInteger();
        return run("1c-RESTCLIENT-TIMEOUT", attempts, false, userId, () -> {
            attempts.incrementAndGet();
            return restClient.get()
                    .uri("/{userId}", userId)
                    .retrieve()
                    .body(UserResponseDTO.class);
        });
    }

    // =====================================================================
    // DEMO 1b: TIMEOUT (TimeLimiter 1.5s - Lớp bảo vệ thứ 2)
    // Vấn đề : user-service chậm -> thread của order-service bị treo chờ.
    // Giải pháp: TimeLimiter cắt sau demo.timeout.duration-ms (1.5s), trả lỗi 504 ngay.
    // Lưu ý  : TimeLimiter chỉ "bỏ chờ" - request bên dưới vẫn chạy tới khi Feign readTimeout (3s) cắt.
    // =====================================================================
    public DemoResult timeout(Long userId) {
        AtomicInteger attempts = new AtomicInteger();
        return run("1-TIMEOUT", attempts, false, userId, () -> {
            Supplier<CompletionStage<UserResponseDTO>> async = () ->
                    CompletableFuture.supplyAsync(() -> callUser("timeout", userId, attempts), kit.asyncExecutor());

            CompletionStage<UserResponseDTO> stage = Decorators.ofCompletionStage(async)
                    .withTimeLimiter(kit.timeoutOnly(), kit.scheduler())
                    .get();
            return stage.toCompletableFuture().get(30, TimeUnit.SECONDS);
        });
    }

    // =====================================================================
    // DEMO 2: RETRY (Resilience4j Retry)
    // Vấn đề : lỗi thoáng qua (mạng chớp, instance đang khởi động) -> gọi lại là khỏi.
    // Giải pháp: Retry tối đa 3 lần, chờ 500ms -> 1000ms (exponential backoff).
    // Thử    : POST /api/chaos?failFirstN=2  => lần 3 thành công.
    //          POST /api/chaos?failFirstN=5  => hết 3 lần vẫn lỗi.
    // =====================================================================
    public DemoResult retry(Long userId) {
        AtomicInteger attempts = new AtomicInteger();
        List<DemoResult.RetryAttempt> attemptResults = new ArrayList<>();
        DemoResult result = run("2-RETRY", attempts, false, userId, () -> {
            Supplier<UserResponseDTO> call = () -> {
                long start = System.nanoTime();
                try {
                    UserResponseDTO user = callUser("retry", userId, attempts);
                    long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
                    attemptResults.add(new DemoResult.RetryAttempt(attempts.get(), 200, "OK", elapsed));
                    return user;
                } catch (RuntimeException failure) {
                    Throwable cause = unwrap(failure);
                    Integer status = cause instanceof FeignException feign && feign.status() > 0
                            ? feign.status() : null;
                    long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
                    String outcome = toFailure("2-RETRY", cause, attempts.get(), elapsed).outcome();
                    attemptResults.add(new DemoResult.RetryAttempt(attempts.get(), status, outcome, elapsed));
                    throw failure;
                }
            };
            return Decorators.ofSupplier(call)
                    .withRetry(kit.retryOnly())
                    .get();
        });
        return new DemoResult(
                result.pattern(),
                result.outcome(),
                result.httpStatus(),
                result.message() + " [Thư viện: Resilience4j Retry · Decorators.withRetry]",
                result.user(),
                result.attempts(),
                result.elapsedMs(),
                result.fallback(),
                attemptResults
        );
    }

    // =====================================================================
    // DEMO 2b: SPRING RETRY (qua Spring RetryTemplate với Exponential Backoff)
    // Minh họa trọn vẹn chủ đề "Spring Retry / Resilience4j Retry":
    // Dùng RetryTemplate của Spring Retry với maxAttempts=3, backoff 500ms, 1000ms.
    // =====================================================================
    public DemoResult springRetry(Long userId) {
        AtomicInteger attempts = new AtomicInteger();
        List<DemoResult.RetryAttempt> attemptResults = new ArrayList<>();
        DemoResult result = run("2b-SPRING-RETRY", attempts, false, userId, () -> {
            return springRetryTemplate.execute(context -> {
                long start = System.nanoTime();
                try {
                    UserResponseDTO user = callUser("spring-retry", userId, attempts);
                    long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
                    attemptResults.add(new DemoResult.RetryAttempt(attempts.get(), 200, "OK", elapsed));
                    return user;
                } catch (RuntimeException failure) {
                    Throwable cause = unwrap(failure);
                    Integer status = cause instanceof FeignException feign && feign.status() > 0 ? feign.status() : null;
                    long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
                    String outcome = toFailure("2b-SPRING-RETRY", cause, attempts.get(), elapsed).outcome();
                    attemptResults.add(new DemoResult.RetryAttempt(attempts.get(), status, outcome, elapsed));
                    log.warn("[SPRING-RETRY RetryTemplate] lần thử #{} (retryCount={}) thất bại ({})",
                            attempts.get(), context.getRetryCount(), cause.getClass().getSimpleName());
                    throw failure;
                }
            });
        });
        return new DemoResult(
                result.pattern(),
                result.outcome(),
                result.httpStatus(),
                result.message() + " [Thư viện: Spring Retry · RetryTemplate.execute]",
                result.user(),
                result.attempts(),
                result.elapsedMs(),
                result.fallback(),
                attemptResults
        );
    }

    // =====================================================================
    // DEMO 3: BULKHEAD
    // Vấn đề : 1 endpoint chậm chiếm hết thread -> các endpoint khác chết theo (như vách ngăn tàu).
    // Giải pháp: tối đa N request đồng thời vào user-service, dư thì từ chối NGAY (429).
    // Thử    : /api/chaos?delayMs=2000 rồi /api/orders/resilience/burst/bulkhead?n=10
    // =====================================================================
    public DemoResult bulkhead(Long userId) {
        AtomicInteger attempts = new AtomicInteger();
        return run("3-BULKHEAD", attempts, false, userId, () -> {
            Supplier<UserResponseDTO> call = () -> callUser("bulkhead", userId, attempts);
            return Decorators.ofSupplier(call)
                    .withBulkhead(kit.bulkheadOnly())
                    .get();
        });
    }

    // =====================================================================
    // DEMO 4: CIRCUIT BREAKER
    // Vấn đề : user-service sập mà vẫn dồn request vào -> chờ vô ích, càng làm nó khó hồi phục.
    // Giải pháp: CLOSED -> (>=50% lỗi trong 5 lần gần nhất) -> OPEN: fail-fast 503
    //            -> sau 10s HALF_OPEN: thử 2 request -> khỏe thì CLOSED, lỗi thì OPEN lại.
    // Thử    : /api/chaos?failPercent=100 rồi gọi /api/orders/resilience/circuit-breaker/1 liên tục.
    // =====================================================================
    public DemoResult circuitBreaker(Long userId) {
        AtomicInteger attempts = new AtomicInteger();
        return run("4-CIRCUIT-BREAKER", attempts, false, userId, () -> {
            Supplier<UserResponseDTO> call = () -> callUser("cb", userId, attempts);
            return Decorators.ofSupplier(call)
                    .withCircuitBreaker(kit.cbOnly())
                    .get();
        });
    }

    // =====================================================================
    // DEMO 5: KẾT HỢP CẢ 4
    //
    //   request ──► RETRY ──► CIRCUIT BREAKER ──► TIMEOUT ──► BULKHEAD ──► user-service
    //   (ngoài cùng)                                          (trong cùng)
    //
    // Thứ tự Decorators: with* gọi SAU thì bọc ở NGOÀI.
    //   - Bulkhead (trong cùng) : giới hạn số lời gọi thật sự sang user-service
    //   - TimeLimiter           : giới hạn thời gian của MỖI lần gọi
    //   - CircuitBreaker        : mỗi lần (kể cả retry) đều được ghi nhận -> mạch mở khi lỗi nhiều
    //   - Retry (ngoài cùng)    : thử lại khi lỗi; KHÔNG retry khi CB mở / bulkhead đầy
    //   - Fallback              : cuối cùng, lỗi gì cũng trả user dự phòng thay vì 5xx
    // =====================================================================
    public DemoResult combined(Long userId, boolean useFallback) {
        AtomicInteger attempts = new AtomicInteger();
        return run("5-COMBINED", attempts, useFallback, userId, () -> {
            Supplier<UserResponseDTO> call = () -> callUser("combined", userId, attempts);

            CompletionStage<UserResponseDTO> stage = Decorators.ofSupplier(call)
                    .withThreadPoolBulkhead(kit.tpbCombined())          // 1. trong cùng
                    .withTimeLimiter(kit.tlCombined(), kit.scheduler()) // 2.
                    .withCircuitBreaker(kit.cbCombined())               // 3.
                    .withRetry(kit.retryCombined(), kit.scheduler())    // 4. ngoài cùng
                    .get();
            return stage.toCompletableFuture().get(30, TimeUnit.SECONDS);
        });
    }

    // =====================================================================
    // DEMO 6: HỘI TỤ CẢ 4 TOPIC (Feign timeout + Bulkhead + Circuit Breaker + Retry)
    //
    //   request ──► RETRY ──► CIRCUIT BREAKER ──► BULKHEAD ──► Feign (readTimeout 1s) ──► user-service
    //   (ngoài cùng)                                                        (trong cùng)
    //
    //   - Feign timeout : cắt MỖI lần gọi sau 1s -> biến "treo" thành lỗi rõ ràng (FeignException).
    //   - Bulkhead      : tối đa 3 lời gọi đồng thời; dư thì BulkheadFullException (Retry KHÔNG thử lại).
    //   - CircuitBreaker: ghi nhận mọi lần gọi (kể cả các lần retry); lỗi nhiều -> OPEN.
    //   - Retry         : thử lại lỗi thoáng qua; KHÔNG thử lại khi CB đã OPEN.
    // Không dùng TimeLimiter / fallback: để chỉ đúng 4 topic của seminar tham gia.
    // Kịch bản chi tiết (4 pha) xem LY_THUYET_VA_THUAT_NGU.md, mục 6.
    // =====================================================================
    public DemoResult converge(Long userId) {
        AtomicInteger attempts = new AtomicInteger();
        return run("6-CONVERGE-4IN1", attempts, false, userId, () -> {
            Supplier<UserResponseDTO> call = () -> {
                int n = attempts.incrementAndGet();
                log.info("[converge] gọi user-service lần #{} (thread={})", n, Thread.currentThread().getName());
                return convergeClient.getUserById(userId);
            };
            return Decorators.ofSupplier(call)
                    .withBulkhead(kit.bulkheadConverge())        // 1. trong cùng (ngay trên Feign timeout)
                    .withCircuitBreaker(kit.cbConverge())        // 2.
                    .withRetry(kit.retryConverge())              // 3. ngoài cùng
                    .get();
        });
    }

    // =====================================================================
    // Tiện ích
    // =====================================================================

    /** Chạy 1 demo theo tên (dùng cho /burst). */
    public DemoResult dispatch(String pattern, Long userId) {
        return switch (pattern) {
            case "feign-timeout" -> feignTimeout(userId);
            case "restclient-timeout" -> restClientTimeout(userId);
            case "converge" -> converge(userId);
            case "timeout" -> timeout(userId);
            case "retry" -> retry(userId);
            case "spring-retry" -> springRetry(userId);
            case "bulkhead" -> bulkhead(userId);
            case "circuit-breaker" -> circuitBreaker(userId);
            case "combined" -> combined(userId, true);
            case "combined-nofallback" -> combined(userId, false);
            case "no-protection" -> noProtection(userId);
            default -> throw new IllegalArgumentException(
                    "pattern phải là: feign-timeout | restclient-timeout | timeout | retry | spring-retry | bulkhead | circuit-breaker | converge | combined | combined-nofallback | no-protection");
        };
    }

    /** Xem trạng thái hiện tại của mọi pattern. */
    public Map<String, Object> status() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("circuitBreaker_demo4", cb(kit.cbOnly()));
        m.put("circuitBreaker_combined", cb(kit.cbCombined()));
        m.put("circuitBreaker_converge", cb(kit.cbConverge()));

        Map<String, Object> bh = new LinkedHashMap<>();
        bh.put("maxConcurrentCalls", kit.bulkheadOnly().getBulkheadConfig().getMaxConcurrentCalls());
        bh.put("availableConcurrentCalls", kit.bulkheadOnly().getMetrics().getAvailableConcurrentCalls());
        m.put("bulkhead_demo3", bh);

        Map<String, Object> bhc = new LinkedHashMap<>();
        bhc.put("maxConcurrentCalls", kit.bulkheadConverge().getBulkheadConfig().getMaxConcurrentCalls());
        bhc.put("availableConcurrentCalls", kit.bulkheadConverge().getMetrics().getAvailableConcurrentCalls());
        m.put("bulkhead_converge", bhc);

        Map<String, Object> tpb = new LinkedHashMap<>();
        tpb.put("threadPoolSize", kit.tpbCombined().getMetrics().getThreadPoolSize());
        tpb.put("queueDepth", kit.tpbCombined().getMetrics().getQueueDepth());
        tpb.put("remainingQueueCapacity", kit.tpbCombined().getMetrics().getRemainingQueueCapacity());
        m.put("threadPoolBulkhead_combined", tpb);
        return m;
    }

    private Map<String, Object> cb(CircuitBreaker cb) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("state", cb.getState().name());
        m.put("failureRatePercent", cb.getMetrics().getFailureRate()); // -1 = chưa đủ số lần gọi tối thiểu
        m.put("bufferedCalls", cb.getMetrics().getNumberOfBufferedCalls());
        m.put("failedCalls", cb.getMetrics().getNumberOfFailedCalls());
        m.put("notPermittedCalls", cb.getMetrics().getNumberOfNotPermittedCalls());
        return m;
    }

    /** Đưa các circuit breaker về CLOSED, xóa số liệu - để demo lại từ đầu. */
    public Map<String, Object> reset() {
        kit.cbOnly().reset();
        kit.cbCombined().reset();
        kit.cbConverge().reset();
        return status();
    }

    /** Lời gọi thật sang user-service; mỗi lần chạy tăng bộ đếm attempts. */
    private UserResponseDTO callUser(String tag, Long userId, AtomicInteger attempts) {
        int n = attempts.incrementAndGet();
        log.info("[{}] gọi user-service lần #{} (thread={})", tag, n, Thread.currentThread().getName());
        return userClient.getUserById(userId);
    }

    /** Chạy 1 demo, đo thời gian, đổi mọi kết quả/lỗi thành DemoResult. */
    private DemoResult run(String pattern, AtomicInteger attempts, boolean useFallback, Long userId, Execution execution) {
        long begin = System.currentTimeMillis();
        try {
            UserResponseDTO user = execution.run();
            return new DemoResult(pattern, "OK", 200,
                    "Thành công sau " + attempts.get() + " lần gọi sang user-service",
                    user, attempts.get(), System.currentTimeMillis() - begin, false);
        } catch (Throwable e) {
            Throwable cause = unwrap(e);
            long elapsed = System.currentTimeMillis() - begin;
            DemoResult failed = toFailure(pattern, cause, attempts.get(), elapsed);
            log.warn("[{}] thất bại: {} -> {} ({}ms, {} lần gọi thật)",
                    pattern, cause.getClass().getSimpleName(), failed.outcome(), elapsed, attempts.get());
            if (useFallback) {
                return new DemoResult(pattern, "FALLBACK", 200,
                    "FALLBACK vì " + failed.outcome() + " - " + failed.message(),
                    new UserResponseDTO(userId, "Khách (dự phòng)", "Chưa có địa chỉ"),
                    attempts.get(), elapsed, true);
            }
            return failed;
        }
    }

    private DemoResult toFailure(String pattern, Throwable t, int attempts, long elapsed) {
        String outcome;
        int status;
        String msg;
        if (t instanceof CallNotPermittedException) {
            outcome = "CIRCUIT_OPEN"; status = 503;
            msg = "Mạch đang MỞ: từ chối ngay, không gọi sang user-service (fail-fast)";
        } else if (t instanceof BulkheadFullException) {
            outcome = "BULKHEAD_FULL"; status = 429;
            msg = "Bulkhead đã đầy: quá số request đồng thời cho phép, bị từ chối ngay";
        } else if (t instanceof TimeoutException) {
            outcome = "TIMEOUT"; status = 504;
            msg = "TimeLimiter cắt: user-service không trả lời kịp";
        } else if (t instanceof FeignException fe) {
            if (fe.status() >= 500) {
                outcome = "UPSTREAM_5XX"; status = 502;
                msg = "user-service trả lỗi HTTP " + fe.status();
            } else if (fe.status() < 0) {
                Throwable cause = fe.getCause();
                boolean isConnect = false;
                boolean isSocketTimeout = false;
                Throwable cur = cause;
                while (cur != null) {
                    if (cur instanceof ConnectException || (cur.getMessage() != null && cur.getMessage().contains("Connection refused"))) {
                        isConnect = true;
                        break;
                    }
                    if (cur instanceof SocketTimeoutException || (cur.getMessage() != null && cur.getMessage().toLowerCase().contains("timed out"))) {
                        isSocketTimeout = true;
                        break;
                    }
                    cur = cur.getCause();
                }

                if (isConnect) {
                    outcome = "UPSTREAM_DOWN"; status = 503;
                    msg = "Không thể kết nối đến User Service (Connection refused - server đang tắt hoặc sai cổng)";
                } else if (isSocketTimeout) {
                    outcome = "FEIGN_TIMEOUT"; status = 504;
                    msg = "Feign read timeout: User Service không phản hồi kịp sau 3s (" + fe.getMessage() + ")";
                } else {
                    outcome = "FEIGN_TIMEOUT"; status = 504;
                    msg = "Feign không kết nối/đọc được: " + fe.getMessage();
                }
            } else {
                outcome = "UPSTREAM_4XX"; status = 502;
                msg = "user-service trả lỗi HTTP " + fe.status();
            }
        } else if (t instanceof org.springframework.web.client.ResourceAccessException) {
            boolean isConnect = false;
            Throwable cur = t.getCause();
            while (cur != null) {
                if (cur instanceof ConnectException || (cur.getMessage() != null && cur.getMessage().contains("Connection refused"))) {
                    isConnect = true;
                    break;
                }
                cur = cur.getCause();
            }
            if (isConnect) {
                outcome = "UPSTREAM_DOWN"; status = 503;
                msg = "RestClient không thể kết nối đến User Service (server đang tắt hoặc sai cổng)";
            } else {
                outcome = "RESTCLIENT_TIMEOUT"; status = 504;
                msg = "RestClient read timeout (2.5s): " + (t.getCause() != null ? t.getCause().getMessage() : t.getMessage());
            }
        } else if (t.getClass().getSimpleName().contains("Timeout")) {
            outcome = "TIMEOUT"; status = 504;
            msg = "TimeLimiter hết giờ (1.5s): " + (t.getCause() != null ? t.getCause().getMessage() : t.getMessage());
        } else {
            outcome = "ERROR"; status = 500;
            msg = t.getClass().getSimpleName() + ": " + t.getMessage();
        }
        return new DemoResult(pattern, outcome, status, msg, null, attempts, elapsed, false);
    }
}

