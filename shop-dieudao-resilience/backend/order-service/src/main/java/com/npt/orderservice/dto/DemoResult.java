package com.npt.orderservice.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * Kết quả trả về cho mỗi lần demo Resilience.
 *
 * @param pattern    tên demo (1-TIMEOUT, 2-RETRY, ...)
 * @param outcome    OK | TIMEOUT | BULKHEAD_FULL | CIRCUIT_OPEN | UPSTREAM_5XX | FEIGN_TIMEOUT | FALLBACK | ERROR
 * @param httpStatus mã HTTP trả cho client
 * @param message    giải thích bằng tiếng Việt
 * @param user       dữ liệu user (null nếu lỗi)
 * @param attempts   số lần THỰC SỰ gọi sang user-service (để thấy retry)
 * @param elapsedMs  tổng thời gian xử lý
 * @param fallback   true nếu dữ liệu là dự phòng
 * @param attemptResults kết quả từng lời gọi User Service trong demo Retry
 */
public record DemoResult(String pattern,
                         String outcome,
                         int httpStatus,
                         String message,
                         UserResponseDTO user,
                         int attempts,
                         long elapsedMs,
                         boolean fallback,
                         @JsonInclude(JsonInclude.Include.NON_EMPTY) List<RetryAttempt> attemptResults) {

    public DemoResult(String pattern, String outcome, int httpStatus, String message,
                      UserResponseDTO user, int attempts, long elapsedMs, boolean fallback) {
        this(pattern, outcome, httpStatus, message, user, attempts, elapsedMs, fallback, List.of());
    }

    public DemoResult withAttemptResults(List<RetryAttempt> attemptResults) {
        return new DemoResult(pattern, outcome, httpStatus, message, user, attempts, elapsedMs, fallback, attemptResults);
    }

    public record RetryAttempt(int number, Integer httpStatus, String outcome, long elapsedMs) {}
}

