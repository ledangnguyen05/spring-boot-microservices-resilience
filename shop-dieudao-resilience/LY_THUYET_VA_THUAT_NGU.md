# Nguyên lý hoạt động và thuật ngữ của 4 topic Resilience

Tài liệu này giải thích **vì sao cần**, **hoạt động thế nào** và **các thuật ngữ** của bốn topic seminar, rồi ghép chúng thành một kịch bản hội tụ (mục 6). Thao tác demo từng bước nằm ở [DEMO_RESILIENCE.md](DEMO_RESILIENCE.md).

| # | Topic | Câu hỏi mà cơ chế trả lời |
| - | ----- | ------------------------- |
| 1 | Feign / RestClient timeout | Chờ một lời gọi tối đa bao lâu? |
| 2 | Spring Retry / Resilience4j Retry | Lời gọi vừa lỗi, có thử lại không và chờ bao lâu? |
| 3 | Resilience4j Bulkhead | Còn đủ "suất" để nhận thêm một lời gọi đồng thời không? |
| 4 | Resilience4j Circuit Breaker | Dựa trên kết quả gần đây, có nên cho lời gọi tiếp theo đi qua không? |

## 0. Bối cảnh chung và thuật ngữ nền

Trong kiến trúc microservices, `order-service` (bên gọi) phải gọi `user-service` (bên bị gọi) qua mạng. Mạng và dịch vụ phía sau có thể chậm hoặc lỗi bất cứ lúc nào. Nếu bên gọi cứ chờ và gọi tiếp, tài nguyên của nó (luồng, kết nối) cạn dần và sự cố **lan dây chuyền**.

| Thuật ngữ | Nghĩa |
| --------- | ----- |
| **Cascading failure** (lỗi dây chuyền) | Một dịch vụ chậm/lỗi kéo các dịch vụ gọi nó chậm/lỗi theo, rồi lan tiếp. |
| **Downstream / Upstream** | Downstream là dịch vụ bị gọi (ở đây là `user-service`). Upstream là bên gọi. |
| **Transient fault** (lỗi thoáng qua) | Lỗi tự hết sau thời gian ngắn: mạng chớp, instance đang khởi động. Thử lại thường khỏi. |
| **Thread exhaustion** (cạn luồng) | Mọi luồng xử lý đều đang chờ downstream, không còn luồng cho request mới. |
| **Fail-fast** (thất bại nhanh) | Từ chối ngay thay vì chờ vô ích. Trả lỗi sớm tốt hơn treo lâu. |
| **Idempotent** (lũy đẳng) | Thao tác lặp lại nhiều lần cho cùng kết quả (ví dụ đọc dữ liệu). Chỉ nên retry thao tác idempotent, hoặc phải có khóa idempotency. |
| **Chaos injection** | Cố ý gây sự cố để kiểm chứng. Project dùng `ChaosState` ở `user-service`: `delayMs` (chậm), `failPercent` (% lỗi 500), `failFirstN` (N lần đầu lỗi rồi tự hết). |

---

## 1. Feign / RestClient timeout

### Vấn đề
Không đặt timeout thì lời gọi có thể chờ rất lâu (hoặc vô hạn). Mỗi lời gọi treo giữ một luồng, đủ nhiều lời gọi treo sẽ làm cạn luồng của `order-service`.

### Nguyên lý
HTTP client đặt **hai giới hạn** ở hai giai đoạn của một lời gọi:

```text
Bên gọi                                            Bên bị gọi
   │── mở kết nối (TCP) ───────────────────────────►│
   │   ◄── giới hạn: CONNECT timeout                │
   │── gửi request ────────────────────────────────►│
   │   (user-service xử lý / bị trễ)                │
   │   ◄── giới hạn: READ timeout ──────────────────│ phản hồi
```

Hết giới hạn nào thì client **tự ngắt chờ** và ném ngoại lệ. Bên gọi giải phóng luồng và xử lý lỗi ngay thay vì chờ tiếp.

