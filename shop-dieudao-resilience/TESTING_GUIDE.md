# Hướng Dẫn Kiểm Thử & Giải Thích Nguyên Lý Resilience

Tài liệu này tập trung 100% vào **Nguyên lý hoạt động (Ban đầu vs Sau đó)** và **Cách kiểm thử thực tế** của các mẫu chịu lỗi (Resilience) trong kiến trúc Microservices.

---

## 1. Trạng Thái Đèn Báo Trên Giao Diện (`:3000`)

- **🟢 Xanh lá (Online):** Service đang chạy và phản hồi HTTP 200.
- **🔴 Đỏ (Offline):** Service chưa được bật (bị từ chối kết nối).
- **Nếu thấy `Gateway :8080` bị đỏ:** Hãy vào IntelliJ, chọn **`ApiGatewayApplication`** ở thanh công cụ trên cùng và bấm nút **▶ Run**. Khi Gateway khởi động xong, đèn sẽ chuyển ngay sang **🟢 Xanh lá**.

---

## 2. Kiểm Thử Chi Tiết Các Mẫu Chịu Lỗi (Resilience Patterns)

Luồng gọi: **React UI (`:3000`) ➔ API Gateway (`:8080`) ➔ Order Service (`:8082`) ➔ User Service (`:8081`)**

> [!TIP]
> Để hiểu sâu hơn về lý thuyết chi tiết, các thuật ngữ kỹ thuật và ví dụ so sánh, bạn có thể tham khảo thêm tài liệu: [LY_THUYET_VA_THUAT_NGU.md](LY_THUYET_VA_THUAT_NGU.md).

---

### MẪU 1: TIMEOUT (Feign 3s / RestClient 2.5s vs Resilience4j TimeLimiter 1.5s)

#### 1. Nguyên lý hoạt động (Ban đầu vs Sau đó)
- 🔴 **Ban đầu (Khi KHÔNG CÓ Timeout):**
  - Khi User Service bị chậm (ví dụ mất 4 đến 10 giây do nghẽn database hoặc quá tải), Order Service phải giữ chặt luồng xử lý (thread hanging) để chờ đợi.
  - Hàng trăm client gọi đến sẽ chiếm sạch toàn bộ thread pool của Order Service $\rightarrow$ **Cạn kiệt tài nguyên và sập toàn bộ hệ thống theo dây chuyền (Cascading Failure)**.
- 🟢 **Sau đó (Khi ĐÃ CÓ bảo vệ 2 tầng Timeout):**
  - **Tầng kết nối HTTP (OpenFeign = 3000ms / Spring 6 RestClient = 2500ms):** Bảo vệ từng cuộc gọi HTTP đơn lẻ (`/feign-timeout/1`, `/restclient-timeout/1`). Khi User Service chậm 4s, kết nối tự cắt tại ngưỡng đã đặt và trả **`504 FEIGN_TIMEOUT` / `504 RESTCLIENT_TIMEOUT`**.
  - **Tầng nghiệp vụ ứng dụng (Resilience4j TimeLimiter = 1500ms):** Khống chế tổng thời gian chờ tối đa cho cả nghiệp vụ (`/timeout/1`). Quá **1.5 giây** là hủy tác vụ và trả **`504 TIMEOUT`** ngay (dù bên dưới có nhiều bước hay Retry).

#### 2. Cách kiểm thử
1. Tại giao diện Web (`http://localhost:3000`), chọn kịch bản **Timeout** và bấm **`▶ Kiểm tra các lớp Timeout`** *(hoặc gọi Chaos `delayMs=4000` rồi thử lần lượt từng endpoint trên Swagger)*.
2. Dùng tab **`1. CÓ BẢO VỆ`**, **`2. KHÔNG BẢO VỆ`**, và **`3. SO SÁNH ĐỐI CHIẾU 2 BÊN`** để xem khác biệt trực tiếp.

#### 3. Kết quả kỳ vọng
- **Không cài Timeout:** Chờ đủ `~4000ms` mới xong.
- **Feign Timeout / RestClient Timeout:** Mã HTTP **`504`**, cắt đúng ngưỡng kết nối HTTP đã cấu hình mẫu (`~3000ms` / `~2500ms`).
- **TimeLimiter:** Mã HTTP **`504`**, `outcome: TIMEOUT`, cắt tổng nghiệp vụ sau `~1500ms`.
- **Lưu ý phân biệt lỗi:** Nếu User Service bị tắt hẳn (Connection Refused), hệ thống sẽ trả về mã `503 UPSTREAM_DOWN` thay vì timeout, giúp phân biệt rõ ràng giữa "mạng chậm" và "server sập".

---

### MẪU 2: SPRING RETRY & RESILIENCE4J RETRY (Exponential Backoff)

