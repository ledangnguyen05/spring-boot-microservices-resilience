package com.npt.orderservice.client;

import com.npt.orderservice.dto.UserResponseDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/**
 * OpenFeign client ban đầu của hệ thống (dùng Retryer.Default và timeout riêng).
 */
@FeignClient(name = "xxx", url = "${user-service.url:http://localhost:8081}/api/users")
public interface UserClient {

    @GetMapping("/{userId}")
    UserResponseDTO getUserById(@PathVariable("userId") Long userId);
}

