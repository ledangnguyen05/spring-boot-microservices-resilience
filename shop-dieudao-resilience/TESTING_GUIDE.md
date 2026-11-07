# Hướng Dẫn Kiểm Thử & Giải Thích Nguyên Lý Resilience

Tài liệu này tập trung chuyên sâu vào **Nguyên lý hoạt động** và **Cách kiểm thử thực tế** của 4 mẫu chịu lỗi (Resilience) trong kiến trúc Microservices.

---

## 1. Trạng Thái Đèn Báo Trên Giao Diện (`:3000`)

- **🟢 Xanh lá (Online):** Service đang chạy và phản hồi HTTP 200.
- **🔴 Đỏ (Offline):** Service chưa được bật (bị từ chối kết nối).
- **Nếu thấy `Gateway :8080` bị đỏ:** Hãy vào IntelliJ, chọn **`ApiGatewayApplication`** ở thanh công cụ trên cùng và bấm nút **▶ Run**. Khi Gateway khởi động xong, đèn sẽ chuyển ngay sang **🟢 Xanh lá**.

---

## 2. Kiểm Thử Chi Tiết 4 Mẫu Chịu Lỗi (Resilience Patterns)

Luồng gọi: **React UI (`:3000`) ➔ API Gateway (`:8080`) ➔ Order Service (`:8082`) ➔ User Service (`:8081`)**

---

### MẪU 1: TIMEOUT (TimeLimiter 1.5s & Feign Timeout 3s)

#### 1. Nguyên lý hoạt động
- **Tại sao cần?** Khi dịch vụ downstream (User Service) bị nghẽn CSDL hoặc xử lý quá chậm (ví dụ mất 4-10 giây), dịch vụ upstream (Order Service) sẽ bị giữ chặt luồng xử lý (thread hanging) để chờ đợi. Khi nhiều request dồn đến, toàn bộ pool luồng của Order Service sẽ bị cạn kiệt, dẫn đến **sập toàn bộ hệ thống theo dây chuyền (Cascading Failure)**.
- **Cách hoạt động:**
  - **Tầng 1 (TimeLimiter - 1.5s):** Resilience4j đếm thời gian bất đồng bộ. Đúng 1.5s nếu chưa có kết quả, TimeLimiter chủ động ngắt cuộc gọi và trả về mã lỗi `504 TIMEOUT` ngay lập tức để giải phóng luồng.
  - **Tầng 2 (Feign readTimeout - 3.0s):** Lớp bảo hiểm thứ hai ở tầng kết nối socket HTTP nếu tầng 1 không bắt được.

#### 2. Cách kiểm thử
1. Tại mục **Chaos Injection Center**, bấm nút: **`⏱️ 2. Chậm 4s (Timeout)`**.
2. Tại thẻ **Pattern 1**, bấm nút: **`Test Timeout (TimeLimiter 1.5s)`**.

#### 3. Kết quả kỳ vọng
- **Mã HTTP:** `504 Gateway Timeout`.
- **Thời gian phản hồi:** `~1505ms` (ngắt ngay ở mốc 1.5 giây, không bị bắt chờ đủ 4 giây).
- **Thông báo:** *"TimeLimiter cắt: user-service không trả lời kịp"*.

---

### MẪU 2: RESILIENCE4J RETRY (Exponential Backoff)

#### 1. Nguyên lý hoạt động
- **Tại sao cần?** Trong hệ thống phân tán, các sự cố chớp nhoáng (transient errors) như chập chờn đường truyền mạng, container khởi động lại thường chỉ kéo dài vài trăm mili-giây. Nếu báo lỗi ngay cho khách hàng thì trải nghiệm rất kém.
- **Cách hoạt động:**
  - Tự động thử lại tối đa **3 lần**.
  - **Exponential Backoff:** Sau lần 1 thất bại, hệ thống chờ 500ms; sau lần 2 thất bại, thời gian chờ nhân đôi lên 1000ms. Điều này giúp tránh hiện tượng **Retry Storm** (hàng loạt client dồn dập tấn công server đang gặp sự cố khiến nó sập hẳn).
  - Client này tắt Retry mặc định của Feign (`NoRetryFeignConfig`) để Resilience4j toàn quyền quản lý, tránh nhân đôi số lần gọi (3 x 3 = 9 lần).

