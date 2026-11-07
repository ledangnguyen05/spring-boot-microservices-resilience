package com.npt.orderservice.controller;

import com.npt.orderservice.client.UserClient;
import com.npt.orderservice.dto.OrderResponseDTO;
import com.npt.orderservice.dto.UserResponseDTO;
import com.npt.orderservice.entity.Order;
import com.npt.orderservice.repository.OrderRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@CrossOrigin(origins = "*")
@Tag(name = "Original Order API", description = "Endpoint đơn hàng ban đầu (dùng OpenFeign client gốc với Feign timeout và retry)")
@RequestMapping("/api/orders")
public class OrderController {

    private final UserClient userAPI;
    private final OrderRepository orderRepository;

    public OrderController(UserClient userAPI, OrderRepository orderRepository) {
        this.userAPI = userAPI;
        this.orderRepository = orderRepository;
    }

    @Operation(summary = "Lấy danh sách tất cả đơn hàng",
            description = "Trả về danh sách 10 đơn hàng được seed trong cơ sở dữ liệu dạng JSON.")
    @GetMapping
    public List<Order> getAllOrders() {
        return orderRepository.findAll();
    }

    @Operation(summary = "Lấy đơn hàng theo ID (Endpoint gốc)",
            description = "Lấy thông tin đơn hàng từ database và gọi user-service qua OpenFeign để lấy thông tin khách hàng, trả về định dạng JSON.")
    @GetMapping("/{orderId}")
    public ResponseEntity<OrderResponseDTO> getOrderById(@PathVariable Long orderId) {
        Order order = orderRepository.findById(orderId).orElse(null);
        if (order == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy đơn hàng với ID: " + orderId);
        }

        long begin = System.currentTimeMillis();
        UserResponseDTO user = userAPI.getUserById(order.getUserId());
        long end = System.currentTimeMillis();
        long timeTakenMs = end - begin;

        String message = "Order #" + orderId + " [" + order.getProductName() + "] for user "
                + (user != null ? user.getName() : "Unknown")
                + " at address " + (user != null ? user.getAddress() : "Unknown")
                + " | Time taken to call user-service: " + timeTakenMs + " ms";

        OrderResponseDTO response = new OrderResponseDTO(
                order.getId(),
                order.getUserId(),
                order.getProductName(),
                order.getQuantity(),
                order.getPrice(),
                order.getStatus(),
                user,
                timeTakenMs,
                message
        );

        return ResponseEntity.ok(response);
    }
}