#### 1. Nguyên lý hoạt động (Ban đầu vs Sau đó)
- 🔴 **Ban đầu (Khi KHÔNG CÓ Retry):**
  - Trong môi trường Cloud/Microservices, các sự cố thoáng qua (transient faults) như rung lắc đường truyền mạng hoặc container đang khởi động lại thường chỉ kéo dài vài trăm mili-giây.
  - Nếu không có Retry, chỉ cần 1 gói tin chập chờn là client nhận ngay mã lỗi **HTTP 500**, gây gián đoạn trải nghiệm người dùng.
- 🟢 **Sau đó (Khi ĐÃ CÓ Retry bảo vệ — hỗ trợ cả Resilience4j Retry & Spring Retry):**
  - Tự động thử lại tối đa **3 lần** (`Decorators.withRetry` ở `/retry/1` và `RetryTemplate.execute` ở `/spring-retry/1`).
  - **Exponential Backoff:** Lần 1 thất bại $\rightarrow$ chờ `500ms`; nếu lần 2 vẫn thất bại $\rightarrow$ nhân đôi thời gian chờ lên `1000ms`. Nếu thành công ngay ở lần retry đầu tiên (`#2`), hệ thống **dừng ngay**, không chờ `1000ms` thừa.

#### 2. Cách kiểm thử
1. Tại giao diện Web (`http://localhost:3000`), chọn kịch bản **Retry**.
2. Chọn mốc giả lập: **`Lỗi 1 lần đầu`** (dừng ngay ở `#2` ~515ms) hoặc **`Lỗi 2 lần đầu`** (chờ `500ms + 1000ms` rồi thành công ở `#3` ~1520ms).
3. Bấm **`▶ Thử lấy thông tin khách`** để chạy thật cả **Resilience4j Retry** và **Spring Retry** và xem bảng chi tiết từng lượt `#1`, `#2`, `#3` kèm hàng nghỉ Backoff.

#### 3. Kết quả kỳ vọng
- **Mã HTTP:** `200 OK` (cả Resilience4j Retry và Spring Retry đều thành công, dữ liệu khách hàng đầy đủ).
- **Chênh lệch vài ms giữa 2 thư viện:** Chỉ là dao động tự nhiên của mạng localhost và lịch đánh thức thread của hệ điều hành.

---

### MẪU 3: RESILIENCE4J BULKHEAD (Vách Ngăn Giới Hạn Luồng Đồng Thời)

#### 1. Nguyên lý hoạt động (Ban đầu vs Sau đó)
- 🔴 **Ban đầu (Khi KHÔNG CÓ Bulkhead):**
  - Ngưỡng chịu tải an toàn sang User Service chỉ là **3 luồng đồng thời**.
  - Khi **10 lượt chậm (2s)** ập đến cùng lúc mà không có Bulkhead đứng gác, cả **10/10 lượt** tràn qua một lúc (vượt gấp $3{,}3\times$ ngưỡng an toàn) $\rightarrow$ gây nghẽn kết nối và **VỠ NGƯỠNG QUÁ TẢI TẬP THỂ** khiến **0/10 lượt thành công** (chết chùm `10× HTTP 503 OVERLOAD_COLLAPSE`).
- 🟢 **Sau đó (Khi ĐÃ CÓ Bulkhead bảo vệ):**
  - Bulkhead khóa trần chỉ tối đa **3 chỗ** (`maxConcurrentCalls = 3`, FIFO theo thứ tự đến trước `#1–#3`), nằm đúng trong ngưỡng an toàn nên **3/3 lượt vào đều sống trọn vẹn `200 OK`**.
  - 7 lượt vượt ngưỡng (`#4–#10`) bị từ chối **NGAY LẬP TỨC** tại cửa Order Service với mã **`HTTP 429 BULKHEAD_FULL`** (~5ms, `0 lần gọi User`), đồng thời giữ tài nguyên máy chủ rảnh cho các API khác.

#### 2. Cách kiểm thử
1. Tại giao diện Web (`http://localhost:3000`), chọn kịch bản **Bulkhead**.
2. Chạy thử tab **`1. CÓ BẢO VỆ`** rồi chuyển sang tab **`2. KHÔNG BẢO VỆ`** (chế độ `no-protection` trên Swagger: `GET /api/orders/resilience/burst/no-protection?n=10`) để đối chiếu trực tiếp.

#### 3. Kết quả kỳ vọng
- **Có Bulkhead:** **3× `200 OK`** (`#1–#3`) + **7× `429 BULKHEAD_FULL`** (`#4–#10`, `0` lần gọi User).
- **Không có Bulkhead:** **`0/10` thành công** · **10× `503 OVERLOAD_COLLAPSE`** (tất cả tràn sang User Service cùng lúc rồi chết chùm).

---

### MẪU 4: RESILIENCE4J CIRCUIT BREAKER (Cầu Dao Ngắt Mạch Tự Động)

