import { useState, useEffect, useRef } from 'react';
import {
  Play, Pause, SkipForward, RotateCcw, Clock, RefreshCw, Layers,
  Zap, ShieldCheck, Server, AlertTriangle, ArrowRight, Ban, CheckCircle2,
  XCircle, Laptop, Activity
} from 'lucide-react';

const flowStepsData = {
  normal: [
    {
      title: 'Bước 1: Client gửi yêu cầu',
      from: 'client', to: 'order', status: 'sending',
      action: 'Chuyển tiếp qua Gateway', code: 'HTTP GET', color: '#6366f1',
      badge: 'Đang chuyển tiếp',
      desc: 'Người dùng xem chi tiết đơn hàng #001. API Gateway tiếp nhận và định tuyến tới Order Service.',
      resilienceEffect: 'Đường truyền bình thường, chưa kích hoạt cơ chế phòng thủ nào.'
    },
    {
      title: 'Bước 2: Order Service gọi User Service',
      from: 'order', to: 'user', status: 'processing',
      action: 'OpenFeign gọi downstream', code: 'GET /api/users/1', color: '#6366f1',
      badge: 'Gọi đối tác',
      desc: 'Order Service dùng Feign Client gọi sang User Service (:8081) để tra cứu họ tên và email của khách.',
      resilienceEffect: 'Luồng xử lý (worker thread) đang chờ phản hồi từ User Service.'
    },
    {
      title: 'Bước 3: User Service phản hồi bình thường',
      from: 'user', to: 'order', status: 'returning',
      action: 'User Service trả 200 OK', code: 'HTTP 200', color: '#22c55e',
      badge: 'Dữ liệu hợp lệ',
      desc: 'User Service xử lý truy vấn database thành công và trả về dữ liệu khách hàng đầy đủ.',
      resilienceEffect: 'Không có lỗi, thời gian phản hồi nhanh (~15ms).'
    },
    {
      title: 'Bước 4: Hoàn tất đơn hàng cho Client',
      from: 'order', to: 'client', status: 'success',
      action: 'Trả về Client trọn vẹn', code: 'HTTP 200 OK', color: '#22c55e',
      badge: 'Hoàn thành 200 OK',
      desc: 'Order Service gộp dữ liệu đơn hàng cùng dữ liệu khách hàng và trả về cho trình duyệt.',
      resilienceEffect: 'Hệ thống hoạt động ở trạng thái lý tưởng.'
    }
  ],

  timeout: [
    {
      title: 'Bước 1: Tiếp nhận yêu cầu kiểm tra Timeout',
      from: 'client', to: 'order', status: 'sending',
      action: 'Gửi request đơn hàng', code: 'GET /feign-timeout/1', color: '#6366f1',
      badge: 'Bắt đầu luồng',
      desc: 'Client yêu cầu lấy thông tin đơn hàng trong tình huống User Service đang gặp sự cố nghẽn.',
      resilienceEffect: 'Order Service bắt đầu cấp phát 1 worker thread cho request này.'
    },
    {
      title: 'Bước 2: Gọi User Service (Bị nghẽn 4000ms)',
      from: 'order', to: 'user', status: 'delayed',
      action: 'Đang ngâm chờ phản hồi...', code: 'Chậm 4000ms', color: '#f59e0b',
      badge: 'User Service bị đơ',
      desc: 'User Service bị quá tải I/O giả lập, giữ kết nối và không phản hồi trong 4000ms.',
      resilienceEffect: 'Nếu KHÔNG CÓ Timeout: Thread của Order Service sẽ bị giam giữ vô thời hạn, nhanh chóng làm cạn kiệt Connection Pool!'
    },
    {
      title: 'Bước 3: Mốc Timeout kích hoạt — Cắt đứt kết nối!',
      from: 'order', to: 'user', status: 'cut',
      action: 'Lưỡi cắt Timeout can thiệp', code: 'Cắt sau 1000ms / 1500ms', color: '#ef4444',
      badge: 'CẮT ĐỨT (TIMEOUT)',
      desc: 'Resilience Kit / Feign Client đo thấy thời gian vượt ngưỡng cấu hình (1.0s hoặc 1.5s). Lập tức ngắt kết nối!',
      resilienceEffect: 'Hành động sinh tồn: Đơn phương hủy chờ đợi, ngay lập tức THU HỒI LUỒNG XỬ LÝ (Worker Thread) để phục vụ các yêu cầu khác.'
    },
    {
      title: 'Bước 4: Phản hồi lỗi kiểm soát cho Client',
      from: 'order', to: 'client', status: 'fail-fast',
      action: 'Trả mã lỗi Timeout có kiểm soát', code: 'HTTP 504 / 500', color: '#ef4444',
      badge: 'Giải phóng luồng thành công',
      desc: 'Order Service trả về HTTP 504 (hoặc 500 Feign Timeout). Thời gian phản hồi đúng bằng mốc timeout cấu hình thay vì phải chờ 4s.',
      resilienceEffect: 'Bảo vệ thành công Order Service không bị sập theo (ngăn chặn Cascading Failure).'
    }
  ],

  retry: [
    {
      title: 'Bước 1: Lần thử 1 — Gặp lỗi sự cố thoáng qua',
      from: 'order', to: 'user', status: 'retry-fail',
      action: 'Lần 1: Gọi User Service', code: 'Lỗi HTTP 500 💥', color: '#ef4444',
      badge: 'Thất bại lần 1',
      desc: 'Order Service gọi User Service. Do mạng rung lắc hoặc service mới reboot, User Service trả về lỗi 500.',
      resilienceEffect: 'Cơ chế Retry can thiệp: Giữ lại lỗi, CHƯA BÁO VỀ CLIENT để bảo vệ trải nghiệm người dùng.'
    },
    {
      title: 'Bước 2: Exponential Backoff (Chờ 500ms)',
      from: 'order', to: 'order', status: 'waiting',
      action: 'Tạm dừng 500ms trước khi thử lại', code: 'Wait 500ms ⏳', color: '#f59e0b',
      badge: 'Đếm lùi Backoff',
      desc: 'Hệ thống không gọi lại dồn dập ngay lập tức mà áp dụng thuật toán Exponential Backoff nghỉ 500ms để đối tác kịp phục hồi.',
      resilienceEffect: 'Tránh gây bão tải ngược lên downstream (Anti-Storm).'
    },
    {
      title: 'Bước 3: Lần thử 2 — Vẫn gặp lỗi thoáng qua',
      from: 'order', to: 'user', status: 'retry-fail',
      action: 'Lần 2: Gọi lại User Service', code: 'Lỗi HTTP 500 💥', color: '#ef4444',
      badge: 'Thất bại lần 2',
      desc: 'Lần thử thứ hai vẫn trả về HTTP 500 (chưa hết 2 lần lỗi giả lập).',
      resilienceEffect: 'Retry tiếp tục nhân đôi thời gian chờ: Backoff 1000ms.'
    },
    {
      title: 'Bước 4: Lần thử 3 — Tự cứu vãn thành công!',
      from: 'order', to: 'user', status: 'processing',
      action: 'Lần 3: Gọi lại lần cuối', code: 'HTTP 200 OK ✅', color: '#22c55e',
      badge: 'Tự cứu thành công!',
      desc: 'Sau 1000ms, Order Service thử lại lần 3. Lúc này sự cố đã qua, User Service phản hồi dữ liệu khách hàng hợp lệ!',
      resilienceEffect: 'Yêu cầu được tự động cứu chữa thành công trong cùng 1 request.'
    },
    {
      title: 'Bước 5: Trả dữ liệu 200 OK cho Client',
      from: 'order', to: 'client', status: 'success',
      action: 'Trả kết quả hoàn hảo cho Client', code: 'HTTP 200 OK', color: '#22c55e',
      badge: 'Client hoàn toàn hài lòng',
      desc: 'Client nhận được kết quả đơn hàng đầy đủ với mã HTTP 200. Khách hàng hoàn toàn không hề nhận ra hệ thống vừa vượt qua 2 lần lỗi!',
      resilienceEffect: 'Đạt độ kiên cường tối đa trước các lỗi rung lắc mạng (Transient Faults).'
    }
  ],

  bulkhead: [
    {
      title: 'Bước 1: Bão lưu lượng 10 request ập đến cùng lúc',
      from: 'client', to: 'order', status: 'burst',
      action: '10 Request đồng thời gửi đến', code: '10 Concurrent Requests', color: '#6366f1',
      badge: 'Lưu lượng tăng đột biến',
      desc: '10 khách hàng đồng thời gửi lệnh gọi. Mỗi request cần 2 giây để hoàn thành.',
      resilienceEffect: 'Nếu không giới hạn, 10 request này sẽ chiếm trọn connection pool, khiến các API khác bị nghẽn hoàn toàn!'
    },
    {
      title: 'Bước 2: Vách ngăn Bulkhead kiểm soát hạn ngạch',
      from: 'order', to: 'order', status: 'inspecting',
      action: 'Kiểm tra Semaphore: Max 3 slots', code: 'Max Concurrent = 3', color: '#f59e0b',
      badge: 'Cách ly tài nguyên',
      desc: 'Vách ngăn Bulkhead cách ly chỉ cấp đúng 3 giấy phép (slots) cho API này. 7 lượt dư thừa không được phép vào.',
      resilienceEffect: 'Đảm bảo tài nguyên server còn trống cho các nghiệp vụ thanh toán, đăng nhập...'
    },
    {
      title: 'Bước 3: Từ chối 7 lượt quá tải ngay lập tức (1ms)',
      from: 'order', to: 'client', status: 'rejected',
      action: '7 lượt bị dội ngược ngay', code: '7x HTTP 429 ⛔', color: '#ef4444',
      badge: 'Từ chối quá tải (1ms)',
      desc: '7 request vượt quá hạn ngạch bị vách ngăn Bulkhead chặn đứng ở cửa và trả về HTTP 429 trong ~1ms (0 giây chờ đợi).',
      resilienceEffect: 'Không để request rác ngâm lâu trong RAM hoặc Thread Pool.'
    },
    {
      title: 'Bước 4: 3 lượt hợp lệ hoàn tất an toàn',
      from: 'order', to: 'client', status: 'success',
      action: '3 lượt trong slot hoàn tất', code: '3x HTTP 200 OK ✅', color: '#22c55e',
      badge: 'Bảo vệ thành công',
      desc: '3 request được cấp slot xử lý xong sau 2000ms và trả về kết quả 200 OK an toàn.',
      resilienceEffect: 'Hệ thống vận hành ổn định ngay cả trong tâm bão lưu lượng.'
    }
  ],

  breaker: [
    {
      title: 'Bước 1: Mạch CLOSED — Request lưu thông bình thường',
      from: 'order', to: 'user', status: 'processing',
      action: 'Mạch CLOSED (Đóng)', code: 'Circuit: CLOSED 🟢', color: '#22c55e',
      badge: 'Bình thường',
      desc: 'Cầu dao đang ở trạng thái CLOSED. Mọi request được chuyển tiếp trực tiếp sang User Service.',
      resilienceEffect: 'Hệ thống liên tục thống kê tỷ lệ lỗi trong cửa sổ trượt (sliding window).'
    },
    {
      title: 'Bước 2: Downstream lỗi 100% — Tỷ lệ lỗi vượt ngưỡng',
      from: 'user', to: 'order', status: 'error-storm',
      action: 'Lỗi 500 liên tiếp từ User Service', code: 'Failure Rate > 50%', color: '#ef4444',
      badge: 'Phát hiện sập nguồn',
      desc: 'User Service liên tục sập nguồn và trả về mã lỗi 500 cho mọi cuộc gọi.',
      resilienceEffect: 'CircuitBreaker nhận thấy đối tác đã chết, bắt đầu quy trình kích hoạt cầu dao an toàn.'
    },
    {
      title: 'Bước 3: CẦU DAO BẬT MỞ (OPEN) — Cắt đứt mạch điện!',
      from: 'order', to: 'order', status: 'breaker-open',
      action: 'Bung cầu dao sang OPEN', code: 'Circuit: OPEN 🔴', color: '#ef4444',
      badge: 'CẦU DAO BUNG MẠCH',
      desc: 'Cầu dao bung mở hoàn toàn! Trạng thái chuyển sang OPEN để cô lập hoàn toàn User Service.',
      resilienceEffect: 'Từ thời điểm này, không còn bất kỳ request nào được phép chạm vào User Service nữa!'
    },
    {
      title: 'Bước 4: Chặn đứng mọi request mới bằng Fail-Fast (14ms)',
      from: 'order', to: 'client', status: 'fail-fast',
      action: 'Từ chối tức thì ở cửa Order Service', code: 'HTTP 503 Fail-Fast ⚡', color: '#ef4444',
      badge: 'Bảo vệ sinh tồn (0ms/14ms)',
      desc: 'Request mới tới gặp cầu dao OPEN lập tức bị dội ngược trở ra với mã HTTP 503. Số lần gọi User Service: 0 LẦN!',
      resilienceEffect: 'Cứu Order Service không bị cạn luồng; Cho User Service thời gian thở để tự phục hồi; Chống sập dây chuyền (Cascading Failure).'
    },
    {
      title: 'Bước 5: Chuyển HALF-OPEN & Thử nghiệm chữa lành',
      from: 'order', to: 'user', status: 'half-open',
      action: 'Mạch hé mở cho 1 request thăm dò', code: 'Circuit: HALF_OPEN 🟡', color: '#f59e0b',
      badge: 'Thăm dò hồi phục',
      desc: 'Sau thời gian chờ quy định, cầu dao chuyển sang HALF-OPEN và cho phép 1 lượt gọi thử nghiệm duy nhất đi qua.',
      resilienceEffect: 'Nếu lượt gọi này thành công, cầu dao tự động đóng sập lại CLOSED (Xanh) phục hồi hoàn toàn.'
    }
  ],

  converge: [
    {
      title: 'Pha 1: Bulkhead lọc bão lưu lượng',
      from: 'client', to: 'order', status: 'converge-p1',
      action: 'Bulkhead tiếp nhận 6 request', code: 'Pha 1 · Bulkhead', color: '#6366f1',
      badge: 'Tầng 3: Bulkhead lọc tải',
      desc: 'Gửi 6 request song song. Bulkhead cấp 3 slot chạy (200 OK) và từ chối ngay 3 request quá tải bằng mã 429.',
      resilienceEffect: 'Tầng Bulkhead bảo vệ Order Service không bị ngập lụt tài nguyên.'
    },
    {
      title: 'Pha 2: Retry tự cứu khi gặp lỗi chập chờn',
      from: 'order', to: 'user', status: 'converge-p2',
      action: 'Retry thử lại 3 lần', code: 'Pha 2 · Retry 200 OK', color: '#22c55e',
      badge: 'Tầng 1: Retry tự cứu',
      desc: 'User Service lỗi 2 lần đầu (500). Tầng Retry ngoài cùng tự động thử lại lần 3 và lấy được dữ liệu thành công.',
      resilienceEffect: 'Tầng Retry tự xóa bỏ tác động của sự cố thoáng qua đối với người dùng.'
    },
    {
      title: 'Pha 3: Feign Timeout cắt đứt trễ & Bung mạch',
      from: 'order', to: 'user', status: 'converge-p3',
      action: 'Feign ngắt sau 1s, kích hoạt CB', code: 'Pha 3 · Feign Cut (504)', color: '#ef4444',
      badge: 'Tầng 4: Feign Timeout',
      desc: 'User Service bị treo 3s. Tầng Feign Timeout cắt đứt chính xác sau 1000ms. Lỗi này được ghi nhận khiến Circuit Breaker BUNG OPEN!',
      resilienceEffect: 'Feign Timeout chuyển giao tín hiệu nguy cấp cho Circuit Breaker.'
    },
    {
      title: 'Pha 4: Circuit Breaker chặn đứng bằng Fail-Fast (14ms)',
      from: 'order', to: 'client', status: 'converge-p4',
      action: 'Từ chối 503, Retry dừng hoạt động', code: 'Pha 4 · Fail-Fast (503)', color: '#ef4444',
      badge: 'Tầng 2: Circuit Breaker OPEN',
      desc: 'Mạch đang OPEN. Request mới tới bị dội ngược ngay trong 14ms (HTTP 503). Retry tuyệt đối không gọi lại để chống bão Retry Storm!',
      resilienceEffect: 'Sự phối hợp hoàn hảo: CB bảo vệ downstream, dập tắt bão Retry.'
    },
    {
      title: 'Pha 5: Tự chữa lành & Khép mạch về 200 OK',
      from: 'order', to: 'user', status: 'converge-p5',
      action: 'Khôi phục, thăm dò thành công', code: 'Pha 5 · Self-Healing (200)', color: '#22c55e',
      badge: 'Tự chữa lành hoàn tất',
      desc: 'User Service được khôi phục. Sau 3s mạch chuyển HALF_OPEN, gửi 1 request thăm dò thành công 200 OK và đóng mạch về CLOSED!',
      resilienceEffect: 'Khép lại trọn vẹn 100% vòng đời kiên cường của hệ thống Microservices.'
    }
  ],

  fallback: [
    {
      title: 'Bước 1: Downstream gặp sự cố nghiêm trọng',
      from: 'order', to: 'user', status: 'error-storm',
      action: 'User Service mất kết nối', code: 'Downstream Failed', color: '#ef4444',
      badge: 'Sự cố hệ thống',
      desc: 'User Service bị sập hoặc ngắt mạch, không thể cung cấp dữ liệu khách hàng.',
      resilienceEffect: 'Nếu KHÔNG CÓ Fallback: Khách hàng sẽ thấy màn hình lỗi 500 hoặc 503 xám xịt.'
    },
    {
      title: 'Bước 2: Cơ chế Fallback can thiệp tức thì',
      from: 'order', to: 'order', status: 'fallback-active',
      action: 'Tạo dữ liệu dự phòng an toàn', code: 'Fallback Engaged 🛡️', color: '#22c55e',
      badge: 'Kích hoạt Fallback',
      desc: 'Hàm Fallback tự động can thiệp, tạo đối tượng dự phòng an toàn (Guest User: "Khách dự phòng - Chế độ bảo trì").',
      resilienceEffect: 'Chuyển đổi suy giảm mềm (Graceful Degradation).'
    },
    {
      title: 'Bước 3: Trả về kết quả 200 OK cho khách hàng',
      from: 'order', to: 'client', status: 'success',
      action: 'Trả về HTTP 200 với dữ liệu dự phòng', code: 'HTTP 200 OK (Fallback)', color: '#22c55e',
      badge: 'Trải nghiệm không gián đoạn',
      desc: 'Người dùng vẫn xem được đơn hàng bình thường kèm thông báo dự phòng mềm mại thay vì màn hình lỗi trắng xóa.',
      resilienceEffect: 'Bảo toàn trải nghiệm mua sắm và uy tín thương hiệu của ứng dụng.'
    }
  ]
};

