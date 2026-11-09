import { useState, useEffect, useRef } from 'react';
import {
  Play, Pause, RotateCcw, Activity, ArrowRight, CheckCircle2, AlertTriangle, ShieldAlert,
  ChevronLeft, ChevronRight, Gauge
} from 'lucide-react';

export default function FlowVisualizer({
  scenarioId = 'normal',
  busy = false,
  liveStage = '',
  breakerState = null,
  runCount = 0,
  probeRunCount = 0,
  actionLabel = 'Chạy kịch bản',
  scenarioMode = 'protected',
  isUnprotected = false
}) {
  // STRICT RULE: isPlaying is FALSE initially! It NEVER moves until user clicks!
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1); // 0.5 (Chậm rãi thuyết trình) | 1 (Chuẩn)

  const animTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const lastTimeRef = useRef(performance.now());
  const reqIdRef = useRef(null);
  const stepTargetTimeRef = useRef(null);
  const isSteppingRef = useRef(false);
  const speedRef = useRef(1);

  // Synchronize isPlaying with ref
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // When switching scenario or mode: strictly STOP, reset to 0
  useEffect(() => {
    setIsPlaying(false);
    isSteppingRef.current = false;
    stepTargetTimeRef.current = null;
    animTimeRef.current = 0;
    setCurrentTime(0);
  }, [scenarioId, scenarioMode]);

  // When user clicks the main Run button in App, START the natural flow!
  useEffect(() => {
    if (runCount > 0) {
      animTimeRef.current = 0;
      setCurrentTime(0);
      isSteppingRef.current = false;
      stepTargetTimeRef.current = null;
      setIsPlaying(true);
    }
  }, [runCount]);

  // When user clicks the Probe button ("Gửi 2 lượt thăm dò") in App, START the probe flow!
  useEffect(() => {
    if (probeRunCount > 0) {
      animTimeRef.current = 0;
      setCurrentTime(0);
      isSteppingRef.current = false;
      stepTargetTimeRef.current = null;
      setIsPlaying(true);
    }
  }, [probeRunCount]);

  // High precision 60 FPS animation loop with Smooth Gliding Stepper physics
  useEffect(() => {
    function tick(now) {
      const delta = Math.min(now - lastTimeRef.current, 50) * speedRef.current;
      lastTimeRef.current = now;

      if (isPlayingRef.current) {
        if (isSteppingRef.current && stepTargetTimeRef.current !== null) {
          const target = stepTargetTimeRef.current;
          const current = animTimeRef.current;

          if (target > current) {
            // Gliding forward smoothly to milestone
            const stepDelta = Math.max(delta * 1.35, 12);
            const next = current + stepDelta;
            if (next >= target) {
              animTimeRef.current = target;
              setCurrentTime(target);
              isSteppingRef.current = false;
              stepTargetTimeRef.current = null;
              setIsPlaying(false);
            } else {
              animTimeRef.current = next;
              setCurrentTime(next);
            }
          } else if (target < current) {
            // Gliding backward smoothly to milestone
            const stepDelta = Math.max(delta * 1.5, 15);
            const next = current - stepDelta;
            if (next <= target) {
              animTimeRef.current = target;
              setCurrentTime(target);
              isSteppingRef.current = false;
              stepTargetTimeRef.current = null;
              setIsPlaying(false);
            } else {
              animTimeRef.current = next;
              setCurrentTime(next);
            }
          } else {
            isSteppingRef.current = false;
            stepTargetTimeRef.current = null;
            setIsPlaying(false);
          }
        } else {
          // Continuous play
          animTimeRef.current += delta;
          setCurrentTime(animTimeRef.current);
        }
      }

      reqIdRef.current = requestAnimationFrame(tick);
    }

    reqIdRef.current = requestAnimationFrame(tick);
    return () => {
      if (reqIdRef.current) cancelAnimationFrame(reqIdRef.current);
    };
  }, []);

  // Determine if this is a probe-specific run in Circuit Breaker
  const isProbeMode = scenarioId === 'breaker' && probeRunCount > 0 && probeRunCount >= runCount;

  // Duration settings per scenario
  let totalDuration = 5000;
  if (isUnprotected) {
    if (scenarioId === 'timeout') totalDuration = 6000;
    else if (scenarioId === 'retry') totalDuration = 5500;
    else if (scenarioId === 'bulkhead') totalDuration = 6000;
    else if (scenarioId === 'breaker') totalDuration = 6500;
  } else {
    if (scenarioId === 'timeout') totalDuration = 12500; // 4 runs: Direct (4s) -> Feign 3s -> RestClient 2.5s -> TimeLimiter 1.5s
    else if (scenarioId === 'retry') totalDuration = 12000;
    else if (scenarioId === 'bulkhead') totalDuration = 6000;
    else if (scenarioId === 'breaker') totalDuration = isProbeMode ? 6500 : 7000;
    else if (scenarioId === 'converge') totalDuration = 12500;
    else if (scenarioId === 'fallback') totalDuration = 5500;
  }

  // Auto-pause when full flow reaches the end, so viewers can read conclusion
  useEffect(() => {
    if (isPlaying && currentTime >= totalDuration) {
      setIsPlaying(false);
    }
  }, [isPlaying, currentTime, totalDuration]);

  // Smooth quadratic easing for natural acceleration & deceleration
  const easeInOut = (p) => (p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p);

  // SVG System Coordinates (viewBox 0 0 900 240)
  const gwX = 130;
  const gwY = 120;
  const orderX = 450;
  const orderY = 120;
  const userX = 770;
  const userY = 120;

  const t = Math.min(currentTime, totalDuration);

  // State flags for SVG elements
  let packetX = gwX;
  let packetY = gwY;
  let packetColor = '#6366f1';
  let packetLabel = 'SẴN SÀNG';
  let packetVisible = true;
  let pipe2Cut = false;
  let pipe2Blocked = false;
  let isUserError = false;
  let leverAngle = 0; // 0: CLOSED, 20: HALF-OPEN, 45: OPEN
  let multiPackets = null; // for Bulkhead 10 particles
  let stationRing = null; // circular countdown at station

  let narrative = {
    stepTitle: 'Chờ khởi chạy kịch bản',
    badge: 'Hệ thống sẵn sàng',
    action: 'Đang ở trạng thái nghỉ',
    desc: `Chưa có yêu cầu nào được gửi đi. Hãy nhấn nút "${actionLabel}" ở trên để bắt đầu quan sát luồng chuyển động thực tế.`,
    resilience: 'Toàn bộ 3 dịch vụ (Gateway, Order, User) đang ở trạng thái hoạt động bình thường, tài nguyên sẵn sàng.',
    statusColor: '#6366f1',
    code: 'CHỜ LỆNH'
  };

  let phaseMilestones = [];

  // ==========================================
  // SCENARIO 1: NORMAL (4-Leg Full Round Trip)
  // ==========================================
  if (scenarioId === 'normal') {
    phaseMilestones = [
      { name: '1. Gửi đơn hàng', time: 0 },
      { name: '2. Feign gọi User', time: 1200 },
      { name: '3. User trả 200 OK', time: 2400 },
      { name: '4. Hoàn tất về Client', time: 3800 }
    ];

    if (t > 0 || isPlaying) {
      if (t < 1200) {
        const p = easeInOut(t / 1200);
        packetX = gwX + p * (orderX - gwX);
        packetColor = '#6366f1';
        packetLabel = 'GET /api/orders/1';
        narrative = {
          stepTitle: 'Bước 1/4: Client gửi yêu cầu tạo đơn hàng',
          badge: 'Tiếp nhận yêu cầu',
          action: 'Client -> API Gateway (:8080) -> Order Service (:8082)',
          desc: 'API Gateway tiếp nhận request từ người dùng và định tuyến an toàn tới Order Service (:8082).',
          resilience: 'API Gateway đóng vai trò làm chốt chặn bảo mật và phân phối lưu lượng vào mạng nội bộ.',
          statusColor: '#6366f1',
          code: 'HTTP GET'
        };
      } else if (t < 2400) {
        const p = easeInOut((t - 1200) / 1200);
        packetX = orderX + p * (userX - orderX);
        packetColor = '#6366f1';
        packetLabel = 'OpenFeign: GET /users/1';
        narrative = {
          stepTitle: 'Bước 2/4: Order Service gọi User Service qua OpenFeign',
          badge: 'Giao tiếp liên dịch vụ',
          action: 'Order Service (:8082) -> User Service (:8081)',
          desc: 'Order Service kích hoạt Feign Client để tra cứu thông tin khách hàng (tên, địa chỉ, số điện thoại).',
          resilience: 'OpenFeign đóng gói REST API thành interface Java trong suốt, chuẩn hóa giao tiếp liên dịch vụ.',
          statusColor: '#6366f1',
          code: 'FEIGN CALL'
        };
      } else if (t < 3800) {
        const p = easeInOut((t - 2400) / 1400);
        packetX = userX - p * (userX - orderX);
        packetColor = '#22c55e';
        packetLabel = '200 OK (Nguyễn Văn A)';
        narrative = {
          stepTitle: 'Bước 3/4: User Service phản hồi dữ liệu khách hàng',
          badge: 'Xử lý thành công',
          action: 'User Service trả mã HTTP 200 OK',
          desc: 'User Service truy vấn cơ sở dữ liệu hoàn tất trong ~15ms và gửi dữ liệu khách hàng trở lại Order Service.',
          resilience: 'Đường truyền thông suốt lý tưởng, downstream hoạt động ổn định và đáp ứng tức thì.',
          statusColor: '#22c55e',
          code: 'HTTP 200 OK'
        };
      } else {
        const p = easeInOut((t - 3800) / 1200);
        packetX = orderX - p * (orderX - gwX);
        packetColor = '#22c55e';
        packetLabel = 'Đơn hàng #001 (200 OK)';
        narrative = {
          stepTitle: 'Bước 4/4: Hoàn tất đơn hàng & Trả kết quả về Client',
          badge: 'Hoàn tất trọn vẹn',
          action: 'Order Service gộp dữ liệu & trả về Client',
          desc: 'Order Service tổng hợp thông tin sản phẩm và khách hàng, trả về phản hồi HTTP 200 OK hoàn chỉnh cho Client.',
          resilience: 'Giao dịch hoàn tất hoàn hảo trong trạng thái bình thường (Happy Path).',
          statusColor: '#22c55e',
          code: '200 OK HOÀN TẤT'
        };
      }
    }
  }

  // =========================================================================
  // SCENARIO 2: TIMEOUT (MATCHES THE 3 TABLE ROWS: DIRECT, FEIGN, TIMELIMITER)
  // =========================================================================
  else if (scenarioId === 'timeout') {
    if (isUnprotected) {
      phaseMilestones = [
        { name: '1. Gửi request', time: 0 },
        { name: '2. Treo nghẽn 4s (Không Timeout)', time: 1200 },
        { name: '3. Khóa luồng & Pool 🚨', time: 3000 },
        { name: '4. Kết thúc sau 4.016ms', time: 4800 }
      ];

      if (t > 0 || isPlaying) {
        if (t < 1200) {
          const p = easeInOut(t / 1200);
          packetX = gwX + p * (userX - gwX);
          packetColor = '#6366f1';
          packetLabel = 'GET /api/users/1';
          narrative = {
            stepTitle: 'Bước 1/4: Gửi request — KHÔNG CÓ BẢO VỆ TIMEOUT',
            badge: 'Thiếu Timeout',
            action: 'Client -> Gateway -> Order Service -> User Service',
            desc: 'Yêu cầu được gửi đi nhưng KHÔNG CÓ bất kỳ cơ chế Timeout nào (không Feign readTimeout, không TimeLimiter).',
            resilience: 'Hệ thống phó mặc cho đối tác downstream; nếu đối tác chậm, toàn bộ chuỗi dịch vụ phải chờ theo.',
            statusColor: '#6366f1',
            code: 'KHÔNG TIMEOUT'
          };
        } else if (t < 4600) {
          packetX = userX;
          isUserError = true;
          packetColor = '#ef4444';
          const waitS = (((t - 1200) / 3400) * 4).toFixed(1);
          packetLabel = `TREO CHẾT LUỒNG ${waitS}s / 4.0s ⏳`;
          stationRing = { x: userX, y: userY, progress: (t - 1200) / 3400, label: `${waitS}s` };
          narrative = {
            stepTitle: 'Bước 2/4: THẢM HỌA TREO LUỒNG — User Service bị nghẽn 4.000ms',
            badge: 'Treo cứng luồng 4s',
            action: 'Worker thread bị giam giữ 4.000ms tại User Service',
            desc: 'User Service bị quá tải I/O 4 giây. Do không có Timeout, Order Service bị ép phải ngâm socket kết nối suốt hơn 4 giây!',
            resilience: 'HIỂM HỌA: Connection pool của HikariCP và Worker thread pool của Tomcat bị khóa chặt, không thể tái sử dụng.',
            statusColor: '#ef4444',
            code: 'TREO 4s / KHÓA LUỒNG'
          };
        } else {
          const p = easeInOut((t - 4600) / 1400);
          packetX = userX - p * (userX - gwX);
          packetColor = '#f59e0b';
          packetLabel = '200 OK (Sau 4.016ms) ⚠️';
          narrative = {
            stepTitle: 'Bước 4/4: Phản hồi về sau 4.016ms — Nguy cơ sập dây chuyền (Cascading Failure)',
            badge: 'Hệ thống suy kiệt',
            action: 'Trả mã 200 OK sau khi làm kiệt quệ tài nguyên',
            desc: 'Dù cuối cùng nhận được HTTP 200, nhưng cái giá phải trả là luồng xử lý bị đóng băng hơn 4 giây. Trong môi trường production, 20-50 request ngâm đồng thời như thế này sẽ làm sập toàn bộ Order Service!',
            resilience: 'Chứng minh: Timeout là tấm khiên sinh tồn bắt buộc phải có để ngăn thảm họa sập dây chuyền.',
            statusColor: '#f59e0b',
            code: '200 OK (TRỄ 4s)'
          };
        }
      }
    } else {
      phaseMilestones = [
        { name: '1. Không Timeout (Chờ 4s)', time: 0 },
        { name: '2. Feign (Mẫu 3s - Tầng mạng)', time: 3100 },
        { name: '3. RestClient (Mẫu 2.5s - Tầng mạng)', time: 6200 },
        { name: '4. TimeLimiter (Mẫu 1.5s - Tầng app)', time: 9300 }
      ];

      if (t > 0 || isPlaying) {
        if (t < 3100) {
          // RUN 1: Direct call to User Service (0 -> 3100ms)
          const pT = t / 3100;
          if (pT < 0.25) {
            const p = easeInOut(pT / 0.25);
            packetX = gwX + p * (userX - gwX);
            packetColor = '#6366f1';
            packetLabel = 'Lượt 1: Gọi thẳng (Không Timeout)';
          } else if (pT < 0.75) {
            packetX = userX;
            isUserError = true;
            packetColor = '#f59e0b';
            const waitS = ((pT - 0.25) / 0.5 * 4).toFixed(1);
            packetLabel = `ĐỨNG CHỜ ${waitS}s / 4.0s ⏳`;
            stationRing = { x: userX, y: userY, progress: (pT - 0.25) / 0.5, label: `${waitS}s` };
          } else {
            const p = easeInOut((pT - 0.75) / 0.25);
            packetX = userX - p * (userX - gwX);
            packetColor = '#22c55e';
            packetLabel = '200 OK (Sau 4 giây chờ)';
          }
          narrative = {
            stepTitle: 'Lượt 1/4: Không cài Timeout — Buộc phải đứng chờ đủ 4 giây',
            badge: 'Chưa được bảo vệ',
            action: 'Gọi thẳng User Service (:8081) khi nó đang bị kẹt chậm 4 giây',
            desc: 'Vì không có giới hạn chờ, luồng xử lý phải ngồi đợi trọn 4 giây mới xong. Nếu bên kia kẹt 1 phút hay kẹt vĩnh viễn, máy chủ của bạn cũng đứng im tương ứng.',
            resilience: 'Hậu quả: Vài chục người dùng bấm cùng lúc là máy chủ cạn sạch luồng xử lý và sập theo.',
            statusColor: '#f59e0b',
            code: 'CHỜ HẾT 4s'
          };
        } else if (t < 6200) {
          // RUN 2: Feign readTimeout = 3000ms (3100 -> 6200ms)
          const pT = (t - 3100) / 3100;
          if (pT < 0.25) {
            const p = easeInOut(pT / 0.25);
            packetX = gwX + p * (userX - gwX);
            packetColor = '#6366f1';
            packetLabel = 'Lượt 2: Feign (Cài mẫu 3s)';
          } else if (pT < 0.65) {
            packetX = userX;
            isUserError = true;
            packetColor = '#f59e0b';
            const waitS = ((pT - 0.25) / 0.4 * 3).toFixed(1);
            packetLabel = `CHỜ TỐI ĐA 3s: ${waitS}s ⏳`;
            stationRing = { x: orderX, y: orderY, progress: (pT - 0.25) / 0.4, label: `${waitS}s` };
          } else if (pT < 0.8) {
            pipe2Cut = true;
            packetX = (orderX + userX) / 2;
            packetColor = '#ef4444';
            packetLabel = 'FEIGN ĐÓNG KẾT NỐI ✂️';
          } else {
            pipe2Cut = true;
            const p = easeInOut((pT - 0.8) / 0.2);
            packetX = orderX - p * (orderX - gwX);
            packetColor = '#ef4444';
            packetLabel = '504 HẾT GIỜ (3s)';
          }
          narrative = {
            stepTitle: 'Lượt 2/4: Timeout ở lớp kết nối HTTP (OpenFeign — cài mẫu 3 giây)',
            badge: 'Lớp kết nối mạng',
            action: 'OpenFeign chỉ cho phép 1 lần gọi HTTP chờ tối đa 3 giây',
            desc: 'User Service vẫn chậm 4s, nhưng ở lớp mạng ta cài Feign chờ tối đa 3s. Hết 3s, Feign chủ động ngắt kết nối và báo mã 504 thay vì đợi tiếp.',
            resilience: 'Lưu ý: Con số 3s là do ta tự cài để bảo vệ từng cuộc gọi HTTP đơn lẻ, giúp không bị rò rỉ kết nối mạng.',
            statusColor: '#ef4444',
            code: 'FEIGN NGẮT 3s'
          };
        } else if (t < 9300) {
          // RUN 3: Spring 6 RestClient readTimeout = 2500ms (6200 -> 9300ms)
          const pT = (t - 6200) / 3100;
          if (pT < 0.25) {
            const p = easeInOut(pT / 0.25);
            packetX = gwX + p * (userX - gwX);
            packetColor = '#6366f1';
            packetLabel = 'Lượt 3: RestClient (Cài mẫu 2.5s)';
          } else if (pT < 0.65) {
            packetX = userX;
            isUserError = true;
            packetColor = '#f59e0b';
            const waitS = ((pT - 0.25) / 0.4 * 2.5).toFixed(1);
            packetLabel = `CHỜ TỐI ĐA 2.5s: ${waitS}s ⏳`;
            stationRing = { x: orderX, y: orderY, progress: (pT - 0.25) / 0.4, label: `${waitS}s` };
          } else if (pT < 0.8) {
            pipe2Cut = true;
            packetX = (orderX + userX) / 2;
            packetColor = '#f97316';
            packetLabel = 'RESTCLIENT ĐÓNG KẾT NỐI ✂️';
          } else {
            pipe2Cut = true;
            const p = easeInOut((pT - 0.8) / 0.2);
            packetX = orderX - p * (orderX - gwX);
            packetColor = '#f97316';
            packetLabel = '504 HẾT GIỜ (2.5s)';
          }
          narrative = {
            stepTitle: 'Lượt 3/4: Timeout ở lớp kết nối HTTP (Spring 6 RestClient — cài mẫu 2.5 giây)',
            badge: 'Lớp kết nối mạng',
            action: 'Spring RestClient cài hạn mức đọc 2.5 giây cho 1 cuộc gọi HTTP',
            desc: 'Tương tự Feign nhưng dùng thư viện RestClient mới của Spring 6. Khi cài 2.5s mà bên kia mất 4s, kết nối tự đóng ở giây 2.5 và trả mã 504.',
            resilience: 'Giống Feign, RestClient kiểm soát thời gian ở lớp HTTP Socket — nhưng nếu bọc Retry 3 lần bên ngoài, tổng thời gian chờ sẽ bị nhân lên.',
            statusColor: '#f97316',
            code: 'RESTCLIENT NGẮT 2.5s'
          };
        } else {
          // RUN 4: Resilience4j TimeLimiter = 1500ms (9300 -> 12500ms)
          const pT = (t - 9300) / 3200;
          if (pT < 0.25) {
            const p = easeInOut(pT / 0.25);
            packetX = gwX + p * (userX - gwX);
            packetColor = '#6366f1';
            packetLabel = 'Lượt 4: TimeLimiter (Cài mẫu 1.5s)';
          } else if (pT < 0.55) {
            packetX = userX;
            isUserError = true;
            packetColor = '#f59e0b';
            const waitS = ((pT - 0.25) / 0.3 * 1.5).toFixed(1);
            packetLabel = `NGÂN SÁCH TỔNG 1.5s: ${waitS}s ⏳`;
            stationRing = { x: orderX, y: orderY, progress: (pT - 0.25) / 0.3, label: `${waitS}s` };
          } else if (pT < 0.75) {
            pipe2Cut = true;
            packetX = (orderX + userX) / 2;
            packetColor = '#ec4899';
            packetLabel = 'TIMELIMITER HỦY TÁC VỤ ⏱️';
          } else {
            pipe2Cut = true;
            const p = easeInOut((pT - 0.75) / 0.25);
            packetX = orderX - p * (orderX - gwX);
            packetColor = '#ec4899';
            packetLabel = '504 HẾT NGÂN SÁCH (1.5s)';
          }
          narrative = {
            stepTitle: 'Lượt 4/4: Timeout ở lớp ứng dụng (Resilience4j TimeLimiter — cài mẫu 1.5 giây)',
            badge: 'Lớp nghiệp vụ ứng dụng',
            action: 'TimeLimiter khống chế TỔNG thời gian chờ của cả tính năng (SLA = 1.5s)',
            desc: 'Khác với Feign/RestClient (chỉ đếm từng lần gửi mạng), TimeLimiter đặt "trần" cho tổng thời gian người dùng phải đợi. Quá 1.5s là hủy tác vụ trả 504 ngay.',
            resilience: 'Kết luận: Hai lớp không thi xem ai nhanh hơn (vì con số do mình tự đặt), mà phối hợp bảo vệ cả ở tầng mạng lẫn tầng tổng nghiệp vụ.',
            statusColor: '#ec4899',
            code: 'TIMELIMITER 1.5s'
          };
        }
      }
    }
  }

  // ==========================================
  // SCENARIO 3: RETRY (Natural Continuous Multi-Round Trips)
  // ==========================================
  else if (scenarioId === 'retry') {
    if (isUnprotected) {
      phaseMilestones = [
        { name: '1. Gửi yêu cầu', time: 0 },
        { name: '2. Lỗi 500 chập chờn', time: 1200 },
        { name: '3. Ném thẳng lỗi 500 (Không Retry)', time: 2400 },
        { name: '4. Sập giao dịch Client', time: 3800 }
      ];

      if (t > 0 || isPlaying) {
        if (t < 1200) {
          const p = easeInOut(t / 1200);
          packetX = gwX + p * (userX - gwX);
          packetColor = '#6366f1';
          packetLabel = 'GET /api/orders/1';
          narrative = {
            stepTitle: 'Bước 1/4: Gửi yêu cầu — KHÔNG CÓ CƠ CHẾ RETRY',
            badge: 'Thiếu Retry',
            action: 'Client -> Gateway -> Order Service -> User Service',
            desc: 'Yêu cầu gọi thẳng sang User Service không qua bất kỳ thư viện thử lại nào (Không Spring Retry, Không Resilience4j Retry).',
            resilience: 'Hệ thống cực kỳ mỏng manh trước các dao động mạng hoặc dịch vụ downstream khởi động lại.',
            statusColor: '#6366f1',
            code: 'KHÔNG RETRY'
          };
        } else if (t < 2400) {
          packetX = userX;
          isUserError = true;
          packetColor = '#ef4444';
          packetLabel = 'Lỗi 500 💥 (User Service)';
          narrative = {
            stepTitle: 'Bước 2/4: User Service gặp lỗi mạng chập chờn (HTTP 500)',
            badge: 'Lỗi thoáng qua',
            action: 'User Service phản hồi HTTP 500 ở lần 1',
            desc: 'User Service đang bận hoặc mới khởi động lại, trả về mã lỗi HTTP 500 thoáng qua (chỉ cần nghỉ 500ms là hồi phục).',
            resilience: 'Sự cố thoáng qua (transient fault) là điều bình thường trong kiến trúc phân tán.',
            statusColor: '#ef4444',
            code: 'HTTP 500'
          };
        } else if (t < 3800) {
          const p = easeInOut((t - 2400) / 1400);
          packetX = userX - p * (userX - orderX);
          packetColor = '#ef4444';
          packetLabel = 'NÉM LỖI 500 💥 (KHÔNG RETRY)';
          narrative = {
            stepTitle: 'Bước 3/4: THẢM HỌA THIẾU RETRY — Đầu hàng ngay lập tức ở lần 1',
            badge: 'Không tự cứu',
            action: 'Order Service ném thẳng ngoại lệ FeignException về Client',
            desc: 'Do KHÔNG CÓ RETRY, Order Service không thể bắt lấy lỗi để thử lại hay đệm Backoff. Nó lập tức đầu hàng và ném thẳng mã lỗi 500 về phía người dùng!',
            resilience: 'Chỉ gọi đúng 1 lần duy nhất (attempts = 1). Không có cơ hội tự chữa lành, làm sập giao dịch ngay tức khắc.',
            statusColor: '#ef4444',
            code: 'ĐẦU HÀNG LẦN 1'
          };
        } else {
          const p = easeInOut((t - 3800) / 1200);
          packetX = orderX - p * (orderX - gwX);
          packetColor = '#ef4444';
          packetLabel = 'HTTP 500 💥 (HỦY ĐƠN HÀNG)';
          narrative = {
            stepTitle: 'Bước 4/4: Khách hàng nhận màn hình lỗi — Đơn hàng #001 bị hủy',
            badge: 'Giao dịch thất bại',
            action: 'Client nhận màn hình lỗi HTTP 500',
            desc: 'Khách hàng nhận thông báo lỗi và đơn hàng bị hủy. Người dùng buộc phải bấm đặt lại từ đầu, dễ bỏ giỏ hàng!',
            resilience: 'So sánh: Khi có Retry, hệ thống âm thầm chờ 500ms rồi thử lại nên vẫn trả về kết quả bình thường (200 OK).',
            statusColor: '#ef4444',
            code: 'HTTP 500 LỖI'
          };
        }
      }
    } else {
      phaseMilestones = [
        { name: '1. Gửi yêu cầu', time: 0 },
        { name: '2. Thử lần 1 (500)', time: 1200 },
        { name: '3. Nghỉ 500ms', time: 3200 },
        { name: '4. Thử lần 2 (500)', time: 4600 },
        { name: '5. Nghỉ 1000ms', time: 6600 },
        { name: '6. Thử lần 3 (200 OK)', time: 8400 },
        { name: '7. Trả về Client', time: 10800 }
      ];

      if (t > 0 || isPlaying) {
        if (t < 1200) {
          const p = easeInOut(t / 1200);
          packetX = gwX + p * (orderX - gwX);
          packetColor = '#6366f1';
          packetLabel = 'GET /api/orders/1';
          narrative = {
            stepTitle: 'Bắt đầu: Client gửi yêu cầu tra cứu qua Gateway',
            badge: 'Khởi động',
            action: 'Client -> Gateway -> Order Service',
            desc: 'API Gateway nhận yêu cầu và chuyển sang Order Service. Cơ chế tự thử lại (Resilience4j Retry & Spring Retry) đang trực sẵn.',
            resilience: 'Quy tắc: Nếu lỗi, hệ thống sẽ tự thử tối đa 3 lần kèm khoảng nghỉ tăng dần giữa các lần.',
            statusColor: '#6366f1',
            code: 'KHỞI TẠO'
          };
        } else if (t < 2200) {
          const p = easeInOut((t - 1200) / 1000);
          packetX = orderX + p * (userX - orderX);
          packetColor = '#6366f1';
          packetLabel = 'Lần 1: Gọi User';
          narrative = {
            stepTitle: 'Bước 1/5: Lần gọi 1 — User Service báo lỗi tạm thời (HTTP 500)',
            badge: 'Lỗi thoáng qua',
            action: 'Lần 1 gọi User Service gặp lỗi 500',
            desc: 'Order Service gọi User Service lần 1. Giả sử mạng vừa chớp nhẹ hoặc dịch vụ bên kia mới khởi động lại nên trả lỗi 500.',
            resilience: 'Retry giữ lỗi lại tại Order Service, CHƯA vội báo hỏng về màn hình của khách.',
            statusColor: '#ef4444',
            code: 'LẦN 1: LỖI 500'
          };
        } else if (t < 3200) {
          const p = easeInOut((t - 2200) / 1000);
          packetX = userX - p * (userX - orderX);
          packetColor = '#ef4444';
          packetLabel = 'Lỗi 500 💥 (Giữ lại)';
          isUserError = true;
          narrative = {
            stepTitle: 'Bước 1/5: Lần 1 thất bại — Giữ lỗi ở Order Service để thử lại',
            badge: 'Chặn lỗi lại',
            action: 'Order Service giữ lỗi, chưa trả về Client',
            desc: 'User Service trả lỗi 500. Thay vì đẩy thẳng lỗi ra màn hình, Retry giữ yêu cầu lại để chuẩn bị gọi thử lần 2.',
            resilience: 'Âm thầm xử lý lỗi ở phía sau để trải nghiệm người dùng không bị gián đoạn.',
            statusColor: '#ef4444',
            code: 'LỖI 500'
          };
        } else if (t < 4600) {
          packetX = orderX;
          packetColor = '#f59e0b';
          packetLabel = 'Nghỉ 500ms ⏳';
          stationRing = { x: orderX, y: orderY, progress: (t - 3200) / 1400, label: '500ms' };
          narrative = {
            stepTitle: 'Bước 2/5: Nghỉ ngắn 500ms trước khi thử lại (Exponential Backoff)',
            badge: 'Giãn nhịp nghỉ',
            action: 'Tạm dừng 500ms chờ bên kia ổn định lại',
            desc: 'Hệ thống không gọi dồn dập ngay lập tức mà nghỉ 500ms để User Service kịp hoàn tất khởi động hoặc qua cơn nghẽn.',
            resilience: 'Giãn nhịp nghỉ giúp tránh tình trạng hàng nghìn người cùng thử lại một lúc gây quá tải thêm.',
            statusColor: '#f59e0b',
            code: 'NGHỈ 500ms'
          };
        } else if (t < 5600) {
          const p = easeInOut((t - 4600) / 1000);
          packetX = orderX + p * (userX - orderX);
          packetColor = '#f59e0b';
          packetLabel = 'Lần 2: Thử lại';
          narrative = {
            stepTitle: 'Bước 3/5: Tự thử lại lần 2 — User Service vẫn chưa kịp khỏe',
            badge: 'Thử lại lần 2',
            action: 'Tự động gửi lại yêu cầu lần 2',
            desc: 'Sau khi nghỉ 500ms, Order Service tự gọi lại lần 2. Trong kịch bản này, User Service vẫn báo lỗi 500 lần nữa.',
            resilience: 'Vẫn còn lượt thử (tối đa 3 lần), nên hệ thống nhân đôi thời gian nghỉ lên 1000ms!',
            statusColor: '#f59e0b',
            code: 'LẦN 2: LỖI 500'
          };
        } else if (t < 6600) {
          const p = easeInOut((t - 5600) / 1000);
          packetX = userX - p * (userX - orderX);
          packetColor = '#ef4444';
          packetLabel = 'Lỗi 500 💥 (Giữ lại)';
          isUserError = true;
          narrative = {
            stepTitle: 'Bước 3/5: Lần 2 vẫn lỗi — Tăng thời gian nghỉ lên gấp đôi (1000ms)',
            badge: 'Nhân đôi giờ nghỉ',
            action: 'Nhân đôi thời gian chờ lên 1000ms',
            desc: 'Lần 2 vẫn thất bại. Retry tiếp tục giữ lỗi lại và tăng thời gian nghỉ lên 1000ms cho lần gọi cuối cùng.',
            resilience: 'Giãn nhịp từ 500ms ➔ 1000ms giúp cho dịch vụ bên kia thêm thời gian hồi phục.',
            statusColor: '#ef4444',
            code: 'LỖI 500'
          };
        } else if (t < 8400) {
          packetX = orderX;
          packetColor = '#f59e0b';
          packetLabel = 'Nghỉ 1000ms ⏳';
          stationRing = { x: orderX, y: orderY, progress: (t - 6600) / 1800, label: '1000ms' };
          narrative = {
            stepTitle: 'Bước 4/5: Nghỉ 1000ms chờ User Service hồi phục hẳn',
            badge: 'Đợi hồi phục',
            action: 'Nghỉ 1000ms trước lần thử thứ 3',
            desc: 'Hệ thống tạm dừng 1 giây để User Service kịp ổn định trước khi gọi lại.',
            resilience: 'Khoảng nghỉ hợp lý giúp cứu được yêu cầu mà không làm nặng thêm máy chủ.',
            statusColor: '#f59e0b',
            code: 'NGHỈ 1000ms'
          };
        } else if (t < 9600) {
          const p = easeInOut((t - 8400) / 1200);
          packetX = orderX + p * (userX - orderX);
          packetColor = '#22c55e';
          packetLabel = 'Lần 3: Thành công ✅';
          narrative = {
            stepTitle: 'Bước 5/5: Lần thử 3 — User Service đã khỏe và trả dữ liệu (200 OK)!',
            badge: 'Thành công ở lần 3',
            action: 'Lần 3 User Service trả về 200 OK',
            desc: 'Sau 1000ms nghỉ, Order Service gọi lại lần thứ 3. Lần này User Service đã ổn định và trả về đầy đủ tên, địa chỉ khách hàng!',
            resilience: 'Tự cứu thành công yêu cầu mà người dùng không cần bấm tải lại trang.',
            statusColor: '#22c55e',
            code: 'LẦN 3: 200 OK'
          };
        } else if (t < 10800) {
          const p = easeInOut((t - 9600) / 1200);
          packetX = userX - p * (userX - orderX);
          packetColor = '#22c55e';
          packetLabel = '200 OK (Dữ liệu khách)';
          narrative = {
            stepTitle: 'Nhận dữ liệu — Order Service ghép thông tin đơn hàng',
            badge: 'Đủ dữ liệu',
            action: 'User Service trả họ tên, địa chỉ về Order Service',
            desc: 'Order Service nhận được thông tin khách hàng và ghép vào đơn hàng #001.',
            resilience: 'Giao dịch được xử lý trọn vẹn dù trước đó bị lỗi 2 lần.',
            statusColor: '#22c55e',
            code: 'GHÉP DỮ LIỆU'
          };
        } else {
          const p = easeInOut((t - 10800) / 1200);
          packetX = orderX - p * (orderX - gwX);
          packetColor = '#22c55e';
          packetLabel = 'HTTP 200 OK ✅';
          narrative = {
            stepTitle: 'Hoàn tất — Trả kết quả thành công về cho khách hàng',
            badge: 'Khách hàng hài lòng',
            action: 'Trả đơn hàng đầy đủ kèm HTTP 200 OK',
            desc: 'Màn hình người dùng nhận kết quả 200 OK bình thường. Khách hàng không hề biết phía sau vừa tự thử lại 3 lần!',
            resilience: 'Giúp ứng dụng ổn định trước các lỗi mạng thoáng qua.',
            statusColor: '#22c55e',
            code: 'HTTP 200 OK'
          };
        }
      }
    }
  }

  // ==========================================
  // SCENARIO 4: BULKHEAD (10 Packets with Physical Separation)
  // ==========================================
  else if (scenarioId === 'bulkhead') {
    if (isUnprotected) {
      phaseMilestones = [
        { name: '1. Bão 10 request đồng thời', time: 0 },
        { name: '2. 10/10 Tràn ngập Order Service', time: 1400 },
        { name: '3. 10/10 Threads bị khóa chặt 2s', time: 3000 },
        { name: '4. Cạn kiệt Thread Pool 🚨', time: 4800 }
      ];

      if (t > 0 || isPlaying) {
        packetVisible = false;
        const barrierX = orderX - 25;
        const p10 = [];

        for (let i = 0; i < 10; i++) {
          const startX = gwX - 50 + (i % 3) * 20;
          const startY = gwY - 36 + i * 8;
          let px, py, col, lbl;

          if (t < 1400) {
            const p = easeInOut(t / 1400);
            px = startX + p * (barrierX - startX);
            py = startY + (orderY - startY) * p * 0.4;
            col = '#ef4444';
            lbl = `#${i + 1}`;
          } else if (t < 3600) {
            // ALL 10 are admitted because there is NO BULKHEAD!
            const p = easeInOut((t - 1400) / 2200);
            px = barrierX + p * (userX - barrierX);
            py = orderY - 45 + i * 10;
            col = '#ef4444';
            lbl = `Lock 2s ⏳`;
          } else if (t < 4800) {
            const p = easeInOut((t - 3600) / 1200);
            px = userX - p * (userX - orderX);
            py = orderY - 45 + i * 10;
            col = '#f59e0b';
            lbl = '200 OK';
          } else {
            const p = easeInOut((t - 4800) / 1200);
            px = orderX - p * (orderX - gwX);
            py = gwY - 36 + i * 8;
            col = '#f59e0b';
            lbl = '200 OK ⚠️';
          }
          p10.push({ x: px, y: py, color: col, label: lbl, accepted: true });
        }
        multiPackets = p10;

        if (t < 1400) {
          narrative = {
            stepTitle: 'Bước 1/4: 10 người cùng bấm một lúc — KHÔNG CÓ BULKHEAD',
            badge: 'Bão lưu lượng',
            action: 'Cả 10 yêu cầu cùng tràn vào Order Service',
            desc: '10 khách hàng bấm tra cứu cùng một lúc. Vì hệ thống KHÔNG cài vách ngăn giới hạn (Bulkhead), tất cả đều được đẩy thẳng vào xử lý.',
            resilience: 'Cổng vào mở toang hoàn toàn, không có ai đứng điều tiết bớt tải.',
            statusColor: '#ef4444',
            code: '10 LƯỢT CÙNG VÀO'
          };
        } else if (t < 3600) {
          narrative = {
            stepTitle: 'Bước 2/4: QUÁ TẢI KHI THIẾU BULKHEAD — Chiếm hết 10/10 luồng trong 2 giây',
            badge: 'Kẹt hết luồng 🚨',
            action: 'Cả 10 luồng làm việc của Order Service bị chiếm sạch',
            desc: 'Vì không giới hạn 3 chỗ, cả 10 yêu cầu cùng vào ngồi chờ User Service mất 2 giây. Toàn bộ 10/10 luồng xử lý của máy chủ bị kẹt cứng!',
            resilience: 'HẬU QUẢ: Trong lúc 10 luồng đang bị kẹt, bất kỳ ai gọi chức năng thanh toán, tạo đơn hay xem giỏ hàng đều bị đứng hình theo!',
            statusColor: '#ef4444',
            code: '10/10 LUỒNG BỊ KẸT'
          };
        } else if (t < 4800) {
          narrative = {
            stepTitle: 'Bước 3/4: Xử lý xong sau 2 giây nhưng cả hệ thống đã bị đơ trong lúc đó',
            badge: 'Đơ toàn hệ thống',
            action: 'Hoàn tất sau khi làm kẹt cứng máy chủ suốt 2 giây',
            desc: 'Dù cả 10 lượt đều trả về 200 OK sau 2 giây, hệ thống đã phải đánh đổi bằng việc đứng hình toàn bộ các chức năng khác.',
            resilience: 'So sánh: Khi có Bulkhead, hệ thống chỉ nhận tối đa 3 lượt, còn 7 lượt dư được báo bận ngay trong 1ms (HTTP 429) để giữ lại luồng cho việc khác!',
            statusColor: '#f59e0b',
            code: 'ĐƠ MÁY CHỦ 2s'
          };
        } else {
          narrative = {
            stepTitle: 'Bước 4/4: Bài học rút ra — Bulkhead ngăn một lỗi nhỏ làm đơ cả hệ thống',
            badge: 'Nguy cơ sập máy chủ',
            action: 'Nếu có 50 người thay vì 10, Order Service sẽ hết sạch luồng và treo hẳn',
            desc: 'Khi thiếu Bulkhead, chỉ cần một chức năng bị chậm là kéo sập theo toàn bộ máy chủ.',
            resilience: 'Nguyên tắc Bulkhead: Chấp nhận từ chối bớt người đến sau (HTTP 429) còn hơn để cả con tàu dịch vụ chìm chung.',
            statusColor: '#ef4444',
            code: 'THIẾU BULKHEAD'
          };
        }
      }
    } else {
      phaseMilestones = [
        { name: '1. Bão 10 request', time: 0 },
        { name: '2. Bulkhead cấp 3 / Chặn 7', time: 1600 },
        { name: '3. 3 Lượt hoàn tất 200 OK', time: 3600 },
        { name: '4. Trả về Client', time: 4800 }
      ];

      if (t > 0 || isPlaying) {
        packetVisible = false;
        const barrierX = orderX - 25;
        const p10 = [];

        for (let i = 0; i < 10; i++) {
          const isAccepted = i < 3;
          const startX = gwX - 50 + (i % 3) * 20;
          const startY = gwY - 36 + i * 8;
          let px, py, col, lbl;

          if (t < 1600) {
            const p = easeInOut(t / 1600);
            px = startX + p * (barrierX - startX);
            py = startY + (orderY - startY) * p * 0.4;
            col = '#818cf8';
            lbl = `#${i + 1}`;
          } else if (isAccepted) {
            if (t < 3600) {
              const p = easeInOut((t - 1600) / 2000);
              px = barrierX + p * (userX - barrierX);
              py = orderY - 24 + i * 24;
              col = '#22c55e';
              lbl = `Slot ${i + 1}`;
            } else if (t < 4800) {
              const p = easeInOut((t - 3600) / 1200);
              px = userX - p * (userX - orderX);
              py = orderY - 24 + i * 24;
              col = '#22c55e';
              lbl = '200 OK';
            } else {
              const p = easeInOut((t - 4800) / 1200);
              px = orderX - p * (orderX - gwX);
              py = gwY - 20 + i * 20;
              col = '#22c55e';
              lbl = '200 OK ✅';
            }
          } else {
            if (t < 3200) {
              const p = easeInOut((t - 1600) / 1600);
              px = barrierX - p * (barrierX - gwX);
              py = startY + Math.sin(i * 1.5) * 15;
              col = '#ef4444';
              lbl = '429';
            } else {
              px = gwX;
              py = startY;
              col = '#ef4444';
              lbl = '429 Bị chặn';
            }
          }
          p10.push({ x: px, y: py, color: col, label: lbl, accepted: isAccepted });
        }
        multiPackets = p10;

        if (t < 1600) {
          narrative = {
            stepTitle: 'Bước 1/4: Bão lưu lượng 10 request ập đến cùng lúc',
            badge: 'Lưu lượng tăng vọt',
            action: '10 Lượt gọi đồng thời vào Order Service',
            desc: '10 khách hàng cùng lúc gửi lệnh tra cứu. Mỗi lượt xử lý cần tới 2 giây để hoàn thành.',
            resilience: 'Nếu không giới hạn, 10 request này sẽ chiếm trọn connection pool, khiến các API quan trọng khác bị nghẽn hoàn toàn!',
            statusColor: '#6366f1',
            code: '10 REQUESTS'
          };
        } else if (t < 3600) {
          narrative = {
            stepTitle: 'Bước 2/4: Bulkhead cấp 3 slot · Từ chối 7 lượt quá tải (429)',
            badge: 'Cách ly tài nguyên',
            action: '7 Lượt bị dội ngược ngay ở cửa về Client',
            desc: 'Vách ngăn Bulkhead chỉ cấp đúng 3 slot cho API này. 7 request vượt hạn ngạch bị dội ngược ngay tức thì trong 1ms với mã HTTP 429!',
            resilience: 'Cách ly tài nguyên (Resource Isolation): Không để request ngâm lâu làm cạn luồng; bảo toàn năng lực phục vụ cho hệ thống.',
            statusColor: '#ef4444',
            code: '3x 200 · 7x 429'
          };
        } else if (t < 4800) {
          narrative = {
            stepTitle: 'Bước 3/4: 3 lượt hợp lệ hoàn tất an toàn sau 2000ms',
            badge: 'Bảo vệ thành công',
            action: '3 Lượt trong slot hoàn thành xử lý tại User Service',
            desc: '3 request được cấp slot hoàn tất xử lý sau 2000ms và phản hồi kết quả về Order Service.',
            resilience: 'Hệ thống vận hành vững như bàn thạch ngay cả trong tâm bão lưu lượng.',
            statusColor: '#22c55e',
            code: '3x 200 OK'
          };
        } else {
          narrative = {
            stepTitle: 'Bước 4/4: Trả kết quả về Client — Hệ thống nguyên vẹn',
            badge: 'Hoàn tất an toàn',
            action: '3 Lượt nhận kết quả 200 OK · 7 Lượt nhận 429 kiểm soát',
            desc: 'Toàn bộ 10 yêu cầu đã được phản hồi nhanh chóng, không có bất kỳ luồng nào bị treo chết.',
            resilience: 'Chứng minh xuất sắc nguyên lý "Khoang kín tàu thủy" (Bulkhead Pattern).',
            statusColor: '#22c55e',
            code: 'HOÀN TẤT BULKHEAD'
          };
        }
      }
    }
  }

  // =========================================================================
  // SCENARIO 5: CIRCUIT BREAKER (NORMAL 6 CALLS OR DEDICATED 2 PROBES MODE)
  // =========================================================================
  else if (scenarioId === 'breaker') {
    if (isUnprotected) {
      phaseMilestones = [
        { name: '1. Lỗi 1-5 (User chết 100%)', time: 0 },
        { name: '2. Không có cầu dao (Mạch đóng)', time: 2400 },
        { name: '3. Lượt 6 vẫn gửi qua mạng', time: 4200 },
        { name: '4. 0 Fail-Fast · Đè bẹp đối tác', time: 5400 }
      ];

      if (t > 0 || isPlaying) {
        leverAngle = 0;
        pipe2Blocked = false;

        if (t < 2400) {
          const pT = t / 2400;
          if (pT < 0.5) {
            const p = easeInOut(pT * 2);
            packetX = gwX + p * (userX - gwX);
            packetColor = '#ef4444';
            packetLabel = 'Lượt 1-5: Gửi qua mạng';
          } else {
            const p = easeInOut((pT - 0.5) * 2);
            packetX = userX - p * (userX - gwX);
            packetColor = '#ef4444';
            packetLabel = 'Lượt 1-5: Lỗi 500 💥';
          }
          isUserError = true;
          narrative = {
            stepTitle: 'Bước 1/4: User Service đang hỏng 100% — Gửi 5 lượt liên tiếp',
            badge: 'Lỗi 100%',
            action: '5 lượt đầu tiên đều thất bại với lỗi 500',
            desc: 'User Service đang bị lỗi hoàn toàn. 5 yêu cầu đầu gửi qua mạng sang đó đều nhận lỗi HTTP 500.',
            resilience: 'Tỷ lệ lỗi đã đạt 100% (vượt xa ngưỡng 50%).',
            statusColor: '#ef4444',
            code: '5/5 LỖI 100%'
          };
        } else if (t < 4200) {
          narrative = {
            stepTitle: 'Bước 2/4: THIẾU CẦU DAO NGẮT MẠCH — Không tự động dừng lại!',
            badge: 'Không có cầu dao',
            action: 'Đường gọi vẫn mở, không có cơ chế tự ngắt bảo vệ',
            desc: 'Dù 5/5 lần đều lỗi, nhưng vì KHÔNG CÓ Circuit Breaker nên Order Service không biết đường dừng lại.',
            resilience: 'Hệ thống thiếu hoàn toàn cầu dao tự ngắt khi dịch vụ bên kia gặp sự cố.',
            statusColor: '#ef4444',
            code: 'KHÔNG TỰ NGẮT'
          };
        } else if (t < 5400) {
          const pT = (t - 4200) / 1200;
          if (pT < 0.5) {
            const p = easeInOut(pT * 2);
            packetX = gwX + p * (userX - gwX);
            packetColor = '#ef4444';
            packetLabel = 'Lượt 6: Vẫn gửi qua mạng!';
          } else {
            const p = easeInOut((pT - 0.5) * 2);
            packetX = userX - p * (userX - gwX);
            packetColor = '#ef4444';
            packetLabel = 'Lượt 6: Vẫn lỗi 500 💥';
          }
          narrative = {
            stepTitle: 'Bước 3/4: Lượt thứ 6 VẪN CỐ gửi sang dịch vụ đang hỏng (không có Fail-Fast)',
            badge: 'Không chặn nhanh',
            action: 'Lượt 6 vẫn phải đi hết đường mạng rồi mới nhận lỗi',
            desc: 'So sánh: Khi có cầu dao, lượt 6 bị chặn luôn tại Order Service trong 14ms (HTTP 503, 0 lần gọi User). Còn ở đây, lượt 6 vẫn gửi qua mạng sang dịch vụ đang hỏng, vừa chậm vừa tạo thêm gánh nặng cho nó!',
            resilience: 'Quá tải dây chuyền: Liên tục gửi thêm yêu cầu vào dịch vụ đang lỗi khiến nó càng khó hồi phục.',
            statusColor: '#ef4444',
            code: 'LƯỢT 6: KHÔNG CHẶN'
          };
        } else {
          packetX = gwX;
          packetColor = '#ef4444';
          packetLabel = '6/6 THẤT BẠI 💥';
          narrative = {
            stepTitle: 'Bước 4/4: Tổng kết — Cả 6 lượt đều gửi qua mạng vào chỗ hỏng',
            badge: 'Làm nặng thêm lỗi',
            action: 'Cả 6 lượt đều tốn công gửi qua mạng và thất bại',
            desc: 'Không có cầu dao ngắt mạch (Circuit Breaker) thì không thể chặn nhanh (Fail-Fast) và cũng không tự kiểm tra để mở lại khi bên kia khỏe (HALF-OPEN).',
            resilience: 'Circuit Breaker giống như cầu dao điện: tự ngắt khi quá tải/chập mạch để bảo vệ cả hệ thống.',
            statusColor: '#ef4444',
            code: '6/6 GỬI VÀO LỖI'
          };
        }
      }
    } else if (isProbeMode) {
      // -----------------------------------------------------------
      // DEDICATED PROBE MODE (Triggered by "Gửi 2 lượt thăm dò")
      // Explains clearly why 2 probes are required by Resilience4j
      // -----------------------------------------------------------
      phaseMilestones = [
        { name: '1. Chờ chuyển HALF-OPEN 🟡', time: 0 },
        { name: '2. Thăm dò lượt 1/2', time: 2000 },
        { name: '3. Thăm dò lượt 2/2', time: 4200 },
        { name: '4. Đóng mạch CLOSED 🟢', time: 5500 }
      ];

      if (t > 0 || isPlaying) {
        if (t < 2000) {
          // Waiting open-wait duration -> lever moves to HALF-OPEN (20°)
          leverAngle = 20;
          pipe2Blocked = false;
          packetX = orderX;
          packetColor = '#f59e0b';
          packetLabel = 'HÉ MỞ HALF-OPEN 🟡';
          narrative = {
            stepTitle: 'Giai đoạn Thăm dò 1: Hết thời gian chờ — Cầu dao hé mở sang HALF-OPEN 🟡',
            badge: 'Thử nghiệm hồi phục',
            action: 'Mạch hé mở cho phép gửi thử nghiệm',
            desc: 'Sau thời gian chờ quy định (openWaitSeconds), cầu dao hé mở sang HALF-OPEN. Tại sao cần 2 lượt thăm dò? Resilience4j cấu hình permittedNumberOfCallsInHalfOpenState=2: Cần đúng 2 lượt thành công liên tiếp để loại trừ trường hợp may mắn chập chờn trước khi chính thức đóng mạch.',
            resilience: 'Cơ chế thăm dò an toàn tuyệt đối, tránh hiện tượng vừa bật lại đã bị bão tải đánh sập.',
            statusColor: '#f59e0b',
            code: 'HALF-OPEN 🟡'
          };
        } else if (t < 4200) {
          // PROBE 1: Order -> User -> Order (200 OK)
          leverAngle = 20;
          const pT = (t - 2000) / 2200;
          if (pT < 0.5) {
            const p = easeInOut(pT * 2);
            packetX = orderX + p * (userX - orderX);
            packetColor = '#f59e0b';
            packetLabel = 'Thăm dò 1/2 (Đi)';
          } else {
            const p = easeInOut((pT - 0.5) * 2);
            packetX = userX - p * (userX - orderX);
            packetColor = '#22c55e';
            packetLabel = 'Thăm dò 1/2: 200 OK ✅';
          }
          narrative = {
            stepTitle: 'Lượt thăm dò 1/2: Gửi request thử nghiệm đầu tiên sang User Service',
            badge: 'Thăm dò lượt 1',
            action: 'Lượt 1 thành công (200 OK) — Mạch VẪN GIỮ HALF-OPEN',
            desc: 'Lượt 1 thành công! Nhưng cầu dao CHƯA ĐÓNG NGAY mà vẫn ở HALF-OPEN để chờ lượt thứ 2 xác nhận chắc chắn.',
            resilience: 'Quy tắc nghiêm ngặt: 1 lượt thành công chưa đủ để khẳng định downstream đã hồi phục 100%.',
            statusColor: '#f59e0b',
            code: 'THĂM DÒ 1/2 (200 OK)'
          };
        } else if (t < 5500) {
          // PROBE 2: Order -> User -> Order (200 OK)
          leverAngle = 20;
          const pT = (t - 4200) / 1300;
          if (pT < 0.5) {
            const p = easeInOut(pT * 2);
            packetX = orderX + p * (userX - orderX);
            packetColor = '#f59e0b';
            packetLabel = 'Thăm dò 2/2 (Đi)';
          } else {
            const p = easeInOut((pT - 0.5) * 2);
            packetX = userX - p * (userX - orderX);
            packetColor = '#22c55e';
            packetLabel = 'Thăm dò 2/2: 200 OK ✅';
          }
          narrative = {
            stepTitle: 'Lượt thăm dò 2/2: Gửi request thử nghiệm thứ hai để chốt quyết định',
            badge: 'Thăm dò lượt 2',
            action: 'Lượt 2 thành công 200 OK — Đạt điều kiện đóng mạch',
            desc: 'Cả 2/2 lượt thăm dò đều thành công rực rỡ! Đạt 100% điều kiện permittedNumberOfCallsInHalfOpenState.',
            resilience: 'Đủ bằng chứng tin cậy để cho phép toàn bộ lưu lượng bình thường lưu thông trở lại.',
            statusColor: '#22c55e',
            code: 'THĂM DÒ 2/2 (200 OK)'
          };
        } else {
          // Lever snaps firmly to CLOSED (0°)! Packet returns to Gateway with 200 OK
          leverAngle = 0;
          const p = easeInOut((t - 5500) / 1000);
          packetX = orderX - p * (orderX - gwX);
          packetColor = '#22c55e';
          packetLabel = 'CLOSED 🟢 (HỒI PHỤC)';
          narrative = {
            stepTitle: 'Tự chữa lành hoàn tất — Cầu dao đóng sập lại CLOSED 🟢',
            badge: 'Hồi phục 100%',
            action: 'Cầu dao khép kín hoàn toàn, hệ thống trở lại bình thường',
            desc: 'Cầu dao tự động dập xuống CLOSED 🟢. Kết thúc trọn vẹn chu trình tự bảo vệ và tự chữa lành (Self-Healing)!',
            resilience: 'Hoàn tất vòng đời kiên cường Microservices mà không cần khởi động lại bất kỳ dịch vụ nào.',
            statusColor: '#22c55e',
            code: 'CLOSED 🟢 THÀNH CÔNG'
          };
        }
      }
    } else {
      // -----------------------------------------------------------
      // REGULAR 6 CALLS RUN (Triggered by "Gửi 6 lượt liên tiếp")
      // Shows: Calls 1-5 encounter 500 -> Trips OPEN -> Call 6 Fail-Fast 14ms!
      // -----------------------------------------------------------
      phaseMilestones = [
        { name: '1. Mạch CLOSED (Lỗi 500)', time: 0 },
        { name: '2. Bung OPEN 🔴 (100% Lỗi)', time: 2200 },
        { name: '3. Fail-Fast 14ms (Chặn 503)', time: 4200 }
      ];

      if (t > 0 || isPlaying) {
        if (t < 1100) {
          leverAngle = 0;
          const p = easeInOut(t / 1100);
          packetX = gwX + p * (userX - gwX);
          packetColor = '#ef4444';
          packetLabel = 'Lần 1-5: Lỗi 500';
          isUserError = true;
          narrative = {
            stepTitle: 'Giai đoạn 1/3: Trạng thái bình thường — Mạch CLOSED (Đang đóng)',
            badge: 'Giám sát lỗi',
            action: 'Mạch đóng, phát hiện lỗi downstream liên tục',
            desc: 'Cầu dao đang ở trạng thái CLOSED. 5 request đầu tiên gửi sang User Service đều nhận về HTTP 500 do User Service đang gặp sự cố.',
            resilience: 'Circuit Breaker liên tục thống kê tỷ lệ thất bại trong cửa sổ trượt 5 phần tử (sliding window = 5).',
            statusColor: '#ef4444',
            code: 'CLOSED 🟢 (LỖI 500)'
          };
        } else if (t < 2200) {
          leverAngle = 0;
          const p = easeInOut((t - 1100) / 1100);
          packetX = userX - p * (userX - orderX);
          packetColor = '#ef4444';
          packetLabel = 'Lỗi 500 (Ghi nhận)';
          isUserError = true;
          narrative = {
            stepTitle: 'Giai đoạn 1/3: Tỷ lệ lỗi tích lũy đạt 100% (Vượt ngưỡng 50%)',
            badge: 'Cảnh báo nguy cấp',
            action: 'Order Service ghi nhận tỷ lệ lỗi vượt ngưỡng 50%',
            desc: '5/5 lượt đều lỗi (100% failure rate), vượt xa ngưỡng an toàn 50% quy định.',
            resilience: 'Tín hiệu ngắt mạch an toàn khẩn cấp được phát động.',
            statusColor: '#ef4444',
            code: 'LỖI 100%'
          };
        } else if (t < 4200) {
          leverAngle = Math.min(((t - 2200) / 1000) * 45, 45);
          pipe2Blocked = true;
          packetX = orderX;
          packetColor = '#ef4444';
          packetLabel = 'CẦU DAO BUNG OPEN 🔴';
          narrative = {
            stepTitle: 'Giai đoạn 2/3: Đối tác sập 100% — CẦU DAO BẬT MỞ (OPEN)!',
            badge: 'Cầu dao bung mở',
            action: 'Bung cầu dao ngắt hoàn toàn kết nối sang đối tác',
            desc: 'Tỷ lệ lỗi 100% ➔ Cầu dao an toàn lập tức BẬT MỞ (OPEN) kèm tia điện xẹt ⚡! Toàn bộ kết nối tới User Service bị ngắt đứt hoàn toàn.',
            resilience: 'Từ thời điểm này, TUYỆT ĐỐI KHÔNG CÒN BẤT KỲ REQUEST NÀO được phép gọi sang User Service nữa!',
            statusColor: '#ef4444',
            code: 'OPEN 🔴'
          };
        } else {
          // Lượt 6: Fail-Fast in action!
          leverAngle = 45;
          pipe2Blocked = true;
          const phaseT = t - 4200;
          if (phaseT < 1400) {
            const p = easeInOut(phaseT / 1400);
            packetX = gwX + p * (orderX - 35 - gwX);
            packetColor = '#f59e0b';
            packetLabel = 'Lượt 6 mới tới';
          } else {
            const p = easeInOut((phaseT - 1400) / 1400);
            packetX = orderX - 35 - p * (orderX - 35 - gwX);
            packetColor = '#ef4444';
            packetLabel = '503 FAIL-FAST (14ms) ⛔';
          }
          narrative = {
            stepTitle: 'Giai đoạn 3/3 (Dòng 6 trên bảng): Lượt 6 bị chặn đứng bằng Fail-Fast (14ms)',
            badge: 'Bảo vệ sinh tồn',
            action: 'Từ chối tức thì ở cửa Order Service, 0 lần gọi User',
            desc: 'Lượt thứ 6 tới chạm vào chốt cầu dao đang OPEN lập tức bị dội ngược ra ngay với mã HTTP 503 chỉ trong 14ms (0 LƯỢT GỌI USER SERVICE). Bấm nút "Gửi 2 lượt thăm dò" ở trên để xem quá trình tự chữa lành!',
            resilience: 'Cứu Order Service không bị cạn luồng; Cho User Service thời gian thở để tự phục hồi; Dập tắt bão lỗi dây chuyền.',
            statusColor: '#ef4444',
            code: '503 FAIL-FAST (14ms)'
          };
        }
      }
    }
  }

  // ==========================================
  // SCENARIO 6: CONVERGE (5 Phases - Zero Coordinate Snaps)
  // ==========================================
  else if (scenarioId === 'converge') {
    phaseMilestones = [
      { name: 'Pha 1 · Bulkhead', time: 0 },
      { name: 'Pha 2 · Retry', time: 2500 },
      { name: 'Pha 3 · Feign Timeout', time: 5000 },
      { name: 'Pha 4 · Fail-Fast', time: 7500 },
      { name: 'Pha 5 · Tự chữa lành', time: 10000 }
    ];

    if (t > 0 || isPlaying) {
      const phaseIdx = Math.floor(t / 2500);
      const pT = (t % 2500) / 2500;
      const progress = easeInOut(pT);

      if (phaseIdx === 0) {
        if (pT < 0.5) {
          packetX = gwX + (progress * 2) * (orderX - gwX);
        } else {
          packetX = orderX - ((progress - 0.5) * 2) * (orderX - gwX);
        }
        packetColor = '#c084fc';
        packetLabel = 'Pha 1 · Bulkhead (429/200)';
        narrative = {
          stepTitle: 'Pha 1/5: Bulkhead tiếp nhận 6 lượt tải',
          badge: 'Tầng 3: Bulkhead',
          action: 'Tiếp nhận 6 request song song',
          desc: 'Gửi 6 request song song. Bulkhead cấp 3 slot chạy (200 OK) và từ chối ngay 3 lượt quá tải bằng mã HTTP 429 tức thì.',
          resilience: 'Tầng Bulkhead lọc sạch bão tải, giữ Order Service không bị ngập lụt tài nguyên.',
          statusColor: '#c084fc',
          code: 'PHA 1: BULKHEAD'
        };
      } else if (phaseIdx === 1) {
        if (pT < 0.3) {
          packetX = gwX + (pT / 0.3) * (userX - gwX);
          packetColor = '#ef4444';
          packetLabel = 'Pha 2: Lần 1 lỗi 500';
        } else if (pT < 0.6) {
          packetX = userX - ((pT - 0.3) / 0.3) * (userX - orderX);
          packetColor = '#f59e0b';
          packetLabel = 'Pha 2: Backoff & Thử lại';
        } else {
          packetX = orderX - ((pT - 0.6) / 0.4) * (orderX - gwX);
          packetColor = '#22c55e';
          packetLabel = 'Pha 2: Lần 3 thành công 200';
        }
        narrative = {
          stepTitle: 'Pha 2/5: Retry tự thử lại 3 lần cứu vãn lỗi mạng chập chờn',
          badge: 'Tầng 1: Retry',
          action: 'Tự động thử lại 3 lần trong suốt',
          desc: 'User Service lỗi 2 lần đầu (500). Tầng Retry ngoài cùng tự động thử lại lần 3 và lấy được dữ liệu khách hàng thành công.',
          resilience: 'Tầng Retry ngoài cùng xóa bỏ hoàn toàn tác động của sự cố thoáng qua đối với người dùng.',
          statusColor: '#38bdf8',
          code: 'PHA 2: RETRY'
        };
      } else if (phaseIdx === 2) {
        pipe2Cut = pT > 0.45;
        if (pT < 0.45) {
          packetX = gwX + (pT / 0.45) * (userX - gwX);
          packetColor = '#f59e0b';
          packetLabel = 'Pha 3: Treo ngâm 3s';
        } else {
          packetX = userX - ((pT - 0.45) / 0.55) * (userX - gwX);
          packetColor = '#ef4444';
          packetLabel = 'Pha 3: Cắt 1s (504) ✂️';
        }
        narrative = {
          stepTitle: 'Pha 3/5: User Service bị treo 3s — Feign cắt đứt sau 1000ms!',
          badge: 'Tầng 4: Feign Timeout',
          action: 'Cắt sau 1s (504) kích hoạt Circuit Breaker',
          desc: 'User Service bị treo 3s. Feign Timeout cắt đứt sau 1000ms. Lỗi này được ghi nhận khiến Circuit Breaker BUNG OPEN!',
          resilience: 'Feign Timeout chuyển giao tín hiệu nguy cấp cho Circuit Breaker.',
          statusColor: '#ef4444',
          code: 'PHA 3: TIMEOUT'
        };
      } else if (phaseIdx === 3) {
        pipe2Blocked = true;
        leverAngle = 45;
        if (pT < 0.5) {
          packetX = gwX + (progress * 2) * (orderX - 35 - gwX);
        } else {
          packetX = orderX - 35 - ((progress - 0.5) * 2) * (orderX - 35 - gwX);
        }
        packetColor = '#ef4444';
        packetLabel = 'Pha 4: Fail-Fast 14ms (503)';
        narrative = {
          stepTitle: 'Pha 4/5: Circuit Breaker OPEN — Từ chối 503 ngay ở cửa!',
          badge: 'Tầng 2: Circuit Breaker',
          action: 'Từ chối 503 ngay ở cửa, Retry dừng',
          desc: 'Mạch đang OPEN. Request mới tới bị dội ngược ngay trong 14ms (HTTP 503). Retry tuyệt đối không gọi lại để chống bão Retry Storm!',
          resilience: 'Circuit Breaker bảo vệ downstream, dập tắt bão Retry.',
          statusColor: '#ef4444',
          code: 'PHA 4: FAIL-FAST'
        };
      } else {
        leverAngle = pT < 0.6 ? 20 : 0;
        if (pT < 0.5) {
          packetX = gwX + (pT / 0.5) * (userX - gwX);
          packetColor = '#f59e0b';
          packetLabel = 'Pha 5: Thăm dò (Probe)';
        } else {
          packetX = userX - ((pT - 0.5) / 0.5) * (userX - gwX);
          packetColor = '#22c55e';
          packetLabel = 'Pha 5: Khép CLOSED (200 OK)';
        }
        narrative = {
          stepTitle: 'Pha 5/5: User Service phục hồi — Thăm dò & Khép mạch CLOSED 🟢',
          badge: 'Tự chữa lành hoàn tất',
          action: 'Khôi phục, thăm dò thành công 200 OK',
          desc: 'User Service được sửa. Sau 3s mạch chuyển HALF_OPEN, gửi 1 request thăm dò thành công 200 OK và đóng mạch về CLOSED!',
          resilience: 'Khép lại trọn vẹn 100% vòng đời kiên cường của hệ thống Microservices.',
          statusColor: '#22c55e',
          code: 'PHA 5: 200 OK'
        };
      }
    }
  }

  // ==========================================
  // SCENARIO 7: FALLBACK (Graceful Degradation)
  // ==========================================
  else if (scenarioId === 'fallback') {
    phaseMilestones = [
      { name: '1. Không Fallback (500)', time: 0 },
      { name: '2. Có Fallback (200 OK)', time: 2600 }
    ];

    if (t > 0 || isPlaying) {
      if (t < 2600) {
        const pT = t / 2600;
        if (pT < 0.5) {
          const p = easeInOut(pT * 2);
          packetX = gwX + p * (userX - gwX);
          packetColor = '#ef4444';
          packetLabel = 'User Service sập';
          isUserError = true;
        } else {
          const p = easeInOut((pT - 0.5) * 2);
          packetX = userX - p * (userX - gwX);
          packetColor = '#ef4444';
          packetLabel = 'HTTP 500 LỖI XÁM XỊT 💥';
          isUserError = true;
        }
        narrative = {
          stepTitle: 'Giai đoạn 1/2: Downstream sập nguồn — Không có Fallback',
          badge: 'Sự cố hệ thống',
          action: 'Lỗi 500 lan truyền thẳng về Client',
          desc: 'User Service sập nguồn hoàn toàn. Do không có cơ chế Fallback, lỗi HTTP 500 truyền thẳng về Client khiến người dùng thấy màn hình báo lỗi.',
          resilience: 'Nếu KHÔNG CÓ Fallback: Khách hàng sẽ thấy màn hình lỗi 500 xám xịt, gián đoạn quy trình mua hàng.',
          statusColor: '#ef4444',
          code: 'KHÔNG FALLBACK'
        };
      } else {
        const pT = (t - 2600) / 2900;
        if (pT < 0.4) {
          const p = easeInOut(pT / 0.4);
          packetX = gwX + p * (userX - gwX);
          packetColor = '#f59e0b';
          packetLabel = 'Gọi User Service';
          isUserError = true;
        } else if (pT < 0.7) {
          const p = easeInOut((pT - 0.4) / 0.3);
          packetX = userX - p * (userX - orderX);
          packetColor = '#22c55e';
          packetLabel = 'Bảo hiểm Fallback';
        } else {
          const p = easeInOut((pT - 0.7) / 0.3);
          packetX = orderX - p * (orderX - gwX);
          packetColor = '#22c55e';
          packetLabel = 'Khách dự phòng (200 OK)';
        }
        narrative = {
          stepTitle: 'Giai đoạn 2/2: Kích hoạt Fallback — Dữ liệu dự phòng mềm dẻo',
          badge: 'Bảo hiểm lỗi',
          action: 'Order Service chặn lỗi & trả về dữ liệu an toàn',
          desc: 'Hàm Fallback tự động can thiệp ngay tại Order Service, trả về đối tượng "Khách hàng dự phòng" với HTTP 200 OK.',
          resilience: 'Bảo toàn trải nghiệm mua sắm không bị gián đoạn (Graceful Degradation).',
          statusColor: '#22c55e',
          code: '200 OK (FALLBACK)'
        };
      }
    }
  }

  const currentMilestoneIndex = phaseMilestones.reduce((bestIdx, m, idx) => (
    currentTime >= m.time - 60 ? idx : bestIdx
  ), 0);

  function stepTo(targetTime) {
    stepTargetTimeRef.current = Math.max(0, Math.min(targetTime, totalDuration));
    isSteppingRef.current = true;
    lastTimeRef.current = performance.now();
    setIsPlaying(true);
  }

  function handleNextStep() {
    const current = animTimeRef.current;
    const next = phaseMilestones.find((m) => m.time > current + 60);
    if (next) {
      stepTo(next.time);
    } else if (current < totalDuration - 50) {
      stepTo(totalDuration);
    }
  }

  function handlePrevStep() {
    const current = animTimeRef.current;
    const prevList = phaseMilestones.filter((m) => m.time < current - 60);
    if (prevList.length > 0) {
      stepTo(prevList[prevList.length - 1].time);
    } else {
      stepTo(0);
    }
  }

  function toggleSpeed() {
    const newSpeed = speed === 1 ? 0.5 : 1;
    setSpeed(newSpeed);
    speedRef.current = newSpeed;
  }

  function handlePlayToggle() {
    isSteppingRef.current = false;
    stepTargetTimeRef.current = null;
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (currentTime >= totalDuration) {
        animTimeRef.current = 0;
        setCurrentTime(0);
      }
      setIsPlaying(true);
    }
  }

  function handleReset() {
    isSteppingRef.current = false;
    stepTargetTimeRef.current = null;
    setIsPlaying(false);
    animTimeRef.current = 0;
    setCurrentTime(0);
  }

  function jumpToMilestone(time) {
    stepTo(time);
  }

  return (
    <div className="flow-visualizer-container">
      {/* Top Controller Bar */}
      <div className="visualizer-header">
        <div className="visualizer-title">
          <Activity size={16} className={`pulse-icon ${isPlaying ? 'active' : ''}`} />
          <span>
            {isUnprotected
              ? '⚠️ MÔ PHỎNG SỰ CỐ KHI KHÔNG CÓ BẢO VỆ'
              : isProbeMode
              ? 'MÔ PHỎNG 2 LƯỢT THĂM DÒ (HALF-OPEN ➔ CLOSED)'
              : 'MÔ PHỎNG CHUYỂN ĐỘNG LIÊN TỤC (60 FPS)'}
          </span>
        </div>

        <div className="visualizer-controls">
          <span className="live-badge" style={{ color: narrative.statusColor, borderColor: narrative.statusColor }}>
            ● {narrative.code}
          </span>

          {/* Stepper Controls: Lướt tới/lùi từng diễn biến thật sự */}
          <div className="stepper-group" role="group" aria-label="Điều khiển từng bước">
            <button
              className="vis-btn stepper-btn"
              onClick={handlePrevStep}
              disabled={currentTime <= 20}
              title="Lướt lùi về diễn biến trước"
            >
              <ChevronLeft size={14} />
              <span>Lùi bước</span>
            </button>

            <span className="stepper-step-pill" title="Mốc diễn biến hiện tại">
              {phaseMilestones.length > 0 ? `Bước ${currentMilestoneIndex + 1}/${phaseMilestones.length}` : 'Bước 1/1'}
            </span>

            <button
              className="vis-btn stepper-btn"
              onClick={handleNextStep}
              disabled={currentTime >= totalDuration - 20}
              title="Lướt tiếp tới diễn biến sau"
            >
              <span>Tiếp theo</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Speed Toggle: 0.5x Chậm để thuyết trình vs 1.0x Chuẩn */}
          <button
            className={`vis-btn speed-btn ${speed < 1 ? 'slow-active' : ''}`}
            onClick={toggleSpeed}
            title={speed === 1 ? 'Chuyển sang 0.5x (Chậm để thuyết trình/giải thích)' : 'Chuyển về 1.0x (Tốc độ chuẩn)'}
          >
            <Gauge size={13} />
            <span>{speed === 1 ? '1.0x' : '🐢 0.5x Chậm'}</span>
          </button>

          <button
            className={`vis-btn play-btn ${isPlaying && !isSteppingRef.current ? 'active' : ''}`}
            onClick={handlePlayToggle}
            title={isPlaying ? 'Tạm dừng chuyển động' : 'Tự động chạy trọn vẹn'}
          >
            {isPlaying && !isSteppingRef.current ? <Pause size={13} /> : <Play size={13} />}
            <span>{isPlaying && !isSteppingRef.current ? 'Tạm dừng' : 'Tự chạy'}</span>
          </button>

          <button className="vis-btn" onClick={handleReset} title="Xem lại từ đầu">
            <RotateCcw size={13} />
            <span>Đặt lại</span>
          </button>
        </div>
      </div>

      {/* Fluid SVG Stage */}
      <div className="canvas-wrapper">
        <svg className="flow-canvas" viewBox="0 0 900 240" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="pipeGlow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.5" />
              <stop offset="50%" stopColor="#818cf8" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#c084fc" stopOpacity="0.5" />
            </linearGradient>
            <filter id="packetGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <pattern id="gridPattern" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1c183a" strokeWidth="1" />
            </pattern>
          </defs>

          {/* Background Grid Pattern */}
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
              <circle cx="0" cy="25" r="20" fill="#ef4444" />
              <text x="0" y="32" textAnchor="middle" fill="#fff" fontSize="17">✂️</text>
              <rect x="-55" y="-18" width="110" height="18" rx="4" fill="#1e1026" stroke="#ef4444" strokeWidth="1.2" />
              <text x="0" y="-5" textAnchor="middle" fill="#fca5a5" fontSize="11" fontWeight="bold">NGẮT TIMEOUT</text>
            </g>
          )}

          {/* Pipe 2 Blocked Barrier */}
          {pipe2Blocked && (
            <g transform="translate(628, 95)">
              <rect x="-16" y="0" width="32" height="50" rx="8" fill="#ef4444" opacity="0.95" />
              <text x="0" y="32" textAnchor="middle" fill="#fff" fontSize="19">⛔</text>
              <rect x="-80" y="-18" width="160" height="18" rx="4" fill="#1e1026" stroke="#ef4444" strokeWidth="1.2" />
              <text x="0" y="-5" textAnchor="middle" fill="#fca5a5" fontSize="11" fontWeight="bold">CHẶN FAIL-FAST (0 LƯỢT)</text>
            </g>
          )}

          {/* Bulkhead Slots and Barrier in Order */}
          {scenarioId === 'bulkhead' && !isUnprotected && (
            <g transform="translate(425, 58)">
              <rect x="0" y="4" width="48" height="25" rx="6" fill="#064e3b" stroke="#10b981" strokeWidth="1.5" />
              <text x="24" y="21" textAnchor="middle" fill="#6ee7b7" fontSize="11" fontWeight="bold">Slot 1</text>

              <rect x="0" y="34" width="48" height="25" rx="6" fill="#064e3b" stroke="#10b981" strokeWidth="1.5" />
              <text x="24" y="51" textAnchor="middle" fill="#6ee7b7" fontSize="11" fontWeight="bold">Slot 2</text>

              <rect x="0" y="64" width="48" height="25" rx="6" fill="#064e3b" stroke="#10b981" strokeWidth="1.5" />
              <text x="24" y="81" textAnchor="middle" fill="#6ee7b7" fontSize="11" fontWeight="bold">Slot 3</text>

              <rect x="0" y="94" width="48" height="24" rx="6" fill="#7f1d1d" stroke="#ef4444" strokeWidth="1.5" />
              <text x="24" y="110" textAnchor="middle" fill="#fca5a5" fontSize="11" fontWeight="bold">🛡️ Chặn 429</text>
            </g>
          )}
          {scenarioId === 'bulkhead' && isUnprotected && (
            <g transform="translate(425, 65)">
              <rect x="0" y="0" width="48" height="85" rx="6" fill="#450a0a" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="3,3" />
              <text x="24" y="24" textAnchor="middle" fill="#fca5a5" fontSize="10" fontWeight="bold">KHÔNG</text>
              <text x="24" y="42" textAnchor="middle" fill="#fca5a5" fontSize="10" fontWeight="bold">CHẶN</text>
              <text x="24" y="64" textAnchor="middle" fill="#f87171" fontSize="16">⚠️</text>
            </g>
          )}

          {/* Node 1: API Gateway */}
          <g transform="translate(60, 65)">
            <rect x="0" y="0" width="140" height="110" rx="14" fill="#18143d" stroke="#4338ca" strokeWidth="2.5" />
            <circle cx="70" cy="35" r="22" fill="#29235e" />
            <text x="70" y="43" textAnchor="middle" fill="#818cf8" fontSize="22">🌐</text>
            <text x="70" y="75" textAnchor="middle" fill="#ffffff" fontSize="15" fontWeight="bold">API Gateway</text>
            <text x="70" y="94" textAnchor="middle" fill="#cbd5e1" fontSize="12" fontWeight="600">:8080 · Client</text>
          </g>

          {/* Node 2: Order Service */}
          <g transform="translate(345, 45)">
            <rect
              x="0" y="0" width="210" height="150" rx="16"
              fill="#14112e"
              stroke={isUnprotected ? '#ef4444' : '#6366f1'}
              strokeWidth={isUnprotected ? '3' : '2.5'}
            />
            <rect x="15" y="10" width="180" height="28" rx="8" fill={isUnprotected ? '#38121a' : '#221d4c'} />
            <text x="105" y="29" textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="bold">
              {isUnprotected ? '⚠️ Order Service (:8082)' : '📦 Order Service (:8082)'}
            </text>

            {/* Inner Guard Box */}
            <g transform="translate(20, 48)">
              <rect
                x="0" y="0" width="170" height="84" rx="10"
                fill={isUnprotected ? '#260f15' : '#0d0a21'}
                stroke={isUnprotected ? '#ef4444' : '#312a66'}
                strokeWidth={isUnprotected ? '2' : '1.2'}
                strokeDasharray={isUnprotected ? '4,3' : 'none'}
              />

              {isUnprotected ? (
                <>
                  {scenarioId === 'timeout' && (
                    <>
                      <text x="85" y="26" textAnchor="middle" fill="#ef4444" fontSize="13" fontWeight="bold">❌ KHÔNG TIMEOUT</text>
                      <text x="85" y="46" textAnchor="middle" fill="#fca5a5" fontSize="11" fontWeight="600">Treo luồng suốt 4s</text>
                      <text x="85" y="66" textAnchor="middle" fill="#f87171" fontSize="11" fontWeight="bold">🚨 Cạn Connection Pool</text>
                    </>
                  )}
                  {scenarioId === 'retry' && (
                    <>
                      <text x="85" y="26" textAnchor="middle" fill="#ef4444" fontSize="13" fontWeight="bold">❌ KHÔNG CÓ RETRY</text>
                      <text x="85" y="46" textAnchor="middle" fill="#fca5a5" fontSize="11" fontWeight="600">Chỉ thử đúng 1 lần</text>
                      <text x="85" y="66" textAnchor="middle" fill="#f87171" fontSize="11" fontWeight="bold">💥 Sập giao dịch ngay 500</text>
                    </>
                  )}
                  {scenarioId === 'bulkhead' && (
                    <>
                      <text x="85" y="26" textAnchor="middle" fill="#ef4444" fontSize="13" fontWeight="bold">❌ KHÔNG BULKHEAD</text>
                      <text x="85" y="46" textAnchor="middle" fill="#fca5a5" fontSize="11" fontWeight="600">Không giới hạn slot</text>
                      <text x="85" y="66" textAnchor="middle" fill="#f87171" fontSize="11" fontWeight="bold">🚨 10/10 Threads Cạn Kiệt</text>
                    </>
                  )}
                  {scenarioId === 'breaker' && (
                    <>
                      <text x="85" y="26" textAnchor="middle" fill="#ef4444" fontSize="13" fontWeight="bold">❌ KHÔNG CIRCUIT BREAKER</text>
                      <text x="85" y="46" textAnchor="middle" fill="#fca5a5" fontSize="11" fontWeight="600">Cầu dao đóng mù quáng</text>
                      <text x="85" y="66" textAnchor="middle" fill="#f87171" fontSize="11" fontWeight="bold">💥 0 Fail-Fast · 6/6 Lỗi</text>
                    </>
                  )}
                </>
              ) : (
                <>
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
                      <text x="85" y="21" textAnchor="middle" fill="#f59e0b" fontSize="11" fontWeight="bold">4 Lượt · 2 Lớp Timeout</text>
                      <text x="85" y="38" textAnchor="middle" fill="#cbd5e1" fontSize="10" fontWeight="600">1. Không Timeout (Chờ 4s)</text>
                      <text x="85" y="54" textAnchor="middle" fill="#fca5a5" fontSize="10" fontWeight="bold">Mạng: Feign 3s · Rest 2.5s</text>
                      <text x="85" y="70" textAnchor="middle" fill="#f472b6" fontSize="10" fontWeight="bold">App: TimeLimiter (1.5s)</text>
                    </>
                  )}
                  {scenarioId === 'retry' && (
                    <>
                      <text x="85" y="28" textAnchor="middle" fill="#38bdf8" fontSize="12" fontWeight="bold">🔄 Retry (R4j &amp; Spring)</text>
                      <text x="85" y="48" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600">Tối đa 3 lần · Nghỉ tăng dần</text>
                      <text x="85" y="68" textAnchor="middle" fill="#4ade80" fontSize="12" fontWeight="bold">Tự cứu ở lần 3</text>
                    </>
                  )}
                  {scenarioId === 'bulkhead' && (
                    <>
                      <text x="85" y="28" textAnchor="middle" fill="#c084fc" fontSize="13" fontWeight="bold">🛡️ Bulkhead</text>
                      <text x="85" y="48" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600">Hạn ngạch 3 slots</text>
                      <text x="85" y="68" textAnchor="middle" fill="#fca5a5" fontSize="12" fontWeight="bold">7 Lượt bị dội 429</text>
                    </>
                  )}
                  {scenarioId === 'breaker' && (
                    <>
                      <text x="85" y="56" textAnchor="middle" fill={leverAngle > 20 ? '#ef4444' : leverAngle > 0 ? '#f59e0b' : '#10b981'} fontSize="13" fontWeight="bold">
                        Cầu dao: {leverAngle > 20 ? 'OPEN 🔴' : leverAngle > 0 ? 'HALF-OPEN 🟡' : 'CLOSED 🟢'}
                      </text>
                      <text x="85" y="73" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600">
                        {leverAngle > 20 ? 'Fail-Fast 14ms (503)' : leverAngle > 0 ? '2 Lượt thăm dò' : 'Cho phép lưu thông'}
                      </text>
                    </>
                  )}
                  {scenarioId === 'converge' && (
                    <>
                      <text x="85" y="56" textAnchor="middle" fill="#818cf8" fontSize="12" fontWeight="bold">4 Tầng lồng nhau</text>
                      <text x="85" y="73" textAnchor="middle" fill="#34d399" fontSize="11" fontWeight="600">Retry ➔ CB ➔ Bulkhead ➔ Feign</text>
                    </>
                  )}
                  {scenarioId === 'normal' && (
                    <>
                      <text x="85" y="36" textAnchor="middle" fill="#22c55e" fontSize="13" fontWeight="bold">✅ OpenFeign Chuẩn</text>
                      <text x="85" y="58" textAnchor="middle" fill="#cbd5e1" fontSize="12" fontWeight="600">Giao tiếp trực tiếp</text>
                    </>
                  )}
                  {scenarioId === 'fallback' && (
                    <>
                      <text x="85" y="32" textAnchor="middle" fill="#22c55e" fontSize="13" fontWeight="bold">🛡️ Fallback Active</text>
                      <text x="85" y="52" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600">Bảo hiểm sự cố</text>
                      <text x="85" y="70" textAnchor="middle" fill="#38bdf8" fontSize="11" fontWeight="bold">Trả dữ liệu dự phòng</text>
                    </>
                  )}
                </>
              )}
            </g>
          </g>

          {/* Node 3: User Service */}
          <g transform="translate(700, 65)">
            <rect
              x="0" y="0" width="140" height="110" rx="14"
              fill="#181329"
              stroke={isUserError ? '#e11d48' : '#10b981'}
              strokeWidth="2.5"
            />
            <circle cx="70" cy="35" r="22" fill={isUserError ? '#3d1624' : '#133526'} />
            <text x="70" y="43" textAnchor="middle" fill={isUserError ? '#f43f5e' : '#34d399'} fontSize="22">
              {isUserError ? '⚠️' : '👤'}
            </text>
            <text x="70" y="75" textAnchor="middle" fill="#ffffff" fontSize="15" fontWeight="bold">User Service</text>
            <text x="70" y="94" textAnchor="middle" fill="#cbd5e1" fontSize="12" fontWeight="600">
              {isUserError ? 'Giả lập sự cố (:8081)' : 'Bình thường (:8081)'}
            </text>
          </g>

          {/* Station Countdown Ring */}
          {stationRing && (
            <g transform={`translate(${stationRing.x}, ${stationRing.y})`}>
              <circle cx="0" cy="0" r="30" fill="none" stroke="#f59e0b44" strokeWidth="5" />
              <circle
                cx="0" cy="0" r="30" fill="none" stroke="#f59e0b" strokeWidth="5"
                strokeDasharray={`${stationRing.progress * 188} 188`}
                transform="rotate(-90)"
              />
              <rect x="-30" y="-10" width="60" height="20" rx="4" fill="#0b081d" opacity="0.9" />
              <text x="0" y="4" textAnchor="middle" fill="#fef08a" fontSize="12" fontWeight="bold">
                {stationRing.label}
              </text>
            </g>
          )}

          {/* Multiple Particles (Bulkhead) */}
          {multiPackets && multiPackets.map((p, idx) => (
            <g key={idx} transform={`translate(${p.x}, ${p.y})`} filter="url(#packetGlow)">
              <circle cx="0" cy="0" r="8" fill={p.color} />
              <circle cx="0" cy="0" r="3" fill="#ffffff" />
              <g transform="translate(0, -14)">
                <rect x="-24" y="-8" width="48" height="15" rx="3" fill="#0b081d" stroke={p.color} strokeWidth="1" />
                <text x="0" y="3" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold">{p.label}</text>
              </g>
            </g>
          ))}

          {/* Single Continuous Packet */}
          {packetVisible && (
            <g transform={`translate(${packetX}, ${packetY})`} filter="url(#packetGlow)">
              <circle cx="0" cy="0" r="14" fill={packetColor} className={isPlaying ? 'pulsing-packet' : ''} />
              <circle cx="0" cy="0" r="6" fill="#ffffff" />
              {/* Opaque high-contrast badge behind label for 100% legibility */}
              <g transform="translate(0, -25)">
                <rect x="-70" y="-12" width="140" height="20" rx="6" fill="#0c0924" stroke={packetColor} strokeWidth="1.5" />
                <text x="0" y="2" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="bold">
                  {packetLabel}
                </text>
              </g>
            </g>
          )}
        </svg>
      </div>

      {/* Live Narrative Card */}
      <div className="flow-explanation-card">
        <div className="step-badge-row">
          <span className="step-pill" style={{ backgroundColor: narrative.statusColor + '25', color: narrative.statusColor, borderColor: narrative.statusColor }}>
            {narrative.badge}
          </span>
          <span className="step-action-tag">
            <ArrowRight size={13} /> {narrative.action}
          </span>
        </div>

        <h4 className="step-title" style={{ color: '#ffffff', margin: '4px 0 6px 0', fontSize: '0.98rem' }}>
          {narrative.stepTitle}
        </h4>

        <p className="step-desc" style={{ fontSize: '0.86rem', color: '#f1f5f9', lineHeight: 1.55, margin: '0 0 8px 0' }}>
          {narrative.desc}
        </p>

        <div className="step-resilience-box" style={{ borderLeftColor: narrative.statusColor, padding: '7px 11px', fontSize: '0.78rem' }}>
          <strong>Nguyên lý & Ý nghĩa kiên cường:</strong> {narrative.resilience}
        </div>

        {/* Milestone Navigation Chips */}
        <div className="step-dots" style={{ marginTop: '10px' }}>
          <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 700, marginRight: '4px' }}>Tua tới mốc:</span>
          {phaseMilestones.map((m, idx) => (
            <button
              key={m.name}
              className={`step-dot ${t >= m.time && (idx === phaseMilestones.length - 1 || t < phaseMilestones[idx + 1].time) ? 'active' : ''}`}
              style={{ width: 'auto', padding: '3px 8px', borderRadius: '6px', fontSize: '0.7rem' }}
              onClick={() => jumpToMilestone(m.time)}
              title={`Nhảy tới ${m.name}`}
            >
              {m.name}
            </button>
          ))}
          {!isPlaying && t === 0 && (
            <span style={{ fontSize: '0.75rem', color: '#818cf8', marginLeft: '8px', fontWeight: 600 }}>
              (Chưa chạy · Bấm &quot;{actionLabel}&quot; ở trên để bắt đầu)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
