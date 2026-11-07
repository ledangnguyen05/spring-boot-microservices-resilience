# Demo Resilience: Timeout + Retry + Bulkhead + Circuit Breaker

Mở rộng từ `shop-dieudao-timeout-gateway` (api-gateway → order-service → user-service).
Dùng **Resilience4j 2.3.0 (core + decorators)**, không dùng annotation/autoconfig nên chạy ổn với Spring Boot 4.1.1 và thứ tự lồng các pattern nhìn thấy rõ trong code.

```
Client ─► api-gateway :8080 ─► order-service :8082 ─(Feign)─► user-service :8081
                                 └─ Resilience4j                └─ "chaos" làm chậm / làm lỗi
```

## Có gì mới so với code mẫu

| Module | Thay đổi |
|---|---|
| `user-service` | `ChaosState` + endpoint `/api/users/chaos` để **giả lập sự cố lúc đang chạy** (chậm, lỗi 500, lỗi N lần đầu). Không còn `sleep(2000)` cứng. |
| `order-service` | Package `resilience/`: `ResilienceKit` (cấu hình 4 pattern), `ResilienceDemoService` (5 demo), `ResilienceDemoController`, Feign client `user-resilient` (tắt Retryer của Feign). Endpoint gốc `/api/orders/{id}` **giữ nguyên**. |
| `api-gateway` | Thêm `connect-timeout` / `response-timeout=20s` (lớp timeout ngoài cùng). |
| root `pom.xml` | Thêm module `api-gateway`. |
| `demo.http` | Kịch bản chạy từng bước bằng IntelliJ HTTP Client. |

## Chạy

Cần JDK 17+ (user-service trong code mẫu đang cấu hình compiler 24 + preview, giữ nguyên như bạn đã có).

```bash
# 3 terminal (hoặc 3 Run Configuration trong IntelliJ), theo thứ tự:
cd user-service  && ./mvnw spring-boot:run     # :8081
cd order-service && ./mvnw spring-boot:run     # :8082
cd api-gateway   && ./mvnw spring-boot:run     # :8080
```

Mở `demo.http` trong IntelliJ và bấm ▶ từng request. Hoặc dùng curl/trình duyệt (các endpoint đều là GET).
Theo dõi **log của order-service**: có dòng `[RETRY ...]`, `[CB ... chuyển trạng thái ...]`, `[combined] gọi user-service lần #n`.

## 4 pattern + bản kết hợp

| # | Endpoint (qua gateway) | Pattern | Chuẩn bị sự cố | Kết quả mong đợi |
|---|---|---|---|---|
| 1 | `/api/orders/demo/timeout/1` | **TimeLimiter** 1.5s | `chaos?delayMs=4000` | ~1.5s, `TIMEOUT`, HTTP 504 |
| 2 | `/api/orders/demo/retry/1` | **Retry** 3 lần, backoff 0.5s→1s | `chaos?failFirstN=2` | `OK`, `attempts=3`, ~1.5s |
| 3 | `/api/orders/demo/burst/bulkhead?n=10` | **Bulkhead** (semaphore, 3 đồng thời) | `chaos?delayMs=2000` | 3 `OK`, 7 `BULKHEAD_FULL` (HTTP 429, bị từ chối ngay) |
| 4 | `/api/orders/demo/circuit-breaker/1` (gọi 6+ lần) | **Circuit Breaker** (cửa sổ 5 lần, ≥50% lỗi, mở 10s) | `chaos?failPercent=100` | 5 lần `UPSTREAM_5XX`, từ lần 6 `CIRCUIT_OPEN` (HTTP 503, ~0ms) |
| 5 | `/api/orders/demo/combined/1` | **Cả 4 + fallback** | xem `demo.http` mục 5a–5f | xem dưới |

Endpoint phụ: `/demo/status` (trạng thái CB/bulkhead), `/demo/reset` (đưa CB về CLOSED), `/demo/burst/{pattern}?n=..` (bắn song song; pattern = `timeout|retry|bulkhead|circuit-breaker|combined|combined-nofallback`), `combined/1?fallback=false` (xem lỗi thật thay vì fallback).

Điều khiển user-service: `http://localhost:8081/api/users/chaos?delayMs=..&failPercent=..&failFirstN=..` và `/api/users/chaos/reset`.

