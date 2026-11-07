package com.npt.userservice.controller;

import com.npt.userservice.dto.UserResponseDTO;
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

@RestController
@CrossOrigin(origins = "*")
@Tag(name = "Users API", description = "Tra cứu thông tin người dùng")
@RequestMapping("/api/users")
public class UserController {

    private final ChaosState chaos;

    public UserController(ChaosState chaos) {
        this.chaos = chaos;
    }

    @Operation(summary = "Lấy thông tin User theo ID",
            description = "Trả về thông tin User. Nếu ChaosState được kích hoạt, service sẽ giả lập độ trễ (delayMs) hoặc trả lỗi 500 (failPercent, failFirstN).")
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

        return new UserResponseDTO(userId, "Thành", "1 Lê Lợi, HCM City");
    }
}
