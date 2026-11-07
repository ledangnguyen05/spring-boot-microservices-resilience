package com.npt.orderservice.resilience;

import com.npt.orderservice.UserResponseDTO;

/**
 * Kết quả trả về cho mỗi lần demo.
 *
 * @param pattern    tên demo (1-TIMEOUT, 2-RETRY, ...)
 * @param outcome    OK | TIMEOUT | BULKHEAD_FULL | CIRCUIT_OPEN | UPSTREAM_5XX | FEIGN_TIMEOUT | FALLBACK | ERROR
 * @param httpStatus mã HTTP trả cho client
 * @param message    giải thích bằng tiếng Việt
 * @param user       dữ liệu user (null nếu lỗi)
 * @param attempts   số lần THỰC SỰ gọi sang user-service (để thấy retry)
 * @param elapsedMs  tổng thời gian xử lý
 * @param fallback   true nếu dữ liệu là dự phòng
 */
public record DemoResult(String pattern,
                         String outcome,
                         int httpStatus,
                         String message,
                         UserResponseDTO user,
                         int attempts,
                         long elapsedMs,
                         boolean fallback) {
}