### Thuật ngữ

| Thuật ngữ | Nghĩa | Trong project |
| --------- | ----- | ------------- |
| **connectTimeout** | Thời gian tối đa để **thiết lập kết nối**. Máy đích không phản hồi khi mở kết nối thì dính giới hạn này. | `user-resilient`: 1000 ms. `user-converge`: 500 ms. |
| **readTimeout** | Thời gian tối đa **chờ dữ liệu** sau khi đã kết nối. Đây là giới hạn chờ giữa các lần nhận dữ liệu, nên không phải lúc nào cũng bằng tổng thời gian request. | `user-resilient`: 3000 ms. `user-converge`: 1000 ms. |
| **SocketTimeoutException** | Ngoại lệ Java khi hết readTimeout. Feign bọc lại thành `FeignException` với `status() < 0`. | `toFailure()` đổi thành `FEIGN_TIMEOUT` (HTTP 504). |
| **Connection refused** | Máy đích từ chối kết nối ngay (service tắt). Đây không phải timeout. | `UPSTREAM_DOWN` (HTTP 503). |
| **OpenFeign** | Thư viện khai báo HTTP client bằng interface (`@FeignClient`). Timeout cấu hình theo tên client. | `spring.cloud.openfeign.client.config.<tên>.*` |
| **RestClient** | HTTP client đồng bộ kiểu fluent của Spring. Timeout nằm ở `ClientHttpRequestFactory` (hoặc `spring.http.clients.connect-timeout` / `read-timeout` với builder do Spring Boot cấu hình). | Chỉ trình bày để đối chiếu, project dùng Feign. |
| **TimeLimiter** (Resilience4j) | Giới hạn thời gian **bên gọi chờ kết quả bất đồng bộ**. Là tầng timeout thứ hai, ở mức ứng dụng. | `demo.timeout.duration-ms=1500` (chỉ ở Demo 1b và Demo 5). |

### Lưu ý khi trình bày
- Timeout **cắt việc chờ**, không bảo đảm bên bị gọi đã dừng xử lý. Với thao tác ghi, bên gọi có thể nhận timeout trong khi server vẫn hoàn tất, vì vậy cần idempotency.
- Timeout của lớp trong nên **nhỏ hơn** timeout của lớp ngoài, nếu không lớp ngoài cắt trước và lớp trong thành thừa.

---

## 2. Spring Retry / Resilience4j Retry

### Vấn đề
Lỗi thoáng qua rất phổ biến. Không retry thì chỉ một lần chớp mạng cũng thành lỗi cho người dùng.

### Nguyên lý
Khi một lần gọi lỗi **thuộc loại có thể phục hồi**, thư viện chờ một khoảng (backoff) rồi gọi lại, tối đa `maxAttempts` lần. Hết lượt mà vẫn lỗi thì ném lỗi cuối cùng.

```text
lần 1 ✗ ──chờ 500ms──► lần 2 ✗ ──chờ 1000ms──► lần 3 ✓      (maxAttempts = 3)
```

3 lần gọi chỉ có **2 khoảng chờ** (500 ms rồi 1000 ms), tổng khoảng 1,5 giây cộng thời gian của từng lần gọi.

### Thuật ngữ

