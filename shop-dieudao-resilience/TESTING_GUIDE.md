# Hướng Dẫn Kiểm Thử & Giải Thích Nguyên Lý Resilience

Tài liệu này tập trung 100% vào **Nguyên lý hoạt động (Ban đầu vs Sau đó)** và **Cách kiểm thử thực tế** của các mẫu chịu lỗi (Resilience) trong kiến trúc Microservices.

---

## 1. Trạng Thái Đèn Báo Trên Giao Diện (`:3000`)

- **🟢 Xanh lá (Online):** Service đang chạy và phản hồi HTTP 200.
- **🔴 Đỏ (Offline):** Service chưa được bật (bị từ chối kết nối).
- **Nếu thấy `Gateway :8080` bị đỏ:** Hãy vào IntelliJ, chọn **`ApiGatewayApplication`** ở thanh công cụ trên cùng và bấm nút **▶ Run**. Khi Gateway khởi động xong, đèn sẽ chuyển ngay sang **🟢 Xanh lá**.

---

## 2. Kiểm Thử Chi Tiết 5 Mẫu Chịu Lỗi (Resilience Patterns)

Luồng gọi: **React UI (`:3000`) ➔ API Gateway (`:8080`) ➔ Order Service (`:8082`) ➔ User Service (`:8081`)**

---

### MẪU 1: TIMEOUT (TimeLimiter 1.5s & Feign Timeout 3s)

#### 1. Nguyên lý hoạt động (Ban đầu vs Sau đó)
- 🔴 **Ban đầu (Khi KHÔNG CÓ Timeout):**
  - Khi User Service bị chậm (ví dụ mất 4 đến 10 giây do nghẽn database hoặc quá tải), Order Service phải giữ chặt luồng xử lý (thread hanging) để chờ đợi.
  - Hàng trăm client gọi đến sẽ chiếm sạch toàn bộ thread pool của Order Service $\rightarrow$ **Cạn kiệt tài nguyên và sập toàn bộ hệ thống theo dây chuyền (Cascading Failure)**.
- 🟢 **Sau đó (Khi ĐÃ CÓ TimeLimiter bảo vệ):**
  - TimeLimiter của Resilience4j đếm thời gian độc lập. Đúng **1.5 giây** nếu User Service chưa trả lời, TimeLimiter chủ động ngắt cuộc gọi ngay lập tức.
  - Luồng của Order Service được giải phóng ngay, trả về cho client mã lỗi **`504 TIMEOUT`** trong 1500ms thay vì bắt chờ 4 giây.

#### 2. Cách kiểm thử
1. Tại khung **Chaos Injection Center**, bấm nút: **`⏱️ 2. Chậm 4s (Timeout)`**.
2. Tại thẻ **Pattern 1**, bấm nút: **`▶ Bấm Test Timeout (TimeLimiter 1.5s)`**.

#### 3. Kết quả kỳ vọng
- **Mã HTTP:** `504 Gateway Timeout`.
- **Thời gian phản hồi:** `~1505ms` (ngắt ngay ở mốc 1.5 giây, không đợi 4 giây).
- **Thông báo:** *"TimeLimiter cắt: user-service không trả lời kịp"*.

---

### MẪU 2: RESILIENCE4J RETRY (Exponential Backoff)

#### 1. Nguyên lý hoạt động (Ban đầu vs Sau đó)
- 🔴 **Ban đầu (Khi KHÔNG CÓ Retry):**
  - Trong môi trường Cloud/Microservices, các sự cố thoáng qua (transient faults) như rung lắc đường truyền mạng hoặc container đang khởi động lại thường chỉ kéo dài vài trăm mili-giây.
  - Nếu không có Retry, chỉ cần 1 gói tin chập chờn là client nhận ngay mã lỗi **HTTP 500**, gây ức chế cho người dùng.
- 🟢 **Sau đó (Khi ĐÃ CÓ Retry bảo vệ):**
  - Tự động thử lại tối đa **3 lần**.
  - **Exponential Backoff:** Lần 1 thất bại $\rightarrow$ chờ 500ms; lần 2 thất bại $\rightarrow$ nhân đôi thời gian chờ lên 1000ms. Điều này tránh hiện tượng **Retry Storm** (hàng ngàn client cùng lúc bắn dồn dập vào server đang yếu làm nó chết hẳn).
  - Lần 3 thành công $\rightarrow$ trả về **HTTP 200 OK** trong suốt, người dùng không hề biết có lỗi vừa xảy ra.

