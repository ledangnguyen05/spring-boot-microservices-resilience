# Nexus Resilience Studio - Microservices Architecture (Fullstack Demo)

> **Đề tài Seminar Microservices (15 phút):**
> 1. **Topic 1: Feign / RestClient Timeout** (Connect & Read Timeout hai tầng)
> 2. **Topic 2: Spring Retry / Resilience4j Retry** (Exponential Backoff, chống Retry Storm)
> 3. **Topic 3: Resilience4j Bulkhead** (Semaphore & ThreadPool cô lập tài nguyên)
> 4. **Topic 4: Resilience4j CircuitBreaker** (Ngắt mạch tự động, Fail-fast 0ms)
> 
> *Phần mở rộng (Bonus):* **Kiến trúc kết hợp cả 4 Pattern + Dữ liệu dự phòng (Fallback)**.

Dự án đã được phân chia thành **2 thư mục tách biệt hoàn toàn**:
- **`backend/` (BE)**: Hệ thống 3 Spring Boot Microservices (`api-gateway`, `order-service`, `user-service`).
- **`frontend/` (FE)**: Ứng dụng React Dashboard hiện đại (Vite + Lucide Icons) hỗ trợ kiểm thử trực quan thời gian thực.
- **`TESTING_GUIDE.md`**: Cẩm nang hướng dẫn kiểm thử chi tiết từ giao diện Web đến cURL và unit test.
- **`LY_THUYET_VA_THUAT_NGU.md`**: Giải thích sâu nguyên lý, thuật ngữ chuyên môn và các ví dụ thực tế đời sống của 4 topic.
- **`DEMO_RESILIENCE.md`**: Chi tiết lý thuyết, bảng so sánh và các bước thực hành từng bước.

---

## 1. Yêu cầu Môi trường (Prerequisites)

- **Java JDK:** Phiên bản **17 LTS** trở lên (`java -version`).
- **Node.js & npm:** Node.js **18.x** hoặc **20.x+** (`node -v`, `npm -v`).
- **Hệ điều hành:** Windows, macOS hoặc Linux.

---

## 2. Cấu trúc Dự án (BE & FE Tách Biệt)

```text
shop-dieudao-resilience/
│
├── backend/                              # [BE] Toàn bộ mã nguồn Microservices Spring Boot
│   ├── pom.xml                           # Root POM quản lý 3 submodule (Java 17)
│   ├── mvnw, mvnw.cmd                    # Maven wrapper 3.9.9 (chạy tại thư mục backend/)
│   ├── api-gateway/                      # Cổng API Gateway :8080 (WebFlux + Swagger Aggregator)
│   │   └── src/main/resources/application.properties
│   ├── order-service/                    # Dịch vụ Order & Resilience4j :8082
│   │   ├── src/main/java/com/npt/orderservice/
│   │   │   ├── controller/               # OrderController, ResilienceController
│   │   │   ├── dto/                      # UserResponseDTO, OrderResponseDTO, DemoResult
│   │   │   ├── client/                   # UserClient, UserResilientClient, UserConvergeClient (Feign)
│   │   │   ├── service/                  # ResilienceKit, ResilienceDemoService
│   │   │   ├── config/                   # OpenApiConfig, FeignConfig, NoRetryFeignConfig, RestClientConfig, OrderDataSeeder
│   │   │   └── OrderServiceApplication.java
│   │   └── src/test/java/...             # Unit test CircuitBreaker, Bulkhead, Retry, Converge
│   └── user-service/                     # Dịch vụ User & Chaos Simulator :8081
│       ├── src/main/java/com/npt/userservice/
│       │   ├── controller/               # UserController, ChaosController
│       │   ├── dto/                      # UserResponseDTO
│       │   ├── entity/, repository/      # Entity User & JPA Repository (H2)
│       │   ├── service/                  # ChaosState (giả lập sự cố)
│       │   ├── config/                   # OpenApiConfig, UserDataSeeder
│       │   └── UserServiceApplication.java
│       └── src/test/java/...             # Unit test ChaosState
│
├── frontend/                             # [FE] Giao diện React Dashboard kiểm thử
│   ├── package.json                      # React 18, Vite, Lucide-React
│   ├── vite.config.js                    # Chạy trên port 3000
│   └── src/
│       ├── App.jsx                       # Điều khiển 4 topic, So sánh & Hội tụ 4 topic
│       ├── FlowVisualizer.jsx            # Minh họa trực quan chuyển động 60 FPS từng bước
│       ├── DemoResults.jsx               # Kết xuất bảng số liệu, JSON, ma trận so sánh
│       ├── demoLessons.js                # Lý thuyết, thuật ngữ và bảng đối chiếu trên UI
│       ├── ErrorBoundary.jsx             # Bắt lỗi render React an toàn
│       ├── index.css                     # Giao diện hiện đại, responsive
│       └── main.jsx                      # React entrypoint
│
├── demo.http                             # Kịch bản test nhanh trong IntelliJ HTTP Client
├── DEMO_RESILIENCE.md                    # Chi tiết lý thuyết, so sánh kỹ thuật & hướng dẫn Swagger
├── LY_THUYET_VA_THUAT_NGU.md             # Giải thích nguyên lý, thuật ngữ & kịch bản hội tụ 5 chặng
├── TESTING_GUIDE.md                      # Hướng dẫn kiểm thử thực tế và nguyên lý Ban đầu vs Sau đó
└── README.md
```

