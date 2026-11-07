package com.npt.userservice.controller;

import com.npt.userservice.service.ChaosState;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@CrossOrigin(origins = "*")
@Tag(name = "Chaos API", description = "Điều khiển sự cố giả lập của User Service")
@RequestMapping("/api/chaos")
public class ChaosController {

    private final ChaosState chaos;

    public ChaosController(ChaosState chaos) {
        this.chaos = chaos;
    }

    @Operation(summary = "Cấu hình giả lập sự cố (Chaos Injection)",
            description = "Điều khiển sự cố lúc runtime (POST): delayMs (độ trễ ms), failPercent (% lỗi 500), failFirstN (lỗi N lần đầu rồi tự phục hồi).")
    @PostMapping
    public Map<String, Object> configure(@RequestParam(required = false) Long delayMs,
                                         @RequestParam(required = false) Integer failPercent,
                                         @RequestParam(required = false) Integer failFirstN) {
        chaos.configure(delayMs, failPercent, failFirstN);
        return state();
    }

    @Operation(summary = "Khôi phục trạng thái bình thường (Reset Chaos)",
            description = "Đưa user-service về trạng thái bình thường (delay=0, fail=0) và reset bộ đếm tổng số cuộc gọi.")
    @PostMapping("/reset")
    public Map<String, Object> reset() {
        chaos.reset();
        return state();
    }

    @Operation(summary = "Xem trạng thái cấu hình Chaos hiện tại",
            description = "Xem thông số delayMs, failPercent, failFirstN và tổng số request đã nhận.")
    @GetMapping
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