## Bản kết hợp: thứ tự lồng là chìa khóa

```
request ─► RETRY ─► CIRCUIT BREAKER ─► TIME LIMITER ─► THREAD-POOL BULKHEAD ─► Feign ─► user-service
          (ngoài)                                                               (trong)
```

```java
Decorators.ofSupplier(call)
    .withThreadPoolBulkhead(tpb)            // trong cùng: tối đa 3 thread + 2 hàng đợi
    .withTimeLimiter(tl, scheduler)         // mỗi lần gọi tối đa 1.5s
    .withCircuitBreaker(cb)                 // mỗi lần (kể cả lần retry) đều được ghi nhận
    .withRetry(retry, scheduler)            // ngoài cùng: thử lại tối đa 3 lần
    .get();
```
Trong `Decorators`, `with*` gọi **sau** thì bọc ở **ngoài**. Vì sao thứ tự này:

- **Retry ngoài cùng** để mỗi lần thử lại đều đi qua CB/timeout/bulkhead; nhưng **không retry** khi `CallNotPermittedException` (CB mở) hay `BulkheadFullException` (đầy) – retry lúc đó chỉ làm tình hình tệ hơn. Lỗi 4xx cũng không retry.
- **CB bọc TimeLimiter** để timeout được tính là lỗi → service chậm cũng làm mạch mở, không chỉ service lỗi.
- **Bulkhead trong cùng** để giới hạn đúng số lời gọi thật sự sang user-service. Bulkhead đầy **không** tính là lỗi của CB (đó là quá tải cục bộ, không phải user-service hỏng).
- **Fallback** ở cuối: lỗi gì cũng trả `Khách (dự phòng)` với HTTP 200 thay vì 5xx.

### Kịch bản mẫu (xem chi tiết trong `demo.http`)

| Tình huống | Điều xảy ra |
|---|---|
| 5a Bình thường | `OK`, `attempts=1` |
| 5b Lỗi thoáng qua (`failFirstN=2`) | Retry cứu: `OK`, `attempts=3` |
| 5c user-service chậm 4s | Mỗi lần timeout 1.5s → retry 3 lần (~6s) → `FALLBACK`. Lần gọi kế tiếp, CB đủ 5 lỗi → mở giữa chừng, retry dừng ngay |
| 5c' Lần gọi thứ 3 | `CIRCUIT_OPEN`, `attempts=0`, ~0ms (fail-fast) |
| 5e Dồn 20 request song song | Phần lớn `BULKHEAD_FULL` (từ chối ngay), order-service không bị treo |
| 5f user-service khỏe lại | Sau 10s CB sang `HALF_OPEN`, 2 lần thử thành công → `CLOSED` |

## Lưu ý khi đọc kết quả

- **Retry của Feign vs Resilience4j**: client `user-resilient` đã tắt `Retryer` của Feign (`NoRetryFeignConfig`). Để cả hai cùng retry thì số lần gọi nhân lên (3×3=9) – "retry storm". Client `xxx` của code mẫu vẫn dùng `Retryer.Default`, nên `/api/orders/{id}` hoạt động như cũ (thử `chaos?delayMs=4000` để thấy Feign tự retry 3 lần, log user-service in 3 lần gọi).
- **Hai tầng timeout**: TimeLimiter 1.5s là cái cắt chính; Feign `readTimeout=3s` là lưới an toàn. TimeLimiter chỉ "bỏ chờ", request bên dưới vẫn chiếm thread tới khi Feign cắt – nên Feign readTimeout phải hữu hạn và nên chỉ lớn hơn TimeLimiter một chút.
- **Hai loại Bulkhead**: demo 3 dùng *semaphore* (đếm số request đồng thời, chạy trên thread của Tomcat, đơn giản). Demo kết hợp dùng *thread-pool* vì TimeLimiter cần một Future để cắt; sức chứa = `core-threads + queue-capacity` = 5.
- Tham số chỉnh ở `order-service/src/main/resources/application.properties` (`demo.*`), restart để áp dụng.
- Thời gian trong bảng là xấp xỉ; số lần thất bại chính xác trong cửa sổ CB phụ thuộc thứ tự bạn bấm request. Nếu kết quả lệch, chạy `/demo/reset` + `chaos/reset` rồi thử lại từ đầu.