export default function FlowVisualizer({ scenarioId, busy, liveStage, breakerState }) {
  const steps = flowStepsData[scenarioId] || flowStepsData.normal;
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef(null);

  // Reset or adjust index when scenario changes
  useEffect(() => {
    setCurrentStepIdx(0);
    setIsPlaying(false);
    if (playTimerRef.current) clearInterval(playTimerRef.current);
  }, [scenarioId]);

  // Auto step if busy with real API
  useEffect(() => {
    if (busy) {
      setIsPlaying(false);
      // Advance steps as stage progresses
      if (scenarioId === 'converge') {
        if (liveStage.includes('Pha 1')) setCurrentStepIdx(0);
        else if (liveStage.includes('Pha 2')) setCurrentStepIdx(1);
        else if (liveStage.includes('Pha 3')) setCurrentStepIdx(2);
        else if (liveStage.includes('Pha 4')) setCurrentStepIdx(3);
        else if (liveStage.includes('Pha 5')) setCurrentStepIdx(4);
      } else if (scenarioId === 'timeout') {
        if (liveStage.includes('User Service')) setCurrentStepIdx(1);
        else if (liveStage.includes('Feign')) setCurrentStepIdx(2);
        else if (liveStage.includes('TimeLimiter')) setCurrentStepIdx(3);
      } else if (scenarioId === 'retry') {
        if (liveStage.includes('thử lại')) setCurrentStepIdx((prev) => Math.min(prev + 1, steps.length - 1));
      }
    }
  }, [busy, liveStage, scenarioId, steps.length]);

  // Interactive play / pause loop
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setCurrentStepIdx((prev) => {
          if (prev >= steps.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 2600);
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, steps.length]);

  const step = steps[currentStepIdx] || steps[0];

  function togglePlay() {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (currentStepIdx >= steps.length - 1) {
        setCurrentStepIdx(0);
      }
      setIsPlaying(true);
    }
  }

  function nextStep() {
    setIsPlaying(false);
    setCurrentStepIdx((prev) => Math.min(prev + 1, steps.length - 1));
  }

  function prevStep() {
    setIsPlaying(false);
    setCurrentStepIdx((prev) => Math.max(prev - 1, 0));
  }

  function resetFlow() {
    setIsPlaying(false);
    setCurrentStepIdx(0);
  }

  // Calculate packet position along diagram
  // Client = 10%, Order = 50%, User = 90%
  let packetX = 10;
  let packetY = 50;
  let packetVisible = true;
  let connectionCut = false;
  let connectionBlocked = false;

  if (step.status === 'sending') {
    packetX = 30; // traveling Client -> Order
  } else if (step.status === 'processing') {
    packetX = 70; // traveling Order -> User
  } else if (step.status === 'delayed') {
    packetX = 86; // stuck at User
  } else if (step.status === 'cut') {
    packetX = 64; // cut at bridge
    connectionCut = true;
  } else if (step.status === 'returning') {
    packetX = 35; // returning to Order
  } else if (step.status === 'success') {
    packetX = 14; // returned back to Client
  } else if (step.status === 'fail-fast') {
    packetX = 46; // bounced at Order, retreating
    connectionBlocked = true;
  } else if (step.status === 'retry-fail') {
    packetX = 82; // failed at User
  } else if (step.status === 'waiting') {
    packetX = 50; // held in Order
  } else if (step.status === 'burst') {
    packetX = 32;
  } else if (step.status === 'rejected') {
    packetX = 26; // bounced back
  } else if (step.status === 'breaker-open') {
    packetX = 50;
    connectionBlocked = true;
  } else if (step.status === 'half-open') {
    packetX = 70;
  } else if (step.status.startsWith('converge')) {
    if (step.status === 'converge-p1') packetX = 46;
    else if (step.status === 'converge-p2') packetX = 75;
    else if (step.status === 'converge-p3') { packetX = 65; connectionCut = true; }
    else if (step.status === 'converge-p4') { packetX = 42; connectionBlocked = true; }
    else if (step.status === 'converge-p5') packetX = 85;
  }

  const isCircuitOpen = breakerState === 'OPEN' || step.status === 'breaker-open' || step.status === 'converge-p4';

  return (
    <div className="flow-visualizer-container">
      {/* Top Controller Bar */}
      <div className="visualizer-header">
        <div className="visualizer-title">
          <Activity size={17} className="pulse-icon" />
          <span>MINH HỌA ĐỘNG ĐƯỜNG ĐI REQUEST & CƠ CHẾ PHÒNG THỦ</span>
        </div>
        <div className="visualizer-controls">
          <span className="step-counter">Bước {currentStepIdx + 1} / {steps.length}</span>
          <button className="vis-btn" onClick={prevStep} disabled={currentStepIdx === 0} title="Bước trước">
            ❮
          </button>
          <button className={`vis-btn play-btn ${isPlaying ? 'active' : ''}`} onClick={togglePlay} title={isPlaying ? 'Tạm dừng' : 'Tự động phát hoạt họa'}>
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            <span>{isPlaying ? 'Tạm dừng' : 'Phát hoạt họa'}</span>
          </button>
          <button className="vis-btn" onClick={nextStep} disabled={currentStepIdx === steps.length - 1} title="Bước tiếp theo">
            ❯
          </button>
          <button className="vis-btn" onClick={resetFlow} title="Xem lại từ đầu">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* SVG Pipeline Animation Stage */}
      <div className="pipeline-stage">
        <svg className="pipeline-svg" viewBox="0 0 900 200" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="pipeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#6366f1" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.4" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Connection Pipe 1: Client -> Order */}
          <line x1="150" y1="100" x2="380" y2="100" stroke="#332d66" strokeWidth="6" strokeLinecap="round" />
          <line x1="150" y1="100" x2="380" y2="100" stroke="url(#pipeGrad)" strokeWidth="3" strokeDasharray="6,6" className="animated-flow-line" />

          {/* Connection Pipe 2: Order -> User */}
          <line
            x1="520" y1="100" x2="750" y2="100"
            stroke={connectionCut ? '#ef4444' : connectionBlocked ? '#4b5563' : '#332d66'}
            strokeWidth="6"
            strokeLinecap="round"
          />
          {!connectionBlocked && !connectionCut && (
            <line x1="520" y1="100" x2="750" y2="100" stroke="url(#pipeGrad)" strokeWidth="3" strokeDasharray="6,6" className="animated-flow-line" />
          )}

          {/* Cut Scissors Indicator */}
          {connectionCut && (
            <g transform="translate(625, 80)">
              <circle cx="10" cy="20" r="18" fill="#ef4444" />
              <text x="10" y="25" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="bold">✂️</text>
              <text x="10" y="-8" textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="bold">NGẮT TIMEOUT (1s)</text>
            </g>
          )}

          {/* Blocked Wall Indicator */}
          {connectionBlocked && (
            <g transform="translate(625, 75)">
              <rect x="-8" y="0" width="36" height="50" rx="8" fill="#ef4444" opacity="0.9" />
              <text x="10" y="30" textAnchor="middle" fill="#fff" fontSize="20" fontWeight="bold">⛔</text>
              <text x="10" y="-8" textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="bold">CHẶN FAIL-FAST (0 LƯỢT)</text>
            </g>
          )}

          {/* Animated Request Packet */}
          {packetVisible && (
            <g transform={`translate(${packetX * 9}, ${packetY * 2})`} filter="url(#glow)">
              <circle cx="0" cy="0" r="13" fill={step.color} className="pulsing-packet" />
              <circle cx="0" cy="0" r="6" fill="#ffffff" />
              <text x="0" y="-20" textAnchor="middle" fill={step.color} fontSize="11" fontWeight="bold">
                {step.code}
              </text>
            </g>
          )}

          {/* Node 1: Client / Gateway */}
          <g transform="translate(50, 45)">
            <rect x="0" y="0" width="120" height="110" rx="14" fill="#1e1b4b" stroke="#4338ca" strokeWidth="2" />
            <circle cx="60" cy="35" r="20" fill="#312e81" />
            <text x="60" y="42" textAnchor="middle" fill="#818cf8" fontSize="18">🌐</text>
            <text x="60" y="75" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="bold">API Gateway</text>
            <text x="60" y="93" textAnchor="middle" fill="#94a3b8" fontSize="10">:8080 · Client</text>
          </g>

          {/* Node 2: Order Service (Resilience Guards) */}
          <g transform="translate(360, 25)">
            <rect
              x="0" y="0" width="180" height="150" rx="16"
              fill="#18182b"
              stroke={isCircuitOpen ? '#ef4444' : '#6366f1'}
              strokeWidth="2.5"
            />
            <rect x="10" y="10" width="160" height="28" rx="8" fill="#242145" />
            <text x="90" y="28" textAnchor="middle" fill="#e0e7ff" fontSize="12" fontWeight="bold">
              📦 Order Service (:8082)
            </text>

            {/* Active Guard badge inside Order */}
            <g transform="translate(20, 52)">
              <rect x="0" y="0" width="140" height="78" rx="10" fill="#131126" stroke="#3730a3" strokeWidth="1.2" />
              {scenarioId === 'timeout' && (
                <>
                  <text x="70" y="24" textAnchor="middle" fill="#f59e0b" fontSize="11" fontWeight="bold">⏱️ Feign Timeout</text>
                  <text x="70" y="45" textAnchor="middle" fill="#94a3b8" fontSize="10">readTimeout: 1000ms</text>
                  <text x="70" y="65" textAnchor="middle" fill="#ef4444" fontSize="10" fontWeight="bold">Cắt đứt khi quá 1s</text>
                </>
              )}
              {scenarioId === 'retry' && (
                <>
                  <text x="70" y="24" textAnchor="middle" fill="#38bdf8" fontSize="11" fontWeight="bold">🔄 Resilience4j Retry</text>
                  <text x="70" y="45" textAnchor="middle" fill="#94a3b8" fontSize="10">Max 3 lần · Backoff</text>
                  <text x="70" y="65" textAnchor="middle" fill="#22c55e" fontSize="10" fontWeight="bold">Tự cứu ở lần 3</text>
                </>
              )}
              {scenarioId === 'bulkhead' && (
                <>
                  <text x="70" y="24" textAnchor="middle" fill="#a855f7" fontSize="11" fontWeight="bold">🛡️ Bulkhead Semaphore</text>
                  <text x="70" y="45" textAnchor="middle" fill="#94a3b8" fontSize="10">3 Slot chạy / 10 đến</text>
                  <text x="70" y="65" textAnchor="middle" fill="#f59e0b" fontSize="10" fontWeight="bold">7 request dội lại 429</text>
                </>
              )}
              {scenarioId === 'breaker' && (
                <>
                  <text x="70" y="24" textAnchor="middle" fill="#ec4899" fontSize="11" fontWeight="bold">⚡ Circuit Breaker</text>
                  <text x="70" y="45" textAnchor="middle" fill={isCircuitOpen ? '#ef4444' : '#22c55e'} fontSize="11" fontWeight="bold">
                    Trạng thái: {isCircuitOpen ? 'OPEN 🔴' : 'CLOSED 🟢'}
                  </text>
                  <text x="70" y="65" textAnchor="middle" fill="#94a3b8" fontSize="10">
                    {isCircuitOpen ? 'Fail-Fast 14ms (503)' : 'Cho phép lưu thông'}
                  </text>
                </>
              )}
              {scenarioId === 'converge' && (
                <>
                  <text x="70" y="20" textAnchor="middle" fill="#818cf8" fontSize="10" fontWeight="bold">4 Tầng lồng nhau</text>
                  <text x="70" y="38" textAnchor="middle" fill="#94a3b8" fontSize="9">1.Retry ➔ 2.CB</text>
                  <text x="70" y="54" textAnchor="middle" fill="#94a3b8" fontSize="9">3.Bulkhead ➔ 4.Feign</text>
                  <text x="70" y="70" textAnchor="middle" fill="#22c55e" fontSize="9" fontWeight="bold">5 Pha bảo vệ khép kín</text>
                </>
              )}
              {scenarioId === 'normal' && (
                <>
                  <text x="70" y="28" textAnchor="middle" fill="#22c55e" fontSize="11" fontWeight="bold">✅ OpenFeign Chuẩn</text>
                  <text x="70" y="52" textAnchor="middle" fill="#94a3b8" fontSize="10">Chuyển tiếp trơn tru</text>
                </>
              )}
              {scenarioId === 'fallback' && (
                <>
                  <text x="70" y="24" textAnchor="middle" fill="#22c55e" fontSize="11" fontWeight="bold">🛡️ Fallback Mode</text>
                  <text x="70" y="45" textAnchor="middle" fill="#94a3b8" fontSize="10">Bảo hiểm lỗi</text>
                  <text x="70" y="65" textAnchor="middle" fill="#38bdf8" fontSize="10">Trả dữ liệu dự phòng</text>
                </>
              )}
            </g>
          </g>

          {/* Node 3: User Service */}
          <g transform="translate(730, 45)">
            <rect
              x="0" y="0" width="130" height="110" rx="14"
              fill="#1e182e"
              stroke={scenarioId === 'normal' ? '#22c55e' : '#e11d48'}
              strokeWidth="2"
            />
            <circle cx="65" cy="35" r="20" fill="#2e1a32" />
            <text x="65" y="42" textAnchor="middle" fill="#f43f5e" fontSize="18">👤</text>
            <text x="65" y="75" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="bold">User Service</text>
            <text x="65" y="93" textAnchor="middle" fill="#94a3b8" fontSize="10">
              {scenarioId === 'normal' ? 'Bình thường (:8081)' : 'Giả lập sự cố (:8081)'}
            </text>
          </g>
        </svg>
      </div>

      {/* Step Explanation Banner */}
      <div className="flow-explanation-card">
        <div className="step-badge-row">
          <span className="step-pill" style={{ backgroundColor: step.color + '25', color: step.color, borderColor: step.color }}>
            {step.badge}
          </span>
          <span className="step-action-tag">
            <ArrowRight size={13} /> {step.action}
          </span>
        </div>
        <h4 className="step-title">{step.title}</h4>
        <p className="step-desc">{step.desc}</p>
        <div className="step-resilience-box">
          <strong>Ý nghĩa kiên cường:</strong> {step.resilienceEffect}
        </div>

        {/* Step Indicator dots */}
        <div className="step-dots">
          {steps.map((st, i) => (
            <button
              key={st.title}
              className={`step-dot ${i === currentStepIdx ? 'active' : ''}`}
              onClick={() => { setIsPlaying(false); setCurrentStepIdx(i); }}
              title={`Nhảy tới bước ${i + 1}: ${st.title}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
