package com.npt.orderservice.resilience;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.LinkedHashMap;

import org.springframework.web.bind.annotation.CrossOrigin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Các endpoint demo (gọi qua gateway: http://localhost:8080/api/orders/demo/...)
 */
@RestController
@CrossOrigin(origins = "*")
@Tag(name = "Resilience Demo API", description = "Các demo 4 pattern đơn lẻ và kết hợp: Timeout, Retry, Bulkhead, Circuit Breaker")
@RequestMapping("/api/orders/demo")
public class ResilienceDemoController {

    private final ResilienceDemoService service;

    public ResilienceDemoController(ResilienceDemoService service) {
        this.service = service;
    }

    @GetMapping("/timeout/{userId}")
    public ResponseEntity<DemoResult> timeout(@PathVariable Long userId) {
        return reply(service.timeout(userId));
    }

    @GetMapping("/retry/{userId}")
    public ResponseEntity<DemoResult> retry(@PathVariable Long userId) {
        return reply(service.retry(userId));
    }

    @GetMapping("/bulkhead/{userId}")
    public ResponseEntity<DemoResult> bulkhead(@PathVariable Long userId) {
        return reply(service.bulkhead(userId));
    }

    @GetMapping("/circuit-breaker/{userId}")
    public ResponseEntity<DemoResult> circuitBreaker(@PathVariable Long userId) {
        return reply(service.circuitBreaker(userId));
    }

    /** fallback=false để thấy lỗi thật (503/504/429...) thay vì user dự phòng. */
    @GetMapping("/combined/{userId}")
    public ResponseEntity<DemoResult> combined(@PathVariable Long userId,
                                               @RequestParam(defaultValue = "true") boolean fallback) {
        return reply(service.combined(userId, fallback));
    }

    /**
     * Bắn n request SONG SONG vào 1 demo rồi tóm tắt kết quả - để xem Bulkhead/Circuit Breaker
     * làm việc mà không cần công cụ load test.
     * VD: /api/orders/demo/burst/bulkhead?n=10
     */
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

    /** Trạng thái các Circuit Breaker / Bulkhead. */
    @GetMapping("/status")
    public Map<String, Object> status() {
        return service.status();
    }

    /** Reset Circuit Breaker về CLOSED để demo lại. */
    @RequestMapping(path = "/reset", method = {RequestMethod.GET, RequestMethod.POST})
    public Map<String, Object> reset() {
        return service.reset();
    }

    private ResponseEntity<DemoResult> reply(DemoResult r) {
        return ResponseEntity.status(r.httpStatus()).body(r);
    }
}
