export const lessons = {
  normal: {
    goal: 'Lấy một đơn hàng thành công để có kết quả chuẩn trước khi tạo sự cố.',
    steps: ['Đọc đơn hàng #001', 'Tra thông tin khách', 'Trả dữ liệu đơn và khách'],
    takeaway: 'Dùng kết quả này làm mốc đối chiếu khi các bài sau trả lỗi hoặc trả dữ liệu dự phòng.',
    terms: [
      ['Order Service', 'Quản lý đơn hàng. Đơn có mã khách, sản phẩm và trạng thái.'],
      ['User Service', 'Quản lý thông tin khách hàng, chẳng hạn tên và địa chỉ. Order Service tra thông tin này bằng mã khách trên đơn.'],
    ],
  },
  timeout: {
    goal: 'Giữ cùng độ trễ 4 giây để thấy giới hạn ở mỗi tầng ảnh hưởng thế nào đến thời gian người dùng phải chờ.',
    steps: ['Đo User Service trực tiếp', 'Đo khi Feign tự giới hạn chờ', 'Đo khi thêm TimeLimiter'],
    takeaway: 'So sánh cho thấy tầng nào dừng chờ trước với cấu hình hiện tại. Giới hạn ngắn giúp trả lỗi sớm, nhưng cần đủ thời gian cho các phản hồi hợp lệ.',
    terms: [
      ['Feign / RestClient', 'Hai cách gọi HTTP từ Java. Feign khai báo lời gọi bằng interface, còn RestClient gọi bằng các phương thức Java. Demo chạy Feign.'],
      ['Connect timeout', 'Giới hạn chờ để mở kết nối mới. Bài này giả lập phản hồi chậm sau khi kết nối đã mở.'],
      ['Read timeout', 'Giới hạn chờ dữ liệu phản hồi ở tầng HTTP. Feign trong demo đặt ngưỡng đọc 3 giây.'],
      ['Resilience4j TimeLimiter', 'Giới hạn thời gian Order Service chờ kết quả của tác vụ. Demo đặt 1,5 giây. Lời gọi bên dưới vẫn có thể tiếp tục sau khi Order Service đã trả lỗi.'],
    ],
  },
  retry: {
    goal: 'Kiểm tra một yêu cầu của người dùng có thể vượt qua lỗi tạm thời nhờ tự thử lại hay không.',
    steps: ['Gửi một yêu cầu từ giao diện', 'User Service lỗi hai lần đầu', 'Đọc kết quả lần thử cuối'],
    takeaway: 'Xem cả bảng từng lần gọi và mã HTTP cuối. Một yêu cầu vẫn có thể thành công sau lỗi tạm thời. Đổi lại, người dùng phải chờ thêm các lần thử và khoảng nghỉ giữa chúng.',
    terms: [
      ['Retry', 'Thử lại một thao tác khi gặp loại lỗi đã chọn và vẫn còn lượt. Demo cho tối đa 3 lần gọi, tính cả lần đầu.'],
      ['Spring Retry / Resilience4j Retry', 'Hai thư viện áp dụng chính sách thử lại. Spring Retry có @Retryable hoặc RetryTemplate. Demo chạy Resilience4j Retry để bọc lời gọi Feign.'],
      ['Backoff', 'Khoảng nghỉ trước khi gọi lại. Demo chờ 500 ms rồi 1.000 ms để các lần thử không dồn sát nhau.'],
    ],
  },
  bulkhead: {
    goal: 'Kiểm tra Order Service giới hạn bao nhiêu lời gọi cùng lúc khi nhiều người cùng truy cập.',
    steps: ['Gửi 10 lượt song song', 'Mỗi lượt xin một suất', 'Đếm số lượt được nhận và bị chặn'],
    takeaway: 'Nhìn cột Số lần gọi User. Lượt bị chặn vì hết suất có giá trị 0, cho thấy giới hạn đã bảo vệ dịch vụ phía sau khỏi nhận thêm tải.',
    terms: [
      ['Resilience4j Bulkhead', 'Giới hạn số công việc đang xử lý đồng thời. Có thể hình dung như quầy chỉ có ba chỗ phục vụ.'],
      ['Semaphore', 'Mỗi lượt phải lấy một suất. Demo có 3 suất và từ chối ngay khi hết chỗ. Khi một lượt xong, suất được trả để lượt khác dùng.'],
      ['HTTP 429', 'Trong demo, đây là mã của từng lượt bị từ chối vì hết suất. API tổng hợp vẫn có thể trả HTTP 200 vì đã thu được kết quả cả đợt.'],
    ],
  },
  breaker: {
    goal: 'Kiểm tra mạch có ngừng gửi thêm yêu cầu khi User Service lỗi liên tục và có tự cho gọi lại khi dịch vụ phục hồi hay không.',
    steps: ['Gửi 6 lượt khi User Service đang lỗi', 'Khôi phục dịch vụ và chờ mạch đổi trạng thái', 'Gửi 2 lượt thăm dò'],
    takeaway: 'Lượt thứ sáu và lượt thăm dò dùng cùng API. Kết quả khác nhau vì chúng đến ở hai trạng thái khác nhau của mạch và User Service đã được khôi phục trước khi thăm dò.',
    terms: [
      ['Resilience4j Circuit Breaker', 'Một cầu dao phần mềm. Nó dựa vào kết quả các lời gọi gần đây để quyết định có chuyển yêu cầu tiếp theo đến User Service hay không.'],
      ['CLOSED · Cho gọi', 'Năm lượt đầu vẫn tới User Service và nhận lỗi. Khi đủ 5 mẫu, tỷ lệ lỗi 100% vượt ngưỡng 50%, nên mạch mở.'],
      ['OPEN · Tạm chặn', 'Lượt thứ sáu đến ngay sau khi mạch mở nên Order Service trả 503 với 0 lần gọi User. Mạch ở trạng thái này khoảng 10 giây để giảm tải cho dịch vụ lỗi.'],
      ['HALF_OPEN · Gọi thăm dò', 'Hết thời gian chờ, mạch tự cho qua tối đa 2 lượt để kiểm tra. Nút thăm dò đợi mạch cho phép mới gửi. Hai lượt thành công đưa mạch về CLOSED. Một lượt lỗi trong hai lượt chạm ngưỡng 50% và làm mạch mở lại.'],
    ],
  },
  fallback: {
    goal: 'So sánh người dùng thấy gì khi cùng một sự cố được xử lý có hoặc không có dữ liệu dự phòng.',
    steps: ['Giả lập User Service lỗi', 'Gọi khi tắt dự phòng', 'Gọi lại khi bật dự phòng'],
    takeaway: 'Đọc trường outcome bên cạnh mã HTTP. FALLBACK cho biết màn hình đang dùng thông tin dự phòng; dữ liệu khách thật vẫn chưa lấy được.',
    terms: [
      ['Fallback', 'Dữ liệu thay thế mà Order Service trả khi luồng lấy thông tin khách thất bại. Demo dùng khách dự phòng để giao diện vẫn có nội dung hiển thị.'],
      ['HTTP 200 và FALLBACK', 'API đã trả một phản hồi có thể hiển thị. Trường outcome cho biết phản hồi này đến từ nhánh dự phòng.'],
    ],
  },
};
