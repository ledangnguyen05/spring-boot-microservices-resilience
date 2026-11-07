package com.npt.userservice;

import org.springframework.stereotype.Component;

import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Trạng thái "phá hoại" (chaos) của user-service, chỉnh được lúc đang chạy
 * để giả lập các sự cố mà Resilience4j ở order-service phải chống đỡ:
 *
 *  - delayMs     : mỗi request ngủ thêm bao nhiêu ms  -> TIMEOUT / BULKHEAD
 *  - failPercent : % request trả HTTP 500               -> CIRCUIT BREAKER
 *  - failFirstN  : N request đầu tiên trả 500 rồi tự hồi -> RETRY
 */
@Component
public class ChaosState {

    private volatile long delayMs = 0;
    private volatile int failPercent = 0;
    private final AtomicInteger failFirstN = new AtomicInteger(0);
    private final AtomicInteger totalCalls = new AtomicInteger(0);

    public int nextCall() {
        return totalCalls.incrementAndGet();
    }

    /** Có nên bắn lỗi 500 ở request này không? */
    public boolean shouldFail() {
        // failFirstN: giảm dần, chỉ bắn lỗi khi còn "hạn ngạch"
        while (true) {
            int remaining = failFirstN.get();
            if (remaining <= 0) break;
            if (failFirstN.compareAndSet(remaining, remaining - 1)) {
                return true;
            }
        }
        return failPercent > 0 && ThreadLocalRandom.current().nextInt(100) < failPercent;
    }

    public void configure(Long delayMs, Integer failPercent, Integer failFirstN) {
        if (delayMs != null) this.delayMs = Math.max(0, delayMs);
        if (failPercent != null) this.failPercent = Math.min(100, Math.max(0, failPercent));
        if (failFirstN != null) this.failFirstN.set(Math.max(0, failFirstN));
    }

    public void reset() {
        delayMs = 0;
        failPercent = 0;
        failFirstN.set(0);
        totalCalls.set(0);
    }

    public long getDelayMs() { return delayMs; }
    public int getFailPercent() { return failPercent; }
    public int getFailFirstN() { return failFirstN.get(); }
    public int getTotalCalls() { return totalCalls.get(); }
}
