package com.npt.orderservice;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "xxx", url = "http://localhost:8081/api/users") // tên service và url của user-service
public interface UserClient {

    // khai báo các hàm như viết REST api bình thường
    @GetMapping("/{userId}")
    public UserResponseDTO getUserById(@RequestParam Long userId);
}
// //chỉ khai báo các lời gọi api sang bên user-service
//DI DEPENDENCY INJECTION, new cái Interface này và chấm gọi hàm getUserById(555L) - autowired