---

## 3. Hướng dẫn Khởi động Hệ thống

> [!IMPORTANT]
> Script Maven Wrapper (`mvnw` / `mvnw.cmd`) nằm tại thư mục gốc **`backend/`**. Khi chạy lệnh bằng cờ `-pl`, hãy đứng từ `backend/`.

### Bước 1: Khởi động Backend (3 Service)
Mở 3 terminal riêng biệt (hoặc chạy trực tiếp qua Run Configurations trong IntelliJ):

```bash
# Terminal 1: Chạy User Service (Port 8081)
cd backend
.\mvnw.cmd -pl user-service spring-boot:run     # Trên Linux/macOS: ./mvnw -pl user-service spring-boot:run

# Terminal 2: Chạy Order Service (Port 8082)
cd backend
.\mvnw.cmd -pl order-service spring-boot:run    # Trên Linux/macOS: ./mvnw -pl order-service spring-boot:run

# Terminal 3: Chạy API Gateway (Port 8080)
cd backend
.\mvnw.cmd -pl api-gateway spring-boot:run      # Trên Linux/macOS: ./mvnw -pl api-gateway spring-boot:run
```

### Bước 2: Khởi động Frontend (React Dashboard)
Mở terminal thứ 4:

```bash
cd frontend
npm install        # (Chỉ cần chạy lần đầu)
npm run dev        # Khởi động React trên http://localhost:3000
```