| Thuật ngữ | Nghĩa | Trong project |
| --------- | ----- | ------------- |
| **Attempt / maxAttempts** | Số lần gọi, **tính cả lần đầu**. `maxAttempts = 3` nghĩa là 1 lần đầu + tối đa 2 lần thử lại. | `demo.retry.max-attempts=3` |
| **Backoff** | Khoảng chờ giữa hai lần gọi, để downstream có thời gian hồi phục. | — |
| **Fixed backoff** | Mỗi lần chờ như nhau. | — |
| **Exponential backoff** | Khoảng chờ nhân lên theo hệ số (`multiplier`). | 500 ms × 2 → 1000 ms (`IntervalFunction.ofExponentialBackoff`) |
| **Jitter** | Độ lệch ngẫu nhiên thêm vào backoff để nhiều client không thử lại cùng một lúc. Project chưa bật jitter. | — |
| **Retryable exception** | Loại lỗi đáng thử lại (timeout, lỗi mạng, 5xx). | `retryable()` trong `ResilienceKit` |
| **Non-retryable** | Thử lại vô ích hoặc có hại: 4xx (request sai), `CallNotPermittedException` (mạch đang mở), `BulkheadFullException` (đã quá tải). | Bị loại trừ trong `retryable()` |
| **Retry storm / amplification** | Nhiều client và nhiều tầng cùng retry làm tải **nhân lên** đúng lúc downstream yếu nhất. | Feign `Retryer` bị tắt (`NoRetryFeignConfig`) để không bị 3 × 3 = 9 lần gọi. |
| **Feign `Retryer`** | Cơ chế retry có sẵn của Feign. Client `xxx` của code mẫu dùng `Retryer.Default`; client demo dùng `NEVER_RETRY`. | `FeignConfig`, `NoRetryFeignConfig` |

### Spring Retry và Resilience4j Retry

| Tiêu chí | Spring Retry | Resilience4j Retry |
| -------- | ------------ | ------------------ |
| Cách áp dụng | `@EnableRetry` + `@Retryable` (qua Spring AOP proxy), hoặc `RetryTemplate.execute(...)` | `RetryConfig` rồi bọc hàm bằng `Decorators` hoặc annotation |
| Điều kiện thử lại | `retryFor` / `noRetryFor` | `retryOnException`, `retryOnResult` |
| Khi hết lượt | `@Recover` hoặc callback của `RetryTemplate` | Lỗi cuối được ném ra (hoặc dùng fallback) |
| Lưu ý | Lời gọi phải đi qua **proxy**: phương thức tự gọi phương thức khác trong cùng bean sẽ **bỏ qua** retry. | Thứ tự lồng với Circuit Breaker / Bulkhead thể hiện rõ trong code. |

Project dùng Resilience4j vì cần lồng nhiều cơ chế và thấy rõ thứ tự. Spring Retry chỉ được trình bày để đối chiếu, không có code chạy. Theo tôi biết, Spring Framework 7 (nền của Spring Boot 4) cũng đã có sẵn `@Retryable` và `RetryTemplate` trong lõi, bạn nên kiểm tra lại tài liệu Spring trước khi đưa điểm này lên slide.

---

## 3. Resilience4j Bulkhead

### Vấn đề
Một downstream chậm làm các lời gọi **ở lại lâu hơn**, số lời gọi đồng thời tăng dần cho đến khi chiếm hết luồng của bên gọi. Khi đó các chức năng khác không liên quan cũng chết theo.

### Nguyên lý
Tên gọi lấy từ **vách ngăn khoang tàu**: một khoang thủng nước thì các khoang khác vẫn nổi. Bulkhead giới hạn **số lời gọi đang chạy đồng thời** vào một downstream. Hết "suất" thì lời gọi mới bị **từ chối ngay** (hoặc xếp hàng có giới hạn). Suất được trả lại khi lời gọi kết thúc.

```text
10 request đến cùng lúc     ┌─ 3 suất ─┐
 ──────────────────────────►│ ● ● ●    │──► user-service (chậm 2s)
                            └──────────┘
 7 request còn lại ──► bị từ chối ngay: BulkheadFullException (HTTP 429)
```

### Thuật ngữ

