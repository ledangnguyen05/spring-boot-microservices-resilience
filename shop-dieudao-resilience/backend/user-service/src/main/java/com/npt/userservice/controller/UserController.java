package com.npt.userservice.controller;

import com.npt.userservice.dto.UserResponseDTO;
import com.npt.userservice.entity.User;
import com.npt.userservice.repository.UserRepository;
import com.npt.userservice.service.ChaosState;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@CrossOrigin(origins = "*")
@Tag(name = "Users API", description = "Tra cứu thông tin người dùng")
@RequestMapping("/api/users")
public class UserController {

    private final ChaosState chaos;
    private final UserRepository userRepository;

    public UserController(ChaosState chaos, UserRepository userRepository) {
        this.chaos = chaos;
        this.userRepository = userRepository;
    }

    @Operation(summary = "Lấy danh sách tất cả Users",
            description = "Trả về danh sách 10 Users được seed trong cơ sở dữ liệu.")
    @GetMapping
    public List<User> getAllUsers() {
        return userRepository.findAll();
    }

    @Operation(summary = "Lấy thông tin User theo ID",
            description = "Trả về thông tin User từ cơ sở dữ liệu. Nếu ChaosState được kích hoạt, service sẽ giả lập độ trễ (delayMs) hoặc trả lỗi 500 (failPercent, failFirstN).")
    @GetMapping("/{userId}")
    public UserResponseDTO getUserById(@PathVariable Long userId) throws InterruptedException {
        int call = chaos.nextCall();
        System.out.println("[user-service] call #" + call + " userId=" + userId
                + " | delayMs=" + chaos.getDelayMs()
                + " failPercent=" + chaos.getFailPercent()
                + " failFirstN(left)=" + chaos.getFailFirstN());

        // 1) Giả lập service chậm -> kích hoạt TIMEOUT / BULKHEAD ở order-service
        if (chaos.getDelayMs() > 0) {
            Thread.sleep(chaos.getDelayMs());
        }
        // 2) Giả lập service lỗi -> kích hoạt RETRY / CIRCUIT BREAKER ở order-service
        if (chaos.shouldFail()) {
            System.out.println("[user-service] call #" + call + " -> 500 (injected failure)");
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "chaos: injected failure");
        }

        User user = userRepository.findById(userId)
                .orElseGet(() -> new User(userId, "Khách #" + userId, "user" + userId + "@example.com", "0900000000", "Địa chỉ mặc định, HCM City"));

        return new UserResponseDTO(user.getId(), user.getName(), user.getAddress());
    }
}
