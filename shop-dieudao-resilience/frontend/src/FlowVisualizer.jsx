import { useState, useEffect, useRef } from 'react';
import {
  Play, Pause, RotateCcw, Activity, ArrowRight, ChevronLeft, ChevronRight,
  Server, Shield, Zap, Clock, Layers, RefreshCw, Scissors, Ban, CheckCircle2
} from 'lucide-react';

// Detailed Step-by-Step Definitions explaining everything from start to finish
const SCENARIO_STEPS = {
  normal: [
    {
      title: 'Bước 1/2: Khởi tạo & Chuyển tiếp đơn hàng',
      from: 130, to: 770, packetProgress: 0.5,
      color: '#6366f1', label: 'GET /api/orders/1', code: 'HTTP GET',
      badge: 'Chuyển tiếp yêu cầu',
      action: 'Client gửi qua Gateway sang Order Service',
      desc: 'Khách hàng yêu cầu xem đơn hàng #001. API Gateway tiếp nhận và định tuyến sang Order Service (:8082). Order Service kích hoạt Feign Client gọi sang User Service (:8081) để lấy thông tin khách.',
      resilience: 'Đường truyền lý tưởng, chưa phát sinh lỗi nào. OpenFeign giao tiếp trực tiếp.'
    },
    {
      title: 'Bước 2/2: User Service phản hồi & Trả về 200 OK',
      from: 770, to: 130, packetProgress: 1.0,
      color: '#22c55e', label: '200 OK (User Data)', code: 'HTTP 200 OK',
      badge: 'Hoàn tất thành công',
      action: 'User Service trả dữ liệu khách hàng',
      desc: 'User Service xử lý database thành công trong 15ms và trả về họ tên, địa chỉ khách hàng. Order Service gộp dữ liệu đơn hàng và phản hồi HTTP 200 OK hoàn chỉnh cho trình duyệt.',
      resilience: 'Hệ thống vận hành trơn tru ở trạng thái bình thường.'
    }
  ],

  timeout: [
    {
      title: 'Bước 1/4: Gửi yêu cầu kiểm tra Timeout',
      from: 130, to: 450, packetProgress: 0.3,
      color: '#6366f1', label: 'GET /feign-timeout/1', code: 'BẮT ĐẦU',
      badge: 'Gửi yêu cầu',
      action: 'Order Service tiếp nhận yêu cầu từ Client',
      desc: 'Khách hàng gửi yêu cầu tra cứu đơn hàng. Order Service tiếp nhận và chuẩn bị dùng OpenFeign gọi sang User Service (:8081).',
      resilience: 'Order Service cấp phát 1 luồng xử lý (worker thread) cho kết nối này.'
    },
    {
      title: 'Bước 2/4: User Service bị nghẽn ngâm 4000ms',
      from: 450, to: 770, packetProgress: 0.85, isUserError: true,
      color: '#f59e0b', label: 'BỊ TREO 4s ⏳', code: 'NGHẼN 4000ms',
      badge: 'Sự cố đối tác',
      action: 'User Service ngâm phản hồi 4 giây',
      desc: 'User Service gặp sự cố quá tải I/O giả lập, giữ kết nối và ngâm request tới 4000ms mà không phản hồi. Đồng hồ Feign Timeout của Order Service bắt đầu đếm giờ.',
      resilience: 'HIỂM HỌA: Nếu KHÔNG CÓ Timeout, luồng này sẽ bị treo chết trong 4s. Hàng trăm khách cùng vào sẽ làm cạn kiệt toàn bộ Thread Pool (Thread Starvation)!'
    },
    {
      title: 'Bước 3/4: Mốc Timeout 1.0s kích hoạt — Cắt đứt kết nối!',
      from: 450, to: 770, packetProgress: 0.62, pipe2Cut: true,
      color: '#ef4444', label: 'CẮT TIMEOUT (1s) ✂️', code: 'CẮT 1000ms',
      badge: 'Cơ chế ra tay',
      action: 'Feign Timeout can thiệp ngắt kết nối',
      desc: 'Đúng mốc 1000ms (hoặc 1500ms đối với TimeLimiter), cơ chế Timeout phát hiện quá hạn! Lưỡi cắt lập tức kích hoạt, chủ động hủy bỏ kết nối và dừng việc chờ đợi User Service.',
      resilience: 'HÀNH ĐỘNG SINH TỒN: Thu hồi ngay luồng xử lý (Worker Thread) để Order Service lập tức rảnh tay phục vụ các khách hàng khác.'
    },
    {
      title: 'Bước 4/4: Giải phóng luồng an toàn — Trả HTTP 504',
      from: 450, to: 130, packetProgress: 1.0, pipe2Cut: true,
      color: '#ef4444', label: '504 GATEWAY TIMEOUT', code: 'HTTP 504',
      badge: 'Bảo vệ thành công',
      action: 'Trả mã lỗi kiểm soát về Client',
      desc: 'Order Service trả về mã HTTP 504 Gateway Timeout cho Client sau đúng 1s thay vì phải chờ 4s vô ích. Luồng xử lý đã được giải phóng an toàn 100%.',
      resilience: 'Bảo vệ thành công Order Service sống sót, ngăn chặn nguy cơ sập dây chuyền (Cascading Failure).'
    }
  ],

  retry: [
    {
      title: 'Bước 1/5: Lần thử 1 — Gặp sự cố mạng chớp nhoáng (500)',
      from: 450, to: 770, packetProgress: 0.85, isUserError: true,
      color: '#ef4444', label: 'Lần 1: LỖI 500 💥', code: 'THỬ LẦN 1',
      badge: 'Sự cố thoáng qua',
      action: 'Lần 1 gọi User Service bị lỗi 500',
      desc: 'Order Service gọi User Service lần 1. Do mạng rung lắc hoặc service đối tác mới khởi động lại, User Service trả về lỗi HTTP 500.',
      resilience: 'Cơ chế Retry can thiệp: Giữ lại lỗi, CHƯA BÁO VỀ CLIENT để bảo vệ trải nghiệm của người dùng.'
    },
    {
      title: 'Bước 2/5: Exponential Backoff 500ms — Đệm thời gian nghỉ',
      from: 450, to: 450, packetProgress: 0.5,
      color: '#f59e0b', label: 'Backoff 500ms ⏳', code: 'BACKOFF 500ms',
      badge: 'Đếm lùi Backoff',
      action: 'Tạm dừng 500ms trước khi thử lại',
      desc: 'Hệ thống không gọi dồn dập ngay mà áp dụng thuật toán Exponential Backoff nghỉ 500ms để User Service có thời gian tự hồi phục.',
      resilience: 'Nguyên lý chống bão Retry (Anti-Retry Storm): Tránh làm tê liệt đối tác đang ngộp thở.'
    },
    {
      title: 'Bước 3/5: Lần thử 2 — Vẫn lỗi 500 & Tăng thời gian chờ lên 1000ms',
      from: 450, to: 770, packetProgress: 0.85, isUserError: true,
      color: '#ef4444', label: 'Lần 2: LỖI 500 💥', code: 'THỬ LẦN 2',
      badge: 'Kiên trì thử lại',
      action: 'Lần 2 vẫn gặp lỗi 500',
      desc: 'Hết 500ms, Order Service tự động bắn lại request lần 2. User Service vẫn chưa hồi phục kịp (vẫn lỗi 500). Retry tiếp tục giữ lại và nhân đôi thời gian nghỉ lên 1000ms!',
      resilience: 'Nhân đôi thời gian chờ (1000ms) để đối tác hoàn tất khởi động lại trước khi buông xuôi.'
    },
    {
      title: 'Bước 4/5: Lần thử 3 — User Service phục hồi & Tự cứu thành công!',
      from: 450, to: 770, packetProgress: 0.85,
      color: '#22c55e', label: 'Lần 3: 200 OK ✅', code: 'THỬ LẦN 3',
      badge: 'Tự cứu thành công',
      action: 'Lần 3 User Service phản hồi hợp lệ',
      desc: 'Sau 1000ms nghỉ, Order Service thử lại lần 3. Lúc này User Service đã hoàn tất reboot và phản hồi dữ liệu khách hàng đầy đủ!',
      resilience: 'Tự động cứu vãn yêu cầu từ cõi chết trong cùng một phiên làm việc.'
    },
    {
      title: 'Bước 5/5: Hoàn tất giao dịch — Trả HTTP 200 OK về Client',
      from: 770, to: 130, packetProgress: 1.0,
      color: '#22c55e', label: 'HTTP 200 OK ✅', code: 'HTTP 200 OK',
      badge: 'Client hài lòng',
      action: 'Trả dữ liệu hoàn chỉnh cho Client',
      desc: 'Client nhận kết quả hoàn hảo với HTTP 200 OK. Khách hàng hoàn toàn không hề hay biết hệ thống vừa âm thầm vượt qua 2 lần lỗi trước đó!',
      resilience: 'Đạt độ kiên cường tối đa trước các lỗi rung lắc mạng tạm thời (Transient Faults).'
    }
  ],

  bulkhead: [
    {
      title: 'Bước 1/4: Bão lưu lượng 10 request ập đến cùng lúc',
      from: 130, to: 420, packetProgress: 0.4, isBurst: true,
      color: '#6366f1', label: '10 Request đồng thời', code: '10 REQUESTS',
      badge: 'Lưu lượng tăng vọt',
      action: '10 Lượt gọi dồn dập vào Order Service',
      desc: '10 khách hàng cùng lúc gửi lệnh tra cứu. Mỗi lượt xử lý cần tới 2 giây để hoàn thành.',
      resilience: 'Nếu không giới hạn, 10 request này sẽ chiếm trọn connection pool, khiến các API quan trọng khác bị nghẽn hoàn toàn!'
    },
    {
      title: 'Bước 2/4: Vách ngăn Bulkhead kiểm soát hạn ngạch (3 Slots)',
      from: 420, to: 420, packetProgress: 0.5, isBurst: true,
      color: '#f59e0b', label: 'Max 3 Slots cấp phép', code: 'SEMAPHORE 3',
      badge: 'Cách ly tài nguyên',
      action: 'Kiểm tra hạn mức Semaphore',
      desc: 'Vách ngăn Bulkhead chỉ cấp đúng 3 giấy phép (Semaphore Slots) cho API này. 7 lượt dư thừa không được phép vào.',
      resilience: 'Nguyên lý khoang kín tàu thủy: Giới hạn sự cố trong một khoang, giữ các khoang khác an toàn nổi trên mặt nước.'
    },
    {
      title: 'Bước 3/4: Từ chối 7 lượt quá tải ngay lập tức trong 1ms (HTTP 429)',
      from: 420, to: 130, packetProgress: 0.5, isBurstBounce: true,
      color: '#ef4444', label: '7x HTTP 429 (1ms)', code: '7x 429 ⛔',
      badge: 'Từ chối quá tải tức thì',
      action: '7 Lượt bị dội ngược ngay ở cửa',
      desc: '7 request vượt quá hạn ngạch bị chặn đứng ngay ở vách ngăn Bulkhead và nảy bật ngược ra ngoài với mã HTTP 429 chỉ trong ~1ms (0 giây chờ đợi).',
      resilience: 'Không để request rác ngâm lâu trong RAM hoặc Thread Pool; bảo toàn năng lực phục vụ cho hệ thống.'
    },
    {
      title: 'Bước 4/4: 3 lượt hợp lệ hoàn tất an toàn sau 2s',
      from: 420, to: 770, packetProgress: 1.0, isBurstAccepted: true,
      color: '#22c55e', label: '3x HTTP 200 OK ✅', code: '3x 200 OK',
      badge: 'Bảo vệ thành công',
      action: '3 Lượt trong slot hoàn thành',
      desc: '3 request được cấp slot hoàn tất xử lý sau 2000ms và trả về kết quả 200 OK an toàn.',
      resilience: 'Hệ thống vận hành vững như bàn thạch ngay cả trong tâm bão lưu lượng.'
    }
  ],

  breaker: [
    {
      title: 'Bước 1/5: Trạng thái bình thường — Mạch CLOSED (Đóng)',
      from: 450, to: 770, packetProgress: 0.8, leverAngle: 0,
      color: '#ef4444', label: 'User Service lỗi 500', code: 'CLOSED 🟢',
      badge: 'Giám sát lỗi',
      action: 'Mạch đóng, phát hiện lỗi tăng cao',
      desc: 'Cầu dao đang ở trạng thái CLOSED. Mọi request được chuyển tiếp sang User Service. Tuy nhiên User Service liên tục trả về lỗi HTTP 500.',
      resilience: 'Circuit Breaker liên tục thống kê tỷ lệ thất bại trong cửa sổ trượt (sliding window).'
    },
    {
      title: 'Bước 2/5: Đối tác sập 100% — CẦU DAO BẬT MỞ (OPEN)!',
      from: 450, to: 450, packetProgress: 0.5, leverAngle: 45, pipe2Blocked: true,
      color: '#ef4444', label: 'CẦU DAO BUNG OPEN 🔴', code: 'OPEN 🔴',
      badge: 'Cầu dao bung mở',
      action: 'Bung cầu dao ngắt hoàn toàn mạch điện',
      desc: 'Tỷ lệ lỗi vượt quá ngưỡng 50% $\to$ Cầu dao an toàn lập tức BẬT MỞ (OPEN) kèm tia điện xẹt ⚡! Toàn bộ kết nối tới User Service bị ngắt đứt hoàn toàn.',
      resilience: 'Từ thời điểm này, TUYỆT ĐỐI KHÔNG CÒN BẤT KỲ REQUEST NÀO được phép gọi sang User Service nữa!'
    },
    {
      title: 'Bước 3/5: Chặn đứng mọi request mới bằng Fail-Fast (14ms)',
      from: 130, to: 450, packetProgress: 0.5, leverAngle: 45, pipe2Blocked: true, isFailFastBounce: true,
      color: '#ef4444', label: '503 FAIL-FAST (14ms)', code: 'HTTP 503',
      badge: 'Bảo vệ sinh tồn',
      action: 'Từ chối tức thì ở cửa Order Service',
      desc: 'Request mới tới chạm vào chốt cầu dao đang OPEN lập tức bị dội ngược ra ngay với mã HTTP 503 chỉ trong 14ms (0 LƯỢT GỌI USER SERVICE).',
      resilience: 'Cứu Order Service không bị cạn luồng; Cho User Service thời gian thở để tự phục hồi; Dập tắt bão lỗi dây chuyền.'
    },
    {
      title: 'Bước 4/5: Chuyển HALF-OPEN — Cho 1 request thăm dò',
      from: 450, to: 770, packetProgress: 0.75, leverAngle: 20,
      color: '#f59e0b', label: 'Thăm dò (Probe)', code: 'HALF_OPEN 🟡',
      badge: 'Thử nghiệm phục hồi',
      action: 'Mạch hé mở cho 1 request thử nghiệm',
      desc: 'Sau thời gian chờ quy định (3s/10s), cầu dao hé mở sang HALF-OPEN và gửi đúng 1 request thăm dò sức khỏe đối tác.',
      resilience: 'Cơ chế tự kiểm tra phục hồi thông minh mà không gây quá tải cho đối tác.'
    },
    {
      title: 'Bước 5/5: Thăm dò thành công — Cầu dao đóng lại CLOSED 🟢',
      from: 770, to: 130, packetProgress: 1.0, leverAngle: 0,
      color: '#22c55e', label: '200 OK (CLOSED 🟢)', code: 'CLOSED 🟢',
      badge: 'Tự chữa lành hoàn tất',
      action: 'Khép cầu dao về trạng thái ban đầu',
      desc: 'Lượt thăm dò thành công 200 OK! Cầu dao tự động đóng sập lại hoàn toàn (CLOSED), hệ thống tự chữa lành trọn vẹn và trở lại bình thường.',
      resilience: 'Khép kín vòng đời kiên cường tự động (Self-Healing).'
    }
  ],

  converge: [
    {
      title: 'Pha 1/5: Bulkhead lọc bão lưu lượng',
      from: 130, to: 450, packetProgress: 0.45,
      color: '#c084fc', label: 'Pha 1 · Bulkhead (6 lượt)', code: 'PHA 1: BULKHEAD',
      badge: 'Tầng 3: Bulkhead',
      action: 'Tiếp nhận 6 request song song',
      desc: 'Gửi 6 request song song. Bulkhead cấp 3 slot chạy (200 OK) và từ chối ngay 3 lượt quá tải bằng mã HTTP 429 tức thì.',
      resilience: 'Tầng Bulkhead lọc sạch bão tải, giữ Order Service không bị ngập lụt tài nguyên.'
    },
    {
      title: 'Pha 2/5: Retry tự cứu lỗi chập chờn',
      from: 450, to: 770, packetProgress: 0.8,
      color: '#38bdf8', label: 'Pha 2 · Retry tự cứu (200 OK)', code: 'PHA 2: RETRY',
      badge: 'Tầng 1: Retry',
      action: 'Tự động thử lại 3 lần',
      desc: 'User Service lỗi 2 lần đầu (500). Tầng Retry ngoài cùng tự động thử lại lần 3 và lấy được dữ liệu khách hàng thành công.',
      resilience: 'Tầng Retry ngoài cùng xóa bỏ hoàn toàn tác động của sự cố thoáng qua đối với người dùng.'
    },
    {
      title: 'Pha 3/5: Feign Timeout cắt đứt trễ & Bung mạch',
      from: 450, to: 770, packetProgress: 0.65, pipe2Cut: true,
      color: '#ef4444', label: 'Pha 3 · Feign Timeout cắt sau 1s', code: 'PHA 3: TIMEOUT',
      badge: 'Tầng 4: Feign Timeout',
      action: 'User Service treo 3s — Feign ngắt sau 1s',
      desc: 'User Service bị treo 3s. Feign Timeout cắt đứt sau 1000ms. Lỗi này được ghi nhận khiến Circuit Breaker BUNG OPEN!',
      resilience: 'Feign Timeout chuyển giao tín hiệu nguy cấp cho Circuit Breaker.'
    },
    {
      title: 'Pha 4/5: Circuit Breaker chặn đứng bằng Fail-Fast (14ms)',
      from: 130, to: 450, packetProgress: 0.48, pipe2Blocked: true, leverAngle: 45, isFailFastBounce: true,
      color: '#ef4444', label: 'Pha 4 · Fail-Fast 14ms (503)', code: 'PHA 4: FAIL-FAST',
      badge: 'Tầng 2: Circuit Breaker',
      action: 'Từ chối 503 ngay ở cửa, Retry dừng',
      desc: 'Mạch đang OPEN. Request mới tới bị dội ngược ngay trong 14ms (HTTP 503). Retry tuyệt đối không gọi lại để chống bão Retry Storm!',
      resilience: 'Sự phối hợp hoàn hảo: CB bảo vệ downstream, dập tắt bão Retry.'
    },
    {
      title: 'Pha 5/5: Tự chữa lành & Khép mạch về 200 OK',
      from: 770, to: 130, packetProgress: 1.0, leverAngle: 0,
      color: '#22c55e', label: 'Pha 5 · Tự chữa lành (200 OK)', code: 'PHA 5: 200 OK',
      badge: 'Tự chữa lành hoàn tất',
      action: 'Khôi phục, thăm dò thành công 200 OK',
      desc: 'User Service được sửa. Sau 3s mạch chuyển HALF_OPEN, gửi 1 request thăm dò thành công 200 OK và đóng mạch về CLOSED!',
      resilience: 'Khép lại trọn vẹn 100% vòng đời kiên cường của hệ thống Microservices.'
    }
  ],

  fallback: [
    {
      title: 'Bước 1/2: Downstream gặp sự cố nghiêm trọng',
      from: 130, to: 450, packetProgress: 0.5,
      color: '#ef4444', label: 'Downstream sập nguồn', code: 'USER SẬP',
      badge: 'Sự cố hệ thống',
      action: 'User Service mất kết nối',
      desc: 'User Service bị sập hoặc ngắt mạch, không thể cung cấp dữ liệu khách hàng.',
      resilience: 'Nếu KHÔNG CÓ Fallback: Khách hàng sẽ thấy màn hình lỗi 500 hoặc 503 xám xịt.'
    },
    {
      title: 'Bước 2/2: Cơ chế Fallback can thiệp tức thì',
      from: 450, to: 130, packetProgress: 1.0,
      color: '#22c55e', label: 'Khách dự phòng (200 OK)', code: '200 OK (FALLBACK)',
      badge: 'Bảo hiểm lỗi',
      action: 'Trả dữ liệu dự phòng mềm dẻo',
      desc: 'Hàm Fallback tự động can thiệp, trả về đối tượng "Khách hàng dự phòng" với HTTP 200 OK.',
      resilience: 'Bảo toàn trải nghiệm mua sắm không bị gián đoạn (Graceful Degradation).'
    }
  ]
};

