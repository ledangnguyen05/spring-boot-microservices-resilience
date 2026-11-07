package com.npt.orderservice.service;

import feign.FeignException;
import feign.Request;
import feign.RequestTemplate;
import io.github.resilience4j.bulkhead.Bulkhead;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.decorators.Decorators;
import io.github.resilience4j.retry.Retry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.*;

class ResiliencePatternsTest {

    private final ResilienceKit kit = new ResilienceKit(
            1500, // timeoutMs
            3,    // maxAttempts
            50,   // retryWaitMs (test nhanh)
            2.0,  // retryMultiplier
            3,    // bulkheadMax
            3, 3, 2, // tpb
            5,    // cbWindow
            50.0f,// cbThreshold
            2,    // cbOpenSeconds
            2     // cbHalfOpenCalls
    );

    @Test
    @DisplayName("CircuitBreaker chuyển từ CLOSED sang OPEN khi tỷ lệ lỗi vượt ngưỡng")
    void testCircuitBreakerOpensOnFailure() {
        CircuitBreaker cb = kit.cbOnly();
        cb.reset();
        assertEquals(CircuitBreaker.State.CLOSED, cb.getState());

        Supplier<String> failingCall = () -> {
            throw new RuntimeException("Simulated upstream error");
        };

        // Window size = 5. Gọi lỗi 5 lần
        for (int i = 0; i < 5; i++) {
            assertThrows(Exception.class, () ->
                    Decorators.ofSupplier(failingCall).withCircuitBreaker(cb).get()
            );
        }

        // CircuitBreaker phải chuyển sang OPEN
        assertEquals(CircuitBreaker.State.OPEN, cb.getState(), "CircuitBreaker phải chuyển sang OPEN");

        // Khi OPEN, ném ngay CallNotPermittedException (fail-fast, không gọi method)
        assertThrows(CallNotPermittedException.class, () ->
                Decorators.ofSupplier(() -> "success").withCircuitBreaker(cb).get()
        );
    }

    @Test
    @DisplayName("Bulkhead từ chối lời gọi thứ 4 khi số lời gọi đồng thời tối đa là 3")
    void testBulkheadLimitsConcurrentCalls() {
        Bulkhead bh = kit.bulkheadOnly();
        assertTrue(bh.tryAcquirePermission(), "Call 1 cho phép");
        assertTrue(bh.tryAcquirePermission(), "Call 2 cho phép");
        assertTrue(bh.tryAcquirePermission(), "Call 3 cho phép");

        // Call 4 phải bị từ chối
        assertFalse(bh.tryAcquirePermission(), "Call 4 phải bị từ chối vì quá tải");

        // Giải phóng 1 slot
        bh.onComplete();
        assertTrue(bh.tryAcquirePermission(), "Sau khi nhả slot, call tiếp theo được phép");
    }

    @Test
    @DisplayName("Retry thử lại tối đa 3 lần khi gặp exception hợp lệ")
    void testRetryRetriesOnException() {
        Retry retry = kit.retryOnly();
        AtomicInteger attempts = new AtomicInteger();

        Supplier<String> call = () -> {
            int current = attempts.incrementAndGet();
            if (current < 3) {
                throw new RuntimeException("Transient failure");
            }
            return "SUCCESS";
        };

        String result = Decorators.ofSupplier(call).withRetry(retry).get();
        assertEquals("SUCCESS", result);
        assertEquals(3, attempts.get(), "Phải gọi đúng 3 lần (2 lần fail + 1 lần thành công)");
    }

    @Test
    @DisplayName("Lỗi 4xx là lỗi phía client -> không retry và không làm hỏng CircuitBreaker")
    void testClientErrorIgnored() {
        Request req = Request.create(Request.HttpMethod.GET, "/api/users/1", Collections.emptyMap(), null, StandardCharsets.UTF_8, new RequestTemplate());
        FeignException.NotFound notFound = new FeignException.NotFound("User not found", req, null, null);

        assertTrue(ResilienceKit.isClientError(notFound), "Lỗi 404 phải được nhận diện là client error");
    }
}

