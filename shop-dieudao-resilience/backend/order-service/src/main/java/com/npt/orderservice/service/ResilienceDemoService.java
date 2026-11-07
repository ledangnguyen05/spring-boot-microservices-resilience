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

import java.util.LinkedHashMap;
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
    private final ResilienceKit kit;

    public ResilienceDemoService(UserResilientClient userClient, ResilienceKit kit) {
        this.userClient = userClient;
        this.kit = kit;
    }

    // =====================================================================
    // DEMO 1: TIMEOUT
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
    // DEMO 2: RETRY
    // Vấn đề : lỗi thoáng qua (mạng chớp, instance đang khởi động) -> gọi lại là khỏi.
    // Giải pháp: Retry tối đa 3 lần, chờ 500ms -> 1000ms (exponential backoff).
    // Thử    : user-service/chaos?failFirstN=2  => lần 3 thành công.
    //          user-service/chaos?failFirstN=5  => hết 3 lần vẫn lỗi.
    // =====================================================================
    public DemoResult retry(Long userId) {
        AtomicInteger attempts = new AtomicInteger();
        return run("2-RETRY", attempts, false, userId, () -> {
            Supplier<UserResponseDTO> call = () -> callUser("retry", userId, attempts);
            return Decorators.ofSupplier(call)
                    .withRetry(kit.retryOnly())
                    .get();
        });
    }

    // =====================================================================
    // DEMO 3: BULKHEAD
    // Vấn đề : 1 endpoint chậm chiếm hết thread -> các endpoint khác chết theo (như vách ngăn tàu).
    // Giải pháp: tối đa N request đồng thời vào user-service, dư thì từ chối NGAY (429).
    // Thử    : chaos?delayMs=2000 rồi /demo/burst/bulkhead?n=10
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
    // Thử    : chaos?failPercent=100 rồi gọi /demo/circuit-breaker/1 liên tục.
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
    // Tiện ích
    // =====================================================================

    /** Chạy 1 demo theo tên (dùng cho /burst). */
    public DemoResult dispatch(String pattern, Long userId) {
        return switch (pattern) {
            case "timeout" -> timeout(userId);
            case "retry" -> retry(userId);
            case "bulkhead" -> bulkhead(userId);
            case "circuit-breaker" -> circuitBreaker(userId);
            case "combined" -> combined(userId, true);
            case "combined-nofallback" -> combined(userId, false);
            default -> throw new IllegalArgumentException(
                    "pattern phải là: timeout | retry | bulkhead | circuit-breaker | combined | combined-nofallback");
        };
    }

    /** Xem trạng thái hiện tại của mọi pattern. */
    public Map<String, Object> status() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("circuitBreaker_demo4", cb(kit.cbOnly()));
        m.put("circuitBreaker_combined", cb(kit.cbCombined()));

        Map<String, Object> bh = new LinkedHashMap<>();
        bh.put("maxConcurrentCalls", kit.bulkheadOnly().getBulkheadConfig().getMaxConcurrentCalls());
        bh.put("availableConcurrentCalls", kit.bulkheadOnly().getMetrics().getAvailableConcurrentCalls());
        m.put("bulkhead_demo3", bh);

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

    /** Đưa cả 2 circuit breaker về CLOSED, xóa số liệu - để demo lại từ đầu. */
    public Map<String, Object> reset() {
        kit.cbOnly().reset();
        kit.cbCombined().reset();
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
                outcome = "FEIGN_TIMEOUT"; status = 504;
                msg = "Feign không kết nối/đọc được (connect/read timeout): " + fe.getMessage();
            } else {
                outcome = "UPSTREAM_4XX"; status = 502;
                msg = "user-service trả lỗi HTTP " + fe.status();
            }
        } else if (t.getClass().getSimpleName().contains("Timeout")) {
            outcome = "TIMEOUT"; status = 504;
            msg = "Hết thời gian chờ: " + t.getClass().getSimpleName();
        } else {
            outcome = "ERROR"; status = 500;
            msg = t.getClass().getSimpleName() + ": " + t.getMessage();
        }
        return new DemoResult(pattern, outcome, status, msg, null, attempts, elapsed, false);
    }
}

