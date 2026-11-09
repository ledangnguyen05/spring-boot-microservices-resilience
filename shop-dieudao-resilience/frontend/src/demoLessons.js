export const lessons = {
  normal: {
    goal: 'Kiểm tra luồng chạy bình thường để làm mốc so sánh trước khi tạo lỗi.',
    mainPurpose: 'Order Service nhận yêu cầu lấy đơn hàng, gọi sang User Service để lấy tên và địa chỉ khách, rồi trả về thông tin đầy đủ.',
    steps: ['Đọc đơn hàng #001', 'Gọi User Service lấy tên & địa chỉ khách', 'Gộp lại và trả kết quả (HTTP 200)'],
    takeaway: 'Khi mọi thứ bình thường, kết quả trả về chỉ mất khoảng 15–30ms.',
    terms: [
      ['Order Service', 'Dịch vụ quản lý đơn hàng (sản phẩm, số lượng, giá).'],
      ['User Service', 'Dịch vụ lưu thông tin khách hàng (họ tên, địa chỉ).'],
    ],
  },
  timeout: {
    goal: 'Hiểu tại sao phải đặt giới hạn thời gian chờ (Timeout) và phân biệt 2 tầng Timeout: tầng kết nối HTTP (Feign/RestClient) vs tầng nghiệp vụ ứng dụng (TimeLimiter).',
    mainPurpose: 'Khi User Service bị treo hoặc xử lý quá chậm (4 giây), nếu không đặt Timeout thì Order Service sẽ đứng chờ mãi, kẹt hết luồng xử lý và sập theo. Lưu ý quan trọng: các con số 3s (Feign), 2.5s (RestClient) và 1.5s (TimeLimiter) là do chúng ta CHỦ ĐỘNG CẤU HÌNH MẪU để minh họa vai trò của từng tầng — không dùng để so sánh thư viện nào nhanh hơn.',
    steps: [
      'Không cài Timeout: Phải đứng chờ đủ 4 giây',
      'Lớp kết nối HTTP (Feign 3s / RestClient 2.5s): Hạn mức cho MỘT lần gửi request qua mạng',
      'Lớp nghiệp vụ ứng dụng (TimeLimiter 1.5s): Tổng thời gian tối đa cho phép cả chức năng chạy',
    ],
    takeaway: 'Feign/RestClient Timeout bảo vệ từng cuộc gọi mạng riêng lẻ. TimeLimiter bảo vệ thời gian chờ tổng thể của cả nghiệp vụ (kể cả khi bên dưới gọi nhiều bước hoặc có Retry). Hai tầng này bổ trợ cho nhau, không phải đối thủ của nhau.',
    terms: [
      ['Lưu ý về con số cấu hình (3s, 2.5s, 1.5s)', 'Đây là các mốc thời gian mẫu tự cấu hình trong file code để dễ quan sát lúc chạy demo, KHÔNG phải hiệu năng cố định của thư viện. Ngoài thực tế, lập trình viên tự chọn con số phù hợp với nghiệp vụ.'],
      ['Feign / RestClient Timeout (Lớp kết nối)', 'Giới hạn thời gian chờ cho 1 lần gửi HTTP request đơn lẻ. Nếu có Retry 3 lần, mỗi lần chờ 3s thì tổng cộng khách vẫn phải đợi 9s.'],
      ['Resilience4j TimeLimiter (Lớp ứng dụng)', 'Đặt "trần" thời gian tối đa cho toàn bộ tác vụ (CompletableFuture). Quá ngưỡng tổng này thì hủy ngay để giải phóng luồng.'],
      ['HTTP 504 (Gateway Timeout)', 'Mã báo hết thời gian chờ một cách chủ động, giúp hệ thống thoát khỏi tình trạng treo cứng vô hạn.'],
    ],
  },
  retry: {
    goal: 'Xem hệ thống tự động thử lại như thế nào khi gặp lỗi tạm thời (mạng chập chờn hoặc dịch vụ vừa khởi động lại).',
    mainPurpose: 'Thay vì gặp lỗi lần đầu đã vội báo hỏng ngay cho người dùng, hệ thống giữ lại lỗi trong âm thầm, nghỉ một nhịp ngắn tăng dần (500ms rồi 1000ms) rồi tự gọi lại. Hệ thống chạy song song cả 2 thư viện chuẩn của Spring Boot là Resilience4j Retry và Spring Retry.',
    steps: [
      'Gửi 1 yêu cầu lấy thông tin khách',
      'User Service cố tình báo lỗi (500) ở lần 1 và lần 2',
      'Nghỉ 500ms rồi 1000ms ➔ Thử lần 3 thành công (HTTP 200)',
    ],
    takeaway: 'Khách hàng vẫn nhận được dữ liệu bình thường mà không hề biết hệ thống vừa gặp 2 lần lỗi thoáng qua.',
    terms: [
      ['Spring Retry & Resilience4j Retry', 'Hai thư viện hỗ trợ tự thử lại phổ biến nhất. Dự án cài đặt cả hai để ban giám khảo xem trực tiếp cách dùng bằng Spring RetryTemplate và Resilience4j Decorator.'],
      ['Exponential Backoff (Nghỉ tăng dần)', 'Khoảng nghỉ tăng dần giữa các lần thử lại (ví dụ 500ms ➔ 1000ms) để dịch vụ bên kia có thời gian hồi phục.'],
      ['Chống Retry Storm (Bão thử lại)', 'Nếu hàng nghìn người cùng thử lại liên tục không nghỉ sẽ làm sập hẳn dịch vụ đang yếu. Backoff giúp giãn nhịp ra.'],
      ['Số lần gọi (Attempts)', 'Tổng số lần Order Service thực sự gọi sang User Service (tối đa 3 lần).'],
    ],
  },
  bulkhead: {
    goal: 'Giới hạn số lượng người được xử lý cùng lúc để tránh tình trạng 1 chức năng chậm làm treo toàn bộ hệ thống.',
    mainPurpose: 'Giống như vách ngăn chống tràn trên tàu thủy: dù khoang này bị nước tràn, các khoang khác vẫn an toàn. Bulkhead cấp tối đa 3 chỗ làm việc cùng lúc cho việc gọi User Service. Ai đến sau khi đã hết chỗ sẽ nhận thông báo bận ngay (HTTP 429) thay vì vào xếp hàng làm đơ hết máy chủ.',
    steps: [
      'Bắn 10 yêu cầu cùng lúc (mỗi lượt xử lý mất 2 giây)',
      'Chỉ có 3 chỗ (slot) được nhận vào xử lý',
      '7 người đến sau bị từ chối ngay (HTTP 429) trong vài mili-giây',
    ],
    takeaway: 'Các lượt bị từ chối có Số lần gọi User = 0, chứng tỏ tải thừa đã bị chặn ngay ở cửa trước khi chạm tới dịch vụ bên dưới.',
    terms: [
      ['Resilience4j Bulkhead', 'Cơ chế tạo "vách ngăn" giới hạn số luồng tối đa cho một dịch vụ để bảo vệ tài nguyên chung.'],
      ['Semaphore (3 chỗ)', 'Mô hình đếm vé: có 3 vé (maxConcurrentCalls = 3). Ai lấy được vé mới được đi tiếp; hết vé thì báo bận ngay.'],
      ['HTTP 429 (Too Many Requests)', 'Mã phản hồi báo hệ thống đang quá tải, mời thử lại sau.'],
    ],
  },
  breaker: {
    goal: 'Tự động ngắt kết nối khi phát hiện dịch vụ bên kia đang hỏng liên tục, rồi tự kiểm tra và mở lại khi nó khỏe.',
    mainPurpose: 'Hoạt động y hệt cầu dao điện trong nhà: Khi thấy dịch vụ bên kia lỗi liên tục (≥ 50% số lần gọi gần nhất bị lỗi), cầu dao tự NGẮT (OPEN). Mọi yêu cầu mới đến đều bị trả về lỗi ngay trong vài mili-giây (không gọi qua mạng nữa). Nhờ vậy máy chủ vừa không tốn công chờ vô ích, vừa để yên cho dịch vụ hỏng sửa lỗi.',
    steps: [
      'Gửi 6 lượt khi User Service lỗi 100%',
      'Đủ 5 mẫu lỗi ➔ Cầu dao ngắt (OPEN), lượt thứ 6 bị chặn luôn tại cửa (HTTP 503)',
      'Sửa lại User Service, chờ hết thời gian mở mạch (10 giây) để mạch sang trạng thái dò đường (HALF-OPEN)',
      'Gửi 2 lượt thăm dò thành công ➔ Cầu dao đóng lại bình thường (CLOSED)',
    ],
    takeaway: 'Cầu dao giúp hệ thống tự ngắt nhanh khi gặp sự cố lớn và tự khôi phục lại mà không cần kỹ thuật viên vào khởi động lại.',
    terms: [
      ['CLOSED (Mạch đóng · Cho đi qua)', 'Trạng thái bình thường, mọi yêu cầu đều được gửi sang User Service.'],
      ['OPEN (Mạch ngắt · Chặn tại cửa)', 'Khi tỷ lệ lỗi vượt ngưỡng (50% trong 5 lần gần nhất), cầu dao ngắt trong 10 giây. Mọi cuộc gọi mới bị trả lỗi ngay (HTTP 503, 0 lần gọi qua mạng).'],
      ['HALF-OPEN (Mở hé · Dò đường)', 'Hết 10 giây, cầu dao mở hé cho thử tối đa 2 cuộc gọi để xem dịch vụ bên kia đã khỏe lại chưa.'],
      ['Cửa sổ trượt (Sliding Window)', 'Bộ nhớ đếm kết quả 5 cuộc gọi gần nhất để tính phần trăm lỗi.'],
    ],
  },
  converge: {
    goal: 'Xem cả 4 cơ chế (Bulkhead, Timeout, Retry, Circuit Breaker) phối hợp với nhau trong một vòng đời hoàn chỉnh.',
    mainPurpose: 'Ghép cả 4 lớp bảo vệ vào cùng một luồng gọi API: Retry bọc ngoài cùng ➔ Circuit Breaker ➔ Bulkhead ➔ Timeout. Chạy qua 5 giai đoạn từ lúc lưu lượng cao, gặp lỗi nhẹ, dịch vụ bị treo chết hẳn cho tới lúc tự hồi phục.',
    steps: [
      'Giai đoạn 1 (Bulkhead): Gửi 6 lượt cùng lúc ➔ Nhận 3 lượt, chặn bớt 3 lượt thừa (429)',
      'Giai đoạn 2 (Retry): Gặp lỗi nhẹ 2 lần đầu ➔ Tự thử lại lần 3 thành công (200 OK)',
      'Giai đoạn 3 (Timeout + Circuit Breaker): Dịch vụ treo 3s ➔ Timeout cắt ở 1s, cầu dao chuyển OPEN',
      'Giai đoạn 4 (Fail-Fast): Gọi khi cầu dao đang OPEN ➔ Chặn ngay sau ~14ms (503), Retry cũng tự dừng không cố gọi lại',
      'Giai đoạn 5 (Tự hồi phục): Dịch vụ khỏe lại ➔ Thăm dò thành công 200 OK, cầu dao đóng về CLOSED',
    ],
    takeaway: 'Khi xếp đúng thứ tự lồng nhau, 4 cơ chế hỗ trợ nhau hoàn hảo: khi cầu dao đã ngắt (OPEN), Retry không cố thử lại vô ích nữa, tránh gây bão request.',
    terms: [
      ['Thứ tự lồng nhau', 'Retry (ngoài cùng) ➔ Circuit Breaker ➔ Bulkhead ➔ Timeout ➔ Gọi User Service.'],
      ['Ngắt nhanh (Fail-Fast 503)', 'Chủ động trả lỗi ngay lập tức tại Order Service khi biết chắc đối tác đang chết, giúp bảo vệ toàn hệ thống.'],
      ['Tự hồi phục (Self-Healing)', 'Tự động phát hiện đối tác đã khỏe lại thông qua lượt dò đường và đưa hệ thống về trạng thái bình thường.'],
    ],
  },
  fallback: {
    goal: 'Xem màn hình ứng dụng thay đổi thế nào giữa việc BẬT và TẮT dữ liệu dự phòng khi dịch vụ gặp lỗi hoàn toàn.',
    mainPurpose: 'Khi tất cả mọi cách thử lại đều thất bại, thay vì ném ra màn hình báo lỗi gây khó chịu cho người dùng, hệ thống kích hoạt phương án dự phòng (Fallback) để trả về dữ liệu mặc định an toàn.',
    steps: [
      'Giả lập User Service hỏng hoàn toàn',
      'Khi TẮT Fallback: Người dùng nhận mã lỗi HTTP 500/503',
      'Khi BẬT Fallback: Người dùng vẫn nhận được tên "Khách (dự phòng)" kèm HTTP 200',
    ],
    takeaway: 'Fallback giúp giữ cho giao diện luôn hiển thị mượt mà dù một phần hệ thống phụ phía sau đang gặp sự cố.',
    terms: [
      ['Fallback (Phương án dự phòng)', 'Hàm xử lý thay thế chạy khi cuộc gọi chính thất bại hoàn toàn.'],
      ['Hạ cấp mềm dẻo (Graceful Degradation)', 'Thà hiển thị thông tin cơ bản/tạm thời cho khách còn hơn là làm hỏng toàn bộ trang web.'],
    ],
  },
};