#### 2. Cách kiểm thử
1. Tại **Chaos Center**, bấm nút: **`⚡ 3. Lỗi 2 lần đầu (Retry)`** *(2 request đầu trả về HTTP 500, request thứ 3 bình thường)*.
2. Tại thẻ **Pattern 2**, bấm nút: **`Test Retry (Tối đa 3 lần)`**.

#### 3. Kết quả kỳ vọng
- **Mã HTTP:** `200 OK` (Màu xanh lá).
- **Số lần gọi thật (`attempts`):** `3 lần` (Lần 1 fail ➔ Lần 2 fail ➔ Lần 3 thành công).
- **Thời gian:** `~1520ms` (gồm 500ms chờ lần 1 + 1000ms chờ lần 2). Khách hàng nhận được dữ liệu bình thường, không hề thấy lỗi 500.

---

### MẪU 3: RESILIENCE4J BULKHEAD (Vách Ngăn Cách Ly - Semaphore)

#### 1. Nguyên lý hoạt động
- **Tại sao cần?** Lấy cảm hứng từ các vách ngăn kín nước trên thân tàu thủy: nếu một khoang bị thủng, vách ngăn giữ nước không tràn sang các khoang khác, tàu vẫn nổi.
- **Cách hoạt động:** Giới hạn tối đa **3 cuộc gọi đồng thời** được phép đi vào User Service. Nếu có 10 cuộc gọi đồng thời ập đến, 3 cuộc gọi được tiếp nhận, 7 cuộc gọi vượt ngưỡng bị từ chối **ngay lập tức** với mã `HTTP 429 Too Many Requests`. Điều này bảo vệ tài nguyên để phục vụ các chức năng khác trong hệ thống.

#### 2. Cách kiểm thử
1. Tại **Chaos Center**, nhập ô `delayMs = 2000` rồi bấm **Áp dụng Chaos** *(giữ request chiếm chỗ trong 2 giây)*.
2. Tại thẻ **Pattern 3**, giữ nguyên ô `Số request song song: 10`, bấm nút: **`Bắn 10 Request song song`**.

#### 3. Kết quả kỳ vọng
- **3 request:** Kết quả `OK` (mã HTTP 200).
- **7 request:** Bị từ chối lập tức với kết quả `BULKHEAD_FULL` (mã HTTP 429).
- **Thời gian xử lý của 7 request bị từ chối:** Chỉ mất `2ms - 5ms` (**fail-fast**, không tốn thời gian chờ đợi).

---

### MẪU 4: RESILIENCE4J CIRCUIT BREAKER (Cầu Dao Ngắt Mạch Tự Động)

#### 1. Nguyên lý hoạt động
- **Tại sao cần?** Khi một dịch vụ downstream bị sập hoàn toàn, việc liên tục gửi request sang chỉ làm lãng phí tài nguyên và khiến dịch vụ đó càng không thể hồi phục.
- **Cách hoạt động (3 trạng thái):**
  1. **CLOSED (Đóng mạch):** Hoạt động bình thường. Hệ thống theo dõi tỷ lệ lỗi trong cửa sổ trượt (sliding window) gồm 5 cuộc gọi gần nhất.
  2. **OPEN (Ngắt mạch):** Khi tỷ lệ lỗi $\ge 50\%$, cầu dao nhảy sang `OPEN`. Mọi cuộc gọi đến bị **chặn đứng ngay lập tức tại Order Service** với mã `503 CIRCUIT_OPEN` (xử lý trong 0ms), không gửi bất kỳ request nào sang downstream.
  3. **HALF_OPEN (Mở nửa vời):** Sau 10 giây ở trạng thái OPEN, cầu dao cho phép 2 cuộc gọi thăm dò đi qua. Nếu 2 cuộc gọi này thành công $\rightarrow$ cầu dao tự đóng lại (`CLOSED`); nếu vẫn thất bại $\rightarrow$ tiếp tục ngắt mạch (`OPEN`).

