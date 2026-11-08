export const lessons = {
  normal: {
    goal: 'Lấy một đơn hàng thành công để có kết quả chuẩn trước khi tạo sự cố.',
    mainPurpose: 'Kiểm tra luồng gọi microservice thông thường trong điều kiện lý tưởng: Order Service gọi User Service lấy thông tin khách hàng và trả về đơn hàng đầy đủ.',
    steps: ['Đọc đơn hàng #001', 'Tra thông tin khách', 'Trả dữ liệu đơn và khách'],
    takeaway: 'Dùng kết quả này làm mốc đối chiếu khi các bài sau trả lỗi hoặc trả dữ liệu dự phòng.',
    terms: [
      ['Order Service', 'Quản lý đơn hàng. Đơn có mã khách, sản phẩm và trạng thái.'],
      ['User Service', 'Quản lý thông tin khách hàng, chẳng hạn tên và địa chỉ. Order Service tra thông tin này bằng mã khách trên đơn.'],
    ],
  },
  timeout: {
    goal: 'Giữ cùng độ trễ 4 giây để thấy giới hạn ở mỗi tầng ảnh hưởng thế nào đến thời gian người dùng phải chờ.',
    mainPurpose: 'Thiết lập giới hạn thời gian chờ tối đa ở tầng HTTP client (OpenFeign / RestClient) và tầng ứng dụng (TimeLimiter). Khi downstream phản hồi chậm hoặc bị treo, client chủ động ngắt kết nối socket, ngay lập tức giải phóng thread pool và kết nối cho Order Service, ngăn chặn sự cố cạn kiệt luồng và sập dây chuyền (Cascading Failure).',
    steps: ['Đo User Service trực tiếp (trễ 4s)', 'Đo Feign read timeout (ngắt ở 3s)', 'Đo Resilience4j TimeLimiter (ngắt ở 1,5s)'],
    takeaway: 'So sánh cho thấy tầng nào dừng chờ trước với cấu hình hiện tại. Giới hạn ngắn giúp trả lỗi sớm, nhưng cần đủ thời gian cho các phản hồi hợp lệ.',
    terms: [
      ['Feign / RestClient', 'Hai cách gọi HTTP từ Java. Feign khai báo lời gọi bằng interface (@FeignClient), còn RestClient gọi bằng các phương thức Java. Demo chạy Feign.'],
      ['Connect timeout', 'Giới hạn thời gian tối đa để mở kết nối TCP mới. Bài này giả lập phản hồi chậm sau khi kết nối đã mở.'],
      ['Read timeout', 'Giới hạn thời gian chờ dữ liệu phản hồi ở tầng HTTP. Feign trong demo đặt ngưỡng đọc 3 giây.'],
      ['Resilience4j TimeLimiter', 'Giới hạn thời gian Order Service chờ kết quả của tác vụ ở tầng ứng dụng (đặt 1,5 giây) để giải phóng luồng sớm hơn.'],
      ['HTTP 504', 'Mã lỗi Gateway Timeout trả về khi một trong các tầng timeout ngắt việc chờ (FEIGN_TIMEOUT hoặc TIMEOUT).'],
    ],
  },
  retry: {
    goal: 'Kiểm tra một yêu cầu của người dùng có thể vượt qua lỗi tạm thời nhờ tự thử lại hay không.',
    mainPurpose: 'Tự động gửi lại yêu cầu khi gặp các sự cố mạng chập chờn hoặc gián đoạn thoáng qua (transient faults, HTTP 500) và áp dụng khoảng nghỉ tăng dần (Exponential Backoff). Giúp giao dịch tự cứu vãn thành công trong suốt với người dùng, đồng thời kiểm soát tần suất thử lại để không gây quá tải thêm cho đối tác (chống Retry Storm).',
    steps: ['Gửi một yêu cầu từ giao diện', 'User Service lỗi hai lần đầu', 'Đọc kết quả lần thử cuối (thành công ở lần 3)'],
    takeaway: 'Xem cả bảng từng lần gọi và mã HTTP cuối. Một yêu cầu vẫn có thể thành công sau lỗi tạm thời. Đổi lại, người dùng phải chờ thêm các lần thử và khoảng nghỉ giữa chúng.',
    terms: [
      ['Spring Retry / Resilience4j Retry', 'Hai thư viện áp dụng chính sách thử lại. Spring Retry có @Retryable hoặc RetryTemplate. Demo chạy Resilience4j Retry để bọc lời gọi Feign.'],
      ['Retry', 'Thử lại một thao tác khi gặp loại lỗi đã chọn và vẫn còn lượt. Demo cho tối đa 3 lần gọi, tính cả lần đầu.'],
      ['Backoff / Exponential Backoff', 'Khoảng nghỉ tăng dần trước khi gọi lại. Demo chờ 500 ms rồi 1.000 ms để các lần thử không dồn sát nhau.'],
      ['Retry Storm', 'Hiểm họa hàng triệu client cùng ồ ạt thử lại, biến lỗi mạng nhỏ thành sự cố sập toàn diện dịch vụ phía sau.'],
      ['Số lần gọi (attempts)', 'Số lượt thực tế gọi sang User Service được ghi nhận trên bảng kết quả (tối đa 3 lần).'],
    ],
  },
  bulkhead: {
    goal: 'Kiểm tra Order Service giới hạn bao nhiêu lời gọi cùng lúc khi nhiều người cùng truy cập.',
    mainPurpose: 'Cô lập tài nguyên và giới hạn số lượng cuộc gọi đồng thời tối đa (maxConcurrentCalls) được phép truy cập vào một dịch vụ downstream. Khi lượng truy cập tăng vọt vượt ngưỡng, Bulkhead từ chối ngay lập tức (fail-fast HTTP 429 trong vài ms) để bảo vệ thread pool của Order Service không bị chiếm dụng trọn bộ và bảo vệ downstream khỏi quá tải.',
    steps: ['Gửi 10 lượt song song (mỗi lượt chiếm luồng 2s)', 'Mỗi lượt xin một suất trong bộ đếm', 'Cấp 3 suất xử lý, từ chối ngay 7 lượt vượt ngưỡng'],
    takeaway: 'Nhìn cột Số lần gọi User. Lượt bị chặn vì hết suất có giá trị 0, cho thấy giới hạn đã bảo vệ dịch vụ phía sau khỏi nhận thêm tải.',
    terms: [
      ['Resilience4j Bulkhead', 'Giới hạn số công việc đang xử lý đồng thời để cô lập tài nguyên cho từng dịch vụ.'],
      ['Semaphore', 'Mỗi lượt phải lấy một suất. Demo có 3 suất và từ chối ngay khi hết chỗ. Khi một lượt xong, suất được trả để lượt khác dùng.'],
      ['HTTP 429', 'Mã của từng lượt bị từ chối ngay vì hết suất xử lý. Lượt bị chặn có số lần gọi User = 0.'],
      ['maxConcurrentCalls', 'Ngưỡng cuộc gọi đồng thời tối đa được chấp nhận tại một thời điểm (demo đặt là 3).'],
    ],
  },
  breaker: {
    goal: 'Kiểm tra mạch có ngừng gửi thêm yêu cầu khi User Service lỗi liên tục và có tự cho gọi lại khi dịch vụ phục hồi hay không.',
    mainPurpose: 'Đóng vai trò cầu dao ngắt mạch thông minh, liên tục theo dõi tỷ lệ thất bại của downstream trong một cửa sổ trượt. Khi tỷ lệ lỗi vượt ngưỡng cho phép (≥ 50%), mạch tự động chuyển sang OPEN để lập tức từ chối mọi yêu cầu mới trong 0ms (HTTP 503) mà không cần gọi downstream; sau đó tự động chuyển sang HALF_OPEN để thăm dò và khôi phục khi dịch vụ phía sau đã bình thường trở lại.',
    steps: ['Gửi 6 lượt khi User Service đang lỗi 100%', 'Mạch đếm 5 mẫu lỗi và chuyển sang OPEN ở lượt 6', 'Khôi phục dịch vụ, chờ 10s để mạch sang HALF_OPEN', 'Gửi 2 lượt thăm dò thành công đưa mạch về CLOSED'],
    takeaway: 'Lượt thứ sáu và lượt thăm dò dùng cùng API. Kết quả khác nhau vì chúng đến ở hai trạng thái khác nhau của mạch và User Service đã được khôi phục trước khi thăm dò.',
    terms: [
      ['Resilience4j Circuit Breaker', 'Một cầu dao phần mềm dựa vào kết quả các lời gọi gần đây để quyết định có chuyển yêu cầu tiếp theo đến User Service hay không.'],
      ['CLOSED · Cho gọi', 'Năm lượt đầu vẫn tới User Service và nhận lỗi. Khi đủ 5 mẫu, tỷ lệ lỗi 100% vượt ngưỡng 50%, nên mạch mở.'],
      ['OPEN · Tạm chặn', 'Lượt thứ sáu đến ngay sau khi mạch mở nên Order Service trả HTTP 503 trong 0ms với 0 lần gọi User. Mạch giữ trạng thái này 10 giây để giảm tải cho dịch vụ lỗi.'],
      ['HALF_OPEN · Gọi thăm dò', 'Hết thời gian chờ, mạch tự cho qua tối đa 2 lượt để kiểm tra. Hai lượt thành công đưa mạch về CLOSED. Một lượt lỗi trong hai lượt chạm ngưỡng 50% và làm mạch mở lại.'],
      ['Sliding Window', 'Cửa sổ trượt ghi nhận kết quả các cuộc gọi gần nhất (demo cấu hình 5 cuộc gọi) để tính tỷ lệ thất bại.'],
    ],
  },
  converge: {
    goal: 'Kiểm chứng trọn vẹn 1 vòng đời (Full Lifecycle) của đơn hàng khi cả 4 cơ chế cùng bảo vệ: từ lọc tải ➔ tự cứu lỗi nhỏ ➔ ngắt cầu dao fail-fast để sống sót khi đối tác chết ➔ tự chữa lành khép mạch về 200 OK khi đối tác hồi phục.',
    mainPurpose: 'Thiết lập kiến trúc phòng thủ đa tầng phối hợp nhịp nhàng: Bulkhead lọc bão lưu lượng ➔ Feign Timeout cắt đứt trễ ➔ Circuit Breaker ngắt mạch khi lỗi tràn lan ➔ Retry tự cứu lỗi chập chờn. Đặc biệt kiểm soát thứ tự lồng nhau: khi Circuit Breaker đã OPEN, Retry lập tức dừng lại, ngăn chặn triệt để thảm họa bão request (Retry Storm).',
    steps: [
      'Pha 1 · Lọc bão tải: 6 lượt đồng thời (Bulkhead cấp 3 suất 200 OK, từ chối 3 lượt 429 để bảo vệ thread)',
      'Pha 2 · Tự cứu lỗi nhỏ: Lỗi 2 lần đầu (Retry tự thử lại với Backoff, thành công ở lần 3 với 200 OK)',
      'Pha 3 · Cắt trễ & Bật cầu dao: User Service treo 3s (Feign timeout ngắt sau 1s, CB đạt ngưỡng lỗi bung sang OPEN)',
      'Pha 4 · Bảo vệ sinh tồn: Gọi lại khi đối tác đang chết (CB trả HTTP 503 ngay trong 14ms, 0 lần gọi User, Retry dừng ngay)',
      'Pha 5 · Tự chữa lành: User Service hồi phục (thăm dò thành công HTTP 200 OK, mạch tự động khép về CLOSED)',
    ],
    takeaway: 'Thấy rõ ý nghĩa của từng mã: 200 OK (xử lý thành công), 429 (Bulkhead lọc tải), 503 ở Pha 4 (KHÔNG PHẢI lỗi sập hệ thống, mà là Circuit Breaker can thiệp thành công trong 14ms để cứu sống Order Service), và Pha 5 tự chữa lành về 200 OK hoàn tất trọn vẹn 1 flow.',
    terms: [
      ['Decorators Pipeline', 'Thứ tự lồng nhau: Retry (ngoài cùng) ➔ Circuit Breaker ➔ Bulkhead ➔ Feign Timeout (trong cùng) ➔ User Service.'],
      ['Fail-Fast (HTTP 503 ở Pha 4)', 'Phản hồi từ chối ngay trong 14ms tại Order Service với 0 lần gọi User. Đây là thành công của cơ chế tự bảo vệ khi đối tác sập.'],
      ['Chống Retry Storm', 'Khi Circuit Breaker chuyển sang OPEN, Retry nhận diện và dừng ngay lập tức, không thử lại vô ích.'],
      ['Tự chữa lành (Self-Healing)', 'Khi User Service hoạt động bình thường trở lại, mạch tự cho thăm dò và đóng lại CLOSED với HTTP 200 OK.'],
    ],
  },
  fallback: {
    goal: 'So sánh người dùng thấy gì khi cùng một sự cố được xử lý có hoặc không có dữ liệu dự phòng.',
    mainPurpose: 'Cung cấp giải pháp hạ cấp mềm dẻo (Graceful Degradation). Khi mọi cơ chế bảo vệ đều báo lỗi hoặc downstream sập nguồn, Fallback tự động trả về phản hồi dự phòng an toàn (HTTP 200 kèm nhãn FALLBACK) để giao diện người dùng vẫn có dữ liệu hiển thị mượt mà thay vì màn hình lỗi trắng xóa.',
    steps: ['Giả lập User Service lỗi', 'Gọi khi tắt dữ liệu dự phòng (nhận lỗi 500/503)', 'Gọi lại khi bật dữ liệu dự phòng (nhận dữ liệu khách dự phòng HTTP 200)'],
    takeaway: 'Đọc trường outcome bên cạnh mã HTTP. FALLBACK cho biết màn hình đang dùng thông tin dự phòng; dữ liệu khách thật vẫn chưa lấy được.',
    terms: [
      ['Fallback', 'Dữ liệu thay thế mà Order Service trả khi luồng lấy thông tin khách thất bại. Demo dùng khách dự phòng để giao diện vẫn có nội dung hiển thị.'],
      ['HTTP 200 và FALLBACK', 'API đã trả một phản hồi có thể hiển thị. Trường outcome cho biết phản hồi này đến từ nhánh dự phòng.'],
    ],
  },
};