| Thuật ngữ | Nghĩa | Trong project |
| --------- | ----- | ------------- |
| **Bulkhead** | Vách ngăn cô lập tài nguyên cho từng downstream. | — |
| **Semaphore Bulkhead** | Đếm số lời gọi đồng thời bằng semaphore. Lời gọi chạy ngay **trên luồng của bên gọi** sau khi lấy được suất. Nhẹ, đơn giản. | `maxConcurrentCalls = 3`, `maxWaitDuration = 0` |
| **ThreadPool Bulkhead** | Lời gọi chạy trên **pool luồng riêng**. Khi worker bận, tác vụ chờ trong hàng đợi có giới hạn. Cô lập mạnh hơn nhưng tốn luồng. | Chỉ dùng ở Demo 5: core 3, max 3, queue 2 (nhận tối đa 5 cùng lúc) |
| **maxConcurrentCalls** | Số suất đồng thời tối đa. | 3 |
| **maxWaitDuration** | Chờ suất tối đa bao lâu trước khi từ chối. `0` = từ chối ngay. | 0 ms |
| **BulkheadFullException** | Ngoại lệ khi hết suất. | `BULKHEAD_FULL`, HTTP 429 |
| **Rate limiter** (khác) | Giới hạn số lời gọi **trong một khoảng thời gian**. Bulkhead giới hạn số lời gọi **đang chạy cùng lúc**. | Không dùng |

Bulkhead đầy là **quá tải cục bộ**, không phải lỗi của `user-service`, nên cấu hình Circuit Breaker của project **bỏ qua** loại lỗi này.

---

## 4. Resilience4j Circuit Breaker

### Vấn đề
Downstream đã sập mà vẫn dồn request vào thì mỗi request phải chờ vô ích (hoặc chờ đến timeout), đồng thời làm downstream khó hồi phục hơn.

### Nguyên lý
Giống **cầu dao điện**: theo dõi kết quả các lời gọi gần đây. Khi tỷ lệ lỗi vượt ngưỡng, **ngắt mạch** và từ chối ngay các lời gọi mới. Sau một thời gian, thả vài lời gọi **thăm dò** để xem downstream đã khỏe chưa.

```text
                 tỷ lệ lỗi ≥ 50% (đủ 5 mẫu)
     ┌────────┐ ───────────────────────────► ┌────────┐
     │ CLOSED │                              │  OPEN  │  từ chối ngay (CallNotPermittedException)
     └────────┘ ◄─────────────┐              └────────┘
         ▲                    │                  │ sau 10 giây (tự động)
         │ 2 lượt thăm dò     │                  ▼
         │ đều OK        ┌──────────┐ ◄─────────┘
         └───────────────│HALF_OPEN │  cho 2 lượt thăm dò đi qua
                         └──────────┘ ──── thăm dò lỗi ───► quay lại OPEN
```

### Thuật ngữ

| Thuật ngữ | Nghĩa | Trong project |
| --------- | ----- | ------------- |
| **CLOSED** | Bình thường: cho đi qua và ghi nhận kết quả. | Trạng thái đầu |
| **OPEN** | Ngắt mạch: từ chối ngay, **không gọi** downstream. | `CIRCUIT_OPEN`, HTTP 503 |
| **HALF_OPEN** | Nửa mở: cho vài lời gọi thăm dò. Khỏe thì CLOSED, lỗi thì OPEN lại. | 2 lượt thăm dò |
| **Sliding window** (cửa sổ trượt) | Tập kết quả dùng để tính tỷ lệ lỗi. *Count-based* giữ N lời gọi gần nhất, *time-based* giữ các lời gọi trong N giây gần nhất. | Count-based, N = 5 |
| **minimumNumberOfCalls** | Số mẫu tối thiểu trước khi đánh giá, để vài lỗi đầu không làm mở mạch. | 5 |
| **failureRateThreshold** | Ngưỡng % lỗi để mở mạch. | 50% (2/5 = 40% giữ nguyên, 3/5 = 60% mở) |
| **waitDurationInOpenState** | Thời gian ở OPEN trước khi sang HALF_OPEN. | 10 giây, tự chuyển (`automaticTransitionFromOpenToHalfOpenEnabled`) |
| **permittedNumberOfCallsInHalfOpenState** | Số lời gọi thăm dò ở HALF_OPEN. | 2 |
| **CallNotPermittedException** | Ngoại lệ khi mạch OPEN từ chối lời gọi. | Ánh xạ thành `CIRCUIT_OPEN` |
| **ignoreException** | Loại lỗi **không tính** vào tỷ lệ lỗi. | 4xx của Feign và `BulkheadFullException` |
| **Slow call rate** | Ngưỡng tỷ lệ lời gọi chậm (Resilience4j hỗ trợ). | Không dùng |

