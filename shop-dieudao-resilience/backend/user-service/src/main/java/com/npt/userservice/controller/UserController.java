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
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@CrossOrigin(origins = "*")
@Tag(name = "User & Chaos API", description = "Các endpoint lấy User và điều khiển sự cố Chaos (delay, 500, failFirstN)")
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

    @Operation(summary = "Cấu hình giả lập sự cố (Chaos Injection)",
            description = "Điều khiển sự cố lúc runtime (GET/POST): delayMs (độ trễ ms), failPercent (% lỗi 500), failFirstN (lỗi N lần đầu rồi tự phục hồi).")
    @RequestMapping(path = "/chaos", method = {RequestMethod.GET, RequestMethod.POST})
    public Map<String, Object> chaos(@RequestParam(required = false) Long delayMs,
                                     @RequestParam(required = false) Integer failPercent,
                                     @RequestParam(required = false) Integer failFirstN) {
        chaos.configure(delayMs, failPercent, failFirstN);
        return state();
    }

    @Operation(summary = "Khôi phục trạng thái bình thường (Reset Chaos)",
            description = "Đưa user-service về trạng thái bình thường (delay=0, fail=0) và reset bộ đếm tổng số cuộc gọi.")
    @RequestMapping(path = "/chaos/reset", method = {RequestMethod.GET, RequestMethod.POST})
    public Map<String, Object> reset() {
        chaos.reset();
        return state();
    }

    @Operation(summary = "Xem trạng thái cấu hình Chaos hiện tại",
            description = "Xem thông số delayMs, failPercent, failFirstN và tổng số request đã nhận.")
    @GetMapping("/chaos/state")
    public Map<String, Object> state() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("delayMs", chaos.getDelayMs());
        m.put("failPercent", chaos.getFailPercent());
        m.put("failFirstN_remaining", chaos.getFailFirstN());
        m.put("failFirstNLeft", chaos.getFailFirstN());
        m.put("totalCalls", chaos.getTotalCalls());
        return m;
    }
}