export const comparisons = {
  timeout: {
    title: 'So sánh Có Timeout vs Không có Timeout (Đứng ở góc độ người dùng & hệ thống)',
    warning: 'Nếu KHÔNG cài Timeout: khi dịch vụ bên dưới bị treo 4 giây (hoặc treo vĩnh viễn), luồng xử lý của bạn cũng bị kẹt cứng từng ấy thời gian. Chỉ cần vài chục người dùng cùng bấm là máy chủ hết sạch luồng xử lý và sập theo.',
    rows: [
      {
        criterion: 'Khi dịch vụ bên kia bị chậm',
        protectedVal: 'Chủ động cắt theo hạn mức đã cấu hình (tầng mạng: Feign/RestClient, tầng nghiệp vụ: TimeLimiter)',
        unprotectedVal: 'Đứng chờ thụ động cho tới khi mạng tự đứt hoặc hết 4 giây mới trả lời',
        impact: 'Giúp máy chủ không bị giam giữ luồng xử lý quá lâu.',
      },
      {
        criterion: 'Khác biệt giữa 2 tầng Timeout',
        protectedVal: 'Feign/RestClient kiểm soát 1 cuộc gọi HTTP; TimeLimiter kiểm soát tổng thời gian cả chức năng (gồm cả Retry/Async)',
        unprotectedVal: 'Không có cả 2 lớp giới hạn nào bảo vệ',
        impact: 'Thời gian (3s, 2.5s, 1.5s) chỉ là ví dụ tự cài để thấy cách 2 lớp phối hợp — không phải cuộc thi xem ai nhanh hơn.',
      },
      {
        criterion: 'Phản hồi về giao diện',
        protectedVal: 'Trả mã HTTP 504 rõ ràng, dứt khoát đúng hạn mức đã đặt',
        unprotectedVal: 'Quay vòng chờ đợi rất lâu, dễ gây đơ trình duyệt của khách',
        impact: 'Người dùng biết ngay sự cố để thao tác lại thay vì chờ trong vô vọng.',
      },
      {
        criterion: 'Rủi ro sập dây chuyền',
        protectedVal: 'An toàn: luồng xử lý được thu hồi ngay để phục vụ người khác',
        unprotectedVal: 'Rủi ro cực cao: nhiều yêu cầu treo cùng lúc sẽ làm sập cả Order Service',
        impact: 'Timeout là lớp bảo vệ cơ bản nhất mà mọi hệ thống Microservices đều phải có.',
      },
    ],
  },
  retry: {
    title: 'So sánh Có Retry (Tự thử lại) vs Không có Retry',
    warning: 'Nếu KHÔNG có Retry: chỉ cần mạng chớp nhẹ hoặc dịch vụ bên kia vừa khởi động lại mất 1 giây, người dùng sẽ bị báo lỗi hỏng đơn hàng ngay ở lần bấm đầu tiên.',
    rows: [
      {
        criterion: 'Gặp lỗi tạm thời 2 lần đầu',
        protectedVal: 'Tự động thử lại tới 3 lần (hỗ trợ cả Resilience4j Retry & Spring Retry)',
        unprotectedVal: 'Báo lỗi ngay từ lần đầu tiên (không thử lại)',
        impact: 'Biến một giao dịch tưởng chừng đã hỏng thành thành công 100%.',
      },
      {
        criterion: 'Trải nghiệm khách hàng',
        protectedVal: 'Nhận kết quả bình thường (HTTP 200 OK), không hề hay biết vừa có lỗi',
        unprotectedVal: 'Hiện màn hình lỗi HTTP 500, khách hàng phải tự bấm lại từ đầu',
        impact: 'Giữ chân khách hàng và giảm tỷ lệ rớt đơn.',
      },
      {
        criterion: 'Cách thử lại (Backoff)',
        protectedVal: 'Nghỉ tăng dần (500ms ➔ 1000ms) để dịch vụ bên kia kịp hồi sức',
        unprotectedVal: 'Không có cơ chế thử lại hay chờ hồi phục',
        impact: 'Khoảng nghỉ tăng dần giúp tránh dồn tải làm sập đối tác.',
      },
      {
        criterion: 'Tổng số lần gọi',
        protectedVal: 'Gọi 3 lần có kiểm soát: Lần 1 ❌ ➔ Lần 2 ❌ ➔ Lần 3 ✅',
        unprotectedVal: 'Gọi đúng 1 lần rồi bỏ cuộc',
        impact: 'Tăng độ ổn định của hệ thống khi chạy trên mạng thực tế.',
      },
    ],
  },
  bulkhead: {
    title: 'So sánh Có Bulkhead (Vách ngăn giới hạn) vs Không có Bulkhead',
    warning: 'Nếu KHÔNG có Bulkhead: 10 người cùng bấm gọi tính năng đang chậm sẽ chiếm trọn 10/10 luồng xử lý của máy chủ. Các tính năng quan trọng khác (thanh toán, giỏ hàng) cũng bị kẹt cứng theo.',
    rows: [
      {
        criterion: 'Số người làm việc cùng lúc',
        protectedVal: 'Khóa chặt tối đa 3 người cùng lúc (Semaphore = 3)',
        unprotectedVal: 'Ai vào cũng nhận, chiếm hết toàn bộ 10 luồng xử lý',
        impact: 'Cô lập khu vực chậm vào một "khoang riêng", giữ an toàn cho phần còn lại.',
      },
      {
        criterion: 'Khi vượt quá giới hạn',
        protectedVal: '7 người đến sau được báo bận ngay trong vài mili-giây (HTTP 429)',
        unprotectedVal: 'Cả 10 người cùng chen chúc chờ suốt 2 giây',
        impact: 'Từ chối nhanh (Fail-fast) để bảo vệ máy chủ không bị quá tải sập nguồn.',
      },
      {
        criterion: 'Ảnh hưởng tới tính năng khác',
        protectedVal: 'Không ảnh hưởng: máy chủ vẫn còn dư luồng cho trang thanh toán/đăng nhập',
        unprotectedVal: 'Sập toàn diện: tất cả API khác đều phải xếp hàng chờ theo',
        impact: 'Giữ vững các tính năng kiếm tiền chính luôn hoạt động mượt mà.',
      },
      {
        criterion: 'Kết quả đo thực tế',
        protectedVal: '3 thành công (200 OK) + 7 báo bận (429 Too Many Requests)',
        unprotectedVal: '10/10 cùng xử lý nhưng máy chủ đơ hoàn toàn trong 2 giây',
        impact: 'Đúng với nguyên lý ngăn khoang kín trên tàu thủy.',
      },
    ],
  },
  breaker: {
    title: 'So sánh Có Circuit Breaker (Cầu dao ngắt mạch) vs Không có',
    warning: 'Nếu KHÔNG có Circuit Breaker: khi User Service đã sập hẳn 100%, Order Service vẫn ngây thơ gửi từng cuộc gọi qua mạng. Vừa tốn thời gian chờ lỗi, vừa làm dịch vụ đang hỏng càng thêm kiệt sức.',
    rows: [
      {
        criterion: 'Khi đối tác hỏng liên tục',
        protectedVal: 'Đủ 5 mẫu lỗi (≥50%) ➔ Tự ngắt cầu dao (OPEN), chặn mọi lượt mới',
        unprotectedVal: 'Mù quáng gửi hết cả 6/6 lượt qua mạng dù biết chắc sẽ lỗi',
        impact: 'Tự động cắt đứt kết nối thừa khi dịch vụ bên kia đang sập.',
      },
      {
        criterion: 'Tốc độ xử lý lúc sập',
        protectedVal: 'Lượt 6 bị chặn tại chỗ chỉ trong ~14ms (HTTP 503, 0 lần gọi qua mạng)',
        unprotectedVal: 'Lượt nào cũng mất thời gian chờ mạng đi về rồi mới báo lỗi',
        impact: 'Tiết kiệm tối đa thời gian và tài nguyên mạng.',
      },
      {
        criterion: 'Cơ hội cho đối tác sửa lỗi',
        protectedVal: 'Cầu dao mở 10s giúp ngưng gửi request, để dịch vụ hỏng kịp hồi phục',
        unprotectedVal: 'Liên tục dội tải vào dịch vụ đang chết khiến nó không thể hồi sinh',
        impact: 'Giúp toàn hệ thống tránh sụp đổ dây chuyền.',
      },
      {
        criterion: 'Tự động phục hồi',
        protectedVal: 'Tự chuyển sang dò đường (HALF-OPEN), thử 2 lượt ổn ➔ Đóng lại (CLOSED)',
        unprotectedVal: 'Không có khả năng tự nhận biết khi dịch vụ kia sống lại',
        impact: 'Hệ thống tự vận hành thông minh, không cần con người can thiệp.',
      },
    ],
  },
};