#### 2. Cách kiểm thử
1. Tại **Chaos Center**, bấm nút: **`💥 4. Sập 100% 500 (CB)`**.
2. Tại thẻ **Pattern 4**, bấm nút: **`Bắn 6 Lần Liên Tiếp`**.

#### 3. Kết quả kỳ vọng
- **Cuộc gọi #1 đến #5:** Trả về `UPSTREAM_5XX (HTTP 502)` (Circuit Breaker đang thu thập 5 mẫu).
- **Cuộc gọi #6:** Cầu dao chuyển sang **`🔴 OPEN`**. Cuộc gọi bị ngắt ngay lập tức với mã `CIRCUIT_OPEN (HTTP 503)` trong `0ms`.
- **Kiểm tra tự hồi phục:** Bấm nút **`🟢 1. Reset Bình thường`** trên Chaos Center, đợi 10 giây (cầu dao chuyển sang `HALF_OPEN`), rồi bấm **`Gửi 1 Request`** 2 lần $\rightarrow$ Mạch tự động phục hồi về **`🟢 CLOSED`**.

---

### MẪU 5: KẾT HỢP CẢ 4 PATTERN + FALLBACK DỰ PHÒNG

#### 1. Nguyên lý hoạt động
- **Thứ tự lồng ghép:** `Client ➔ Retry ➔ CircuitBreaker ➔ TimeLimiter ➔ Bulkhead ➔ Downstream`.
- **Fallback (Dữ liệu dự phòng an toàn):** Nếu tất cả các cơ chế trên đều bị kích hoạt lỗi (User Service sập hoặc quá tải), hệ thống kích hoạt hàm Fallback để trả về dữ liệu người dùng ẩn danh dự phòng: `User(id, "Khách (dự phòng)", "Chưa có địa chỉ")` với mã `HTTP 200 OK` thay vì quăng màn hình lỗi 5xx cho người dùng.

#### 2. Cách kiểm thử
1. Tại **Chaos Center**, bấm nút: **`💥 4. Sập 100% 500 (CB)`**.
2. Tích chọn ô: **`Kích hoạt Fallback`**.
3. Bấm nút: **`Chạy thử nghiệm Kết hợp Toàn diện`**.

#### 3. Kết quả kỳ vọng
- **Mã HTTP:** `200 OK`.
- **Dữ liệu nhận được:** User `"Khách (dự phòng)"` kèm cờ `fallback: true`. Giao diện không bị gián đoạn.
- *(Nếu bỏ tích ô `Kích hoạt Fallback` rồi bấm lại, hệ thống sẽ trả về mã lỗi 503 để đối chiếu sự khác biệt)*.

---

## 3. Bảng Tóm Tắt Đối Chiếu Nhanh

| Pattern | Kích Hoạt Chaos | Hành Động | Mã HTTP Kỳ Vọng | Ý Nghĩa Kỹ Thuật |
|---|---|---|---|---|
| **Timeout** | Bấm `Chậm 4s` | Bấm `Test Timeout` | **504 Gateway Timeout** | Cắt sau đúng 1.5s, không đợi 4s |
| **Retry** | Bấm `Lỗi 2 lần đầu` | Bấm `Test Retry` | **200 OK** | Gọi 3 lần, tự hồi phục ở lần 3 |
| **Bulkhead** | Nhập `delayMs=2000` | Bắn 10 Request song song | **429 Too Many Requests** | 3 request xử lý, 7 request bị từ chối trong 2ms |
| **Circuit Breaker** | Bấm `Sập 100% 500` | Bắn 6 lần liên tiếp | **503 Service Unavailable** | Đủ 5 lần lỗi thì ngắt mạch sang `OPEN`, chặn trong 0ms |
| **Combined + Fallback** | Bấm `Sập 100% 500` | Tích Fallback & Bấm Test | **200 OK** | Trả về dữ liệu dự phòng an toàn `Khách (dự phòng)` |
