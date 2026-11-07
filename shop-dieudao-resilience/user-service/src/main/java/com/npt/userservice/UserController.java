package com.npt.userservice;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.web.bind.annotation.CrossOrigin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

//REST API trả về thông tin user lấy từ db,
// cung cấp cho React (gọi qua Axios, fetch),
// và còn cho Order API gọi (qua OpenFeign)
@RestController
@CrossOrigin(origins = "*")
@Tag(name = "User & Chaos API", description = "Các endpoint lấy user và điều khiển sự cố chaos (delay, 500, fail N)")
@RequestMapping("/api/users") //localhost:8081/api/users/1
public class UserController {

    private final ChaosState chaos;

    public UserController(ChaosState chaos) {
        this.chaos = chaos;
    }

    @GetMapping("/{userId}")
    public UserResponseDTO getUserById(@PathVariable Long userId) throws InterruptedException {
        int call = chaos.nextCall();
        System.out.println("[user-service] call #" + call + " userId=" + userId
                + " | delayMs=" + chaos.getDelayMs()
                + " failPercent=" + chaos.getFailPercent()
                + " failFirstN(left)=" + chaos.getFailFirstN());

        // 1) giả lập service chậm
        if (chaos.getDelayMs() > 0) {
            Thread.sleep(chaos.getDelayMs());
        }
        // 2) giả lập service lỗi
        if (chaos.shouldFail()) {
            System.out.println("[user-service] call #" + call + " -> 500 (injected failure)");
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "chaos: injected failure");
        }
        // hard code
        return new UserResponseDTO(userId, "Thành", "1 Lê Lợi, HCM City");
    }

    /**
     * Điều khiển sự cố lúc đang chạy (GET hoặc POST đều được, tiện gõ trên trình duyệt):
     *   /api/users/chaos?delayMs=4000            -> service chậm 4s
     *   /api/users/chaos?failPercent=100         -> service sập (luôn 500)
     *   /api/users/chaos?failFirstN=2            -> 2 request đầu lỗi rồi tự khỏe
     *   /api/users/chaos                         -> chỉ xem trạng thái hiện tại
     */
    @RequestMapping(path = "/chaos", method = {RequestMethod.GET, RequestMethod.POST})
    public Map<String, Object> chaos(@RequestParam(required = false) Long delayMs,
                                     @RequestParam(required = false) Integer failPercent,
                                     @RequestParam(required = false) Integer failFirstN) {
        chaos.configure(delayMs, failPercent, failFirstN);
        return state();
    }

    /** Đưa user-service về trạng thái khỏe mạnh + reset bộ đếm. */
    @RequestMapping(path = "/chaos/reset", method = {RequestMethod.GET, RequestMethod.POST})
    public Map<String, Object> reset() {
        chaos.reset();
        return state();
    }

    private Map<String, Object> state() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("delayMs", chaos.getDelayMs());
        m.put("failPercent", chaos.getFailPercent());
        m.put("failFirstNLeft", chaos.getFailFirstN());
        m.put("totalCalls", chaos.getTotalCalls());
        return m;
    }
}