Truy cập trình duyệt: **[http://localhost:3000](http://localhost:3000)** để sử dụng giao diện trực quan!

---

## 4. Swagger / OpenAPI 3 UI & Kiểm tra Tương thích

Cổng API Gateway được tích hợp sẵn bộ gộp Swagger Aggregator để tra cứu API toàn hệ thống tại một nơi:

- **Gateway Swagger Aggregator (Tập trung cả 2 service):** [http://localhost:8080/swagger-ui.html](http://localhost:8080/swagger-ui.html)
- **Order Service Swagger:** [http://localhost:8082/swagger-ui/index.html](http://localhost:8082/swagger-ui/index.html)
- **User Service Swagger:** [http://localhost:8081/swagger-ui/index.html](http://localhost:8081/swagger-ui/index.html)

> [!NOTE]
> `order-service` và `user-service` sử dụng `springdoc-openapi-starter-webmvc-ui`, còn `api-gateway` sử dụng `springdoc-openapi-starter-webflux-ui` (cùng phiên bản `2.8.5`, chạy trên Spring Cloud Gateway WebFlux). Đã kiểm tra tương thích và biên dịch không có cảnh báo xung đột bean.

---

## 5. Bảng So Sánh Lý Thuyết (Dùng Cho Slide Thuyết Trình)

### Bảng 1: Spring Retry vs Resilience4j Retry

| Tiêu chí | Spring Retry | Resilience4j Retry |
| --- | --- | --- |
| **Cơ chế triển khai** | Dựa trên Spring AOP Proxy (`@Retryable`, `@EnableRetry`) hoặc `RetryTemplate`. | Functional Decorator (`Decorators.ofSupplier()`), độc lập hoàn toàn với Spring context. |
| **Thứ tự lồng nhau** | Khó kiểm soát thứ tự khi kết hợp với Circuit Breaker/Bulkhead nếu dùng annotation. | Rõ ràng, minh bạch: thứ tự Decorator quyết định chính xác lớp nào bọc ngoài, lớp nào bọc trong. |
| **Phạm vi áp dụng** | Thích hợp cho ứng dụng Spring monolith truyền thống. | Chuẩn công nghiệp cho kiến trúc Microservices hiện đại, tương thích tốt với reactive & async. |
| **Chống Retry Storm** | Cần viết thêm logic can thiệp thủ công. | Dễ dàng cấu hình predicate loại trừ `CallNotPermittedException` (khi CB mở) và 4xx client errors. |

### Bảng 2: Feign Timeout vs RestClient Timeout vs TimeLimiter

| Tầng Timeout | Vị trí áp dụng | Ngưỡng cấu hình | Tác dụng & Đặc điểm |
| --- | --- | --- | --- |
| **Feign Timeout** | Tầng HTTP Client (OpenFeign) | `connectTimeout=1000ms`, `readTimeout=3000ms` | Cắt đứt kết nối socket HTTP khi downstream không phản hồi sau 3 giây. Trả mã `504 FEIGN_TIMEOUT`. |
| **RestClient Timeout** | Tầng HTTP Client (Spring RestClient) | `connectTimeout=1000ms`, `readTimeout=2500ms` (`RestClientConfig`) | Cắt kết nối ở client hướng hàm kiểu mới của Spring 6+ qua `SimpleClientHttpRequestFactory`. Trả mã `504 RESTCLIENT_TIMEOUT`. |
| **Resilience4j TimeLimiter** | Tầng Application / Decorator | `demo.timeout.duration-ms=1500ms` | Lớp bảo vệ bổ sung (tầng 2): ngắt chờ sau 1.5 giây để giải phóng thread pool của Order Service sớm hơn. |

---

## 6. Kiểm Thử Tự Động (Unit & Integration Tests)

Chạy bộ kiểm thử tự động toàn bộ 3 microservices bằng Maven:

```bash
cd backend
.\mvnw.cmd test    # Hoặc ./mvnw test trên Linux/macOS
```

**Kết quả kiểm thử (`BUILD SUCCESS` — tổng 15/15 tests pass toàn hệ thống + `npm run build` frontend thành công):**
- `OrderServiceApplicationTests`: Context loads thành công (1 test).
- `ResiliencePatternsTest` (7 tests):
  - `testCircuitBreakerOpensOnFailure`: CB nhảy từ `CLOSED` sang `OPEN` khi lỗi đạt ngưỡng 50%.
  - `testBulkheadLimitsConcurrentCalls`: Bulkhead giới hạn đúng 3 request song song, từ chối request thứ 4 với `BulkheadFullException`.
  - `testRetryRetriesOnException`: Retry tự thử lại đúng 3 lần với exponential backoff.
  - `testClientErrorIgnoredByRetryAndCircuitBreaker`: Lỗi 4xx (Client Error) không bị retry oan và không làm tăng failure rate của CB.
  - `testCircuitBreakerOpenPreventsRetryStorm`: Khi CB đang `OPEN`, Retry không gọi lại vô ích (chống Retry Storm).
  - `testConvergedPipelineRetryStopsWhenCircuitOpens`: Kiểm thử chuỗi phối hợp cả 4 topic: Retry lập tức ngừng gọi lại khi Circuit Breaker đã bật sang trạng thái `OPEN`.
  - `testBulkheadSurvivesOverloadWhileUnprotectedCollapses`: Đối chứng quá tải 10 luồng song song: không có Bulkhead sập tập thể (`0/10 OK`, `10× 503`), còn có Bulkhead giữ sống đúng `3/3 OK` (FIFO) và chặn nhanh `7× 429`.
- `UserServiceApplicationTests` (1 test) & `ChaosStateTest` (5 tests): Mô phỏng và kiểm soát tỷ lệ lỗi runtime chính xác.
- `ApiGatewayApplicationTests` (1 test): Gateway routing & CORS WebFilter hoạt động chính xác.

---

## 7. Kịch Bản Thuyết Trình Seminar 15 Phút (Đúng 4 Topic)

- **Phút 00 - 02:** Mở đầu & Đặt vấn đề Cascading Failure trong kiến trúc Microservices.
- **Phút 02 - 05:** Trình bày lý thuyết 4 Topic chính (dùng 2 bảng so sánh mục 5).
- **Phút 05 - 12: Live Demo trên Web UI (`http://localhost:3000`):**
  - **Topic 1 (Timeout):** User Service trễ 4s ➔ Đối chứng 4 chặng: Gọi trực tiếp chờ 4s ➔ OpenFeign cắt ở 3s (`FEIGN_TIMEOUT`) ➔ RestClient cắt ở 2.5s (`RESTCLIENT_TIMEOUT`) ➔ TimeLimiter cắt ở 1.5s (`TIMEOUT`).
  - **Topic 2 (Retry):** Chọn lỗi 1 hoặc 2 lần đầu ➔ Chạy nối tiếp **Resilience4j Retry** và **Spring Retry (`RetryTemplate`)** tự động thử lại với Exponential Backoff (500ms, 1000ms) ➔ Thành công (`attempts = 2` hoặc `3`).
  - **Topic 3 (Bulkhead):** So sánh **Chưa bảo vệ** (bắn 10 request ➔ vỡ ngưỡng `0/10 OK`, `10× 503 OVERLOAD_COLLAPSE`) với **Có Bulkhead** (`3 OK` vào xử lý, `7× 429 BULKHEAD_FULL` chặn ngay).
  - **Topic 4 (Circuit Breaker):** User Service lỗi 100% ➔ Sau 5 request lỗi, mạch nhảy sang `OPEN` ➔ Lượt #6 Fail-fast `503` (0 lần gọi User). Khôi phục User Service, chờ 10s sang `HALF_OPEN` và gửi 2 lượt thăm dò chuyển về `CLOSED`.
  - **Hội tụ 4 topic (1 đường ống, 5 chặng):** Nhấn **Chạy trọn vẹn 5 chặng** để xem `Retry → Circuit Breaker [5 ô] → Bulkhead [3 chỗ] → Feign 1s` phối hợp liên hoàn từ lúc lọc tải, tự cứu, bung `OPEN` (3s), chặn cửa `503` đến tự chữa lành `CLOSED`. *(Phần Bonus Fallback `/api/orders/resilience/combined/1` trả `Khách (dự phòng)` có thể minh họa nhanh qua Swagger hoặc `demo.http`.)*
- **Phút 12 - 14:** Phân tích thứ tự Decorators và giải pháp chống Retry Storm (`Retry -> CB -> 4xx/Bulkhead Ignore`, tắt `Retryer` Feign).
- **Phút 14 - 15:** Tổng kết & Hỏi đáp (Q&A).

---

## 8. Bản Đồ File Code & Vị Trí Chỉnh Sửa Tham Số (Phục Vụ Trình Chiếu Code)

| Chủ đề | File chính | Tham số / Vị trí chỉnh sửa nhanh |
| --- | --- | --- |
| **1. Timeout** (OpenFeign, RestClient, TimeLimiter) | `Client`: `UserClient.java`, `UserResilientClient.java`, `UserConvergeClient.java`<br>`RestClient`: `RestClientConfig.java` (`userRestClient`)<br>`TimeLimiter`: `ResilienceKit.java` (`timeoutOnly`)<br>`Service`: `ResilienceDemoService.java` (`feignTimeout`, `restClientTimeout`, `timeout`) | `order-service/src/main/resources/application.properties`:<br>• `spring.cloud.openfeign.client.config.<tên>.connectTimeout / readTimeout` (`xxx`: 2s/3s, `user-resilient`: 1s/3s, `user-converge`: 0.5s/1s)<br>• `demo.timeout.duration-ms=1500`<br>`RestClientConfig.java`: `setConnectTimeout(1s)`, `setReadTimeout(2500ms)`<br>`api-gateway/.../application.properties`: `httpclient.response-timeout=20s` |
| **2. Retry** (Resilience4j Retry & Spring Retry) | `NoRetryFeignConfig.java` (`NEVER_RETRY`) & `FeignConfig.java`<br>`OrderServiceApplication.java` (`@EnableRetry`)<br>`RestClientConfig.java` (`springRetryTemplate`)<br>`ResilienceKit.java` (`retryOnly`, `retryable()`)<br>`ResilienceDemoService.java` (`retry`, `springRetry`) | `application.properties` *(áp cho Resilience4j Retry)*:<br>• `demo.retry.max-attempts=3`<br>• `demo.retry.initial-wait-ms=500`<br>• `demo.retry.multiplier=2.0`<br>`RestClientConfig.java` *(áp cho Spring RetryTemplate)*:<br>• `.maxAttempts(3)` và `.exponentialBackoff(500, 2.0, 5000)` |
| **3. Bulkhead** (Semaphore & ThreadPool) | `ResilienceKit.java` (`bulkheadOnly`, `tpbCombined`, `bulkheadConverge`)<br>`ResilienceDemoService.java` (`bulkhead`, `burst`)<br>`ResilienceController.java` (`/bulkhead/{userId}`, `/burst/{pattern}`) | `application.properties`:<br>• `demo.bulkhead.max-concurrent=3` *(và `maxWaitDuration=0` trong `ResilienceKit.java`)*<br>• ThreadPool (`/combined`): `demo.tpb.core-threads=3`, `max-threads=3`, `queue-capacity=2`<br>`ResilienceController.java`: `?n=10` mặc định cho `/burst` |
| **4. Circuit Breaker** (+ Hội tụ & Fallback) | `ResilienceKit.java` (`cbOnly`, `cbCombined`, `cbConverge`)<br>`ResilienceDemoService.java` (`circuitBreaker`, `converge`, `combined`, `status`, `reset`, `toFailure`)<br>`ResilienceController.java` (`/circuit-breaker/{userId}`, `/converge/{userId}`, `/combined/{userId}`, `/status`, `/reset`) | `application.properties` *(áp cho `cbOnly` & `cbCombined`)*:<br>• `demo.cb.window-size=5`, `failure-rate-threshold=50`<br>• `demo.cb.open-wait-seconds=10`, `half-open-calls=2`<br>`ResilienceKit.java`: `cbConvergeConfig` đặt cứng `waitDurationInOpenState(Duration.ofSeconds(3))` để demo 5 chặng chạy nhanh |

> [!TIP]
> Sau khi sửa số liệu trong `application.properties` hoặc file `.java`, nhớ **restart `OrderServiceApplication`** để bean Spring nhận cấu hình mới.
