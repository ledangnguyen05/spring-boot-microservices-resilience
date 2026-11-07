# Nexus Resilience Studio - Microservices Architecture (Fullstack Demo)

> **Đề tài Seminar Microservices (15 phút):**
> 1. **Resilience4j CircuitBreaker** (kèm Fallback an toàn)
> 2. **Resilience4j Bulkhead** (Semaphore & ThreadPool cô lập tài nguyên)
> 3. **Feign / RestClient Timeout** (Connect & Read Timeout hai tầng)
> 4. **Resilience4j Retry** (Exponential Backoff, chống Retry Storm)

Dự án đã được phân chia thành **2 thư mục tách biệt hoàn toàn**:
- **`backend/` (BE)**: Hệ thống 3 Spring Boot Microservices (`api-gateway`, `order-service`, `user-service`).
- **`frontend/` (FE)**: Ứng dụng React Dashboard hiện đại (Vite + Lucide Icons) hỗ trợ kiểm thử trực quan thời gian thực.
- **`TESTING_GUIDE.md`**: Cẩm nang hướng dẫn kiểm thử chi tiết từ giao diện Web đến cURL và unit test.

---

## 1. Cấu trúc Dự án (BE & FE Tách Biệt)

```text
shop-dieudao-resilience/
│
├── backend/                              # [BE] Toàn bộ mã nguồn Microservices Spring Boot
│   ├── pom.xml                           # Root POM quản lý 3 submodule (Java 17)
│   ├── mvnw, mvnw.cmd                    # Maven wrapper 3.9.9
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
│   ├── index.html                        # Giao diện Dark Tech hiện đại
│   └── src/
│       ├── App.jsx                       # Dashboard điều khiển Chaos & test 4 pattern
│       ├── index.css                     # Glassmorphism, animations, responsive
│       └── main.jsx                      # React entrypoint
│
├── demo.http                             # Kịch bản test nhanh trong IntelliJ HTTP Client
└── README.md                             # Hướng dẫn chi tiết & Kịch bản thuyết trình 15 phút
```

---

## 2. Hướng dẫn Khởi động Hệ thống

### Bước 1: Khởi động Backend (3 Service)
Mở 3 terminal hoặc chạy trực tiếp bằng nút ▶ trong IntelliJ:

```bash
# Terminal 1: Chạy User Service (Port 8081)
cd backend/user-service
./mvnw spring-boot:run

# Terminal 2: Chạy Order Service (Port 8082)
cd backend/order-service
./mvnw spring-boot:run

# Terminal 3: Chạy API Gateway (Port 8080)
cd backend/api-gateway
./mvnw spring-boot:run
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

## 3. Các tính năng nổi bật trên Giao diện React (`frontend/`)

1. **Bộ đèn báo trạng thái (Service Health Indicator):** Tự động ping và hiển thị trạng thái `Online / Offline` của cả 3 microservice.
2. **Sơ đồ luồng xử lý (Architecture Pipeline Bar):** Trực quan hóa đường đi của gói tin:  
   `React UI (:3000) ➔ Gateway (:8080) ➔ Order Service (:8082) ➔ User Service (:8081)`.
3. **Trung tâm điều khiển sự cố (Chaos Control Center):**
   - Nút bấm 1-click kích hoạt sự cố: "Chậm 4s" (Test Timeout), "Lỗi 2 lần đầu" (Test Retry), "Sập 100%" (Test Circuit Breaker), "Reset về bình thường".
   - Tự do tinh chỉnh `delayMs`, `% lỗi 500`, và `failFirstN`.
4. **4 Thẻ kiểm thử Pattern tương tác:**
   - **Pattern 1: Timeout (1.5s):** Bấm nút test, đo thời gian phản hồi thực tế và mã lỗi trả về (504).
   - **Pattern 2: Retry (3 lần):** Hiển thị số lần gọi thực tế (`attempts`), kiểm chứng khả năng tự hồi phục khi gặp lỗi thoáng qua.
   - **Pattern 3: Bulkhead (3 concurrent):** Bắn $N$ request đồng thời (Burst Test), hiển thị rõ số request được xử lý và số request bị từ chối với mã 429.
   - **Pattern 4: Circuit Breaker:** Hiển thị trực tiếp huy hiệu trạng thái **`CLOSED 🟢`**, **`OPEN 🔴` (Fail-fast 0ms)**, hoặc **`HALF_OPEN 🟡`**, kèm nút bắn 6 request liên tiếp và nút Reset.
   - **Pattern 5: Combined + Fallback:** Công tắc bật/tắt Fallback để xem dữ liệu an toàn `Khách (dự phòng)` hoặc mã lỗi thật.
5. **Nhật ký kiểm thử thời gian thực (Live Activity Console):** Ghi lại timestamp, mã HTTP, độ trễ ms và thông điệp giải thích tiếng Việt cho từng thao tác.

---

## 4. Swagger / OpenAPI 3 UI

- **Order Service Swagger:** [http://localhost:8082/swagger-ui/index.html](http://localhost:8082/swagger-ui/index.html)
- **User Service Swagger:** [http://localhost:8081/swagger-ui/index.html](http://localhost:8081/swagger-ui/index.html)

| Dịch vụ | API |
| --- | --- |
| API Gateway | `GET /actuator/health` |
| User Service | `GET /api/users/{userId}` |
| User Service · Chaos | `GET /api/chaos` xem trạng thái, `POST /api/chaos` cấu hình lỗi, `POST /api/chaos/reset` khôi phục |
| Order Service | `GET /api/orders/{orderId}` |
| Order Service · Resilience | `GET /api/orders/resilience/status` xem trạng thái, `POST /api/orders/resilience/reset` đặt lại Circuit Breaker |

Xem các lệnh chạy Timeout, Retry, Bulkhead và Circuit Breaker trong [hướng dẫn demo](DEMO_RESILIENCE.md).

---

## 5. Dàn ý Slide & Kịch bản Thuyết trình Seminar 15 Phút

- **Phút 00 - 03:** Đặt vấn đề cascading failure trong Microservices.
- **Phút 03 - 06:** Giới thiệu 4 Pattern: Feign Timeout, Resilience4j Retry, Bulkhead, Circuit Breaker.
- **Phút 06 - 12:** **Live Demo trực tiếp trên giao diện React (`http://localhost:3000`)**:
  - Demo 1: Bật delay 4s ➔ Bấm test Timeout ➔ Ngắt ở 1.5s (HTTP 504).
  - Demo 2: Bật lỗi 2 lần ➔ Bấm test Retry ➔ Thành công ở lần 3 (HTTP 200).
  - Demo 3: Bắn 10 request đồng thời ➔ 3 OK, 7 bị chặn ngay (HTTP 429).
  - Demo 4: Bật lỗi 100% ➔ Bắn 6 request ➔ Thấy mạch chuyển sang đỏ `OPEN` và trả về ngay 0ms.
  - Demo 5: Bật Fallback ➔ Nhận thông tin `Khách (dự phòng)` êm đẹp.
- **Phút 12 - 14:** Trình bày thứ tự lồng Decorators & giải pháp chống Retry Storm.
- **Phút 14 - 15:** Tổng kết & Hỏi đáp (Q&A).
