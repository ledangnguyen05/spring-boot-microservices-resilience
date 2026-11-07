package com.npt.orderservice;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import org.springframework.web.bind.annotation.CrossOrigin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@CrossOrigin(origins = "*")
@Tag(name = "Original Order API", description = "Endpoint order gốc (dùng default OpenFeign client)")
@RequestMapping("/api/orders") //localhost:8080/api/orders/1
public class OrderController {
    @Autowired
    private UserClient userAPI;
    //crud table order, đôi khi cần thêm info từ bên user đem sang
//khi đó 2 service gọi nhau, 2 api gọi nhau thay vì truyền thống là React gọi API, FE gọi BE, giờ là BE gọi BE
//table Order: id | date | saler | mã-kh
//table Customer:mã-kh, name, address vừa làm
//2 table này ở 2 DB khác nhau, có FK NHƯNG KOP JOIN ĐC, VÌ KHÁC DB
    @GetMapping("/{orderId}")
    public String getOrderById(@PathVariable Long orderId) {
        //cần đi gọi user-service api để xin info user, có địa chỉ để in ra
//giống như đơn hàng 100 giao cho khách ở Lê Lợi P. Sài Gòn
//ta dùng thư viện RestClient, xịn hơn là OpenFeign, khai báo hoy, ko gõ code phần gọi API
        //cách dùng OpenFeign rất giống Spring Data, tức là ta làm 1 cái interface giống JpaRepository<data type cột key, tên entity class>
        // thì bên này cx làm 1 interface có hàm gọi API bên User Service
//chỉ khai báo lời gọi endpoint bên kia, -DECLARATIVE

        Long begin = System.currentTimeMillis();// bấm đồng hồ đo thời gian, để xem mất bao lâu
        //mất 5s để gọi sang user-service
        UserResponseDTO user = userAPI.getUserById(555L);

        Long end = System.currentTimeMillis();
        return "Order " + orderId + " for user " + user.getName() + " at address " + user.getAddress() +"        Time taken to call user-service: " + (end - begin) + " ms";
    }
}