#### 2. Cách kiểm thử
1. Tại **Chaos Center**, bấm nút: **`⚡ 3. Lỗi 2 lần đầu (Retry)`** *(2 request đầu trả về HTTP 500, request thứ 3 bình thường)*.
2. Tại thẻ **Pattern 2**, bấm nút: **`▶ Bấm Test Retry (Tối đa 3 lần)`**.

#### 3. Kết quả kỳ vọng
- **Mã HTTP:** `200 OK` (Màu xanh lá).
- **Số lần gọi thật (`attempts`):** `3 lần` (Lần 1 fail ➔ Lần 2 fail ➔ Lần 3 thành công).
- **Thời gian:** `~1520ms` (gồm 500ms chờ lần 1 + 1000ms chờ lần 2). Khách hàng nhận được dữ liệu bình thường, không hề thấy lỗi 500.

---

### MẪU 3: RESILIENCE4J BULKHEAD (Vách Ngăn Cách Ly - Semaphore)

#### 1. Nguyên lý hoạt động (Ban đầu vs Sau đó)
- 🔴 **Ban đầu (Khi KHÔNG CÓ Bulkhead):**
  - Khi có một đợt bùng nổ lưu lượng (ví dụ 10-50 request đồng thời gọi vào User Service chậm), toàn bộ luồng của Order Service sẽ dồn hết vào xử lý API đó.
  - Hậu quả: Không còn luồng nào trống để phục vụ các API quan trọng khác như giỏ hàng, thanh toán $\rightarrow$ Một API chậm làm liệt toàn bộ ứng dụng.
- 🟢 **Sau đó (Khi ĐÃ CÓ Bulkhead bảo vệ):**
  - Giống như các vách ngăn chống tràn trên thân tàu thủy: giới hạn tối đa **3 cuộc gọi đồng thời** được vào User Service.
  - 3 cuộc gọi đầu được cấp slot phục vụ; 7 cuộc gọi vượt ngưỡng bị từ chối **NGAY LẬP TỨC** với mã **`HTTP 429 Too Many Requests`** chỉ trong **`2ms`** (fail-fast), không làm tắc nghẽn server.

#### 2. Cách kiểm thử
1. Tại **Chaos Center**, nhập ô `delayMs = 2000` rồi bấm **Áp dụng Chaos** *(để request chiếm giữ slot trong 2 giây)*.
2. Tại thẻ **Pattern 3**, giữ nguyên ô `Số request song song: 10`, bấm nút: **`▶ Bắn 10 Request song song`**.

#### 3. Kết quả kỳ vọng
- **3 request:** Kết quả `OK` (mã HTTP 200).
- **7 request:** Bị từ chối ngay lập tức với kết quả `BULKHEAD_FULL` (mã HTTP 429).
- **Thời gian xử lý của 7 request bị từ chối:** Chỉ mất `2ms - 5ms` (**fail-fast**, không tốn thời gian chờ).

---

### MẪU 4: RESILIENCE4J CIRCUIT BREAKER (Cầu Dao Ngắt Mạch Tự Động)

#### 1. Nguyên lý hoạt động (Ban đầu vs Sau đó)
- 🔴 **Ban đầu (Khi KHÔNG CÓ Circuit Breaker):**
  - Khi User Service đã sập hoàn toàn (100% lỗi 500), Order Service vẫn ngây thơ tiếp tục gửi dồn dập hàng nghìn request sang.
  - Hậu quả: Lãng phí CPU/RAM của Order Service và bóp nghẹt User Service, khiến nó không bao giờ có cơ hội khởi động lại để hồi phục.
- 🟢 **Sau đó (Khi ĐÃ CÓ Circuit Breaker bảo vệ):**
  - Cầu dao tự động theo dõi tỷ lệ lỗi trong cửa sổ trượt 5 cuộc gọi gần nhất.
  - Khi tỷ lệ lỗi $\ge 50\%$, cầu dao nhảy sang trạng thái **`🔴 OPEN`**.
  - Ở trạng thái `OPEN`, mọi request gửi đến bị **chặn đứng tức thì tại Order Service** với mã **`503 CIRCUIT_OPEN`** trong **`0ms`**, không cho gửi sang User Service để bảo vệ downstream.
  - Sau 10 giây, cầu dao chuyển sang **`🟡 HALF_OPEN`** để cho 2 request thăm dò đi qua. Nếu 2 request này thành công $\rightarrow$ cầu dao tự đóng lại **`🟢 CLOSED`** (tự lành bệnh).

