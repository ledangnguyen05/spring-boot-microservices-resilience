package com.npt.orderservice.controller;

import com.npt.orderservice.dto.DemoResult;
import com.npt.orderservice.service.ResilienceDemoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Các endpoint demo Resilience4j (gọi trực tiếp hoặc qua API Gateway: http://localhost:8080/api/orders/resilience/...)
 */
@RestController
@CrossOrigin(origins = "*")
@Tag(name = "Order Resilience API", description = "Các demo 4 pattern đơn lẻ và kết hợp: Timeout, Retry, Bulkhead, Circuit Breaker")
@RequestMapping("/api/orders/resilience")
public class ResilienceController {

    private final ResilienceDemoService service;

    public ResilienceController(ResilienceDemoService service) {
        this.service = service;
    }

    @Operation(summary = "Demo 1: Timeout (TimeLimiter)",
            description = "Sử dụng TimeLimiter cắt đứt lời gọi sau 1.5s nếu user-service phản hồi chậm, trả về mã 504 TIMEOUT.")
    @GetMapping("/timeout/{userId}")
    public ResponseEntity<DemoResult> timeout(@PathVariable Long userId) {
        return reply(service.timeout(userId));
    }

    @Operation(summary = "Demo 2: Retry (Thử lại)",
            description = "Tự động thử lại tối đa 3 lần với exponential backoff (500ms, 1000ms...) khi gặp lỗi mạng hoặc 5xx thoáng qua.")
    @GetMapping("/retry/{userId}")
    public ResponseEntity<DemoResult> retry(@PathVariable Long userId) {
        return reply(service.retry(userId));
    }

    @Operation(summary = "Demo 3: Bulkhead (Vách ngăn cách ly - Semaphore)",
            description = "Giới hạn tối đa 3 request đồng thời vào user-service; request vượt ngưỡng bị từ chối ngay với HTTP 429 BULKHEAD_FULL.")
    @GetMapping("/bulkhead/{userId}")
    public ResponseEntity<DemoResult> bulkhead(@PathVariable Long userId) {
        return reply(service.bulkhead(userId));
    }

    @Operation(summary = "Demo 4: Circuit Breaker (Ngắt mạch tự động)",
            description = "Tự ngắt mạch khi tỷ lệ lỗi >= 50% trong 5 lần gọi gần nhất (chuyển sang OPEN - fail-fast 503). Sau 10s chuyển sang HALF_OPEN để thăm dò phục hồi.")
    @GetMapping("/circuit-breaker/{userId}")
    public ResponseEntity<DemoResult> circuitBreaker(@PathVariable Long userId) {
        return reply(service.circuitBreaker(userId));
    }

    @Operation(summary = "Demo 5: Kết hợp cả 4 pattern + Fallback",
            description = "Thứ tự lồng: Retry (ngoài) -> CircuitBreaker -> TimeLimiter -> ThreadPoolBulkhead (trong). Có Fallback an toàn (hoặc truyền fallback=false để thấy mã lỗi thật).")
    @GetMapping("/combined/{userId}")
    public ResponseEntity<DemoResult> combined(@PathVariable Long userId,
                                                @RequestParam(defaultValue = "true") boolean fallback) {
        return reply(service.combined(userId, fallback));
    }

    @Operation(summary = "Bắn N request song song (Burst Test)",
            description = "Tạo n luồng đồng thời gọi vào 1 pattern (timeout | retry | bulkhead | circuit-breaker | combined | combined-nofallback) để kiểm chứng mà không cần tool ngoài.")
    @GetMapping("/burst/{pattern}")
    public Map<String, Object> burst(@PathVariable String pattern,
                                     @RequestParam(defaultValue = "10") int n,
                                     @RequestParam(defaultValue = "1") Long userId) {
        int count = Math.min(Math.max(n, 1), 50);
        long begin = System.currentTimeMillis();
        ExecutorService pool = Executors.newFixedThreadPool(count);
        try {
            List<CompletableFuture<DemoResult>> futures = new ArrayList<>();
            for (int i = 0; i < count; i++) {
                futures.add(CompletableFuture.supplyAsync(() -> service.dispatch(pattern, userId), pool));
            }
            Map<String, Integer> summary = new TreeMap<>();
            List<String> details = new ArrayList<>();
            int i = 1;
            for (CompletableFuture<DemoResult> f : futures) {
                DemoResult r = f.join();
                summary.merge(r.outcome(), 1, Integer::sum);
                details.add("#" + (i++) + " -> " + r.outcome() + " (" + r.elapsedMs() + "ms, "
                        + r.attempts() + " lần gọi thật)");
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("pattern", pattern);
            out.put("parallelRequests", count);
            out.put("totalMs", System.currentTimeMillis() - begin);
            out.put("summary", summary);
            out.put("details", details);
            return out;
        } finally {
            pool.shutdown();
        }
    }

    @Operation(summary = "Xem trạng thái & số liệu Resilience4j",
            description = "Xem trạng thái chi tiết của CircuitBreaker (CLOSED, OPEN, HALF_OPEN, tỷ lệ lỗi) và Bulkhead (số thread, hàng đợi).")
    @GetMapping("/status")
    public Map<String, Object> status() {
        return service.status();
    }

    @Operation(summary = "Reset Circuit Breaker về trạng thái CLOSED",
            description = "Khôi phục mọi Circuit Breaker về trạng thái CLOSED và xóa sạch số liệu thống kê để bắt đầu lại kịch bản.")
    @PostMapping("/reset")
    public Map<String, Object> reset() {
        return service.reset();
    }

    private ResponseEntity<DemoResult> reply(DemoResult r) {
        return ResponseEntity.status(r.httpStatus()).body(r);
    }
}

