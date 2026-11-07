package com.npt.orderservice.controller;

import com.npt.orderservice.client.UserClient;
import com.npt.orderservice.dto.UserResponseDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin(origins = "*")
@Tag(name = "Original Order API", description = "Endpoint đơn hàng ban đầu (dùng OpenFeign client gốc với Feign timeout và retry)")
@RequestMapping("/api/orders")
public class OrderController {

    private final UserClient userAPI;

    public OrderController(UserClient userAPI) {
        this.userAPI = userAPI;
    }

    @Operation(summary = "Lấy đơn hàng theo ID (Endpoint gốc)",
            description = "Gọi user-service qua OpenFeign mặc định (connectTimeout=2s, readTimeout=3s, Retryer=3 lần).")
    @GetMapping("/{orderId}")
    public String getOrderById(@PathVariable Long orderId) {
        long begin = System.currentTimeMillis();
        // Gọi User Service qua OpenFeign
        UserResponseDTO user = userAPI.getUserById(orderId);
        long end = System.currentTimeMillis();

        return "Order " + orderId + " for user " + user.getName() + " at address " + user.getAddress()
                + " | Time taken to call user-service: " + (end - begin) + " ms";
    }
}