#### 1. Nguyên lý hoạt động (Ban đầu vs Sau đó)
- 🔴 **Ban đầu (Khi KHÔNG CÓ Circuit Breaker):**
  - Khi User Service đã sập hoàn toàn (100% lỗi 500), Order Service vẫn tiếp tục gửi mù quáng cả 6/6 lượt qua mạng, lãng phí thời gian và bóp nghẹt downstream.
- 🟢 **Sau đó (Khi ĐÃ CÓ Circuit Breaker bảo vệ):**
  - Cầu dao theo dõi tỷ lệ lỗi trong cửa sổ trượt **5 cuộc gọi gần nhất** (`slidingWindowSize = 5`, `failureRateThreshold = 50%`, cấu hình minh họa; thực tế điều chỉnh theo SLA từng hệ thống).
  - Khi đủ 5 mẫu và tỷ lệ lỗi $\ge 50\%$, cầu dao nhảy sang **`🔴 OPEN`**, chặn ngay các cuộc gọi tiếp theo tại Order Service với mã **`503 CIRCUIT_OPEN`** trong vài ms (`0 lần gọi qua mạng`).
  - Sau **10 giây** nghỉ (`waitDurationInOpenState`), cầu dao hé sang **`🟡 HALF_OPEN`** cho thử **2 lượt thăm dò**; cả 2 lượt `200 OK` $\rightarrow$ tự đóng lại **`🟢 CLOSED`**.

#### 2. Cách kiểm thử
1. Tại giao diện Web (`http://localhost:3000`), chọn kịch bản **Circuit Breaker**.
2. Bấm **`▶ Gửi 6 lượt liên tiếp`** để quan sát 5 lượt đầu thu thập mẫu ➔ bung `OPEN` ➔ lượt #6 bị chặn Fail-Fast `503`.
3. Khi User Service ổn định trở lại, bấm **`▶ Gửi 2 lượt thăm dò (HALF-OPEN)`** để quan sát quá trình tự hồi phục về **`CLOSED`**.

---

### MẪU 5: HỘI TỤ 4 TOPIC SEMINAR (1 Đường Ống 4 Trạm · 5 Chặng Liên Hoàn)

Mục này ghép **đúng 4 Topic chính** trên **cùng 1 đường ống xử lý khép kín**:
`Client ➔ [Trạm 1: Retry] ➔ [Trạm 2: Circuit Breaker (5 ô)] ➔ [Trạm 3: Bulkhead (3 chỗ)] ➔ [Trạm 4: Feign Timeout (1s)] ➔ User Service`. *(Không dùng Bonus Fallback để tập trung trọn vẹn vào 4 topic cốt lõi).*

#### 1. Nguyên lý phối hợp liên hoàn 4 trạm
1. **Trạm 3 — Bulkhead (3 suất):** Ngăn quá tải đồng thời, lượt thừa báo bận nhanh **`429 BULKHEAD_FULL`** (Trạm 1 & Trạm 2 đều nhận biết `429` nên không Retry và không tính lỗi mở mạch).
2. **Trạm 4 — Feign Timeout (1000ms):** Khi User Service treo 3s, Feign cắt đứt tại mốc 1s để không kẹt luồng vô hạn rồi đẩy lỗi ngược lên CB.
3. **Trạm 2 — Circuit Breaker (cửa sổ 5 ô, ngưỡng 50%, mở 3s trong kịch bản hội tụ):** Cộng dồn mẫu qua từng chặng (`3/5` ➔ `40% CLOSED` ➔ `60% OPEN`). Đạt $\ge 50\%$ là **`🔴 OPEN`**, chặn ngay tại cửa **`503 CIRCUIT_OPEN`**, sau 3s hé **`HALF_OPEN`** thăm dò **2/2** lượt xuyên cả 4 trạm để đóng lại **`CLOSED`**.
4. **Trạm 1 — Retry (tối đa 3 lần, 500ms + 1000ms):** Tự cứu lỗi mạng thoáng qua (HTTP 500) khi Trạm 2 còn `CLOSED` (40%), nhưng **dừng ngay** khi Circuit Breaker đã **`OPEN`** hoặc Bulkhead **`429`** (chống `Retry Storm`).

