# Lý thuyết và hướng dẫn demo Timeout, Retry, Bulkhead và Circuit Breaker

Các bài demo bên dưới thực hiện trên trình duyệt bằng Swagger. Mỗi bài có phần lý thuyết, các bước thao tác và kết quả để đối chiếu.

| Cơ chế                            | Quyết định khi gọi dịch vụ phụ thuộc                                 |
| --------------------------------- | -------------------------------------------------------------------- |
| Feign / RestClient Timeout        | Chờ thiết lập kết nối hoặc đọc phản hồi trong bao lâu?               |
| Spring Retry / Resilience4j Retry | Khi một lần gọi thất bại, có thử lại không và chờ bao lâu?           |
| Resilience4j Circuit Breaker      | Dựa trên kết quả gần đây, có nên cho lời gọi tiếp theo đi qua không? |
| Resilience4j Bulkhead             | Hiện còn đủ suất để nhận thêm một lời gọi đồng thời không?           |

Project dùng **OpenFeign** làm HTTP client và **Resilience4j** cho Retry, Circuit Breaker, Bulkhead và TimeLimiter. **Spring Retry** và **Spring RestClient** được trình bày để đối chiếu. Các lệnh bên dưới chạy trên những thành phần đã tích hợp sẵn trong project.

## Chuẩn bị

Swagger của **User Service** dùng để tạo sự cố. Swagger của **Order Service** dùng để gọi thử và xem hệ thống phản ứng thế nào. Resilience4j bảo vệ lời gọi từ Order Service sang User Service. API Gateway cũng chuyển tiếp các API này.

Cần JDK 17. Mở ba cửa sổ PowerShell tại thư mục `shop-dieudao-resilience/backend`, chạy một lệnh trong mỗi cửa sổ và đợi dịch vụ khởi động.

| Cửa sổ        | Lệnh                                           | Cổng |
| ------------- | ---------------------------------------------- | ---- |
| User Service  | `.\mvnw.cmd -pl user-service spring-boot:run`  | 8081 |
| Order Service | `.\mvnw.cmd -pl order-service spring-boot:run` | 8082 |
| API Gateway   | `.\mvnw.cmd -pl api-gateway spring-boot:run`   | 8080 |

### Mở hai tab Swagger

