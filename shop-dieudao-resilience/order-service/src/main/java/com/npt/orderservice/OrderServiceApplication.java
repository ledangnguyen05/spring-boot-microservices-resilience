package com.npt.orderservice;

import feign.Retryer;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
@EnableFeignClients // khai báo để Spring Boot scan các interface FeignClient
public class OrderServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(OrderServiceApplication.class, args);
    }

    @Bean
    public Retryer retryer() {
        return new Retryer.Default(
                1000,  // period: Chờ ban đầu 1 giây trước khi gọi lại
                2000,  // maxPeriod: Thời gian chờ giữa 2 lần gọi tối đa 2 giây
                3      // maxAttempts: Tổng số lần gọi tối đa là 3 (kể cả lần đầu)
        );
    }
}