---

## 5. Thứ tự lồng và vì sao

Khi dùng `Decorators`, `with*` gọi **sau** thì bọc ở **ngoài**. Thứ tự của kịch bản hội tụ (từ ngoài vào trong):

```text
Retry  →  Circuit Breaker  →  Bulkhead  →  Feign (connect/read timeout)  →  user-service
```

| Vị trí | Cơ chế | Lý do đặt ở đó |
| ------ | ------ | -------------- |
| Trong cùng | **Feign timeout** | Là giới hạn của **từng** lời gọi HTTP: biến việc treo thành một lỗi rõ ràng. |
| Kế tiếp | **Bulkhead** | Chỉ cho tối đa N lời gọi thật chạm tới Feign. Hết suất thì từ chối trước khi gọi. |
| Kế tiếp | **Circuit Breaker** | Ghi nhận kết quả **mọi lần gọi** (kể cả lần retry) để biết downstream đang lỗi hàng loạt. |
| Ngoài cùng | **Retry** | Quyết định thử lại dựa trên lỗi nhận được. Nằm ngoài nên **thấy** được `CallNotPermittedException` và `BulkheadFullException` rồi **dừng** thay vì gọi tiếp. |

Nếu đảo Retry vào trong Circuit Breaker thì cả chuỗi retry chỉ được tính là **một** lời gọi trong cửa sổ trượt, mạch phản ứng chậm hơn.

---

## 6. Kịch bản hội tụ: cả 4 topic cùng hoạt động

Endpoint: `GET /api/orders/resilience/converge/{userId}` (một lời gọi qua đủ 4 lớp) và `GET /api/orders/resilience/burst/converge?n=6` (nhiều lời gọi song song).

Cấu hình dùng chung: Feign `user-converge` (connect 500 ms, **read 1000 ms**), Bulkhead 3 suất, Circuit Breaker (cửa sổ 5, ngưỡng 50%, mở 10 giây), Retry 3 lần (500 ms rồi 1000 ms). **Không** có TimeLimiter và fallback, nên chỉ đúng 4 topic tham gia.

Trên giao diện web, chọn kịch bản **Hội tụ 4 topic** rồi bấm **Chạy kịch bản 4 pha**. Giao diện tự đổi sự cố ở `user-service` giữa các pha.

| Pha | Sự cố giả lập | Lời gọi | Cơ chế ra tay | Kết quả mong đợi |
| --- | ------------- | ------- | ------------- | ---------------- |
| **1** Lưu lượng tăng | `delayMs=600` | `burst/converge?n=6` | **Bulkhead** | 3 lượt `OK`, 3 lượt `BULKHEAD_FULL` (HTTP 429). Tổng 3 lần gọi User. Lượt bị từ chối không retry và không bị tính là lỗi. |
| **2** Lỗi thoáng qua | `failFirstN=2` | `converge/1` | **Retry** | HTTP 200, `attempts = 3`, khoảng 1,5 giây (chờ 500 ms rồi 1000 ms). |
| **3** User Service treo | `delayMs=3000` | `converge/1` | **Feign timeout** + **Circuit Breaker** + **Retry** | Feign cắt lần gọi đầu sau **1 giây** (không chờ 3 giây). Lỗi này đẩy tỷ lệ lỗi lên 60% nên mạch **OPEN**. Retry chờ 500 ms, thấy mạch mở thì **dừng**. Kết quả `CIRCUIT_OPEN`, `attempts = 1`, khoảng 1,5 giây. |
| **4** Mạch đang mở | `delayMs=3000` | `converge/1` | **Circuit Breaker** (+ Retry không thử lại) | `CIRCUIT_OPEN` ngay (vài ms), `attempts = 0`, User Service không nhận thêm lời gọi nào. |

