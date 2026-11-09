package com.npt.orderservice.service;

import com.npt.orderservice.client.UserConvergeClient;
import com.npt.orderservice.client.UserResilientClient;
import com.npt.orderservice.dto.UserResponseDTO;
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
import org.springframework.retry.support.RetryTemplate;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.Map;
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
        try {
            assertTrue(bh.tryAcquirePermission(), "Call 1 cho phép");
            assertTrue(bh.tryAcquirePermission(), "Call 2 cho phép");
            assertTrue(bh.tryAcquirePermission(), "Call 3 cho phép");

            // Call 4 phải bị từ chối
            assertFalse(bh.tryAcquirePermission(), "Call 4 phải bị từ chối vì quá tải");

            // Giải phóng 1 slot
            bh.onComplete();
            assertTrue(bh.tryAcquirePermission(), "Sau khi nhả slot, call tiếp theo được phép");
        } finally {
            while (bh.getMetrics().getAvailableConcurrentCalls() < 3) {
                bh.onComplete();
            }
        }
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
    void testClientErrorIgnoredByRetryAndCircuitBreaker() {
        Request req = Request.create(Request.HttpMethod.GET, "/api/users/999", Collections.emptyMap(), null, StandardCharsets.UTF_8, new RequestTemplate());
        FeignException.NotFound notFound = new FeignException.NotFound("User not found", req, null, null);

        // 1. Kiểm tra nhận diện 4xx
        assertTrue(ResilienceKit.isClientError(notFound), "Lỗi 404 phải được nhận diện là client error");

        // 2. Kiểm tra Retry KHÔNG retry với lỗi 4xx (chỉ gọi 1 lần rồi dừng)
        Retry retry = kit.retryOnly();
        AtomicInteger retryAttempts = new AtomicInteger();
        assertThrows(FeignException.NotFound.class, () ->
                Decorators.ofSupplier(() -> {
                    retryAttempts.incrementAndGet();
                    throw notFound;
                }).withRetry(retry).get()
        );
        assertEquals(1, retryAttempts.get(), "Lỗi 4xx không được retry, chỉ gọi đúng 1 lần");

        // 3. Kiểm tra CircuitBreaker KHÔNG ghi nhận failure khi gặp lỗi 4xx
        CircuitBreaker cb = kit.cbOnly();
        cb.reset();
        assertEquals(CircuitBreaker.State.CLOSED, cb.getState());
        for (int i = 0; i < 5; i++) {
            assertThrows(FeignException.NotFound.class, () ->
                    Decorators.ofSupplier(() -> {
                        throw notFound;
                    }).withCircuitBreaker(cb).get()
            );
        }
        assertEquals(CircuitBreaker.State.CLOSED, cb.getState(), "CircuitBreaker vẫn phải CLOSED vì lỗi 4xx được ignore");
        assertEquals(0, cb.getMetrics().getNumberOfFailedCalls(), "Số failed calls phải bằng 0 do 4xx được cấu hình ignore");
    }

    @Test
    @DisplayName("Khi CircuitBreaker đang OPEN thì Retry không gọi lại (chống Retry Storm)")
    void testCircuitBreakerOpenPreventsRetryStorm() {
        CircuitBreaker cb = kit.cbOnly();
        cb.reset();
        cb.transitionToOpenState();
        assertEquals(CircuitBreaker.State.OPEN, cb.getState(), "CircuitBreaker phải đang ở trạng thái OPEN");

        Retry retry = kit.retryOnly();
        AtomicInteger supplierCalls = new AtomicInteger();

        Supplier<String> call = () -> {
            supplierCalls.incrementAndGet();
            return "SHOULD_NOT_EXECUTE";
        };

        // Lồng: Retry ở ngoài, CircuitBreaker ở trong
        Supplier<String> decorated = Decorators.ofSupplier(call)
                .withCircuitBreaker(cb)
                .withRetry(retry)
                .decorate();

        // Lời gọi phải ném ngay CallNotPermittedException (fail-fast)
        assertThrows(CallNotPermittedException.class, decorated::get);

        // Supplier bên trong không bao giờ được chạm vào và Retry không gọi lại
        assertEquals(0, supplierCalls.get(), "Khi CB đang OPEN, method không được gọi và Retry không thử lại");
    }

    @Test
    @DisplayName("Hội tụ 4 topic: lỗi timeout làm CB mở, Retry dừng ngay thay vì gọi tiếp")
    void testConvergedPipelineRetryStopsWhenCircuitOpens() {
        CircuitBreaker cb = kit.cbConverge();
        Bulkhead bh = kit.bulkheadConverge();
        Retry retry = kit.retryConverge();
        cb.reset();

        // Dựng cửa sổ CB (5 mẫu) giống kịch bản demo: 3 OK (pha Bulkhead) -> 2 lỗi + 1 OK (pha Retry)
        // => cửa sổ gần nhất [OK, OK, LỖI, LỖI, OK] = 40% lỗi < 50% nên mạch vẫn CLOSED.
        for (int i = 0; i < 3; i++) {
            assertEquals("ok", Decorators.ofSupplier(() -> "ok").withCircuitBreaker(cb).get());
        }
        for (int i = 0; i < 2; i++) {
            assertThrows(RuntimeException.class, () ->
                    Decorators.ofSupplier((Supplier<String>) () -> {
                        throw new RuntimeException("injected 500");
                    }).withCircuitBreaker(cb).get());
        }
        assertEquals("ok", Decorators.ofSupplier(() -> "ok").withCircuitBreaker(cb).get());
        assertEquals(CircuitBreaker.State.CLOSED, cb.getState(), "Trước pha timeout mạch phải còn CLOSED");

        // Pha timeout: mỗi lần gọi bị cắt (giả lập bằng exception). Lỗi đầu tiên đẩy tỉ lệ lỗi lên 60% -> OPEN.
        AtomicInteger realCalls = new AtomicInteger();
        Supplier<String> timingOutCall = () -> {
            realCalls.incrementAndGet();
            throw new RuntimeException("Read timed out");
        };
        Supplier<String> pipeline = Decorators.ofSupplier(timingOutCall)
                .withBulkhead(bh)             // trong cùng
                .withCircuitBreaker(cb)
                .withRetry(retry)             // ngoài cùng
                .decorate();

        // Lần 1 lỗi (retry được) -> mạch OPEN; lần 2 bị CB từ chối -> Retry không thử lần 3.
        assertThrows(CallNotPermittedException.class, pipeline::get);
        assertEquals(CircuitBreaker.State.OPEN, cb.getState(), "Mạch phải OPEN sau lần timeout thứ 1");
        assertEquals(1, realCalls.get(), "Chỉ 1 lần gọi thật; các lần sau bị CB chặn, không gọi xuống dưới");

        // Gọi lại ngay: fail-fast, không đụng tới lời gọi thật.
        assertThrows(CallNotPermittedException.class, pipeline::get);
        assertEquals(1, realCalls.get(), "Mạch OPEN thì không có thêm lời gọi thật nào");
    }

    @Test
    @DisplayName("Không Bulkhead vỡ ngưỡng quá tải tập thể (0/10 sống · sập 10× 503), còn có Bulkhead giữ sống 3/3 (FIFO) và chặn nhanh 7× 429")
    @SuppressWarnings("unchecked")
    void testBulkheadSurvivesOverloadWhileUnprotectedCollapses() {
        UserResilientClient slowUserClient = id -> {
            try {
                Thread.sleep(650);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new RuntimeException(e);
            }
            return new UserResponseDTO(id, "Nguyễn Văn A", "Q1, TP.HCM");
        };
        UserConvergeClient dummyConvergeClient = id -> new UserResponseDTO(id, "A", "B");

        ResilienceDemoService demoService = new ResilienceDemoService(
                slowUserClient,
                dummyConvergeClient,
                kit,
                RestClient.create(),
                new RetryTemplate()
        );

        // 0) Vừa sức (n=3 <= safeCapacity=3): không bảo vệ vẫn chạy bình thường
        Map<String, Object> withinCap = demoService.burst("no-protection", 3, 1L);
        Map<String, Integer> withinCapSummary = (Map<String, Integer>) withinCap.get("summary");
        assertEquals(3, withinCapSummary.getOrDefault("OK", 0), "Khi lượng gọi nằm trong ngưỡng an toàn 3 luồng, no-protection vẫn xử lý được 3/3");

        // 1) QUÁ TẢI KHÔNG BULKHEAD (n=10 > safeCapacity=3): tràn cả 10/10 cùng lúc -> vỡ ngưỡng quá tải tập thể -> 0/10 thành công (10× 503)
        Map<String, Object> unprotected = demoService.burst("no-protection", 10, 1L);
        Map<String, Integer> unprotectedSummary = (Map<String, Integer>) unprotected.get("summary");
        assertEquals(0, unprotectedSummary.getOrDefault("OK", 0), "Không có Bulkhead tràn 10/3 luồng -> không lượt nào thoát khỏi nghẽn sập");
        assertEquals(10, unprotectedSummary.getOrDefault("OVERLOAD_COLLAPSE", 0), "Cả 10/10 lượt phải sập OVERLOAD_COLLAPSE (HTTP 503)");
        assertEquals(10, unprotected.get("peakConcurrent"));

        List<Map<String, Object>> unprotectedRows = (List<Map<String, Object>>) unprotected.get("requestResults");
        for (Map<String, Object> row : unprotectedRows) {
            assertEquals(503, row.get("httpStatus"));
            assertEquals(1, row.get("attempts"), "Cả 10 lượt đều tràn thật sang User Service trước khi sập");
        }

        // 2) CÓ BULKHEAD (tối đa 3 chỗ): #1-#3 vào (FIFO) và sống 200 OK, #4-#10 bị 429 tức thì (0 lần gọi User)
        Map<String, Object> protectedRes = demoService.burst("bulkhead", 10, 1L);
        Map<String, Integer> protectedSummary = (Map<String, Integer>) protectedRes.get("summary");
        assertEquals(3, protectedSummary.getOrDefault("OK", 0), "Bulkhead chỉ nhận đúng 3 lượt vừa sức nên cả 3 đều sống 200 OK");
        assertEquals(7, protectedSummary.getOrDefault("BULKHEAD_FULL", 0), "7 lượt thừa bị từ chối nhanh HTTP 429");

        List<Map<String, Object>> reqRows = (List<Map<String, Object>>) protectedRes.get("requestResults");
        for (int idx = 0; idx < 3; idx++) {
            assertEquals("OK", reqRows.get(idx).get("outcome"), "Lượt đến trước #" + (idx + 1) + " phải được nhận (FIFO)");
            assertEquals(200, reqRows.get(idx).get("httpStatus"));
        }
        for (int idx = 3; idx < 10; idx++) {
            assertEquals("BULKHEAD_FULL", reqRows.get(idx).get("outcome"), "Lượt đến sau #" + (idx + 1) + " phải nhận 429");
            assertEquals(429, reqRows.get(idx).get("httpStatus"));
            assertEquals(0, reqRows.get(idx).get("attempts"), "Lượt bị Bulkhead chặn không chạm tới User Service");
        }
    }
}

