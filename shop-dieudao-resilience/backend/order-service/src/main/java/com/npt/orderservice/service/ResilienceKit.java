package com.npt.orderservice.service;

import feign.FeignException;
import io.github.resilience4j.bulkhead.Bulkhead;
import io.github.resilience4j.bulkhead.BulkheadConfig;
import io.github.resilience4j.bulkhead.BulkheadFullException;
import io.github.resilience4j.bulkhead.ThreadPoolBulkhead;
import io.github.resilience4j.bulkhead.ThreadPoolBulkheadConfig;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.core.IntervalFunction;
import io.github.resilience4j.retry.Retry;
import io.github.resilience4j.retry.RetryConfig;
import io.github.resilience4j.timelimiter.TimeLimiter;
import io.github.resilience4j.timelimiter.TimeLimiterConfig;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.function.Predicate;

/**
 * "Hộp đồ nghề" Resilience4j: tạo sẵn mọi TimeLimiter / Retry / Bulkhead / CircuitBreaker.
 *
 * Mỗi demo đơn lẻ dùng instance RIÊNG (để trạng thái không dây sang nhau),
 * riêng demo KẾT HỢP dùng bộ "combined" gồm cả 4 pattern.
 *
 * Dùng Resilience4j core + Decorators (không dùng annotation / autoconfig)
 * nên thứ tự lồng nhau nhìn thấy rõ trong code ở ResilienceDemoService.
 */
@Component
public class ResilienceKit {

    private static final Logger log = LoggerFactory.getLogger(ResilienceKit.class);

    // ---------- hạ tầng thread ----------
    /** Lập lịch cho TimeLimiter (đếm giờ timeout) và Retry bất đồng bộ (chờ backoff). */
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(4);
    /** Chạy lời gọi bất đồng bộ cho demo 1 (timeout) - để TimeLimiter có Future mà cắt. */
    private final ExecutorService asyncExecutor = Executors.newFixedThreadPool(20);

    // ---------- DEMO 1: TIMEOUT ----------
    private final TimeLimiter timeoutOnly;

    // ---------- DEMO 2: RETRY ----------
    private final Retry retryOnly;

    // ---------- DEMO 3: BULKHEAD (semaphore) ----------
    private final Bulkhead bulkheadOnly;

    // ---------- DEMO 4: CIRCUIT BREAKER ----------
    private final CircuitBreaker cbOnly;

    // ---------- DEMO 5: KẾT HỢP CẢ 4 ----------
    private final ThreadPoolBulkhead tpbCombined;
    private final TimeLimiter tlCombined;
    private final CircuitBreaker cbCombined;
    private final Retry retryCombined;

    // ---------- DEMO 6: HỘI TỤ 4 TOPIC (Retry > CircuitBreaker > Bulkhead > Feign timeout) ----------
    private final Bulkhead bulkheadConverge;
    private final CircuitBreaker cbConverge;
    private final Retry retryConverge;

    public ResilienceKit(
            @Value("${demo.timeout.duration-ms:1500}") long timeoutMs,
            @Value("${demo.retry.max-attempts:3}") int maxAttempts,
            @Value("${demo.retry.initial-wait-ms:500}") long retryWaitMs,
            @Value("${demo.retry.multiplier:2.0}") double retryMultiplier,
            @Value("${demo.bulkhead.max-concurrent:3}") int bulkheadMax,
            @Value("${demo.tpb.core-threads:3}") int tpbCore,
            @Value("${demo.tpb.max-threads:3}") int tpbMax,
            @Value("${demo.tpb.queue-capacity:2}") int tpbQueue,
            @Value("${demo.cb.window-size:5}") int cbWindow,
            @Value("${demo.cb.failure-rate-threshold:50}") float cbThreshold,
            @Value("${demo.cb.open-wait-seconds:10}") long cbOpenSeconds,
            @Value("${demo.cb.half-open-calls:2}") int cbHalfOpenCalls) {

        TimeLimiterConfig tlConfig = TimeLimiterConfig.custom()
                .timeoutDuration(Duration.ofMillis(timeoutMs))
                .cancelRunningFuture(true)
                .build();

        RetryConfig retryConfig = RetryConfig.custom()
                .maxAttempts(maxAttempts)
                // chờ 500ms, rồi 1000ms, 2000ms... (exponential backoff)
                .intervalFunction(IntervalFunction.ofExponentialBackoff(retryWaitMs, retryMultiplier))
                .retryOnException(retryable())
                .build();

        BulkheadConfig bulkheadConfig = BulkheadConfig.custom()
                .maxConcurrentCalls(bulkheadMax)
                .maxWaitDuration(Duration.ZERO) // hết chỗ là từ chối ngay, không xếp hàng
                .build();

        ThreadPoolBulkheadConfig tpbConfig = ThreadPoolBulkheadConfig.custom()
                .coreThreadPoolSize(tpbCore)
                .maxThreadPoolSize(tpbMax)
                .queueCapacity(tpbQueue)
                .build();

        CircuitBreakerConfig cbConfig = CircuitBreakerConfig.custom()
                .slidingWindowType(CircuitBreakerConfig.SlidingWindowType.COUNT_BASED)
                .slidingWindowSize(cbWindow)
                .minimumNumberOfCalls(cbWindow)
                .failureRateThreshold(cbThreshold)
                .waitDurationInOpenState(Duration.ofSeconds(cbOpenSeconds))
                .permittedNumberOfCallsInHalfOpenState(cbHalfOpenCalls)
                .automaticTransitionFromOpenToHalfOpenEnabled(true)
                // lỗi 4xx là lỗi của người gọi, không phải service sập -> không tính vào CB
                // quá tải cục bộ (bulkhead đầy) cũng không phải lỗi của user-service
                .ignoreException(t -> isClientError(unwrap(t)) || unwrap(t) instanceof BulkheadFullException)
                .build();

        this.timeoutOnly = TimeLimiter.of("demo1-timeout", tlConfig);

        this.retryOnly = Retry.of("demo2-retry", retryConfig);
        logRetry("demo2-retry", retryOnly);

        this.bulkheadOnly = Bulkhead.of("demo3-bulkhead", bulkheadConfig);

        this.cbOnly = CircuitBreaker.of("demo4-cb", cbConfig);
        logCircuitBreaker("demo4-cb", cbOnly);

        this.tpbCombined = ThreadPoolBulkhead.of("combined-tpb", tpbConfig);
        this.tlCombined = TimeLimiter.of("combined-timeout", tlConfig);
        this.cbCombined = CircuitBreaker.of("combined-cb", cbConfig);
        logCircuitBreaker("combined-cb", cbCombined);
        this.retryCombined = Retry.of("combined-retry", retryConfig);
        logRetry("combined-retry", retryCombined);

        // Kịch bản hội tụ: dùng CÙNG cấu hình nhưng waitDurationInOpenState = 3s để pha 5 tự chữa lành nhanh.
        CircuitBreakerConfig cbConvergeConfig = CircuitBreakerConfig.custom()
                .slidingWindowType(CircuitBreakerConfig.SlidingWindowType.COUNT_BASED)
                .slidingWindowSize(cbWindow)
                .minimumNumberOfCalls(cbWindow)
                .failureRateThreshold(cbThreshold)
                .waitDurationInOpenState(Duration.ofSeconds(3))
                .permittedNumberOfCallsInHalfOpenState(cbHalfOpenCalls)
                .automaticTransitionFromOpenToHalfOpenEnabled(true)
                .ignoreException(t -> isClientError(unwrap(t)) || unwrap(t) instanceof BulkheadFullException)
                .build();

        this.bulkheadConverge = Bulkhead.of("converge-bulkhead", bulkheadConfig);
        this.cbConverge = CircuitBreaker.of("converge-cb", cbConvergeConfig);
        logCircuitBreaker("converge-cb", cbConverge);
        this.retryConverge = Retry.of("converge-retry", retryConfig);
        logRetry("converge-retry", retryConverge);
    }

