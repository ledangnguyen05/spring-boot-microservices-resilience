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
    goal: 'Giới hạn số cuộc gọi đồng thời vào một nhánh yếu/chậm để tránh tràn sập tập thể và luôn giữ tài nguyên an toàn cho toàn bộ máy chủ.',
    mainPurpose: 'Giống như vách ngăn chống tràn trên tàu thủy hoặc người gác cổng thang máy tối đa 3 người: khi 10 người cùng ùa vào lúc User Service đang chậm (2s), Bulkhead chỉ mở đúng 3 suất (#1–#3) để cả 3 hoàn thành 200 OK và từ chối nhanh 429 cho 7 lượt thừa (#4–#10) — nhờ vậy hệ thống không sập chùm và máy chủ vẫn rảnh tài nguyên phục vụ các API khác.',
    steps: [
      'Gửi cùng lúc 10 lượt tra cứu User chậm (2s) khi sức chịu tải an toàn chỉ là 3 luồng đồng thời',
      'Bulkhead chỉ cấp đúng 3 chỗ cho 3 lượt đến trước (#1–#3 = 200 OK) và báo bận nhanh HTTP 429 (~5ms) cho 7 lượt thừa (#4–#10)',
      'Nếu tắt Bulkhead: cả 10/10 tràn vào cùng lúc vượt gấp 3,3× ngưỡng an toàn ➔ nghẽn kết nối khiến cả 10/10 cùng sập HTTP 503',
    ],
    takeaway: 'Có Bulkhead (3 chỗ): giữ 3 lượt sống 200 OK + chặn nhanh 7 lượt 429 (0 lần chạm User) và bảo toàn tài nguyên chung cho máy chủ. Không Bulkhead: cả 10/10 chen vào cùng lúc gây vỡ ngưỡng quá tải, chết chùm 0/10 thành công!',
    terms: [
      ['Resilience4j Bulkhead', 'Cơ chế tạo "vách ngăn" giới hạn tối đa số cuộc gọi đồng thời (maxConcurrentCalls) vào một dịch vụ để chống quá tải tập thể và bảo vệ tài nguyên chung của server.'],
      ['FIFO & HTTP 429 (Bulkhead Full)', 'Ưu tiên người đến trước (#1–#3), báo bận ngay HTTP 429 trong ~5ms cho người đến sau (#4–#10) thay vì để cả đám cùng chen vào gây sập.'],
      ['Vỡ ngưỡng quá tải (HTTP 503)', 'Khi thiếu Bulkhead, cả 10/10 cùng chen qua cửa vào nhánh chỉ chịu được 3 luồng ➔ tắc nghẽn kết nối và sập đồng loạt 10× HTTP 503 (0/10 sống).'],
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
    goal: 'Quan sát CÙNG 1 đường ống gồm 4 trạm bảo vệ nối tiếp nhau (Trạm 1 Retry ➔ Trạm 2 CB ➔ Trạm 3 Bulkhead ➔ Trạm 4 Feign 1s) và cách trạng thái cửa sổ 5 mẫu của Circuit Breaker được cộng dồn xuyên suốt 5 chặng.',
    mainPurpose: 'Thay vì 4 cơ chế chạy rời rạc, tất cả yêu cầu đều đi trên MỘT đường ống duy nhất theo thứ tự lồng chuẩn của Resilience4j: Retry (ngoài cùng) ➔ Circuit Breaker (đếm 5 mẫu) ➔ Bulkhead (3 chỗ) ➔ Feign Timeout (cắt 1s). Nhờ vậy chúng truyền tín hiệu cho nhau liên hoàn qua 5 chặng.',
    steps: [
      'Chặng 1 (Trạm 3 lọc tải ➔ Nạp 3 ô CB): 6 lượt cùng ùa vào ➔ Trạm 3 giữ #1–#3 qua Trạm 4 (200 OK) làm đầy 3 ô xanh [✓][✓][✓] của Trạm 2, còn #4–#6 bị chặn 429 (Retry & CB đều bỏ qua)',
      'Chặng 2 (Trạm 2 còn 40% ➔ Trạm 1 tự cứu): Gặp 2 lỗi 500 ➔ Trạm 2 mới lên 2/5 = 40% (< 50%) nên vẫn CLOSED 🟢, cho phép Trạm 1 nghỉ 500ms+1s rồi cứu ở lần #3 ([✓][✓][✕][✕][✓])',
      'Chặng 3 (Trạm 4 cắt 1s ➔ Trạm 2 vọt 60% BUNG OPEN): User treo 3s ➔ Feign cắt tại 1s đẩy cửa sổ CB lên 3/5 = 60% BUNG OPEN 🔴 ➔ chặn đứng luôn Retry #2 (HTTP 503)',
      'Chặng 4 (Trạm 2 khóa cửa Fail-Fast): Mạch OPEN chặn khách mới chỉ trong ~10ms (503, 0 lần chạm Trạm 3–4–User), Trạm 1 dừng hẳn',
      'Chặng 5 (Xuyên cả 4 trạm ➔ CLOSED): User khỏe lại ➔ hết 3s mở hé HALF-OPEN, gửi 2/2 thăm dò đi xuyên Trạm 1–4 200 OK và đóng về CLOSED 🟢',
    ],
    takeaway: 'Cả 5 chặng diễn ra trên CÙNG 1 luồng 4 trạm có trí nhớ liên hoàn: Bulkhead bảo vệ sức chứa & giữ cửa sổ CB sạch ở 3/5 ➔ Retry tự cứu khi CB mới 40% ➔ Timeout 1s làm CB chạm ngưỡng 60% OPEN dập bão ➔ Tự hồi phục CLOSED.',
    terms: [
      ['Thứ tự 4 trạm trên 1 đường ống', 'Gateway ➔ [1. Retry (ngoài cùng)] ➔ [2. Circuit Breaker (5 mẫu)] ➔ [3. Bulkhead (3 chỗ)] ➔ [4. Feign Timeout (1s)] ➔ User Service.'],
      ['Tại sao Chặng 1 & Chặng 2 liên thông với Chặng 3?', 'Chặng 1 nạp 3 mẫu OK [✓][✓][✓], Chặng 2 thêm 2 lỗi + 1 OK trượt thành [✓][✓][✕][✕][✓] (40% < 50% CLOSED), nên sang Chặng 3 chỉ cần ĐÚNG 1 lần Timeout của Trạm 4 là vọt 60% bung OPEN ngay!'],
      ['Thăm dò 2 lượt (HALF-OPEN ➔ CLOSED)', 'Cầu dao hội tụ cấu hình permittedNumberOfCallsInHalfOpenState = 2 nên cần 2 lượt thăm dò thành công liên tiếp xuyên cả 4 trạm để khép mạch về CLOSED 🟢.'],
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
    title: 'So sánh Có Bulkhead (Vách ngăn 3 chỗ) vs Không có Bulkhead (10 lượt cùng lúc)',
    warning: 'Nếu KHÔNG có Bulkhead: cả 10/10 lượt tràn vào cùng lúc vượt xa ngưỡng chịu tải an toàn (3 luồng) ➔ gây nghẽn kết nối và SẬP TẬP THỂ 0/10 thành công (10× HTTP 503)!',
    rows: [
      {
        criterion: 'Số lượt tràn qua Order Service cùng lúc',
        protectedVal: 'Khóa trần đúng 3/10 lượt (#1–#3), đúng bằng ngưỡng chịu tải an toàn',
        unprotectedVal: 'Không ai chặn ➔ Cả 10/10 lượt cùng chen qua một lúc (vượt 3,3× ngưỡng an toàn)',
        impact: 'Giữ lưu lượng đi tiếp luôn nằm trong khả năng gánh của đối tác và giữ tài nguyên máy chủ trống.',
      },
      {
        criterion: '7 lượt vượt ngưỡng (#4–#10)',
        protectedVal: 'Báo bận nhanh có kiểm soát trong ~5ms (HTTP 429, 0 lần gọi User)',
        unprotectedVal: 'Tất cả cùng xông qua mạng sang User Service tạo cơn bão kết nối đồng thời',
        impact: 'Chặn thừa ở cổng Order Service giúp cả hai dịch vụ không bị quá tải.',
      },
      {
        criterion: 'Tỷ lệ sống sót thực tế',
        protectedVal: '3 / 3 lượt được nhận sống trọn vẹn HTTP 200 OK',
        unprotectedVal: '0 / 10 thành công — Cả 10/10 lượt ĐỀU SẬP HTTP 503 (Chết chùm) 💥',
        impact: 'Thà giữ 3 người qua cầu an toàn còn hơn để cả 10 người chen lên làm sập cầu!',
      },
      {
        criterion: 'Kết quả đo thực tế tổng thể',
        protectedVal: '3× HTTP 200 OK (#1–#3) + 7× HTTP 429 (#4–#10)',
        unprotectedVal: '10× HTTP 503 OVERLOAD_COLLAPSE (0× HTTP 200)',
        impact: 'Đúng với nguyên lý ngăn khoang kín trên tàu thủy và kiểm soát tải đồng thời.',
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