#### 2. Cách kiểm thử
1. Tại **Chaos Center**, bấm nút: **`💥 4. Sập 100% 500 (CB)`**.
2. Tại thẻ **Pattern 4**, bấm nút: **`▶ Bắn 6 Lần Liên Tiếp`**.

#### 3. Kết quả kỳ vọng
- **Cuộc gọi #1 đến #5:** Trả về `UPSTREAM_5XX (HTTP 502)` (Circuit Breaker đang thu thập 5 mẫu).
- **Cuộc gọi #6:** Cầu dao chuyển sang **`🔴 OPEN`**. Cuộc gọi bị ngắt ngay lập tức với mã `CIRCUIT_OPEN (HTTP 503)` trong `0ms`.
- **Kiểm tra tự hồi phục:** Bấm nút **`🟢 1. Reset Bình thường`** trên Chaos Center, đợi 10 giây (cầu dao chuyển sang `HALF_OPEN`), rồi bấm **`Gửi 1 Request`** 2 lần $\rightarrow$ Mạch tự động phục hồi về **`🟢 CLOSED`**.

---

### MẪU 5: KẾT HỢP CẢ 4 PATTERN + FALLBACK DỰ PHÒNG

#### 1. Nguyên lý hoạt động (Ban đầu vs Sau đó)
- 🔴 **Ban đầu (Khi KHÔNG CÓ Fallback):**
  - Khi một dịch vụ gặp sự cố nghiêm trọng, toàn bộ các tầng bảo vệ đều báo lỗi, khách hàng nhìn thấy màn hình lỗi 500/503 trắng xóa hoặc ứng dụng bị đơ gián đoạn.
- 🟢 **Sau đó (Khi ĐÃ CÓ Fallback bảo vệ):**
  - Thứ tự lồng chuẩn: `Client ➔ Retry ➔ CircuitBreaker ➔ TimeLimiter ➔ Bulkhead ➔ Downstream`.
  - Nếu tất cả các cơ chế trên đều bị kích hoạt lỗi, hàm Fallback tự động can thiệp và trả về dữ liệu người dùng ẩn danh dự phòng: `User(id, "Khách (dự phòng)", "Chưa có địa chỉ")` với mã **`HTTP 200 OK`**.
  - Giao diện người dùng vẫn hiển thị mượt mà, không bị gián đoạn trải nghiệm mua sắm.

#### 2. Cách kiểm thử
1. Tại **Chaos Center**, bấm nút: **`💥 4. Sập 100% 500 (CB)`**.
2. Tích chọn ô: **`Kích hoạt Fallback`**.
3. Bấm nút: **`▶ Chạy thử nghiệm Kết hợp Toàn diện (Combined + Fallback)`**.

#### 3. Kết quả kỳ vọng
- **Mã HTTP:** `200 OK`.
- **Dữ liệu nhận được:** User `"Khách (dự phòng)"` kèm cờ `fallback: true`. Giao diện không bị vỡ.
- *(Nếu bỏ tích ô `Kích hoạt Fallback` rồi bấm lại, hệ thống sẽ trả về mã lỗi 503 để đối chiếu sự khác biệt)*.

---

## 3. Bảng Tóm Tắt Đối Chiếu Nhanh

| Pattern | Kích Hoạt Chaos | Hành Động | Ban Đầu (Không bảo vệ) | Sau Đó (Có Resilience) | Mã HTTP |
|---|---|---|---|---|---|
| **Timeout** | Bấm `Chậm 4s` | Bấm `Test Timeout` | Bị treo 4 giây, nghẽn thread pool | Cắt sau đúng 1.5s, giải phóng luồng ngay | **504 Gateway Timeout** |
| **Retry** | Bấm `Lỗi 2 lần đầu` | Bấm `Test Retry` | Văng lỗi 500 ngay lần đầu tiên | Gọi 3 lần, tự hồi phục ở lần 3 trong suốt | **200 OK** |
| **Bulkhead** | Nhập `delayMs=2000` | Bắn 10 Request song song | 10 request chiếm trọn tài nguyên hệ thống | 3 request phục vụ, 7 request bị từ chối trong 2ms | **429 Too Many Requests** |
| **Circuit Breaker** | Bấm `Sập 100% 500` | Bắn 6 lần liên tiếp | Vẫn nã request làm downstream chết hẳn | Ngắt mạch sang `OPEN`, chặn đứng trong 0ms | **503 Service Unavailable** |
| **Combined + Fallback** | Bấm `Sập 100% 500` | Tích Fallback & Bấm Test | Khách hàng nhận trang lỗi 500/503 | Trả về dữ liệu an toàn `Khách (dự phòng)` | **200 OK** |