    // ================= Getter =================
    public ScheduledExecutorService scheduler() { return scheduler; }
    public ExecutorService asyncExecutor() { return asyncExecutor; }
    public TimeLimiter timeoutOnly() { return timeoutOnly; }
    public Retry retryOnly() { return retryOnly; }
    public Bulkhead bulkheadOnly() { return bulkheadOnly; }
    public CircuitBreaker cbOnly() { return cbOnly; }
    public ThreadPoolBulkhead tpbCombined() { return tpbCombined; }
    public TimeLimiter tlCombined() { return tlCombined; }
    public CircuitBreaker cbCombined() { return cbCombined; }
    public Retry retryCombined() { return retryCombined; }
    public Bulkhead bulkheadConverge() { return bulkheadConverge; }
    public CircuitBreaker cbConverge() { return cbConverge; }
    public Retry retryConverge() { return retryConverge; }

    // ================= Chính sách: lỗi nào được retry? =================

    /**
     * Retry khi: timeout, Feign lỗi mạng, upstream 5xx.
     * KHÔNG retry khi:
     *  - CircuitBreaker đang OPEN (CallNotPermittedException) -> retry chỉ tổ phí, phải fail-fast
     *  - Bulkhead đầy (BulkheadFullException)                 -> retry chỉ làm quá tải thêm
     *  - Lỗi 4xx (request sai, gọi lại vẫn sai)
     */
    private static Predicate<Throwable> retryable() {
        return t -> {
            Throwable r = unwrap(t);
            return !(r instanceof CallNotPermittedException)
                    && !(r instanceof BulkheadFullException)
                    && !isClientError(r);
        };
    }

    public static boolean isClientError(Throwable t) {
        return t instanceof FeignException fe && fe.status() >= 400 && fe.status() < 500;
    }

    /** Bóc lớp CompletionException / ExecutionException để lấy nguyên nhân thật. */
    public static Throwable unwrap(Throwable t) {
        while ((t instanceof CompletionException || t instanceof ExecutionException) && t.getCause() != null) {
            t = t.getCause();
        }
        return t;
    }

    // ================= Log sự kiện cho dễ quan sát =================
    private static void logRetry(String name, Retry retry) {
        retry.getEventPublisher().onRetry(e ->
                log.warn("[RETRY  {}] lần gọi thứ {} thất bại ({}), chờ rồi gọi lại...",
                        name, e.getNumberOfRetryAttempts(), unwrap(e.getLastThrowable()).getClass().getSimpleName()));
    }

    private static void logCircuitBreaker(String name, CircuitBreaker cb) {
        cb.getEventPublisher().onStateTransition(e ->
                log.warn("[CB     {}] chuyển trạng thái: {}", name, e.getStateTransition()));
    }

    @PreDestroy
    void shutdown() {
        scheduler.shutdownNow();
        asyncExecutor.shutdownNow();
        try {
            tpbCombined.close();
        } catch (Exception ignored) {
        }
    }
}

