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

import java.util.Map;

/**
 * Các endpoint demo Resilience4j (gọi trực tiếp hoặc qua API Gateway: http://localhost:8080/api/orders/resilience/...)
 */
@RestController
@CrossOrigin(origins = "*")
@Tag(name = "Order Resilience API", description = "Các demo 4 pattern đơn lẻ và kết hợp: Timeout, Retry, Bulkhead, Circuit Breaker")
@RequestMapping({"/api/orders/resilience", "/api/orders/demo"})
public class ResilienceController {

    private final ResilienceDemoService service;

    public ResilienceController(ResilienceDemoService service) {
        this.service = service;
    }

    @Operation(summary = "Demo 0: Không bảo vệ (Baseline để đối chứng)",
            description = "Gọi thẳng sang User Service không qua bất kỳ cơ chế Resilience nào: Không Timeout, Không Retry, Không Circuit Breaker, Không Bulkhead.")
    @GetMapping("/no-protection/{userId}")
    public ResponseEntity<DemoResult> noProtection(@PathVariable Long userId) {
        return reply(service.noProtection(userId));
    }

    @Operation(summary = "Demo 1a: Feign Timeout (Read Timeout 3s - Topic chính)",
            description = "Gọi thẳng OpenFeign client không qua Decorator nào; khi User Service trễ 4s, Feign cắt sau 3s (readTimeout) trả mã 504 FEIGN_TIMEOUT.")
    @GetMapping("/feign-timeout/{userId}")
    public ResponseEntity<DemoResult> feignTimeout(@PathVariable Long userId) {
        return reply(service.feignTimeout(userId));
    }

    @Operation(summary = "Demo 1c: RestClient Timeout (Read Timeout 2.5s - Topic chính)",
            description = "Gọi User Service qua Spring 6 RestClient với SimpleClientHttpRequestFactory (readTimeout = 2.5s), tự động ngắt kết nối khi quá hạn trả mã 504 TIMEOUT.")
    @GetMapping("/restclient-timeout/{userId}")
    public ResponseEntity<DemoResult> restClientTimeout(@PathVariable Long userId) {
        return reply(service.restClientTimeout(userId));
    }

    @Operation(summary = "Demo 1b: Timeout (TimeLimiter 1.5s - Lớp bảo vệ bổ sung)",
            description = "Sử dụng TimeLimiter cắt đứt lời gọi sau 1.5s nếu user-service phản hồi chậm, trả về mã 504 TIMEOUT.")
    @GetMapping("/timeout/{userId}")
    public ResponseEntity<DemoResult> timeout(@PathVariable Long userId) {
        return reply(service.timeout(userId));
    }

    @Operation(summary = "Demo 2: Retry (Resilience4j Retry)",
            description = "Tự động thử lại tối đa 3 lần với exponential backoff (500ms, 1000ms...) khi gặp lỗi mạng hoặc 5xx thoáng qua qua Resilience4j.")
    @GetMapping("/retry/{userId}")
    public ResponseEntity<DemoResult> retry(@PathVariable Long userId) {
        return reply(service.retry(userId));
    }

    @Operation(summary = "Demo 2b: Spring Retry (RetryTemplate)",
            description = "Tự động thử lại tối đa 3 lần với exponential backoff qua thư viện chuẩn Spring Retry (RetryTemplate).")
    @GetMapping("/spring-retry/{userId}")
    public ResponseEntity<DemoResult> springRetry(@PathVariable Long userId) {
        return reply(service.springRetry(userId));
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

    @Operation(summary = "Demo 6: HỘI TỤ 4 topic (Feign timeout + Bulkhead + Circuit Breaker + Retry)",
            description = "Thứ tự lồng: Retry (ngoài) -> CircuitBreaker -> Bulkhead -> Feign readTimeout 1s (trong). Không có TimeLimiter hay Fallback. Dùng /burst/converge?n=6 để thấy Bulkhead.")
    @GetMapping("/converge/{userId}")
    public ResponseEntity<DemoResult> converge(@PathVariable Long userId) {
        return reply(service.converge(userId));
    }

    @Operation(summary = "Demo 5: Kết hợp cả 4 pattern + Fallback",
            description = "Thứ tự lồng: Retry (ngoài) -> CircuitBreaker -> TimeLimiter -> ThreadPoolBulkhead (trong). Có Fallback an toàn (hoặc truyền fallback=false để thấy mã lỗi thật).")
    @GetMapping("/combined/{userId}")
    public ResponseEntity<DemoResult> combined(@PathVariable Long userId,
                                                @RequestParam(defaultValue = "true") boolean fallback) {
        return reply(service.combined(userId, fallback));
    }

    @Operation(summary = "Bắn N request song song (Burst Test)",
            description = "Tạo n luồng đồng thời gọi vào 1 pattern (feign-timeout | restclient-timeout | timeout | retry | spring-retry | bulkhead | circuit-breaker | converge | no-protection). So sánh Bulkhead (nhận 3 chỗ FIFO, chặn 429 phần thừa) với no-protection (tràn quá tải tập thể 503).")
    @GetMapping("/burst/{pattern}")
    public Map<String, Object> burst(@PathVariable String pattern,
                                     @RequestParam(defaultValue = "10") int n,
                                     @RequestParam(defaultValue = "1") Long userId) {
        return service.burst(pattern, n, userId);
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