export const comparisons = {
  timeout: {
    title: 'So sánh cơ chế Feign / TimeLimiter Timeout vs Không có Timeout',
    warning: 'Khi không dùng Timeout, downstream bị treo 4 giây làm luồng xử lý của Order Service bị ngâm nghẹt suốt 4.000ms, khiến toàn bộ Connection Pool và Thread Pool bị cạn kiệt, dẫn tới sập dây chuyền (Cascading Failure).',
    rows: [
      {
        criterion: 'Thời gian chờ phản hồi',
        protectedVal: 'Ngắt ngay sau 1.5s (TimeLimiter) hoặc 3s (Feign readTimeout)',
        unprotectedVal: 'Treo cứng 4.000ms (hoặc chờ vô hạn tới khi gateway/client timeout)',
        impact: 'Cứu được 2.5s lãng phí, giải phóng luồng ngay lập tức.',
      },
      {
        criterion: 'Tài nguyên Thread & Socket',
        protectedVal: 'Thu hồi Thread pool và Socket TCP ngay khi hết hạn định ngạch',
        unprotectedVal: 'Thread bị phong tỏa (Blocked I/O) suốt 4s, Connection Pool cạn sạch',
        impact: 'Ngăn chặn hiện tượng nghẽn luồng dây chuyền sang các nghiệp vụ khác.',
      },
      {
        criterion: 'Mã HTTP & Trạng thái',
        protectedVal: 'HTTP 504 Gateway Timeout có kiểm soát rõ ràng',
        unprotectedVal: 'HTTP 200 sau 4s (hoặc trình duyệt timeout báo lỗi kết nối ngắt ngang)',
        impact: 'Phản hồi dứt khoát giúp client xử lý UI thay vì quay vòng vô tận.',
      },
      {
        criterion: 'Nguy cơ sụp đổ dây chuyền',
        protectedVal: 'Triệt tiêu 100%: Dịch vụ gọi (Order) sống sót ngay cả khi đối tác chết ngạt',
        unprotectedVal: 'Nguy cơ cực cao: 20-50 request ngâm đồng thời là sập toàn bộ Order Service',
        impact: 'Timeout là lớp phòng thủ tối thiểu bắt buộc của mọi kiến trúc Microservices.',
      },
    ],
  },
  retry: {
    title: 'So sánh cơ chế Resilience4j Retry vs Không có Retry',
    warning: 'Khi không dùng Retry, bất kỳ lỗi mạng thoáng qua (HTTP 500 transient fault) ở downstream cũng sẽ lập tức biến thành lỗi thất bại vĩnh viễn với người dùng, ném lỗi 500 và làm hỏng giao dịch ngay lần đầu tiên.',
    rows: [
      {
        criterion: 'Xử lý lỗi mạng chập chờn',
        protectedVal: 'Tự động thử lại tối đa 3 lần với Exponential Backoff (500ms, 1000ms)',
        unprotectedVal: 'Đầu hàng ngay lập tức ở lần đầu tiên (1 attempt duy nhất)',
        impact: 'Cứu vãn giao dịch thành công 100% trong suốt với người dùng cuối.',
      },
      {
        criterion: 'Trải nghiệm người dùng (UX)',
        protectedVal: 'Nhận kết quả HTTP 200 OK với đầy đủ dữ liệu khách hàng',
        unprotectedVal: 'Bị quăng lỗi HTTP 500 sụp đổ màn hình, đơn hàng bị hủy bỏ',
        impact: 'Người dùng không phải tự tay bấm F5 / Đặt lại đơn hàng nhiều lần.',
      },
      {
        criterion: 'Thời gian phục hồi đối tác',
        protectedVal: 'Áp dụng Exponential Backoff để downstream có thời gian khởi động lại',
        unprotectedVal: 'Không có cơ chế phục hồi; chỉ biết báo lỗi và bỏ cuộc',
        impact: 'Khoảng nghỉ tăng dần ngăn chặn hiện tượng bão thử lại (Retry Storm).',
      },
      {
        criterion: 'Số lần gọi downstream',
        protectedVal: 'Thử lại có kiểm soát (Lần 1 ❌ ➔ Lần 2 ❌ ➔ Lần 3 ✅)',
        unprotectedVal: 'Chỉ gọi đúng 1 lần duy nhất rồi vứt bỏ toàn bộ ngữ cảnh',
        impact: 'Tăng tỷ lệ khả dụng (High Availability) từ 0% lên 100% khi lỗi thoáng qua.',
      },
    ],
  },
  bulkhead: {
    title: 'So sánh cơ chế Resilience4j Bulkhead vs Không có Bulkhead',
    warning: 'Khi không dùng Bulkhead, 10 request đồng thời ập vào chiếm trọn 10/10 worker threads của Order Service trong 2 giây. Thread pool bị cạn kiệt 100%, làm tê liệt toàn bộ các API quan trọng khác như tạo đơn, thanh toán hay hủy đơn.',
    rows: [
      {
        criterion: 'Giới hạn đồng thời (Concurrency Cap)',
        protectedVal: 'Giới hạn nghiêm ngặt 3 suất (Semaphore maxConcurrentCalls = 3)',
        unprotectedVal: 'Không có bất kỳ giới hạn nào, nhận bừa bãi toàn bộ 10/10 request',
        impact: 'Cô lập rủi ro trong một khoang kín, bảo toàn 70% tài nguyên còn lại.',
      },
      {
        criterion: 'Phản ứng khi quá tải',
        protectedVal: '7 lượt quá tải bị dội ngược ngay tức khắc trong 1ms (HTTP 429)',
        unprotectedVal: 'Cả 10 lượt cùng chen chúc ngâm 2s, chiếm dụng 100% worker threads',
        impact: 'Fail-fast trong 1ms giúp client biết hệ thống bận thay vì treo ngâm máy móc.',
      },
      {
        criterion: 'Tình trạng Thread Pool',
        protectedVal: 'Chỉ dùng tối đa 3 threads, còn dư thừa thread cho các API khác',
        unprotectedVal: 'Cạn kiệt 10/10 threads trong 2s, gây nạn đói tài nguyên (Thread Starvation)',
        impact: 'Bảo vệ các luồng doanh thu cốt lõi (thanh toán, giỏ hàng) luôn thông suốt.',
      },
      {
        criterion: 'Mã HTTP phản hồi',
        protectedVal: '3 lượt HTTP 200 OK + 7 lượt HTTP 429 Too Many Requests chuẩn mực',
        unprotectedVal: '10 lượt HTTP 200 nhưng toàn hệ thống bị nghẽn đơ cứng suốt 2 giây',
        impact: 'Áp dụng nguyên lý khoang kín vách ngăn tàu thủy (Ship Bulkhead).',
      },
    ],
  },
  breaker: {
    title: 'So sánh cơ chế Circuit Breaker vs Không có Circuit Breaker',
    warning: 'Khi không dùng Circuit Breaker, dù downstream đã chết 100%, Order Service vẫn mù quáng gửi cả 6 request qua mạng. Không có Fail-Fast (0ms), vừa lãng phí tài nguyên vừa dội bom vào đối tác đang gặp sự cố, chặn đứng cơ hội tự phục hồi.',
    rows: [
      {
        criterion: 'Hành vi khi đối tác chết',
        protectedVal: 'Nhận diện lỗi ≥ 50% ➔ Tự bung OPEN 🔴, chặn đứng mọi lời gọi mới',
        unprotectedVal: 'Mù quáng gửi tiếp cả 6 request qua mạng dù đối tác đang chết ngập ngụa',
        impact: 'Ngắt mạch khẩn cấp để ngăn chặn thảm họa sập toàn diện hệ thống.',
      },
      {
        criterion: 'Tốc độ phản hồi khi lỗi',
        protectedVal: 'Lượt 6 bị từ chối NGAY TỨC THÌ trong 14ms (HTTP 503 Fail-Fast, 0 lần gọi)',
        unprotectedVal: 'Mỗi lượt đều phải đi qua mạng, đợi lỗi và tiêu tốn hàng trăm ms/giây vô ích',
        impact: 'Tiết kiệm 100% thời gian chờ và băng thông mạng khi dịch vụ lỗi.',
      },
      {
        criterion: 'Bảo vệ downstream',
        protectedVal: 'Mạch mở 10s cho đối tác thở, ngừng hẳn mọi cuộc gọi sang đối tác',
        unprotectedVal: 'Liên tục nã đạn request vào đối tác đang kiệt sức (Cascading Overload)',
        impact: 'Giúp đối tác có không gian thở và tự chữa lành (Self-Healing).',
      },
      {
        criterion: 'Cơ chế tự phục hồi',
        protectedVal: 'Tự chuyển HALF-OPEN 🟡, gửi 2 lượt thăm dò và tự đóng lại CLOSED 🟢',
        unprotectedVal: 'Không có trí thông minh tự phục hồi; phụ thuộc hoàn toàn vào reboot thủ công',
        impact: 'Hệ thống tự động vận hành và hồi phục mà không cần can thiệp con người.',
      },
    ],
  },
};

