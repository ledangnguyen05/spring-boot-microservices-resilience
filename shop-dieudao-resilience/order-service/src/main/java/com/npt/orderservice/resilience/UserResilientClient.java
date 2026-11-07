package com.npt.orderservice.resilience;

import com.npt.orderservice.UserResponseDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/**
 * Feign client dành cho các demo Resilience4j.
 * Timeout kết nối/đọc cấu hình ở application.properties (spring.cloud.openfeign.client.config.user-resilient.*).
 */
@FeignClient(name = "user-resilient",
        url = "${user-service.url}/api/users",
        configuration = NoRetryFeignConfig.class)
public interface UserResilientClient {

    @GetMapping("/{userId}")
    UserResponseDTO getUserById(@PathVariable("userId") Long userId);
}