export default function FlowVisualizer({
  scenarioId = 'normal',
  busy = false,
  liveStage = '',
  breakerState = null,
  runCount = 0,
  actionLabel = 'Chạy kịch bản'
}) {
  const steps = SCENARIO_STEPS[scenarioId] || SCENARIO_STEPS.normal;

  // IMPORTANT: isPlaying defaults to FALSE!
  // It NEVER auto-plays until the user explicitly clicks a button!
  const [isPlaying, setIsPlaying] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [progressInStep, setProgressInStep] = useState(0); // 0.0 to 1.0 within step

  const stepTimerRef = useRef(null);

  // When scenario changes, strictly PAUSE and reset to Step 0!
  useEffect(() => {
    setIsPlaying(false);
    setStepIndex(0);
    setProgressInStep(0);
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);
  }, [scenarioId]);

  // When user clicks the main run button in the app, START slowly!
  useEffect(() => {
    if (runCount > 0) {
      setStepIndex(0);
      setProgressInStep(0);
      setIsPlaying(true);
    }
  }, [runCount]);

  // Sync stepIndex with live backend progress if busy
  useEffect(() => {
    if (busy) {
      setIsPlaying(true);
      if (scenarioId === 'converge') {
        if (liveStage.includes('Pha 1')) setStepIndex(0);
        else if (liveStage.includes('Pha 2')) setStepIndex(1);
        else if (liveStage.includes('Pha 3')) setStepIndex(2);
        else if (liveStage.includes('Pha 4')) setStepIndex(3);
        else if (liveStage.includes('Pha 5')) setStepIndex(4);
      } else if (scenarioId === 'timeout') {
        if (liveStage.includes('User Service')) setStepIndex(1);
        else if (liveStage.includes('Feign')) setStepIndex(2);
        else if (liveStage.includes('TimeLimiter')) setStepIndex(3);
      } else if (scenarioId === 'retry') {
        if (liveStage.includes('Lần 1')) setStepIndex(0);
        else if (liveStage.includes('500ms')) setStepIndex(1);
        else if (liveStage.includes('Lần 2')) setStepIndex(2);
        else if (liveStage.includes('1000ms')) setStepIndex(3);
        else if (liveStage.includes('Lần 3')) setStepIndex(4);
      }
    }
  }, [busy, liveStage, scenarioId]);

  // Smooth, deliberate playback: Each step takes 4.0 seconds (4000ms)
  // giving viewers ample time to read the full explanation!
  useEffect(() => {
    if (isPlaying) {
      const stepDuration = 4200; // 4.2 seconds per step - comfortable reading pace!
      const interval = 50;
      let elapsed = 0;

      stepTimerRef.current = setInterval(() => {
        elapsed += interval;
        const p = Math.min(elapsed / stepDuration, 1);
        setProgressInStep(p);

        if (elapsed >= stepDuration) {
          elapsed = 0;
          setStepIndex((prev) => {
            if (prev >= steps.length - 1) {
              // Finished the entire story from start to finish!
              // STOP gracefully so user can read final conclusion!
              setIsPlaying(false);
              return prev;
            }
            return prev + 1;
          });
        }
      }, interval);
    } else {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    }

    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    };
  }, [isPlaying, steps.length]);

  const currentStep = steps[stepIndex] || steps[0];

  // Coordinates
  const gwX = 130;
  const gwY = 120;
  const orderX = 450;
  const orderY = 120;
  const userX = 770;
  const userY = 120;

  // Calculate packet position smoothly based on step and progress
  let packetX = gwX;
  let packetY = gwY;
  let packetColor = currentStep.color;
  let packetLabel = currentStep.label;

  if (!isPlaying && stepIndex === 0 && runCount === 0) {
    // Idle standby state: packet sits at Gateway
    packetX = gwX;
    packetY = gwY;
    packetColor = '#6366f1';
    packetLabel = 'CHỜ LỆNH';
  } else {
    // Interpolate smoothly between currentStep.from and currentStep.to
    const startX = currentStep.from;
    const endX = currentStep.to;
    packetX = startX + progressInStep * (endX - startX);
    packetY = gwY;

    if (currentStep.isFailFastBounce) {
      const bP = progressInStep < 0.4 ? progressInStep / 0.4 : (1 - progressInStep) / 0.6;
      packetX = gwX + bP * (orderX - 40 - gwX);
    }
  }

  // Handle Step Controls
  function handlePrev() {
    setIsPlaying(false);
    setStepIndex((prev) => Math.max(prev - 1, 0));
    setProgressInStep(1);
  }

  function handleNext() {
    setIsPlaying(false);
    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
    setProgressInStep(1);
  }

  function handlePlayToggle() {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (stepIndex >= steps.length - 1) {
        setStepIndex(0);
        setProgressInStep(0);
      }
      setIsPlaying(true);
    }
  }

  function handleReset() {
    setIsPlaying(false);
    setStepIndex(0);
    setProgressInStep(0);
  }

  const leverAngle = currentStep.leverAngle ?? (breakerState === 'OPEN' ? 45 : 0);
  const pipe2Cut = Boolean(currentStep.pipe2Cut);
  const pipe2Blocked = Boolean(currentStep.pipe2Blocked);

  return (
    <div className="flow-visualizer-container">
      {/* Top Controller Bar */}
      <div className="visualizer-header">
        <div className="visualizer-title">
          <Activity size={17} className={`pulse-icon ${isPlaying ? 'active' : ''}`} />
          <span>MÔ PHỎNG CHUYỂN ĐỘNG & GIẢI THÍCH TỪNG BƯỚC (60 FPS)</span>
        </div>

        <div className="visualizer-controls">
          <span className="step-counter">
            Bước {stepIndex + 1} / {steps.length}
          </span>
          <button className="vis-btn" onClick={handlePrev} disabled={stepIndex === 0} title="Quay lại bước trước">
            <ChevronLeft size={15} /> <span>Trước</span>
          </button>
          <button
            className={`vis-btn play-btn ${isPlaying ? 'active' : ''}`}
            onClick={handlePlayToggle}
            title={isPlaying ? 'Tạm dừng để đọc chữ' : 'Bắt đầu phát hoạt họa'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            <span>{isPlaying ? 'Tạm dừng' : 'Phát mô phỏng'}</span>
          </button>
          <button className="vis-btn" onClick={handleNext} disabled={stepIndex === steps.length - 1} title="Xem bước tiếp theo">
            <span>Tiếp</span> <ChevronRight size={15} />
          </button>
          <button className="vis-btn" onClick={handleReset} title="Xem lại từ đầu">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* SVG Canvas Stage */}
      <div className="canvas-wrapper">
        <svg className="flow-canvas" viewBox="0 0 900 240" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="pipeGlow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#818cf8" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#c084fc" stopOpacity="0.4" />
            </linearGradient>
            <filter id="packetGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background Grid Pattern */}
          <pattern id="gridPattern" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1c183a" strokeWidth="1" />
          </pattern>
          <rect width="900" height="240" fill="url(#gridPattern)" />

          {/* Pipe 1: Gateway -> Order */}
          <line x1="200" y1="120" x2="345" y2="120" stroke="#2c2559" strokeWidth="8" strokeLinecap="round" />
          <line x1="200" y1="120" x2="345" y2="120" stroke="url(#pipeGlow)" strokeWidth="3" strokeDasharray="6,12" className={isPlaying ? 'animated-flow-line' : ''} />

          {/* Pipe 2: Order -> User */}
          <line
            x1="555" y1="120" x2="700" y2="120"
            stroke={pipe2Cut ? '#ef444433' : pipe2Blocked ? '#374151' : '#2c2559'}
            strokeWidth="8"
            strokeLinecap="round"
          />
          {!pipe2Cut && !pipe2Blocked && (
            <line x1="555" y1="120" x2="700" y2="120" stroke="url(#pipeGlow)" strokeWidth="3" strokeDasharray="6,12" className={isPlaying ? 'animated-flow-line' : ''} />
          )}

          {/* Pipe 2 Cut Scissors */}
          {pipe2Cut && (
            <g transform="translate(628, 95)">
              <circle cx="0" cy="25" r="18" fill="#ef4444" />
              <text x="0" y="31" textAnchor="middle" fill="#fff" fontSize="16">✂️</text>
              <text x="0" y="-3" textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="bold">NGẮT TIMEOUT (1s)</text>
            </g>
          )}

          {/* Pipe 2 Blocked Barrier */}
          {pipe2Blocked && (
            <g transform="translate(628, 95)">
              <rect x="-14" y="0" width="28" height="50" rx="8" fill="#ef4444" opacity="0.9" />
              <text x="0" y="31" textAnchor="middle" fill="#fff" fontSize="18">⛔</text>
              <text x="0" y="-3" textAnchor="middle" fill="#fca5a5" fontSize="11" fontWeight="bold">CHẶN FAIL-FAST (0 LƯỢT)</text>
            </g>
          )}

          {/* Bulkhead Slots and Barrier in Order */}
          {scenarioId === 'bulkhead' && (
            <g transform="translate(425, 60)">
              <rect x="0" y="5" width="46" height="24" rx="6" fill="#064e3b" stroke="#10b981" strokeWidth="1.5" />
              <text x="23" y="21" textAnchor="middle" fill="#34d399" fontSize="10" fontWeight="bold">Slot 1</text>

              <rect x="0" y="35" width="46" height="24" rx="6" fill="#064e3b" stroke="#10b981" strokeWidth="1.5" />
              <text x="23" y="51" textAnchor="middle" fill="#34d399" fontSize="10" fontWeight="bold">Slot 2</text>

              <rect x="0" y="65" width="46" height="24" rx="6" fill="#064e3b" stroke="#10b981" strokeWidth="1.5" />
              <text x="23" y="81" textAnchor="middle" fill="#34d399" fontSize="10" fontWeight="bold">Slot 3</text>

              <rect x="0" y="95" width="46" height="22" rx="6" fill="#7f1d1d" stroke="#ef4444" strokeWidth="1.5" />
              <text x="23" y="110" textAnchor="middle" fill="#fca5a5" fontSize="10" fontWeight="bold">🛡️ Chặn 429</text>
            </g>
          )}

          {/* Node 1: API Gateway */}
          <g transform="translate(60, 65)">
            <rect x="0" y="0" width="140" height="110" rx="14" fill="#18143d" stroke="#4338ca" strokeWidth="2.5" />
            <circle cx="70" cy="35" r="20" fill="#29235e" />
            <text x="70" y="42" textAnchor="middle" fill="#818cf8" fontSize="20">🌐</text>
            <text x="70" y="75" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="bold">API Gateway</text>
            <text x="70" y="93" textAnchor="middle" fill="#94a3b8" fontSize="10">:8080 · Client</text>
          </g>

          {/* Node 2: Order Service */}
          <g transform="translate(345, 45)">
            <rect x="0" y="0" width="210" height="150" rx="16" fill="#14112e" stroke="#6366f1" strokeWidth="2.5" />
            <rect x="15" y="10" width="180" height="28" rx="8" fill="#221d4c" />
            <text x="105" y="29" textAnchor="middle" fill="#e0e7ff" fontSize="12" fontWeight="bold">📦 Order Service (:8082)</text>

            {/* Inner Guard Box */}
            <g transform="translate(20, 48)">
              <rect x="0" y="0" width="170" height="84" rx="10" fill="#0d0a21" stroke="#312a66" strokeWidth="1.2" />

              {/* Physical Circuit Breaker Lever */}
              {(scenarioId === 'breaker' || scenarioId === 'converge') && (
                <g transform="translate(85, 36)">
                  <circle cx="-20" cy="0" r="4" fill="#94a3b8" />
                  <circle cx="20" cy="0" r="4" fill="#94a3b8" />
                  <line
                    x1="-20" y1="0" x2="20" y2={-leverAngle * 0.7}
                    stroke={leverAngle > 0 ? '#ef4444' : '#10b981'}
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  {leverAngle > 0 && <text x="24" y="-20" fill="#fef08a" fontSize="14">⚡</text>}
                </g>
              )}

              {scenarioId === 'timeout' && (
                <>
                  <text x="85" y="28" textAnchor="middle" fill="#f59e0b" fontSize="11" fontWeight="bold">⏱️ Feign Timeout</text>
                  <text x="85" y="48" textAnchor="middle" fill="#94a3b8" fontSize="10">readTimeout: 1000ms</text>
                  <text x="85" y="68" textAnchor="middle" fill="#ef4444" fontSize="10" fontWeight="bold">Cắt đứt khi quá 1s</text>
                </>
              )}
              {scenarioId === 'retry' && (
                <>
                  <text x="85" y="28" textAnchor="middle" fill="#38bdf8" fontSize="11" fontWeight="bold">🔄 Resilience4j Retry</text>
                  <text x="85" y="48" textAnchor="middle" fill="#94a3b8" fontSize="10">Max 3 lần · Backoff</text>
                  <text x="85" y="68" textAnchor="middle" fill="#22c55e" fontSize="10" fontWeight="bold">Tự cứu ở lần 3</text>
                </>
              )}
              {scenarioId === 'bulkhead' && (
                <>
                  <text x="85" y="28" textAnchor="middle" fill="#c084fc" fontSize="11" fontWeight="bold">🛡️ Bulkhead</text>
                  <text x="85" y="48" textAnchor="middle" fill="#94a3b8" fontSize="10">Hạn ngạch 3 slots</text>
                  <text x="85" y="68" textAnchor="middle" fill="#f59e0b" fontSize="10" fontWeight="bold">7 Lượt bị dội 429</text>
                </>
              )}
              {scenarioId === 'breaker' && (
                <>
                  <text x="85" y="58" textAnchor="middle" fill={leverAngle > 0 ? '#ef4444' : '#10b981'} fontSize="11" fontWeight="bold">
                    Cầu dao: {leverAngle > 0 ? 'OPEN 🔴' : 'CLOSED 🟢'}
                  </text>
                  <text x="85" y="74" textAnchor="middle" fill="#94a3b8" fontSize="10">
                    {leverAngle > 0 ? 'Fail-Fast 14ms (503)' : 'Cho phép lưu thông'}
                  </text>
                </>
              )}
              {scenarioId === 'converge' && (
                <>
                  <text x="85" y="58" textAnchor="middle" fill="#818cf8" fontSize="10" fontWeight="bold">4 Tầng lồng nhau</text>
                  <text x="85" y="74" textAnchor="middle" fill="#34d399" fontSize="9">Retry ➔ CB ➔ Bulkhead ➔ Feign</text>
                </>
              )}
              {scenarioId === 'normal' && (
                <>
                  <text x="85" y="36" textAnchor="middle" fill="#22c55e" fontSize="11" fontWeight="bold">✅ OpenFeign Chuẩn</text>
                  <text x="85" y="58" textAnchor="middle" fill="#94a3b8" fontSize="10">Giao tiếp trực tiếp</text>
                </>
              )}
              {scenarioId === 'fallback' && (
                <>
                  <text x="85" y="32" textAnchor="middle" fill="#22c55e" fontSize="11" fontWeight="bold">🛡️ Fallback Active</text>
                  <text x="85" y="52" textAnchor="middle" fill="#94a3b8" fontSize="10">Bảo hiểm sự cố</text>
                  <text x="85" y="70" textAnchor="middle" fill="#38bdf8" fontSize="10">Trả dữ liệu dự phòng</text>
                </>
              )}
            </g>
          </g>

          {/* Node 3: User Service */}
          <g transform="translate(700, 65)">
            <rect
              x="0" y="0" width="140" height="110" rx="14"
              fill="#181329"
              stroke={currentStep.isUserError ? '#e11d48' : '#10b981'}
              strokeWidth="2.5"
            />
            <circle cx="70" cy="35" r="20" fill={currentStep.isUserError ? '#3d1624' : '#133526'} />
            <text x="70" y="42" textAnchor="middle" fill={currentStep.isUserError ? '#f43f5e' : '#34d399'} fontSize="20">
              {currentStep.isUserError ? '⚠️' : '👤'}
            </text>
            <text x="70" y="75" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="bold">User Service</text>
            <text x="70" y="93" textAnchor="middle" fill="#94a3b8" fontSize="10">
              {currentStep.isUserError ? 'Giả lập lỗi (:8081)' : 'Bình thường (:8081)'}
            </text>
          </g>

          {/* Single Fluid Packet */}
          <g transform={`translate(${packetX}, ${packetY})`} filter="url(#packetGlow)">
            <circle cx="0" cy="0" r="13" fill={packetColor} className={isPlaying ? 'pulsing-packet' : ''} />
            <circle cx="0" cy="0" r="6" fill="#ffffff" />
            <text x="0" y="-20" textAnchor="middle" fill={packetColor} fontSize="11" fontWeight="bold">
              {packetLabel}
            </text>
          </g>
        </svg>
      </div>

      {/* Live Step Explanation Card (Full Explanation from Start to Finish) */}
      <div className="flow-explanation-card">
        <div className="step-badge-row">
          <span className="step-pill" style={{ backgroundColor: currentStep.color + '25', color: currentStep.color, borderColor: currentStep.color }}>
            {currentStep.badge}
          </span>
          <span className="step-action-tag">
            <ArrowRight size={13} /> {currentStep.action}
          </span>
        </div>

        <h4 className="step-title" style={{ color: '#ffffff', margin: '4px 0 6px 0', fontSize: '1.02rem' }}>
          {currentStep.title}
        </h4>

        <p className="step-desc" style={{ fontSize: '0.9rem', color: '#f1f5f9', lineHeight: 1.6, margin: '0 0 10px 0' }}>
          {currentStep.desc}
        </p>

        <div className="step-resilience-box" style={{ borderLeftColor: currentStep.color }}>
          <strong>Nguyên lý & Ý nghĩa kiên cường:</strong> {currentStep.resilience}
        </div>

        {/* Step Indicator Chips */}
        <div className="step-dots" style={{ marginTop: '10px' }}>
          {steps.map((st, idx) => (
            <button
              key={st.title}
              className={`step-dot ${idx === stepIndex ? 'active' : ''}`}
              onClick={() => {
                setIsPlaying(false);
                setStepIndex(idx);
                setProgressInStep(1);
              }}
              title={st.title}
            >
              {idx + 1}
            </button>
          ))}
          {!isPlaying && runCount === 0 && (
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: '10px' }}>
              (Chưa khởi chạy · Bấm nút &quot;{actionLabel}&quot; ở trên để bắt đầu)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
