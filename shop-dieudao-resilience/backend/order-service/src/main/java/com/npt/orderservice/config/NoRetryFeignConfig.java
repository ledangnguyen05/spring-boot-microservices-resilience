package com.npt.orderservice.config;

import feign.Retryer;
import org.springframework.context.annotation.Bean;

/**
 * Cấu hình RIÊNG cho Feign client "user-resilient" (cố ý KHÔNG gắn @Configuration
 * để Spring không scan nhầm thành cấu hình toàn cục).
 *
 * Tắt Retryer của Feign: việc retry giao hẳn cho Resilience4j.
 * Nếu để cả hai cùng retry thì số lần gọi bị NHÂN LÊN (3 x 3 = 9 lần) -> "retry storm".
 * (Client "xxx" của code mẫu vẫn giữ Retryer.Default cấu hình trong FeConfig, nên endpoint gốc không đổi.)
 */
public class NoRetryFeignConfig {

    @Bean
    public Retryer retryer() {
        return Retryer.NEVER_RETRY;
    }
}