| Tab       | Mở trang                                                             | Tìm nhóm                 |
| --------- | -------------------------------------------------------------------- | ------------------------ |
| **User**  | [Swagger User Service](http://localhost:8081/swagger-ui/index.html)  | **Chaos API**            |
| **Order** | [Swagger Order Service](http://localhost:8082/swagger-ui/index.html) | **Order Resilience API** |

Trong Swagger, **bấm vào dòng API → Try it out → điền các ô được nêu trong bài → Execute**. Để trống các ô tùy chọn còn lại. Xem mã HTTP ở cột **Code** và các trường kết quả trong **Response body** của phần **Server response**.

**Chạy thử trước khi demo.** Ở tab **User**, chạy `POST /api/chaos/reset` để đưa User Service về bình thường. Sau đó ở tab **Order**, chạy `GET /api/orders/resilience/timeout/{userId}` với `userId = 1`. Bạn sẽ thấy HTTP **200** và `outcome: OK`.

| Trường       | Cách đọc                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `outcome`    | Kết quả của cơ chế, chẳng hạn `OK` hoặc `TIMEOUT`.                                                                               |
| `elapsedMs`  | Thời gian xử lý tại Order Service, tính bằng mili giây.                                                                          |
| `attempts`   | Số lần Order Service thực sự gọi User Service trong lượt demo này.                                                               |
| `totalCalls` | Tổng số lời gọi lấy thông tin người dùng mà User Service đã nhận từ lần reset gần nhất. Xem qua `GET /api/chaos` ở tab **User**. |

## 1. Feign / RestClient Timeout

### Lý thuyết

Khi `order-service` gọi `user-service`, sự cố có thể xảy ra trước hoặc sau khi thiết lập kết nối. Timeout đặt giới hạn chờ ở từng giai đoạn để lời gọi chậm không giữ luồng và kết nối quá lâu.

| Giới hạn            | Đo giai đoạn nào               | Tình huống minh họa                              |
| ------------------- | ------------------------------ | ------------------------------------------------ |
| **Connect timeout** | Chờ mở kết nối mới             | Máy đích không phản hồi khi mở kết nối.          |
| **Read timeout**    | Chờ dữ liệu sau khi đã kết nối | Server kết nối được nhưng gửi phản hồi quá chậm. |

- **Connect timeout.** Nếu cổng từ chối kết nối ngay, lỗi có thể đến trước ngưỡng timeout. Kết nối được tái sử dụng từ pool có thể bỏ qua giai đoạn mở kết nối.
- **Read timeout.** HTTP client quyết định cách đo khoảng chờ dữ liệu. Tổng thời gian của request có thể dài hơn ngưỡng read timeout.

**OpenFeign** khai báo API bằng interface và cho phép cấu hình `connectTimeout`, `readTimeout` theo tên client. Các giá trị trong cấu hình Feign của project tính bằng mili giây. **Spring RestClient** là HTTP client đồng bộ có API gọi theo chuỗi phương thức. Khi dùng RestClient, timeout đến từ HTTP client và `ClientHttpRequestFactory` được chọn. Với builder do Spring Boot tự cấu hình, các thiết lập HTTP chung có thể áp dụng qua `spring.http.clients.connect-timeout` và `spring.http.clients.read-timeout`. [Spring Cloud OpenFeign](https://docs.spring.io/spring-cloud-openfeign/reference/spring-cloud-openfeign.html), [Spring Boot RestClient](https://docs.spring.io/spring-boot/reference/io/rest-client.html)

**TimeLimiter** trong project đặt thêm một giới hạn ở tầng Resilience4j. Nó giới hạn thời gian bên gọi chờ kết quả bất đồng bộ. Khi giới hạn này hết, `order-service` có thể trả lỗi trước khi HTTP client hết thời gian đọc. Việc trả lỗi sớm cũng không bảo đảm `user-service` đã dừng xử lý. Điều này quan trọng với thao tác ghi vì phía gọi có thể đã nhận timeout trong khi thay đổi ở phía server vẫn hoàn tất.

### Thực hành trên Swagger

| Luồng                                            | Connect timeout Feign | Read timeout Feign | TimeLimiter                                    |
| ------------------------------------------------ | --------------------- | ------------------ | ---------------------------------------------- |
| `GET /api/orders/{orderId}`, client `xxx`        | 2000 ms               | 3000 ms            | —                                              |
| Client `user-resilient` trong các API Resilience | 1000 ms               | 3000 ms            | 1500 ms ở kịch bản Timeout và kịch bản kết hợp |

**Mục tiêu:** Cho User Service phản hồi sau 4 giây và xem tầng nào ngừng chờ trước.

| Bước                          | Tab   | API và ô cần điền                                                                | Kết quả cần nhìn                                  |
| ----------------------------- | ----- | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| **1. Dọn cấu hình cũ**        | User  | `POST /api/chaos/reset`                                                          | Các giá trị giả lập về 0.                         |
| **2. Tạo độ trễ 4 giây**      | User  | `POST /api/chaos`, nhập `delayMs = 4000`                                         | Phản hồi hiện `delayMs: 4000`.                    |
| **3. Thử TimeLimiter**        | Order | `GET /api/orders/resilience/timeout/{userId}`, nhập `userId = 1`                 | HTTP **504**, `TIMEOUT`, khoảng **1,5 giây**.     |
| **4. Thử Feign read timeout** | Order | `GET /api/orders/resilience/bulkhead/{userId}`, nhập `userId = 1` và bấm một lần | HTTP **504**, `FEIGN_TIMEOUT`, khoảng **3 giây**. |
| **5. Bỏ độ trễ**              | User  | `POST /api/chaos/reset`                                                          | Phản hồi hiện `delayMs: 0`.                       |

Hai lượt ở tab **Order** đều có `attempts: 1`. Bước 4 dùng đường dẫn Bulkhead vì khi gọi một lượt và còn suất, lời gọi được chuyển thẳng cho Feign để áp dụng read timeout. Độ trễ được tạo sau khi User Service nhận request, nên phép thử minh họa thời gian chờ phản hồi sau khi đã kết nối.

## 2. Spring Retry / Resilience4j Retry

### Lý thuyết

Retry thực thi lại một thao tác khi lần trước gặp lỗi có khả năng tự phục hồi, chẳng hạn gián đoạn mạng ngắn hoặc dịch vụ phụ thuộc tạm thời trả HTTP 5xx. Mỗi lần thử là một lời gọi mới. Chính sách Retry quyết định lỗi nào đủ điều kiện, tổng số lần gọi, thời gian chờ giữa các lần và cách xử lý khi dùng hết lượt thử.

| Thành phần        | Spring Retry                                                                                                                                          | Resilience4j Retry                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Cách áp dụng      | Dùng `@EnableRetry` và `@Retryable` của thư viện Spring Retry để áp chính sách qua Spring proxy, hoặc bọc thao tác bằng `RetryTemplate.execute(...)`. | Tạo `RetryConfig`, sau đó bọc hàm hoặc lời gọi bất đồng bộ. Project dùng `Decorators` để thấy rõ thứ tự các lớp bảo vệ. |
| Điều kiện thử lại | Ví dụ `retryFor` và `noRetryFor` trên `@Retryable`.                                                                                                   | Ví dụ `retryOnException` để kiểm tra ngoại lệ hoặc `retryOnResult` để kiểm tra kết quả.                                 |
| Giới hạn và chờ   | `maxAttempts` tính cả lần đầu. `@Backoff` cấu hình khoảng chờ.                                                                                        | `maxAttempts` tính cả lần đầu. `intervalFunction` có thể tính khoảng chờ theo số lần thử.                               |
| Khi hết lượt      | Có thể cung cấp `@Recover` hoặc callback phục hồi cho `RetryTemplate`.                                                                                | Luồng demo Retry nhận lỗi cuối cùng và ánh xạ sang HTTP. Luồng kết hợp có cơ chế fallback riêng.                        |

Với `@Retryable` của Spring Retry, lời gọi cần đi qua proxy. Một phương thức tự gọi phương thức khác trong cùng bean có thể bỏ qua lớp retry. `RetryTemplate` thực thi chính sách ngay tại vị trí bọc. [Spring Retry](https://github.com/spring-attic/spring-retry), [Resilience4j Retry](https://resilience4j.readme.io/docs/retry)

**Backoff** giãn các lần gọi để dịch vụ phụ thuộc có thời gian hồi phục. Backoff cố định dùng cùng một khoảng chờ. Exponential backoff tăng khoảng chờ theo hệ số, ví dụ **500 ms → 1000 ms → 2000 ms**. Jitter thêm độ lệch ngẫu nhiên để nhiều client ít có khả năng thử lại cùng lúc. Tổng thời gian của một request gồm thời gian từng lần gọi cộng các khoảng chờ, nên tăng số lần thử cũng làm tăng độ trễ trong tình huống lỗi kéo dài.

Retry phù hợp với thao tác đọc hoặc thao tác có tính idempotent, tức lặp cùng yêu cầu không tạo thêm hiệu ứng nghiệp vụ. Ví dụ, một yêu cầu tạo đơn có thể đã thành công phía server dù phía gọi mất phản hồi. Nếu thử lại yêu cầu ghi, khóa idempotency được xử lý ở server có thể giúp nhận diện cùng một yêu cầu và tránh tạo đơn trùng.

### Thực hành trên Swagger

Project đặt tối đa **3 lần gọi** và exponential backoff **500 ms → 1000 ms**. Chính sách thử lại cho các lỗi như timeout, lỗi mạng và HTTP 5xx, đồng thời loại HTTP 4xx từ Feign, lỗi mạch đang mở và lỗi Bulkhead đầy. Feign `Retryer` được tắt ở client `user-resilient` để số lần thử do Resilience4j kiểm soát. Nếu hai tầng cùng thử tối đa ba lần thì một request có thể phát sinh tới chín lần gọi xuống dịch vụ phụ thuộc.

1. Ở tab **User**, chạy `POST /api/chaos/reset`. Sau đó chạy `POST /api/chaos` với `failFirstN = 2` để hai lời gọi đầu tiên lỗi.
2. Ở tab **Order**, mở `GET /api/orders/resilience/retry/{userId}`, nhập `userId = 1` rồi bấm **Execute một lần**.
3. Xem **HTTP 200**, `outcome: OK` và `attempts: 3`. Ở tab **User**, chạy `GET /api/chaos` để xác nhận `totalCalls: 3`. Lần thứ ba thành công sau hai khoảng chờ **500 ms** và **1000 ms**.

**Thử hết lượt:** Reset Chaos rồi lặp lại với `failFirstN = 5`. Kết quả là HTTP **502**, `outcome: UPSTREAM_5XX` và `attempts: 3`. Ba lần đều gặp lỗi nên Order Service dừng thử.

## 3. Resilience4j Bulkhead

### Lý thuyết

Bulkhead giới hạn lượng công việc **đang diễn ra đồng thời** cho một luồng hoặc một dịch vụ phụ thuộc. Nếu lời gọi downstream chậm, các lượt đang chạy giữ suất lâu hơn. Khi hết suất, Bulkhead có thể từ chối request mới thay vì để tất cả luồng hoặc kết nối dồn vào cùng một phụ thuộc. Suất được trả khi tác vụ kết thúc. Một Bulkhead giới hạn theo số lượt đang chạy, còn rate limiter giới hạn theo số lượt trong một khoảng thời gian.

| Loại                    | Cách cô lập                                                                                                                                      | Cấu hình trong project                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Semaphore Bulkhead**  | Lời gọi chạy trên luồng hiện tại sau khi lấy được permit. `maxConcurrentCalls` đặt số permit, `maxWaitDuration` đặt thời gian tối đa chờ permit. | Demo đơn lẻ có **3 permit**, chờ **0 ms**. Lượt thứ tư đang tranh suất bị từ chối ngay nếu cả ba permit còn bận.                          |
| **ThreadPool Bulkhead** | Lời gọi chạy trên pool riêng. Khi worker bận, tác vụ mới có thể chờ trong hàng đợi giới hạn. Khi hết cả worker lẫn chỗ đợi, lượt mới bị từ chối. | Luồng kết hợp dùng **3 worker** và **2 chỗ đợi**. Tối đa 5 tác vụ có thể được nhận cùng lúc, trong đó tối đa 3 tác vụ thực thi đồng thời. |

Bulkhead vẫn có thể đầy khi mọi lời gọi cuối cùng đều thành công nhưng phản hồi chậm. Trong project, lời gọi bị từ chối trước khi chạm tới `user-service` có `attempts: 0`. [Resilience4j Bulkhead](https://resilience4j.readme.io/docs/bulkhead)

### Thực hành trên Swagger

1. Ở tab **User**, chạy `POST /api/chaos/reset`. Sau đó chạy `POST /api/chaos` với `delayMs = 2000` để mỗi lượt giữ suất khoảng 2 giây.
2. Ở tab **Order**, mở `GET /api/orders/resilience/burst/{pattern}`. Nhập `pattern = bulkhead`, `n = 10` và `userId = 1`. Bấm **Execute** một lần để Order Service tạo 10 lượt song song.
3. Xem `summary` trong **Response body**. Kỳ vọng **3 lượt `OK`** và **7 lượt `BULKHEAD_FULL`**. Ở tab **User**, `GET /api/chaos` sẽ hiện `totalCalls: 3`.

HTTP **200** là mã của API tổng hợp kết quả. Với API gọi từng lượt `GET /api/orders/resilience/bulkhead/{userId}`, lời gọi đến khi cả ba suất đang bận sẽ nhận HTTP **429**.

## 4. Resilience4j Circuit Breaker

### Lý thuyết

Circuit Breaker theo dõi kết quả các lời gọi gần đây. Khi một phụ thuộc đang lỗi hàng loạt, việc tạm ngừng gửi lời gọi mới giúp trả lỗi nhanh và giảm tải trong lúc phụ thuộc phục hồi.

| Trạng thái    | Hành vi                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **CLOSED**    | Cho lời gọi đi qua và ghi nhận kết quả. Sau khi đủ mẫu tối thiểu, mạch mở nếu tỷ lệ lỗi đạt ngưỡng cấu hình.                         |
| **OPEN**      | Từ chối lời gọi mới bằng `CallNotPermittedException`. Project ánh xạ lỗi này thành HTTP 503 và `CIRCUIT_OPEN`.                       |
| **HALF_OPEN** | Cho một số lời gọi thăm dò đi qua. Sau khi đủ kết quả thăm dò, mạch đóng nếu tỷ lệ nằm dưới các ngưỡng, hoặc mở lại nếu chạm ngưỡng. |

**Cửa sổ trượt** quyết định dữ liệu nào được dùng để tính tỷ lệ. Cửa sổ theo số lượt giữ kết quả của `N` lời gọi gần nhất. Cửa sổ theo thời gian tổng hợp các lời gọi trong `N` giây gần nhất. `minimumNumberOfCalls` quy định phải có bao nhiêu mẫu trước khi đánh giá, để một vài lỗi ban đầu không đủ làm mở mạch. Resilience4j còn hỗ trợ ngưỡng tỷ lệ lời gọi chậm. Kịch bản dưới đây kích hoạt mạch bằng tỷ lệ lỗi HTTP 500. [Resilience4j Circuit Breaker](https://resilience4j.readme.io/docs/circuitbreaker)

### Thực hành trên Swagger

Project dùng cửa sổ **5 lời gọi**, tối thiểu **5 mẫu**, ngưỡng lỗi **50%**. Trong 5 mẫu được ghi nhận, **2 lỗi = 40%** nên mạch vẫn đóng, **3 lỗi = 60%** đủ mở mạch. HTTP 4xx từ Feign và lỗi Bulkhead đầy được bỏ qua khi tính tỷ lệ. Sau **10 giây** ở `OPEN`, mạch tự chuyển sang `HALF_OPEN` để thăm dò **2 lượt**. Với ngưỡng 50%, hai lượt thăm dò thành công sẽ đóng mạch, còn một lượt lỗi trong hai lượt là đủ để mở lại.

**Giai đoạn 1 · Làm mạch mở**

1. Ở tab **User**, chạy `POST /api/chaos/reset`, rồi chạy `POST /api/chaos` với `failPercent = 100`.
2. Ở tab **Order**, chạy `POST /api/orders/resilience/reset` để bắt đầu với mạch `CLOSED`.
3. Mở `GET /api/orders/resilience/circuit-breaker/{userId}`, nhập `userId = 1`. Bấm **Execute 6 lần**, mỗi lần đợi kết quả rồi bấm tiếp. Bấm lần thứ 6 ngay sau lần thứ 5, vì mạch sẽ tự chuyển sang `HALF_OPEN` sau 10 giây.

| Lượt    | Kết quả                                     | Cách đọc                                                               |
| ------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| **1–5** | HTTP **502**, `UPSTREAM_5XX`, `attempts: 1` | Mỗi lượt đều đến User Service và gặp lỗi. Sau lượt 5, mạch mở.         |
| **6**   | HTTP **503**, `CIRCUIT_OPEN`, `attempts: 0` | Order Service từ chối ngay. `GET /api/chaos` vẫn hiện `totalCalls: 5`. |

**Giai đoạn 2 · Quan sát mạch tự phục hồi**

1. Ở tab **User**, chạy `POST /api/chaos/reset` để User Service hoạt động bình thường. Giữ nguyên Circuit Breaker để quan sát nó tự phục hồi.
2. Chờ khoảng **11 giây**. Ở tab **Order**, chạy `GET /api/orders/resilience/status` và tìm `circuitBreaker_demo4.state: HALF_OPEN`.
3. Chạy lại API Circuit Breaker với `userId = 1` hai lần. Cả hai trả HTTP **200**. Sau lần đầu, trạng thái vẫn là `HALF_OPEN`. Sau lần thứ hai, gọi lại API trạng thái để thấy `CLOSED`.

## Khi bốn cơ chế phối hợp

Endpoint `GET /api/orders/resilience/combined/1` dùng thứ tự từ ngoài vào trong sau đây.

```text
Retry → Circuit Breaker → TimeLimiter → ThreadPool Bulkhead → OpenFeign → User Service
```

Mỗi lần thử phải qua Circuit Breaker trước. Nếu mạch cho phép, TimeLimiter giới hạn thời gian chờ của lần thử đó, gồm cả thời gian chờ tác vụ trong Bulkhead. Feign áp dụng timeout kết nối và đọc khi tác vụ thực sự bắt đầu gọi HTTP. Vì Retry nằm ngoài Circuit Breaker, các lần thử được breaker ghi nhận riêng. Nếu mạch đang mở hoặc Bulkhead đầy, Retry kết thúc ngay theo chính sách của project.

Endpoint kết hợp mặc định có fallback. Khi thấy HTTP 200, kiểm tra `outcome` để phân biệt `OK` với `FALLBACK`. Thêm `?fallback=false` để quan sát mã lỗi từ chính sách bảo vệ.

## Dọn trạng thái sau demo

1. Ở tab **User**, chạy `POST /api/chaos/reset` để bỏ độ trễ và lỗi giả lập.
2. Ở tab **Order**, chạy `POST /api/orders/resilience/reset` để đưa Circuit Breaker về `CLOSED`.

Các ngưỡng trong hướng dẫn lấy từ [cấu hình mặc định của order-service](backend/order-service/src/main/resources/application.properties). Có thể xem cách từng cơ chế bọc lời gọi Feign trong [ResilienceDemoService.java](backend/order-service/src/main/java/com/npt/orderservice/service/ResilienceDemoService.java).
