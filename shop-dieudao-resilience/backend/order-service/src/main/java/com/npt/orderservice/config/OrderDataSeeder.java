package com.npt.orderservice.config;

import com.npt.orderservice.entity.Order;
import com.npt.orderservice.repository.OrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;

@Component
public class OrderDataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(OrderDataSeeder.class);
    private final OrderRepository orderRepository;

    public OrderDataSeeder(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    @Override
    public void run(String... args) {
        if (orderRepository.count() == 0) {
            List<Order> sampleOrders = List.of(
                    new Order(1L, "Laptop Dell XPS 15", 1, new BigDecimal("32000000"), "COMPLETED"),
                    new Order(2L, "iPhone 16 Pro Max 256GB", 1, new BigDecimal("34990000"), "SHIPPED"),
                    new Order(3L, "Bàn phím cơ Keychron Q1 Pro", 2, new BigDecimal("4500000"), "COMPLETED"),
                    new Order(4L, "Màn hình Dell UltraSharp 27 inch 4K", 1, new BigDecimal("11200000"), "PENDING"),
                    new Order(5L, "Tai nghe chống ồn Sony WH-1000XM5", 1, new BigDecimal("8490000"), "COMPLETED"),
                    new Order(6L, "Chuột công thái học Logitech MX Master 3S", 1, new BigDecimal("2490000"), "SHIPPED"),
                    new Order(7L, "iPad Air M2 11 inch Wi-Fi 128GB", 1, new BigDecimal("16990000"), "PROCESSING"),
                    new Order(8L, "Loa Bluetooth Marshall Stanmore III", 1, new BigDecimal("9990000"), "PENDING"),
                    new Order(9L, "Đồng hồ Apple Watch Series 9 GPS 45mm", 1, new BigDecimal("10490000"), "COMPLETED"),
                    new Order(10L, "Máy chơi game PlayStation 5 Slim", 1, new BigDecimal("14500000"), "SHIPPED")
            );

            orderRepository.saveAll(sampleOrders);
            log.info(">>> Seeded {} orders into H2 Database successfully!", sampleOrders.size());
        }
    }
}

