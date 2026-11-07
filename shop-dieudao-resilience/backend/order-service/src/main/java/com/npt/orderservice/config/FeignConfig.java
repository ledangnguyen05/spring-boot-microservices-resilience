package com.npt.orderservice.config;

import feign.Retryer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FeignConfig {

    /**
     * Feign Retryer mặc định cho client "xxx" (endpoint gốc /api/orders/{id}).
     */
    @Bean
    public Retryer retryer() {
        return new Retryer.Default(
                1000,  // period: chờ ban đầu 1 giây
                2000,  // maxPeriod: thời gian chờ giữa 2 lần gọi tối đa 2 giây
                3      // maxAttempts: tổng số lần gọi tối đa là 3
        );
    }
}

