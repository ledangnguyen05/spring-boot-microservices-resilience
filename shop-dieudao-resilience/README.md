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
│   │   │   ├── dto/                      # UserResponseDTO, DemoResult
│   │   │   ├── client/                   # UserClient, UserResilientClient (Feign)
│   │   │   ├── service/                  # ResilienceKit, ResilienceDemoService
│   │   │   ├── config/                   # OpenApiConfig, FeignConfig, NoRetryFeignConfig
│   │   │   └── OrderServiceApplication.java
│   │   └── src/test/java/...             # Unit test CircuitBreaker, Bulkhead, Retry
│   └── user-service/                     # Dịch vụ User & Chaos Simulator :8081
│       ├── src/main/java/com/npt/userservice/
│       │   ├── controller/               # UserController, ChaosController
│       │   ├── dto/                      # UserResponseDTO
│       │   ├── service/                  # ChaosState (giả lập sự cố)
│       │   ├── config/                   # OpenApiConfig
│       │   └── UserServiceApplication.java
│       └── src/test/java/...             # Unit test ChaosState
│
├── frontend/                             # [FE] Giao diện React Dashboard kiểm thử
│   ├── package.json                      # React 18, Vite, Lucide-React
│   ├── vite.config.js                    # Chạy trên port 3000
│   └── src/
│       ├── App.jsx                       # Điều khiển các kịch bản demo 4 topic + Bonus
│       ├── DemoResults.jsx               # Kết xuất dạng bảng dữ liệu & kết luận phân tích
│       ├── index.css                     # Giao diện hiện đại, responsive
│       └── main.jsx                      # React entrypoint
│
├── demo.http                             # Kịch bản test nhanh trong IntelliJ HTTP Client
├── DEMO_RESILIENCE.md                    # Chi tiết lý thuyết, so sánh kỹ thuật & hướng dẫn Swagger
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
> Dự án sử dụng `springdoc-openapi-starter-webmvc-ui` phiên bản `2.8.5` kết hợp Spring Cloud Gateway WebFlux. Đã kiểm tra tương thích và biên dịch không có cảnh báo xung đột bean.

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
| **RestClient Timeout** | Tầng HTTP Client (Spring RestClient) | Cấu hình qua `ClientHttpRequestFactory` | Tương đương Feign timeout nhưng dùng cho client hướng hàm kiểu mới của Spring 6+. |
| **Resilience4j TimeLimiter** | Tầng Application / Decorator | `demo.timeout.duration-ms=1500ms` | Lớp bảo vệ bổ sung (tầng 2): ngắt chờ sau 1.5 giây để giải phóng thread pool của Order Service sớm hơn. |

---

## 6. Kiểm Thử Tự Động (Unit & Integration Tests)

Chạy bộ kiểm thử tự động toàn bộ 3 microservices bằng Maven:

```bash
cd backend
.\mvnw.cmd test    # Hoặc ./mvnw test trên Linux/macOS
```

**Kết quả kiểm thử (`BUILD SUCCESS`):**
- `OrderServiceApplicationTests`: Context loads thành công.
- `ResiliencePatternsTest`:
  - `testCircuitBreakerOpensOnFailure`: CB nhảy từ `CLOSED` sang `OPEN` khi lỗi đạt ngưỡng 50%.
  - `testBulkheadLimitsConcurrentCalls`: Bulkhead giới hạn đúng 3 request song song, từ chối request thứ 4 với `BulkheadFullException`.
  - `testRetryRetriesOnException`: Retry tự thử lại đúng 3 lần với exponential backoff.
  - `testClientErrorIgnoredByRetryAndCircuitBreaker`: Lỗi 4xx (Client Error) không bị retry oan và không làm tăng failure rate của CB.
  - `testCircuitBreakerOpenPreventsRetryStorm`: Khi CB đang `OPEN`, Retry không gọi lại vô ích (chống Retry Storm).
  - `testConvergedPipelineRetryStopsWhenCircuitOpens`: Kiểm thử chuỗi phối hợp cả 4 topic: Retry lập tức ngừng gọi lại khi Circuit Breaker đã bật sang trạng thái `OPEN`.
- `UserServiceApplicationTests` & `ChaosStateTest`: Mô phỏng và kiểm soát tỷ lệ lỗi runtime chính xác.
- `ApiGatewayApplicationTests`: Gateway routing & CORS WebFilter hoạt động chính xác.

---

## 7. Kịch Bản Thuyết Trình Seminar 15 Phút (Đúng 4 Topic)

- **Phút 00 - 02:** Mở đầu & Đặt vấn đề Cascading Failure trong kiến trúc Microservices.
- **Phút 02 - 05:** Trình bày lý thuyết 4 Topic chính (dùng 2 bảng so sánh mục 5).
- **Phút 05 - 12: Live Demo trên Web UI (`http://localhost:3000`):**
  - **Topic 1 (Timeout):** User Service trễ 4s ➔ Feign timeout ngắt ở 3s (`FEIGN_TIMEOUT`), TimeLimiter ngắt ở 1.5s (`TIMEOUT`).
  - **Topic 2 (Retry):** User Service lỗi 2 lần đầu ➔ Retry tự động thử lại với Exponential Backoff (500ms, 1000ms) ➔ Thành công ở lần 3 (`attempts = 3`).
  - **Topic 3 (Bulkhead):** Bắn 10 request song song ➔ 3 request được cấp slot xử lý, 7 request vượt ngưỡng bị từ chối ngay lập tức trong 2ms với mã `429 BULKHEAD_FULL`.
  - **Topic 4 (Circuit Breaker):** User Service sập 100% ➔ Sau 5 request lỗi, mạch nhảy sang `OPEN` (Fail-fast 0ms). Khi khôi phục, gửi 2 request thăm dò chuyển về `CLOSED`.
  - *(Phần Bonus nếu còn thời gian):* Bật Fallback để hiển thị dữ liệu an toàn `Khách (dự phòng)`.
- **Phút 12 - 14:** Phân tích thứ tự Decorators và giải pháp chống Retry Storm (`CB -> Retry -> 4xx Ignore`).
- **Phút 14 - 15:** Tổng kết & Hỏi đáp (Q&A).