### Vì sao pha 3 làm mạch mở: số học của cửa sổ trượt

Cửa sổ giữ 5 kết quả **gần nhất** (OK = ✓, lỗi = ✗). Lượt Bulkhead bị từ chối **không** được ghi nhận.

| Sau bước | Cửa sổ 5 mẫu gần nhất | Tỷ lệ lỗi | Mạch |
| -------- | --------------------- | --------- | ---- |
| Pha 1 (3 lượt OK) | ✓ ✓ ✓ (mới 3 mẫu) | chưa đánh giá | CLOSED |
| Pha 2, lần gọi 1–2 (lỗi 500) | ✓ ✓ ✓ ✗ ✗ | 40% | CLOSED |
| Pha 2, lần gọi 3 (OK) | ✓ ✓ ✗ ✗ ✓ | 40% | CLOSED |
| Pha 3, lần gọi 1 (Feign timeout) | ✓ ✗ ✗ ✓ ✗ | **60%** | **OPEN** |

### Chạy bằng tay (Swagger hoặc `demo.http`)

1. `POST :8081/api/chaos/reset` và `POST :8082/api/orders/resilience/reset`.
2. Pha 1: `POST :8081/api/chaos?delayMs=600`, rồi `GET .../burst/converge?n=6`.
3. Pha 2: `POST :8081/api/chaos/reset`, `POST :8081/api/chaos?failFirstN=2`, rồi `GET .../converge/1`.
4. Pha 3: `POST :8081/api/chaos/reset`, `POST :8081/api/chaos?delayMs=3000`, rồi `GET .../converge/1`.
5. Pha 4: gọi lại `GET .../converge/1`.
6. Phục hồi (tùy chọn): `POST :8081/api/chaos/reset`, đợi hơn 10 giây (mạch sang `HALF_OPEN`), gọi `converge/1` hai lần, rồi xem `GET .../status` để thấy `circuitBreaker_converge: CLOSED`.

> **Lưu ý khi demo:** kết quả phụ thuộc vào đúng thứ tự các pha và việc mạch được reset từ đầu. Nếu số liệu lệch (ví dụ lần chạy đầu JVM còn "lạnh" nên một lượt ở pha 1 bị chậm quá 1 giây), bấm **Đặt lại** rồi chạy lại. Nên chạy thử một lần trước giờ trình bày.

---

## 7. Câu hỏi thường gặp khi bảo vệ

**Vì sao Retry ở ngoài Circuit Breaker?** Để mỗi lần thử đều được breaker ghi nhận, và để Retry nhìn thấy `CallNotPermittedException` rồi dừng ngay (mục 5).

**Retry nhiều tầng thì sao?** Số lần gọi nhân lên (3 × 3 = 9) làm Retry Storm. Vì vậy `Retryer` của Feign bị tắt ở client demo và giao việc retry cho một tầng duy nhất.

**Timeout 1 giây có cắt được việc `user-service` đang làm không?** Không. Timeout chỉ làm bên gọi thôi chờ. `user-service` vẫn có thể xử lý xong (mục 1).

**Bulkhead khác Circuit Breaker thế nào?** Bulkhead giới hạn số lời gọi **đồng thời** để cô lập tài nguyên, bất kể downstream tốt hay xấu. Circuit Breaker dựa trên **kết quả lịch sử** để quyết định có gọi tiếp hay không.

**Vì sao lỗi 4xx không được retry và không làm mở mạch?** Đó là lỗi của request, không phải downstream sập. Gọi lại vẫn sai, và không nên coi là dấu hiệu service hỏng.

**Khi nào không nên retry?** Thao tác ghi không idempotent, hoặc khi mạch đã mở, hoặc khi hệ thống đang quá tải.