#### 2. Cách kiểm thử trên Giao diện Web
1. Chọn kịch bản **`Hội tụ 4 topic`** ở thanh bên trái.
2. Bấm **`▶ Chạy trọn vẹn 5 chặng`** và theo dõi 5 chặng nối tiếp trên cùng đường ống 4 trạm:
   - **Chặng 1 (Trạm 3 lọc tải):** 6 lượt cùng qua Trạm 1–2 tới Trạm 3 $\rightarrow$ giữ **3 lượt (`200 OK`)** nạp `[✓][✓][✓]` vào CB, chặn nhanh **3 lượt thừa (`429`)**.
   - **Chặng 2 (CB 40% ➔ Trạm 1 tự cứu):** Mạng chập chờn 2 lần 500 $\rightarrow$ CB mới lên `40% (CLOSED)` nên Retry nghỉ `500ms + 1000ms` rồi cứu thành công ở `#3` (`200 OK`, cửa sổ trượt thành `[✓][✓][✕][✕][✓]`).
   - **Chặng 3 (Trạm 4 cắt 1s ➔ CB 60% BUNG OPEN):** Đối tác treo 3s $\rightarrow$ Feign cắt sau 1s, đẩy cửa sổ CB lên `60% (3/5)` khiến cầu dao **BUNG `OPEN`**; Retry `#2` chạm `OPEN` bị chặn `503` ngay (chỉ 1 lần gọi User).
   - **Chặng 4 (Trạm 2 chặn cửa Fail-Fast):** Lượt mới qua Trạm 1 bị Trạm 2 chặn ngay tại cửa (`HTTP 503` ~10ms, `0 lần gọi User`), Trạm 3 & 4 và Retry dừng hẳn.
   - **Chặng 5 (Xuyên cả 4 trạm ➔ CLOSED):** User Service khỏe lại $\rightarrow$ hết 3s nghỉ `OPEN`, Trạm 2 mở hé `HALF-OPEN`, gửi 2 lượt thăm dò `200 OK` xuyên suốt 4 trạm và tự đóng lại **`CLOSED` 🟢**.

---

## 3. Bảng Tóm Tắt Đối Chiếu Nhanh

| Topic | Sự Cố Giả Lập | Hành Động Trên UI | Không Bảo Vệ | Có Resilience | Mã HTTP |
|---|---|---|---|---|---|
| **Timeout** | Chậm `4s` (`delayMs=4000`) | `Kiểm tra các lớp Timeout` | Treo luồng chờ đủ 4 giây | Feign cắt 3s, RestClient 2.5s, TimeLimiter 1.5s | **504 Gateway Timeout** |
| **Retry** | Lỗi 1 hoặc 2 lần đầu | `Thử lấy thông tin khách` | Văng lỗi HTTP 500 ngay lần đầu | Resilience4j Retry & Spring Retry tự thử lại và thành công | **200 OK** |
| **Bulkhead** | Chậm `2s` · Ngưỡng `3` chỗ | `Gửi 10 lượt cùng lúc` | Tràn cả 10/3 chỗ ➔ Chết chùm 0/10 (`10× 503`) | Giữ 3 suất (`200 OK`), chặn nhanh 7 lượt (`429`) · Bảo vệ Server | **200 / 429** |
| **Circuit Breaker** | Lỗi 100% (`failPercent=100`) | `Gửi 6 lượt liên tiếp` | Gửi mù cả 6/6 lượt sang dịch vụ hỏng | Đủ 5 mẫu mở `OPEN`, lượt #6 chặn nhanh `503` (0 lượt User) | **503 Service Unavailable** |
| **Hội tụ 4 Topic** | Tự động 5 chặng trên 4 trạm | `Chạy trọn vẹn 5 chặng` | Sập dây chuyền, cạn luồng, Retry Storm | 1 đường ống 4 trạm chuyển tiếp trạng thái CB xuyên suốt 5 chặng | **200 / 429 / 503** |

---

## 4. Test Nhanh Bonus Fallback, Unit Test & Lưu Ý Kỹ Thuật

* **Kiểm thử Fallback qua Swagger / `demo.http`:**
  * Gọi `POST http://localhost:8081/api/chaos?delayMs=4000`
  * Gọi `GET http://localhost:8080/api/orders/resilience/combined/1` ➔ Trả **HTTP 200**, `outcome: "FALLBACK"`, `fallback: true`, user `"Khách (dự phòng)"`.
  * Gọi `GET http://localhost:8080/api/orders/resilience/combined/1?fallback=false` ➔ Trả mã lỗi thật (`504`/`503`/`429`) thay vì dữ liệu dự phòng.
* **Chạy bộ kiểm thử tự động Backend (`15/15` test PASS):**
  ```bash
  cd backend
  .\mvnw.cmd test
  ```
* **Lưu ý khi demo Bulkhead `Không có bảo vệ` trên localhost:**
  * Tomcat mặc định hỗ trợ `200` thread, nên khi bắn `n=10` request chậm `2s` trên máy local, `ResilienceDemoService.burst("no-protection", ...)` kiểm tra `peakConcurrent > safeCapacity` (`> 3` luồng) để mô phỏng rõ hiện tượng sập quá tải tập thể (`503 OVERLOAD_COLLAPSE`) tương ứng với ngưỡng chịu tải an toàn `3` chỗ của Bulkhead.

