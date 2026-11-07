package com.npt.orderservice.client;

import com.npt.orderservice.config.NoRetryFeignConfig;
import com.npt.orderservice.dto.UserResponseDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/**
 * Feign client RIÊNG cho kịch bản HỘI TỤ 4 topic.
 *
 * Khác {@link UserResilientClient} ở chỗ readTimeout NGẮN (1s) để mỗi lần thử bị Feign cắt nhanh,
 * kịch bản chạy gọn trong vài giây. Timeout cấu hình ở application.properties:
 *   spring.cloud.openfeign.client.config.user-converge.*
 *
 * Retryer của Feign bị tắt (NoRetryFeignConfig): việc retry do Resilience4j quyết định.
 */
@FeignClient(name = "user-converge",
        url = "${user-service.url}/api/users",
        configuration = NoRetryFeignConfig.class)
public interface UserConvergeClient {

    @GetMapping("/{userId}")
    UserResponseDTO getUserById(@PathVariable("userId") Long userId);
}
