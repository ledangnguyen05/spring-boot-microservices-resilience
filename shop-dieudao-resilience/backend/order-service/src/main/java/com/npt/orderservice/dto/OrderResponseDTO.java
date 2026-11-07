package com.npt.orderservice.dto;

import java.math.BigDecimal;

public class OrderResponseDTO {
    private Long orderId;
    private Long userId;
    private String productName;
    private Integer quantity;
    private BigDecimal price;
    private String status;
    private UserResponseDTO user;
    private Long timeTakenMs;
    private String message;

    public OrderResponseDTO() {
    }

    public OrderResponseDTO(Long orderId, Long userId, String productName, Integer quantity,
                            BigDecimal price, String status, UserResponseDTO user,
                            Long timeTakenMs, String message) {
        this.orderId = orderId;
        this.userId = userId;
        this.productName = productName;
        this.quantity = quantity;
        this.price = price;
        this.status = status;
        this.user = user;
        this.timeTakenMs = timeTakenMs;
        this.message = message;
    }

    public Long getOrderId() {
        return orderId;
    }

    public void setOrderId(Long orderId) {
        this.orderId = orderId;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getProductName() {
        return productName;
    }

    public void setProductName(String productName) {
        this.productName = productName;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public UserResponseDTO getUser() {
        return user;
    }

    public void setUser(UserResponseDTO user) {
        this.user = user;
    }

    public Long getTimeTakenMs() {
        return timeTakenMs;
    }

    public void setTimeTakenMs(Long timeTakenMs) {
        this.timeTakenMs = timeTakenMs;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}

