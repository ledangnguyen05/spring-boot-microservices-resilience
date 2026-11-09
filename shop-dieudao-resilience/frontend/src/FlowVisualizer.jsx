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
  isUnprotected = false,
  retryFailCount = 2,
  externalJump = null,
  onActiveCallChange = null
}) {
  // STRICT RULE: isPlaying is FALSE initially! It NEVER moves until user clicks!
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1); // 1 (Chuẩn) | 0.5 (Chậm) | 0.25 (Rất chậm)

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

  // When switching scenario, mode or retry fail preset: strictly STOP, reset to 0
  useEffect(() => {
    setIsPlaying(false);
    isSteppingRef.current = false;
    stepTargetTimeRef.current = null;
    animTimeRef.current = 0;
    setCurrentTime(0);
  }, [scenarioId, scenarioMode, retryFailCount]);

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

  // External jump from clicking Chặng 1..5 cards in App
  useEffect(() => {
    if (externalJump && typeof externalJump.time === 'number') {
      const clamped = Math.max(0, Math.min(externalJump.time, 38000));
      animTimeRef.current = clamped;
      setCurrentTime(clamped);
      isSteppingRef.current = false;
      stepTargetTimeRef.current = null;
      setIsPlaying(false);
    }
  }, [externalJump]);

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
            // Gliding forward smoothly to milestone while respecting selected speed
            const stepDelta = Math.max(delta * 1.4, 0.5);
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
            const stepDelta = Math.max(delta * 1.6, 0.5);
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
    else if (scenarioId === 'breaker') totalDuration = 10200;
  } else {
    if (scenarioId === 'timeout') totalDuration = 12500; // 4 runs: Direct (4s) -> Feign 3s -> RestClient 2.5s -> TimeLimiter 1.5s
    else if (scenarioId === 'retry') totalDuration = retryFailCount === 1 ? 8200 : 12000;
    else if (scenarioId === 'bulkhead') totalDuration = 6000;
    else if (scenarioId === 'breaker') totalDuration = isProbeMode ? 6500 : 11400;
    else if (scenarioId === 'converge') totalDuration = 38000;
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
  let cbSubLabel = 'Cho phép lưu thông';
  let cbUnprotectedSubLabel = '💥 0 Fail-Fast · 6/6 Lỗi';
  let convergePipeline = null;
  let activeBreakerRow = null;

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
      phaseMilestones = retryFailCount === 1
        ? [
            { name: '1. Gửi yêu cầu', time: 0 },
            { name: '2. Thử lần 1 (500)', time: 1200 },
            { name: '3. Nghỉ 500ms', time: 3200 },
            { name: '4. Thử lần 2 (200 OK!)', time: 4600 },
            { name: '5. Trả về Client', time: 6900 }
          ]
        : [
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
            stepTitle: `Bước ${retryFailCount === 1 ? '1/4' : '1/5'}: Lần gọi 1 — User Service báo lỗi tạm thời (HTTP 500)`,
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
            stepTitle: `Bước ${retryFailCount === 1 ? '1/4' : '1/5'}: Lần 1 thất bại — Giữ lỗi ở Order Service để thử lại`,
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
            stepTitle: `Bước ${retryFailCount === 1 ? '2/4' : '2/5'}: Nghỉ ngắn 500ms trước khi thử lại (Exponential Backoff)`,
            badge: 'Giãn nhịp nghỉ',
            action: 'Tạm dừng 500ms chờ bên kia ổn định lại',
            desc: 'Hệ thống không gọi dồn dập ngay lập tức mà nghỉ 500ms để User Service kịp hoàn tất khởi động hoặc qua cơn nghẽn.',
            resilience: 'Giãn nhịp nghỉ giúp tránh tình trạng hàng nghìn người cùng thử lại một lúc gây quá tải thêm.',
            statusColor: '#f59e0b',
            code: 'NGHỈ 500ms'
          };
        } else if (retryFailCount === 1) {
          if (t < 5800) {
            const p = easeInOut((t - 4600) / 1200);
            packetX = orderX + p * (userX - orderX);
            packetColor = '#22c55e';
            packetLabel = 'Lần 2: Thành công ngay ✅';
            narrative = {
              stepTitle: 'Bước 3/4: Thử lại lần đầu (#2) — Thành công luôn (HTTP 200 OK)!',
              badge: 'Thành công ngay lần #2',
              action: 'Lần 2 User Service đã khỏe ➔ trả về 200 OK',
              desc: 'Sau khi nghỉ 500ms, Order Service gọi lại lần #2 (lần retry đầu tiên). User Service đã hồi phục và trả về 200 OK ngay nên hệ thống DỪNG luôn, không chờ 1000ms hay gọi lần 3!',
              resilience: 'Retry thông minh: Thành công ở lần nào là trả kết quả ngay ở lần đó, không chạy thừa.',
              statusColor: '#22c55e',
              code: 'LẦN 2: 200 OK'
            };
          } else if (t < 6900) {
            const p = easeInOut((t - 5800) / 1100);
            packetX = userX - p * (userX - orderX);
            packetColor = '#22c55e';
            packetLabel = '200 OK (Dữ liệu khách)';
            narrative = {
              stepTitle: 'Nhận dữ liệu — Order Service ghép thông tin đơn hàng',
              badge: 'Đủ dữ liệu',
              action: 'User Service trả họ tên, địa chỉ về Order Service',
              desc: 'Order Service nhận được thông tin khách hàng ngay sau lần thử lại đầu tiên.',
              resilience: 'Tổng thời gian chỉ mất ~515ms thay vì ~1.520ms.',
              statusColor: '#22c55e',
              code: 'GHÉP DỮ LIỆU'
            };
          } else {
            const p = easeInOut((t - 6900) / 1300);
            packetX = orderX - p * (orderX - gwX);
            packetColor = '#22c55e';
            packetLabel = 'HTTP 200 OK ✅';
            narrative = {
              stepTitle: 'Bước 4/4: Hoàn tất — Trả kết quả thành công về cho khách hàng',
              badge: 'Xong ngay ở lần #2',
              action: 'Trả đơn hàng đầy đủ kèm HTTP 200 OK (~515ms)',
              desc: 'Chỉ mất 2 lần gọi và 1 lần nghỉ 500ms. Kết thúc ngay khi thành công!',
              resilience: 'Giảm thiểu thời gian chờ tối đa cho người dùng.',
              statusColor: '#22c55e',
              code: 'HTTP 200 OK'
            };
          }
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
  // SCENARIO 4: BULKHEAD (10 Concurrent Calls · Safe Capacity = 3)
  // ==========================================
  else if (scenarioId === 'bulkhead') {
    const getWaitX = (idx) => (idx % 2 === 0 ? 236 : 306);
    const getWaitY = (idx) => 38 + Math.floor(idx / 2) * 40;
    const getPipe2X = (idx) => (idx % 2 === 0 ? 590 : 664);
    const getPipe2Y = (idx) => 38 + Math.floor(idx / 2) * 40;
    const getAccPipe2Y = (idx) => 58 + idx * 62;

    if (isUnprotected) {
      phaseMilestones = [
        { name: '1. 10 lượt cùng ập vào cửa', time: 0 },
        { name: '2. Không ai chặn ➔ 10/10 chen qua', time: 2300 },
        { name: '3. Vỡ ngưỡng ➔ Sập 10× 503 💥', time: 4000 },
        { name: '4. Tổng kết: 0/10 thành công 🚨', time: 5800 }
      ];

      if (t > 0 || isPlaying) {
        packetVisible = false;
        isUserError = t >= 2600;
        const p10 = [];

        // Không có Bulkhead: CẢ 10/10 chen qua Order Service cùng lúc (vượt ngưỡng 3 chỗ) -> sập chùm 10x 503!
        for (let i = 0; i < 10; i++) {
          const colIdx = i % 2;
          const startX = colIdx === 0 ? 226 : 292;
          const waitX = getWaitX(i);
          const waitY = getWaitY(i);
          const pipe2X = getPipe2X(i);
          const pipe2Y = getPipe2Y(i);
          let px, py, col, lbl;

          if (t < 800) {
            const p = easeInOut(t / 800);
            px = startX + p * (waitX - startX);
            py = waitY;
            col = '#f97316';
            lbl = `#${i + 1}`;
          } else if (t < 2300) {
            const p = easeInOut((t - 800) / 1450);
            px = waitX + Math.min(1, p) * (pipe2X - waitX);
            py = waitY + Math.min(1, p) * (pipe2Y - waitY);
            col = '#f59e0b';
            lbl = `#${i + 1}·Vào`;
          } else if (t < 3100) {
            const p = easeInOut((t - 2300) / 800);
            px = pipe2X + p * (694 - pipe2X);
            py = pipe2Y;
            col = p > 0.45 ? '#ef4444' : '#f59e0b';
            lbl = p > 0.45 ? `#${i + 1}:503` : `#${i + 1}·Quá tải`;
          } else if (t < 4000) {
            const p = easeInOut((t - 3100) / 850);
            px = 694 - Math.min(1, p) * (694 - pipe2X);
            py = pipe2Y;
            col = '#ef4444';
            lbl = `#${i + 1}:503`;
          } else if (t < 5800) {
            const p = easeInOut(Math.min(1, (t - 4000) / 1650));
            px = pipe2X - p * (pipe2X - waitX);
            py = pipe2Y + p * (waitY - pipe2Y);
            col = '#ef4444';
            lbl = `#${i + 1}:503`;
          } else {
            px = waitX;
            py = waitY;
            col = '#ef4444';
            lbl = `#${i + 1}:503`;
          }
          p10.push({ x: px, y: py, color: col, label: lbl });
        }
        multiPackets = p10;

        if (t < 1200) {
          narrative = {
            stepTitle: 'Bước 1/4: 10 lượt tra cứu User chậm (2s) cùng ập vào cửa Order Service',
            badge: 'Không có Bulkhead',
            action: 'Cả 10/10 lượt chuẩn bị tràn qua cùng lúc (ngưỡng an toàn chỉ 3 chỗ)',
            desc: 'Nhánh gọi User Service chỉ gánh an toàn tối đa 3 cuộc gọi đồng thời. Nhưng hiện không có Bulkhead đứng gác giới hạn ở Order Service!',
            resilience: 'Vì không có người gác cửa, tất cả 10 lượt sắp đồng loạt tràn qua đường ống sang User Service.',
            statusColor: '#f97316',
            code: 'KHÔNG AI CHẶN'
          };
        } else if (t < 2900) {
          narrative = {
            stepTitle: 'Bước 2/4: Cả 10/10 lượt chen qua cùng lúc — Vượt gấp 3,3× ngưỡng an toàn!',
            badge: 'Tràn 10 / 3 luồng',
            action: 'Tất cả 10 lượt cùng dồn sang User Service (0 lượt bị cản bớt)',
            desc: 'Trái với lúc có Bulkhead (chỉ cho 3 lượt qua), khi KHÔNG có Bulkhead thì toàn bộ 10/10 lượt cùng ập sang User Service và tranh chấp kết nối cùng một thời điểm!',
            resilience: 'Ngưỡng an toàn chỉ 3 luồng nhưng thực tế bị nhồi tới 10 luồng đồng thời — thảm họa sắp xảy ra!',
            statusColor: '#f59e0b',
            code: '10/3 LUỒNG TRÀN'
          };
        } else if (t < 4600) {
          narrative = {
            stepTitle: 'Bước 3/4: VỠ NGƯỠNG QUÁ TẢI TẬP THỂ — Cả 10/10 lượt sập HTTP 503 💥',
            badge: 'Chết chùm 10/10',
            action: 'User Service quá tải nghẽn kết nối ➔ Trả lỗi HTTP 503 cho cả 10 lượt',
            desc: 'Khi cả 10 lượt cùng dồn ép vượt ngưỡng 3 chỗ, đường truyền & kết nối bị nghẽn sập dây chuyền: không một lượt nào hoàn thành trơn tru — cả 10/10 đều bật ngược HTTP 503!',
            resilience: 'Thay vì giữ 3 người an toàn và mời 7 người chờ (429), việc thả cửa cho tất cả vào khiến cả 10 đều sập chung!',
            statusColor: '#ef4444',
            code: 'SẬP 10/10 (503) 💥'
          };
        } else {
          narrative = {
            stepTitle: 'Bước 4/4: Tổng kết khi thiếu Bulkhead — 0/10 thành công · Sập 10× HTTP 503!',
            badge: 'Hậu quả thực tế',
            action: 'Tra cứu User: 0× 200 OK · 10× 503 (Vỡ ngưỡng quá tải)',
            desc: 'Tất cả 10/10 lượt đều hiện đỏ HTTP 503 vì không có giới hạn đồng thời. Máy chủ vừa tốn công gửi cả 10 cuộc gọi sang User Service, vừa không cứu được lượt nào!',
            resilience: 'Bài học: Luôn đặt Bulkhead (maxConcurrentCalls = 3) để giữ 3/3 sống sót 200 OK và chặn nhanh 429 phần thừa.',
            statusColor: '#ef4444',
            code: '0/10 THÀNH CÔNG'
          };
        }
      }
    } else {
      phaseMilestones = [
        { name: '1. 10 lượt ập vào cửa', time: 0 },
        { name: '2. Giữ 3 (#1–#3) · Chặn 7 (429)', time: 2300 },
        { name: '3. 3 lượt qua User xong 200 OK ✅', time: 4000 },
        { name: '4. Hoàn tất · Hệ thống an toàn 🛡️', time: 5800 }
      ];

      if (t > 0 || isPlaying) {
        packetVisible = false;
        const p10 = [];

        for (let i = 0; i < 10; i++) {
          const isAccepted = i < 3;
          const colIdx = i % 2;
          const startX = colIdx === 0 ? 226 : 292;
          const waitX = getWaitX(i);
          const waitY = getWaitY(i);
          let px, py, col, lbl;

          if (t < 800) {
            const p = easeInOut(t / 800);
            px = startX + p * (waitX - startX);
            py = waitY;
            col = '#818cf8';
            lbl = `#${i + 1}`;
          } else if (isAccepted) {
            const accY = getAccPipe2Y(i);
            if (t < 2300) {
              const p = easeInOut(Math.min(1, (t - 800) / 1450));
              px = waitX + p * (628 - waitX);
              py = waitY + p * (accY - waitY);
              col = '#22c55e';
              lbl = `#${i + 1}·Vào ${i + 1}/3`;
            } else if (t < 3150) {
              const p = easeInOut((t - 2300) / 850);
              px = 628 + p * (735 - 628);
              py = accY;
              col = '#22c55e';
              lbl = `#${i + 1}·Chạy`;
            } else if (t < 4000) {
              const p = easeInOut(Math.min(1, (t - 3150) / 800));
              px = 735 - p * (735 - 628);
              py = accY;
              col = '#22c55e';
              lbl = `#${i + 1}:200 OK`;
            } else if (t < 5800) {
              const p = easeInOut(Math.min(1, (t - 4000) / 1650));
              px = 628 - p * (628 - waitX);
              py = accY + p * (waitY - accY);
              col = '#22c55e';
              lbl = `#${i + 1}:200 ✅`;
            } else {
              px = waitX;
              py = waitY;
              col = '#22c55e';
              lbl = `#${i + 1}:200 ✅`;
            }
          } else {
            if (t < 2300) {
              const p = easeInOut(Math.min(1, (t - 800) / 1450));
              // Chạm nhẹ mép chặn bên trái cửa Order rồi dội về ô gọn gàng
              const arc = Math.sin(p * Math.PI) * 8;
              px = waitX + arc;
              py = waitY;
              col = p > 0.35 ? '#ef4444' : '#818cf8';
              lbl = p > 0.35 ? `#${i + 1}:429` : `#${i + 1}`;
            } else {
              px = waitX;
              py = waitY;
              col = '#ef4444';
              lbl = `#${i + 1}:429`;
            }
          }
          p10.push({ x: px, y: py, color: col, label: lbl });
        }
        multiPackets = p10;

        if (t < 1200) {
          narrative = {
            stepTitle: 'Bước 1/4: 10 lượt tra cứu User chậm (2s) cùng ập vào cửa Order Service',
            badge: 'Lưu lượng tăng vọt',
            action: '10 lượt đồng loạt tiến tới cổng Bulkhead (tối đa 3 chỗ)',
            desc: 'Cả 10 lượt đến cùng một thời điểm. Khác với lúc thả nổi, giờ đã có Bulkhead đứng gác với giới hạn nghiêm ngặt maxConcurrentCalls = 3.',
            resilience: 'Bulkhead chỉ cấp đúng 3 vé qua đường ống sang User Service, không để quá tải tập thể xảy ra.',
            statusColor: '#6366f1',
            code: 'TỐI ĐA 3 CHỖ'
          };
        } else if (t < 2900) {
          narrative = {
            stepTitle: 'Bước 2/4: Bulkhead giữ đúng #1–#3 qua User · Chặn nhanh #4–#10 (429)',
            badge: 'Kiểm soát đồng thời',
            action: '3 lượt đầu (#1–#3) sang User Service · 7 lượt thừa nhận 429 (~5ms)',
            desc: 'Ai đến trước (#1, #2, #3) được cấp 3 suất an toàn đi qua. 7 lượt còn lại (#4–#10) bị từ chối nhanh HTTP 429 ngay tại Order Service với 0 lần gọi qua User Service!',
            resilience: 'Giữ User Service nằm gọn trong ngưỡng chịu tải 3 luồng và giữ tài nguyên server Order Service luôn rảnh.',
            statusColor: '#f59e0b',
            code: '3 VÀO · 7× 429'
          };
        } else if (t < 4600) {
          narrative = {
            stepTitle: 'Bước 3/4: Cả 3/3 lượt được nhận đều xử lý thành công HTTP 200 OK ✅',
            badge: 'Cứu sống 3/3 suất vào',
            action: 'User Service phục vụ mượt 3 luồng ➔ Trả dữ liệu 200 OK',
            desc: 'Vì không bị 10 lượt tràn vào bóp nghẹt, User Service xử lý trơn tru cả 3 lượt (#1, #2, #3) sau 2 giây và trả HTTP 200 OK đầy đủ.',
            resilience: 'So với 0/10 thành công lúc thiếu Bulkhead, cơ chế giới hạn 3 chỗ giúp hệ thống vẫn phục vụ ổn định trong cơn bão tải!',
            statusColor: '#10b981',
            code: '3/3 XONG 200 ✅'
          };
        } else {
          narrative = {
            stepTitle: 'Bước 4/4: Hoàn tất an toàn — 3× 200 OK (#1–#3) · 7× 429 (#4–#10)',
            badge: 'Hệ thống đứng vững 🛡️',
            action: 'Sống 3 lượt (#1–#3 = 200 OK) · Chặn gọn 7 lượt thừa (429)',
            desc: 'Kết quả rõ ràng: 3 lượt nằm trong ngưỡng an toàn đều thành công 200 OK, 7 lượt vượt trần bị từ chối lịch sự 429 trong ~5ms — bảo toàn cả User Service lẫn phần tài nguyên còn lại của Order Service.',
            resilience: 'Đúng tinh thần "vách ngăn khoang tàu" (Bulkhead Pattern): chấp nhận từ chối phần thừa để cứu con tàu không chìm.',
            statusColor: '#22c55e',
            code: '3× 200 · 7× 429'
          };
        }
      }
    }
  }

  // =========================================================================
  // SCENARIO 5: CIRCUIT BREAKER (6 CALLS ONE-BY-ONE OR DEDICATED 2 PROBES)
  // =========================================================================
  else if (scenarioId === 'breaker') {
    if (isUnprotected) {
      phaseMilestones = [
        { name: '1. Lượt #1 ➔ Lỗi', time: 0 },
        { name: '2. Lượt #2 ➔ Lỗi', time: 1500 },
        { name: '3. Lượt #3 ➔ Lỗi', time: 3000 },
        { name: '4. Lượt #4 ➔ Lỗi', time: 4500 },
        { name: '5. Lượt #5 ➔ Lỗi', time: 6000 },
        { name: '6. Lượt #6 (Vẫn gọi!)', time: 7500 },
        { name: '7. Tổng kết 6/6 Lỗi', time: 9000 }
      ];

      if (t > 0 || isPlaying) {
        leverAngle = 0;
        pipe2Blocked = false;
        isUserError = true;

        if (t < 9000) {
          const callIdx = Math.min(5, Math.floor(t / 1500));
          const subT = (t - callIdx * 1500) / 1500;
          const callNo = callIdx + 1;
          activeBreakerRow = callIdx;

          if (subT < 0.5) {
            const p = easeInOut(subT * 2);
            packetX = gwX + p * (userX - gwX);
            packetColor = callNo === 6 ? '#f97316' : '#ef4444';
            packetLabel = callNo === 6 ? 'Lượt 6/6: Vẫn gửi sang User!' : `Lượt ${callNo}/6: Gửi qua mạng`;
          } else {
            const p = easeInOut((subT - 0.5) * 2);
            packetX = userX - p * (userX - gwX);
            packetColor = '#ef4444';
            packetLabel = `Lượt ${callNo}/6: Lỗi 502 💥`;
          }

          const failedCount = subT >= 0.5 ? callNo : callIdx;
          cbUnprotectedSubLabel = callNo < 6
            ? `Gọi thật: ${failedCount}/6 lỗi (Không ngắt)`
            : '⚠️ Lượt 6 vẫn sang User Service!';

          if (callNo <= 5) {
            narrative = {
              stepTitle: `Bước ${callNo}/7 (Dòng ${callNo} trên bảng): Lượt #${callNo}/6 gửi thẳng sang User Service đang hỏng`,
              badge: `Lượt ${callNo}/6 · Lỗi`,
              action: `Chưa có cầu dao ➔ vẫn gửi qua mạng (${failedCount}/5 mẫu lỗi)`,
              desc: `Yêu cầu thứ ${callNo} đi từ Gateway ➔ Order ➔ User Service đang hỏng 100% và trả về HTTP 502. ${callNo === 5 ? 'Đã đủ 5/5 lượt lỗi (100%), nhưng vì KHÔNG có Circuit Breaker nên mạch vẫn đóng!' : 'Hệ thống không có cầu dao đếm lỗi.'}`,
              resilience: callNo >= 3
                ? 'Nếu có Circuit Breaker, hệ thống đang tích lũy số mẫu lỗi trong cửa sổ trượt để chuẩn bị ngắt.'
                : 'Lỗi 5xx cứ thế lặp đi lặp lại ở từng lượt gọi.',
              statusColor: '#ef4444',
              code: `LƯỢT ${callNo}/6: LỖI 502`
            };
          } else {
            narrative = {
              stepTitle: 'Bước 6/7 (Dòng 6 trên bảng): Không có cầu dao — Lượt #6 VẪN CỐ gọi sang dịch vụ chết!',
              badge: 'Không Fail-Fast',
              action: 'Lượt #6 vẫn đi xuyên qua Pipe 2 tới User Service đang hỏng',
              desc: 'So sánh: Khi CÓ Circuit Breaker, lượt #6 bị chặn ngay ở cửa Order Service (0 lần gọi User). Còn khi KHÔNG có bảo vệ, lượt #6 vẫn tốn công đi hết đường mạng sang User Service và nhận lỗi 502!',
              resilience: 'Làm nặng thêm sự cố: Mọi request mới tiếp tục dội tải vào dịch vụ đang kiệt quệ.',
              statusColor: '#ef4444',
              code: 'LƯỢT 6: KHÔNG CHẶN'
            };
          }
        } else {
          activeBreakerRow = 5;
          packetX = gwX;
          packetColor = '#ef4444';
          packetLabel = '6/6 THẤT BẠI 💥';
          cbUnprotectedSubLabel = '💥 0 Fail-Fast · 6/6 Gọi thật';
          narrative = {
            stepTitle: 'Bước 7/7: Tổng kết — Cả 6/6 lượt đều gọi thật sang dịch vụ đang sập',
            badge: 'Làm nặng thêm lỗi',
            action: '0 Fail-Fast · Tốn 6 lần gọi mạng vô ích',
            desc: 'Cả 6 lượt từ #1 đến #6 đều phải đi xuyên qua mạng sang User Service đang hỏng và cùng thất bại 502.',
            resilience: 'Circuit Breaker giống cầu dao điện tự động: đủ ngưỡng lỗi sẽ ngắt ngay để bảo vệ cả hai bên.',
            statusColor: '#ef4444',
            code: '6/6 GỌI VÀO LỖI'
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
          cbSubLabel = 'Chờ hết 10s ➔ Dò đường';
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
          cbSubLabel = 'Thăm dò 1/2 (Chờ lượt 2)';
          activeBreakerRow = 6;
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
          cbSubLabel = 'Thăm dò 2/2 OK!';
          activeBreakerRow = 7;
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
          cbSubLabel = 'Đã đóng CLOSED 🟢';
          activeBreakerRow = 7;
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
      // Animates Calls #1 -> #2 -> #3 -> #4 -> #5 sequentially (building 5/5 window),
      // then flips lever OPEN, then rejects Call #6 Fail-Fast!
      // -----------------------------------------------------------
      phaseMilestones = [
        { name: '1. Lượt #1 (Mẫu 1/5)', time: 0 },
        { name: '2. Lượt #2 (Mẫu 2/5)', time: 1500 },
        { name: '3. Lượt #3 (Mẫu 3/5)', time: 3000 },
        { name: '4. Lượt #4 (Mẫu 4/5)', time: 4500 },
        { name: '5. Lượt #5 (Đủ 5/5 lỗi)', time: 6000 },
        { name: '6. Cầu dao bung OPEN 🔴', time: 7500 },
        { name: '7. Lượt #6 Fail-Fast (503)', time: 9100 }
      ];

      if (t > 0 || isPlaying) {
        if (t < 7500) {
          const callIdx = Math.min(4, Math.floor(t / 1500));
          const subT = (t - callIdx * 1500) / 1500;
          const callNo = callIdx + 1;
          const recordedCount = subT >= 0.5 ? callNo : callIdx;
          leverAngle = 0;
          pipe2Blocked = false;
          isUserError = true;
          activeBreakerRow = callIdx;
          cbSubLabel = `Mẫu cửa sổ: ${recordedCount}/5 lỗi`;

          if (subT < 0.5) {
            const p = easeInOut(subT * 2);
            packetX = gwX + p * (userX - gwX);
            packetColor = '#f97316';
            packetLabel = `Lượt ${callNo}/6: Gọi User`;
          } else {
            const p = easeInOut((subT - 0.5) * 2);
            packetX = userX - p * (userX - gwX);
            packetColor = '#ef4444';
            packetLabel = `Lượt ${callNo}/6: Lỗi 502 (${callNo}/5)`;
          }

          narrative = {
            stepTitle: `Diễn biến ${callNo}/7 (Dòng ${callNo} trên bảng): Lượt #${callNo}/6 đi qua mạch CLOSED và gặp lỗi`,
            badge: `Đếm mẫu ${recordedCount}/5`,
            action: subT < 0.5
              ? `Gửi lượt #${callNo} sang User Service`
              : `Nhận lỗi 502 ➔ Cửa sổ trượt ghi nhận mẫu ${recordedCount}/5`,
            desc: callNo < 5
              ? `Mạch đang CLOSED nên cho lượt #${callNo} đi qua. Khi gặp lỗi 502, bộ đếm cửa sổ trượt (slidingWindowSize = 5) tăng lên ${recordedCount}/5. Vì chưa đủ 5 mẫu tối thiểu (minimumNumberOfCalls = 5), cầu dao CHƯA ngắt!`
              : `Lượt thứ 5 đi qua và cũng lỗi! Bộ đếm vừa chạm đúng 5/5 mẫu (tỷ lệ lỗi 100% ≥ ngưỡng 50% cấu hình). Điều kiện ngắt mạch đã kích hoạt!`,
            resilience: callNo < 5
              ? `Resilience4j cần thu thập đủ tối thiểu 5 mẫu gần nhất trước khi đánh giá % lỗi (đã có ${recordedCount}/5 mẫu).`
              : 'Đủ 5/5 mẫu lỗi = 100% (vượt ngưỡng 50%) ➔ Chuẩn bị bật cầu dao sang OPEN!',
            statusColor: '#ef4444',
            code: `CLOSED 🟢 (${recordedCount}/5 LỖI)`
          };
        } else if (t < 9100) {
          leverAngle = Math.min(((t - 7500) / 900) * 45, 45);
          pipe2Blocked = true;
          packetX = orderX;
          packetColor = '#ef4444';
          packetLabel = 'CẦU DAO BUNG OPEN 🔴';
          activeBreakerRow = 4;
          cbSubLabel = '100% lỗi ≥ 50% ➔ NGẮT!';
          narrative = {
            stepTitle: 'Diễn biến 6/7: Đủ 5/5 mẫu lỗi (100% ≥ 50%) — CẦU DAO BUNG MỞ (OPEN) 🔴',
            badge: 'Cầu dao bung mở',
            action: 'Gạt cần câu dao lên 45° · Dựng rào đỏ trước User Service',
            desc: 'Ngay sau lượt #5, tỷ lệ lỗi đạt 100% (vượt ngưỡng 50% do con người cấu hình) ➔ Cầu dao lập tức BẬT MỞ (OPEN) kèm tia điện ⚡! Đường ống sang User Service bị khóa chặt trong 10 giây.',
            resilience: 'Từ thời điểm này, mọi request mới tới Order Service đều bị chặn đứng tại cửa, 0 request nào được phép chạm tới User Service nữa!',
            statusColor: '#ef4444',
            code: 'OPEN 🔴 (ĐÃ NGẮT)'
          };
        } else {
          // Lượt 6: Fail-Fast in action!
          leverAngle = 45;
          pipe2Blocked = true;
          activeBreakerRow = 5;
          cbSubLabel = 'Fail-Fast tức thì (503)';
          const phaseT = t - 9100;
          if (phaseT < 1100) {
            const p = easeInOut(phaseT / 1100);
            packetX = gwX + p * (orderX - 35 - gwX);
            packetColor = '#f59e0b';
            packetLabel = 'Lượt 6/6 mới tới';
          } else {
            const p = easeInOut((phaseT - 1100) / 1200);
            packetX = orderX - 35 - p * (orderX - 35 - gwX);
            packetColor = '#ef4444';
            packetLabel = 'Lượt 6: 503 FAIL-FAST ⛔';
          }
          narrative = {
            stepTitle: 'Diễn biến 7/7 (Dòng 6 trên bảng): Lượt #6 bị chặn Fail-Fast ngay tại cửa (HTTP 503)!',
            badge: 'Bảo vệ sinh tồn',
            action: 'Từ chối tức thì tại Order Service · 0 lần gọi sang User Service',
            desc: 'Lượt thứ 6 vừa chạm vào chốt cầu dao đang OPEN liền bị dội ngược ngay với mã HTTP 503 chỉ trong vài mili-giây (0 LƯỢT GỌI USER SERVICE). Bấm nút "Gửi 2 lượt thăm dò (HALF-OPEN)" ở trên để xem quá trình tự hồi phục!',
            resilience: 'Cứu Order Service không bị nghẽn luồng; Cho User Service 10 giây nghỉ ngơi hồi phục; Dập tắt bão lỗi dây chuyền.',
            statusColor: '#ef4444',
            code: 'LƯỢT 6: 503 FAIL-FAST'
          };
        }
      }
    }
  }

  // ==========================================
  // SCENARIO 6: CONVERGE (1 Đường ống thẳng xuyên 4 Trạm · Nhịp chậm 38s dễ theo dõi)
  // ==========================================
  else if (scenarioId === 'converge') {
    packetVisible = false;
    phaseMilestones = [
      { name: '1. Bulkhead lọc 3/6', time: 3600 },
      { name: '2. Retry tự cứu (#3)', time: 15600 },
      { name: '3. Cắt 1s ➔ Bung OPEN', time: 20500 },
      { name: '4. Chặn 503 (Fail-Fast)', time: 26800 },
      { name: '5. Thăm dò ➔ CLOSED 🟢', time: 36800 }
    ];

    convergePipeline = {
      activeGate: 0,
      retryText: 'Sẵn sàng (Max 3)',
      retryColor: '#38bdf8',
      cbStateText: 'CLOSED 🟢',
      cbColor: '#22c55e',
      cbRateText: '0/5 · Chưa có lỗi',
      cbWindow: [null, null, null, null, null],
      bhSlots: [false, false, false],
      bhText: 'Trống 3/3 chỗ',
      bhColor: '#c084fc',
      feignText: 'Hạn mức 1 giây',
      feignColor: '#f59e0b',
      cutAtFeign: false,
      barrierAtCb: false,
      barrierAtBh: false,
      railY: 165,
      swarms: null,
      swarmLabels: null,
      singlePacket: { x: 94, y: 165, color: '#6366f1', label: 'Sẵn sàng qua 4 trạm' }
    };

    if (t > 0 || isPlaying) {
      if (t < 7500) {
        // CHẶNG 1 (0..7.5s): 6 lượt đi xuyên Trạm 1 & 2 tới Trạm 3 (giữ 3, chặn 3 bằng 429) -> Nạp 3 ô xanh CB
        activeBreakerRow = 0;
        const lt = t;

        if (lt < 2200) {
          const p = easeInOut(lt / 2200);
          const headX = 94 + p * (535 - 94);
          convergePipeline.activeGate = headX < 264 ? 1 : headX < 454 ? 2 : 3;
          convergePipeline.bhText = '6 lượt cùng tới';
          convergePipeline.swarms = Array.from({ length: 6 }, (_, i) => ({
            x: Math.max(94, headX - i * 16),
            y: 159 + (i % 3) * 6,
            color: '#818cf8'
          }));
          convergePipeline.swarmLabels = [{ x: Math.max(195, headX - 25), text: '6 lượt qua Trạm 1–2 ➔ tới Trạm 3', color: '#818cf8' }];
          convergePipeline.singlePacket = null;
        } else if (lt < 5000) {
          const p = easeInOut((lt - 2200) / 2800);
          convergePipeline.activeGate = 3;
          convergePipeline.barrierAtBh = true;
          convergePipeline.bhSlots = [true, true, true];
          convergePipeline.bhText = 'ĐẦY 3/3 · Chặn 3';
          convergePipeline.retryText = 'Dừng (Thấy 429)';
          convergePipeline.retryColor = '#f59e0b';
          const okX = 542 + p * (806 - 542);
          const rejX = 528 - p * (528 - 94);
          convergePipeline.swarms = [
            ...[0, 1, 2].map((i) => ({ x: Math.min(806, okX - i * 14), y: 159 + i * 6, color: '#22c55e' })),
            ...[0, 1, 2].map((i) => ({ x: Math.max(94, rejX - i * 14), y: 159 + i * 6, color: '#ef4444' }))
          ];
          convergePipeline.swarmLabels = [
            { x: Math.max(660, Math.min(770, okX - 10)), text: '#1–#3 qua ➔ User (200)', color: '#22c55e' },
            { x: Math.min(340, Math.max(155, rejX)), text: '#4–#6 bị chặn 429', color: '#ef4444' }
          ];
          convergePipeline.singlePacket = null;
        } else {
          const p = Math.min(1, easeInOut(Math.min(1, (lt - 5000) / 1600)));
          const retX = 806 - p * (806 - 94);
          const filled = retX < 410 ? ['ok', 'ok', 'ok', null, null] : [null, null, null, null, null];
          convergePipeline.activeGate = retX < 410 ? 2 : 4;
          convergePipeline.cbWindow = filled;
          convergePipeline.cbRateText = retX < 410 ? '3/5 xanh · 0% CLOSED' : 'Đang ghi 3 mẫu ✅';
          convergePipeline.bhSlots = [false, false, false];
          convergePipeline.bhText = 'Trống 3/3 chỗ';
          convergePipeline.swarms = [0, 1, 2].map((i) => ({
            x: Math.max(94, Math.min(806, retX + i * 14)),
            y: 159 + i * 6,
            color: '#22c55e'
          }));
          convergePipeline.swarmLabels = [{ x: Math.max(195, Math.min(735, retX + 14)), text: 'Nạp 3 ô xanh [✓✓✓] vào CB', color: '#22c55e' }];
          convergePipeline.singlePacket = null;
        }

        narrative = {
          stepTitle: 'Chặng 1/5: Trạm 3 (Bulkhead) giữ 3 lượt, chặn nhanh 3 lượt 429',
          badge: 'Trạm 3 lọc tải',
          action: '3 suất đầu qua Trạm 4 ➔ User (200 OK) · Nạp 3 ô xanh vào Trạm 2',
          desc: '6 yêu cầu cùng đi tới Trạm 3 (chỉ có 3 chỗ). 3 lượt đầu lọt qua nhận 200 OK; 3 lượt thừa bị chặn 429 tại chỗ (Trạm 1 Retry và Trạm 2 CB đều bỏ qua mã 429).',
          resilience: 'Trạm 2 đã tích lũy 3/5 mẫu xanh [✓][✓][✓][ ][ ] làm bước đệm cho Chặng 2.',
          statusColor: '#c084fc',
          code: 'CHẶNG 1 · BULKHEAD 3/6'
        };
      } else if (t < 16500) {
        // CHẶNG 2 (7.5s..16.5s): 2 lần lỗi 500 -> CB mới 40% (< 50% CLOSED) -> Retry nghỉ 500ms+1s cứu lần #3!
        activeBreakerRow = 1;
        const lt = t - 7500; // 0 .. 9000
        convergePipeline.bhText = 'Đang giữ 1/3';

        if (lt < 2000) {
          // Lần #1 đi -> gặp lỗi 500 -> về Gate 1 & ghi [✕] vào ô 4
          isUserError = true;
          const p = lt / 2000;
          const x = p < 0.5
            ? 94 + easeInOut(p * 2) * (806 - 94)
            : 806 - easeInOut((p - 0.5) * 2) * (806 - 202);
          const hitCb = p >= 0.5 && x < 420;
          convergePipeline.cbWindow = hitCb ? ['ok', 'ok', 'ok', 'fail', null] : ['ok', 'ok', 'ok', null, null];
          convergePipeline.cbRateText = hitCb ? '1/4 = 25% · CLOSED' : '3/5 xanh · 0% CLOSED';
          convergePipeline.bhSlots = [true, false, false];
          convergePipeline.activeGate = hitCb ? 2 : 1;
          convergePipeline.retryText = p < 0.5 ? 'Đẩy lần 1/3' : 'Gặp 500 ➔ Nghỉ';
          convergePipeline.retryColor = p < 0.5 ? '#38bdf8' : '#ef4444';
          convergePipeline.singlePacket = {
            x, y: 165, color: '#ef4444',
            label: p < 0.5 ? 'Lần 1 đi xuyên 4 trạm' : 'Lần 1: Lỗi 500 ❌'
          };
        } else if (lt < 3300) {
          // Dừng nghỉ 500ms tại Gate 1 (1.3s dễ nhìn!)
          isUserError = true;
          convergePipeline.cbWindow = ['ok', 'ok', 'ok', 'fail', null];
          convergePipeline.cbRateText = '1/4 = 25% · CLOSED';
          convergePipeline.bhSlots = [false, false, false];
          convergePipeline.bhText = 'Trống 3/3 chỗ';
          convergePipeline.activeGate = 1;
          convergePipeline.retryText = 'Nghỉ 500ms ⏳';
          convergePipeline.retryColor = '#f59e0b';
          convergePipeline.singlePacket = { x: 202, y: 165, color: '#f59e0b', label: 'Trạm 1 nghỉ 500ms ⏳' };
        } else if (lt < 5300) {
          // Lần #2 đi -> lỗi 500 -> về Gate 1 & ghi [✕] vào ô 5 (40%)
          isUserError = true;
          const p = (lt - 3300) / 2000;
          const x = p < 0.5
            ? 202 + easeInOut(p * 2) * (806 - 202)
            : 806 - easeInOut((p - 0.5) * 2) * (806 - 202);
          const hitCb2 = p >= 0.5 && x < 420;
          convergePipeline.cbWindow = hitCb2 ? ['ok', 'ok', 'ok', 'fail', 'fail'] : ['ok', 'ok', 'ok', 'fail', null];
          convergePipeline.cbRateText = hitCb2 ? '2/5 = 40% (< 50%)' : '1/4 = 25% · CLOSED';
          convergePipeline.bhSlots = [true, false, false];
          convergePipeline.activeGate = hitCb2 ? 2 : 1;
          convergePipeline.retryText = p < 0.5 ? 'Thử lại lần #2' : '500 ➔ Nghỉ 1s';
          convergePipeline.retryColor = '#f59e0b';
          convergePipeline.singlePacket = {
            x, y: 165, color: p < 0.5 ? '#f59e0b' : '#ef4444',
            label: p < 0.5 ? 'Trạm 1 thử lần #2' : 'Lần #2 lỗi ➔ CB mới 40%'
          };
        } else if (lt < 6500) {
          // Dừng nghỉ 1s tại Gate 1 (1.2s dễ đọc con số 40% CLOSED!)
          isUserError = true;
          convergePipeline.cbWindow = ['ok', 'ok', 'ok', 'fail', 'fail'];
          convergePipeline.cbRateText = '2/5 = 40% · CLOSED';
          convergePipeline.bhSlots = [false, false, false];
          convergePipeline.bhText = 'Trống 3/3 chỗ';
          convergePipeline.activeGate = 1;
          convergePipeline.retryText = 'Nghỉ 1 giây ⏳';
          convergePipeline.retryColor = '#f59e0b';
          convergePipeline.singlePacket = { x: 202, y: 165, color: '#f59e0b', label: 'Nghỉ 1s · CB 40% vẫn mở' };
        } else {
          // Lần #3 đi qua 4 trạm -> User trả 200 OK ✅ -> trượt CB thành [✓✓✕✕✓] 40%
          isUserError = false;
          const p = Math.min(1, (lt - 6500) / 1800);
          const x = p < 0.45
            ? 202 + easeInOut(p / 0.45) * (806 - 202)
            : 806 - easeInOut((p - 0.45) / 0.55) * (806 - 94);
          const shifted = p >= 0.45 && x < 420;
          convergePipeline.cbWindow = shifted ? ['ok', 'ok', 'fail', 'fail', 'ok'] : ['ok', 'ok', 'ok', 'fail', 'fail'];
          convergePipeline.cbRateText = '2/5 = 40% · CLOSED';
          convergePipeline.bhSlots = p < 0.8 ? [true, false, false] : [false, false, false];
          convergePipeline.bhText = p < 0.8 ? 'Đang giữ 1/3' : 'Trống 3/3 chỗ';
          convergePipeline.activeGate = shifted ? 2 : 1;
          convergePipeline.retryText = p < 0.45 ? 'Đẩy lần #3!' : 'Cứu ở #3: OK ✅';
          convergePipeline.retryColor = p < 0.45 ? '#38bdf8' : '#22c55e';
          convergePipeline.singlePacket = {
            x, y: 165,
            color: p < 0.45 ? '#38bdf8' : '#22c55e',
            label: p < 0.45 ? 'Trạm 1 thử lần #3' : 'Lần #3: 200 OK ✅'
          };
        }

        narrative = {
          stepTitle: 'Chặng 2/5: Lỗi 500 2 lần — Trạm 2 mới 40% (< 50%) nên Trạm 1 tự cứu ở lần #3',
          badge: 'Trạm 1 tự cứu',
          action: 'CB 40% (CLOSED 🟢) ➔ Retry nghỉ 500ms + 1s rồi thử #3 ➔ 200 OK',
          desc: 'Nhờ Chặng 1 đã có 3 ô xanh nên 2 lỗi chỉ đẩy cửa sổ CB lên 40% (chưa chạm ngưỡng ngắt 50%). Nhờ vậy Trạm 1 vẫn được phép thử lại lần #3 và nhận 200 OK.',
          resilience: 'Cửa sổ trượt 5 mẫu bây giờ là [✓][✓][✕][✕][✓] (40% — sát ngưỡng ngắt 50%!).',
          statusColor: '#38bdf8',
          code: 'CHẶNG 2 · RETRY #3 (40%)'
        };
      } else if (t < 25000) {
        // CHẶNG 3 (16.5s..25.0s): User treo 3s -> Trạm 4 cắt 1s ✂️ -> CB trượt lên 60% OPEN 🔴 -> Chặn luôn Retry #2!
        activeBreakerRow = 2;
        isUserError = true;
        const lt = t - 16500; // 0 .. 8500

        if (lt < 2300) {
          const p = easeInOut(lt / 2300);
          const x = 94 + p * (806 - 94);
          convergePipeline.cbWindow = ['ok', 'ok', 'fail', 'fail', 'ok'];
          convergePipeline.cbRateText = 'Đang 40% · CLOSED';
          convergePipeline.bhSlots = [true, false, false];
          convergePipeline.bhText = 'Đang giữ 1/3';
          convergePipeline.activeGate = x < 264 ? 1 : x < 454 ? 2 : x < 610 ? 3 : 4;
          convergePipeline.retryText = 'Đang đợi #1...';
          convergePipeline.feignText = 'Đếm treo... 1s';
          convergePipeline.singlePacket = { x, y: 165, color: '#f59e0b', label: 'User treo 3s · Chờ Trạm 4' };
        } else if (lt < 5100) {
          const p = Math.min(1, easeInOut(Math.min(1, (lt - 2300) / 2000)));
          const x = 772 - p * (772 - 369);
          const tripped = x <= 425;
          convergePipeline.cutAtFeign = true;
          convergePipeline.feignText = '✂️ CẮT Ở 1s!';
          convergePipeline.feignColor = '#ef4444';
          convergePipeline.activeGate = tripped ? 2 : 4;
          convergePipeline.cbWindow = tripped ? ['ok', 'fail', 'fail', 'ok', 'fail'] : ['ok', 'ok', 'fail', 'fail', 'ok'];
          convergePipeline.cbStateText = tripped ? 'OPEN 🔴' : 'CLOSED 🟢';
          convergePipeline.cbColor = tripped ? '#ef4444' : '#22c55e';
          convergePipeline.cbRateText = tripped ? '3/5 = 60% ➔ NGẮT!' : 'Đẩy lỗi về Trạm 2';
          convergePipeline.barrierAtCb = tripped;
          convergePipeline.retryText = tripped ? 'Dừng (CB OPEN)' : 'Đang đợi #1...';
          convergePipeline.singlePacket = {
            x, y: 165, color: '#ef4444',
            label: tripped ? 'CB vọt 60% ➔ OPEN 🔴!' : 'Trạm 4 cắt 1s ✂️'
          };
        } else {
          // Retry #2 đi tới 350 -> đụng cửa đỏ OPEN bật về Gateway -> giữ yên
          const p = Math.min(1, easeInOut(Math.min(1, (lt - 5100) / 2200)));
          const x = p < 0.42
            ? 202 + (p / 0.42) * (350 - 202)
            : 350 - ((p - 0.42) / 0.58) * (350 - 94);
          convergePipeline.barrierAtCb = true;
          convergePipeline.activeGate = 2;
          convergePipeline.cbWindow = ['ok', 'fail', 'fail', 'ok', 'fail'];
          convergePipeline.cbStateText = 'OPEN 🔴';
          convergePipeline.cbColor = '#ef4444';
          convergePipeline.cbRateText = '60% ≥ 50% · KHÓA 3s';
          convergePipeline.retryText = 'Dừng (CB OPEN)';
          convergePipeline.retryColor = '#ef4444';
          convergePipeline.feignText = 'Đã cắt #1 ở 1s';
          convergePipeline.feignColor = '#ef4444';
          convergePipeline.singlePacket = {
            x, y: 165, color: '#ef4444',
            label: p < 0.42 ? 'Retry #2 gặp cửa OPEN!' : 'Chặn Retry #2 (503)'
          };
        }

        narrative = {
          stepTitle: 'Chặng 3/5: User treo 3s — Trạm 4 cắt 1s ➔ Trạm 2 bung OPEN 🔴, chặn luôn Retry #2',
          badge: 'Cắt 1s ➔ Bung OPEN',
          action: 'Feign cắt ở 1s ➔ CB vọt 60% mở cầu dao ➔ Chặn đứng Retry #2 (503)',
          desc: 'Trạm 4 (Feign) cắt cuộc gọi treo ở mốc 1s, đẩy tỷ lệ lỗi ở Trạm 2 lên 60% (vượt ngưỡng 50%) nên cầu dao bật OPEN. Khi Trạm 1 định gửi Retry #2, nó đụng cửa đỏ OPEN và dừng ngay.',
          resilience: 'Chỉ tốn 1 lượt gọi User duy nhất. Cầu dao khóa cửa 3s để chống bão lỗi.',
          statusColor: '#ef4444',
          code: 'CHẶNG 3 · 60% OPEN 🔴'
        };
      } else if (t < 30500) {
        // CHẶNG 4 (25.0s..30.5s): Lượt mới qua Trạm 1 -> bị chặn ngay ở cửa Trạm 2 (503 · 0 lượt User)
        activeBreakerRow = 3;
        isUserError = true;
        const p = Math.min(1, easeInOut(Math.min(1, (t - 25000) / 3400)));
        const x = p < 0.45
          ? 94 + (p / 0.45) * (350 - 94)
          : 350 - ((p - 0.45) / 0.55) * (350 - 94);

        convergePipeline.activeGate = 2;
        convergePipeline.barrierAtCb = true;
        convergePipeline.cbWindow = ['ok', 'fail', 'fail', 'ok', 'fail'];
        convergePipeline.cbStateText = 'OPEN 🔴';
        convergePipeline.cbColor = '#ef4444';
        convergePipeline.cbRateText = 'Đang khóa 3s (0 qua)';
        convergePipeline.retryText = 'Nhận 503 ➔ Dừng';
        convergePipeline.retryColor = '#ef4444';
        convergePipeline.bhText = 'Đứng ngoài nghỉ';
        convergePipeline.feignText = 'Nghỉ an toàn';
        convergePipeline.singlePacket = {
          x, y: 165,
          color: p < 0.45 ? '#f59e0b' : '#ef4444',
          label: p < 0.45 ? 'Khách mới ➔ qua Trạm 1' : '⛔ Chặn 503 (~10ms)'
        };

        narrative = {
          stepTitle: 'Chặng 4/5: Mạch đang OPEN — Chặn ngay khách mới tại Trạm 2 (0 lượt sang User)',
          badge: 'Fail-Fast sinh tồn',
          action: 'Trả HTTP 503 trong ~10ms · Trạm 3, Trạm 4 và User nghỉ hoàn toàn',
          desc: 'Khách mới vừa qua Trạm 1 đã đụng cửa đỏ tại Trạm 2 và bị trả về 503 ngay lập tức. Nhờ vậy Bulkhead, Feign và User Service không phải gánh thêm tải nào.',
          resilience: 'Giữ trọn tài nguyên cho Order Service và tạo khoảng nghỉ 3s để User hồi sức.',
          statusColor: '#ef4444',
          code: 'CHẶNG 4 · FAIL-FAST 503'
        };
      } else {
        // CHẶNG 5 (30.5s..38.0s): Hết 3s -> HALF-OPEN 🟡 -> 2 lượt thăm dò xuyên 4 trạm OK -> CLOSED 🟢!
        activeBreakerRow = 4;
        isUserError = false;
        const lt = t - 30500; // 0 .. 7500
        convergePipeline.feignText = 'Nhanh (< 1s) 🟢';
        convergePipeline.feignColor = '#22c55e';
        convergePipeline.bhText = 'Trống 3/3 chỗ';

        if (lt < 1500) {
          const p = easeInOut(lt / 1500);
          convergePipeline.activeGate = 2;
          convergePipeline.cbStateText = 'HALF-OPEN 🟡';
          convergePipeline.cbColor = '#f59e0b';
          convergePipeline.cbWindow = ['probe', 'probe', null, null, null];
          convergePipeline.cbRateText = 'Hết 3s ➔ Mở hé';
          convergePipeline.retryText = 'Chờ thăm dò...';
          convergePipeline.singlePacket = {
            x: 94 + p * (284 - 94), y: 165, color: '#f59e0b',
            label: 'User khỏe · Mở hé HALF-OPEN'
          };
        } else if (lt < 3700) {
          const sub = (lt - 1500) / 2200;
          const x = sub < 0.5
            ? 284 + easeInOut(sub * 2) * (806 - 284)
            : 806 - easeInOut((sub - 0.5) * 2) * (806 - 369);
          convergePipeline.activeGate = 2;
          convergePipeline.cbStateText = 'HALF-OPEN 🟡';
          convergePipeline.cbColor = '#f59e0b';
          convergePipeline.cbWindow = sub >= 0.82 ? ['ok', 'probe', null, null, null] : ['probe', 'probe', null, null, null];
          convergePipeline.cbRateText = sub >= 0.82 ? 'Thăm dò 1/2 OK' : 'Đang thử 1/2...';
          convergePipeline.bhSlots = [true, false, false];
          convergePipeline.bhText = 'Đang giữ 1/3';
          convergePipeline.singlePacket = {
            x, y: 165, color: sub < 0.5 ? '#f59e0b' : '#22c55e',
            label: sub < 0.5 ? 'Thăm dò 1/2 ➔ User' : 'Thăm dò 1/2: 200 OK'
          };
        } else if (lt < 6100) {
          const sub = (lt - 3700) / 2400;
          const x = sub < 0.5
            ? 369 + easeInOut(sub * 2) * (806 - 369)
            : 806 - easeInOut((sub - 0.5) * 2) * (806 - 369);
          const done = sub >= 0.80;
          convergePipeline.activeGate = 2;
          convergePipeline.cbStateText = done ? 'CLOSED 🟢' : 'HALF-OPEN 🟡';
          convergePipeline.cbColor = done ? '#22c55e' : '#f59e0b';
          convergePipeline.cbWindow = done ? ['ok', 'ok', null, null, null] : ['ok', 'probe', null, null, null];
          convergePipeline.cbRateText = done ? 'Đủ 2/2 ➔ ĐÓNG!' : 'Đang thử 2/2...';
          convergePipeline.bhSlots = done ? [false, false, false] : [true, false, false];
          convergePipeline.bhText = done ? 'Trống 3/3 chỗ' : 'Đang giữ 1/3';
          convergePipeline.singlePacket = {
            x, y: 165, color: '#22c55e',
            label: sub < 0.5 ? 'Thăm dò 2/2 ➔ User' : 'Đủ 2/2 ➔ Đóng CLOSED 🟢'
          };
        } else {
          const p = Math.min(1, easeInOut((lt - 6100) / 1400));
          convergePipeline.activeGate = 0;
          convergePipeline.cbStateText = 'CLOSED 🟢';
          convergePipeline.cbColor = '#22c55e';
          convergePipeline.cbWindow = ['ok', 'ok', null, null, null];
          convergePipeline.cbRateText = 'Thông mạch · Chu kỳ mới';
          convergePipeline.retryText = 'Sẵn sàng (Max 3)';
          convergePipeline.retryColor = '#22c55e';
          convergePipeline.singlePacket = {
            x: 369 - p * (369 - 94), y: 165, color: '#22c55e',
            label: 'Hoàn tất: CLOSED 🟢 (200 OK)'
          };
        }

        narrative = {
          stepTitle: 'Chặng 5/5: User khỏe lại — Hết 3s, thăm dò 2/2 OK ➔ Tự đóng CLOSED 🟢',
          badge: 'Tự phục hồi khép kín',
          action: '2 lượt thăm dò đi xuyên 4 trạm OK ➔ Đường ống mở lại bình thường',
          desc: 'Hết 3s nghỉ OPEN, Trạm 2 mở hé HALF-OPEN cho 2 lượt thăm dò đi xuyên cả 4 trạm. Cả 2 đều thành công 200 OK nên cầu dao tự đóng về CLOSED 🟢.',
          resilience: 'Hoàn thành 1 vòng đời khép kín trên cùng 4 trạm: Lọc tải ➔ Tự cứu ➔ Cắt treo & Ngắt mạch ➔ Chặn nhanh ➔ Tự hồi phục.',
          statusColor: '#22c55e',
          code: 'CHẶNG 5 · CLOSED 🟢'
        };
      }
    }
  }

  const currentMilestoneIndex = scenarioId === 'converge'
    ? (activeBreakerRow ?? -1)
    : phaseMilestones.reduce((bestIdx, m, idx) => (
      currentTime >= m.time - 60 ? idx : bestIdx
    ), 0);

  useEffect(() => {
    if (onActiveCallChange) {
      onActiveCallChange(activeBreakerRow);
    }
  }, [activeBreakerRow, onActiveCallChange]);

  function stepTo(targetTime) {
    const clamped = Math.max(0, Math.min(targetTime, totalDuration));
    if (scenarioId === 'converge') {
      isSteppingRef.current = false;
      stepTargetTimeRef.current = null;
      animTimeRef.current = clamped;
      setCurrentTime(clamped);
      setIsPlaying(false);
      return;
    }
    stepTargetTimeRef.current = clamped;
    isSteppingRef.current = true;
    lastTimeRef.current = performance.now();
    setIsPlaying(true);
  }

  function handleNextStep() {
    if (scenarioId === 'converge') {
      if (currentTime < 100) {
        stepTo(phaseMilestones[0].time);
      } else {
        const nextIdx = Math.min(phaseMilestones.length - 1, (activeBreakerRow ?? 0) + 1);
        stepTo(phaseMilestones[nextIdx].time);
      }
      return;
    }
    const current = animTimeRef.current;
    const next = phaseMilestones.find((m) => m.time > current + 60);
    if (next) {
      stepTo(next.time);
    } else if (current < totalDuration - 50) {
      stepTo(totalDuration);
    }
  }

  function handlePrevStep() {
    if (scenarioId === 'converge') {
      if (activeBreakerRow == null || activeBreakerRow <= 0) {
        stepTo(0);
      } else {
        stepTo(phaseMilestones[activeBreakerRow - 1].time);
      }
      return;
    }
    const current = animTimeRef.current;
    const prevList = phaseMilestones.filter((m) => m.time < current - 60);
    if (prevList.length > 0) {
      stepTo(prevList[prevList.length - 1].time);
    } else {
      stepTo(0);
    }
  }

  function toggleSpeed() {
    const newSpeed = speed === 1 ? 0.5 : speed === 0.5 ? 0.25 : 1;
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
              {scenarioId === 'converge'
                ? (currentMilestoneIndex < 0 ? 'Sẵn sàng · 5 chặng' : `Chặng ${currentMilestoneIndex + 1}/5`)
                : (phaseMilestones.length > 0 ? `Bước ${currentMilestoneIndex + 1}/${phaseMilestones.length}` : 'Bước 1/1')}
            </span>

            <button
              className="vis-btn stepper-btn"
              onClick={handleNextStep}
              disabled={scenarioId === 'converge' ? (currentMilestoneIndex >= phaseMilestones.length - 1) : (currentTime >= totalDuration - 20)}
              title="Lướt tiếp tới diễn biến sau"
            >
              <span>Tiếp theo</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Speed Toggle: 1.0x -> 0.5x Chậm -> 0.25x Rất chậm */}
          <button
            className={`vis-btn speed-btn ${speed < 1 ? 'slow-active' : ''}`}
            onClick={toggleSpeed}
            title="Đổi tốc độ phát: 1.0x ➔ 0.5x Chậm ➔ 0.25x Rất chậm"
          >
            <Gauge size={13} />
            <span>{speed === 1 ? '1.0x' : speed === 0.5 ? '🐢 0.5x Chậm' : '🐌 0.25x Rất chậm'}</span>
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
        <svg
          className="flow-canvas"
          style={convergePipeline ? { aspectRatio: '900 / 275' } : undefined}
          viewBox={convergePipeline ? '0 0 900 275' : '0 0 900 240'}
          preserveAspectRatio="xMidYMid meet"
        >
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
          <rect width="900" height={convergePipeline ? 275 : 240} fill="url(#gridPattern)" />

          {convergePipeline ? (
            <>
              {/* ========== CONVERGE: 1 ĐƯỜNG THẲNG XUYÊN QUA 4 CỔNG TRẠM ========== */}
              {/* Order Service Outer Wrapper */}
              <rect
                x="110" y="14" width="680" height="212" rx="14"
                fill="#13102b"
                stroke={convergePipeline.barrierAtCb ? '#ef4444' : '#4f46e5'}
                strokeWidth="2.2"
              />
              <rect x="126" y="20" width="648" height="20" rx="6" fill="#211b48" />
              <text x="450" y="34" textAnchor="middle" fill="#e2e8f0" fontSize="11.5" fontWeight="bold">
                📦 Order Service (:8082) — 1 Luồng đi xuyên 4 Trạm
              </text>

              {/* Highway Road running straight through Gateway -> 4 Portal Archways -> User */}
              <line x1="94" y1="165" x2="806" y2="165" stroke="#2c2559" strokeWidth="10" strokeLinecap="round" />
              <line x1="94" y1="165" x2="806" y2="165" stroke="url(#pipeGlow)" strokeWidth="3.5" strokeDasharray="8,12" className={isPlaying ? 'animated-flow-line' : ''} />

              {/* Flow Arrows between Gates (y = 93) */}
              {[[264, 284], [454, 474], [610, 630]].map(([ax1, ax2]) => (
                <g key={`arrow-${ax1}`}>
                  <line x1={ax1 + 2} y1="93" x2={ax2 - 2} y2="93" stroke="#6366f1" strokeWidth="2.2" />
                  <polygon points={`${ax2 - 2},89 ${ax2 + 2},93 ${ax2 - 2},97`} fill="#818cf8" />
                </g>
              ))}

              {/* Gateway Box (Left) */}
              <g transform="translate(12, 108)">
                <rect x="0" y="0" width="82" height="106" rx="12" fill="#18143d" stroke="#4338ca" strokeWidth="2.2" />
                <circle cx="41" cy="30" r="17" fill="#29235e" />
                <text x="41" y="36" textAnchor="middle" fill="#818cf8" fontSize="17">🌐</text>
                <text x="41" y="68" textAnchor="middle" fill="#ffffff" fontSize="12.5" fontWeight="bold">Gateway</text>
                <text x="41" y="86" textAnchor="middle" fill="#cbd5e1" fontSize="10.5">:8080</text>
              </g>

              {/* TRẠM 1 PORTAL: RETRY (x=140, w=124) */}
              <g transform="translate(140, 48)">
                <rect
                  x="0" y="0" width="124" height="150" rx="10"
                  fill="none"
                  stroke={convergePipeline.activeGate === 1 ? convergePipeline.retryColor : '#312a66'}
                  strokeWidth={convergePipeline.activeGate === 1 ? '2.5' : '1.4'}
                />
                <rect x="0" y="0" width="124" height="88" rx="9" fill={convergePipeline.activeGate === 1 ? '#182542' : '#0f0c24'} />
                <text x="62" y="26" textAnchor="middle" fill="#38bdf8" fontSize="12.5" fontWeight="bold">🔄 1. Retry</text>
                <rect x="8" y="42" width="108" height="32" rx="6" fill="#161233" stroke="#2c2559" strokeWidth="1" />
                <text x="62" y="62" textAnchor="middle" fill={convergePipeline.retryColor} fontSize="11" fontWeight="bold">
                  {convergePipeline.retryText}
                </text>
              </g>

              {/* TRẠM 2 PORTAL: CIRCUIT BREAKER (x=284, w=170) */}
              <g transform="translate(284, 48)">
                <rect
                  x="0" y="0" width="170" height="150" rx="10"
                  fill="none"
                  stroke={convergePipeline.barrierAtCb ? '#ef4444' : convergePipeline.activeGate === 2 ? convergePipeline.cbColor : '#312a66'}
                  strokeWidth={convergePipeline.activeGate === 2 || convergePipeline.barrierAtCb ? '2.5' : '1.4'}
                />
                <rect x="0" y="0" width="170" height="88" rx="9" fill={convergePipeline.barrierAtCb ? '#2a1019' : convergePipeline.activeGate === 2 ? '#1d1740' : '#0f0c24'} />
                <text x="85" y="21" textAnchor="middle" fill={convergePipeline.cbColor} fontSize="11.5" fontWeight="bold">
                  ⚡ 2. CB · {convergePipeline.cbStateText}
                </text>
                {convergePipeline.cbWindow.map((cell, ci) => {
                  const cx = 13 + ci * 30;
                  const fill = cell === 'ok' ? '#14532d' : cell === 'fail' ? '#7f1d1d' : cell === 'probe' ? '#78350f' : '#1e1b3a';
                  const stroke = cell === 'ok' ? '#22c55e' : cell === 'fail' ? '#ef4444' : cell === 'probe' ? '#f59e0b' : '#4338ca';
                  const sym = cell === 'ok' ? '✓' : cell === 'fail' ? '✕' : cell === 'probe' ? '?' : `${ci + 1}`;
                  const symColor = cell ? '#ffffff' : '#64748b';
                  return (
                    <g key={`cbw-${ci}`} transform={`translate(${cx}, 32)`}>
                      <rect x="0" y="0" width="24" height="24" rx="5" fill={fill} stroke={stroke} strokeWidth="1.5" />
                      <text x="12" y="16" textAnchor="middle" fill={symColor} fontSize="11.5" fontWeight="bold">{sym}</text>
                    </g>
                  );
                })}
                <text x="85" y="75" textAnchor="middle" fill={convergePipeline.cbColor} fontSize="11" fontWeight="bold">
                  {convergePipeline.cbRateText}
                </text>
              </g>

              {/* TRẠM 3 PORTAL: BULKHEAD (x=474, w=136) */}
              <g transform="translate(474, 48)" opacity={convergePipeline.barrierAtCb ? 0.5 : 1}>
                <rect
                  x="0" y="0" width="136" height="150" rx="10"
                  fill="none"
                  stroke={convergePipeline.activeGate === 3 ? '#c084fc' : '#312a66'}
                  strokeWidth={convergePipeline.activeGate === 3 ? '2.5' : '1.4'}
                />
                <rect x="0" y="0" width="136" height="88" rx="9" fill={convergePipeline.activeGate === 3 ? '#1e1640' : '#0f0c24'} />
                <text x="68" y="21" textAnchor="middle" fill="#c084fc" fontSize="12" fontWeight="bold">🛡️ 3. Bulkhead</text>
                {convergePipeline.bhSlots.map((busySlot, bi) => {
                  const bx = 18 + bi * 36;
                  return (
                    <g key={`bhs-${bi}`} transform={`translate(${bx}, 32)`}>
                      <rect
                        x="0" y="0" width="28" height="24" rx="5"
                        fill={busySlot ? '#166534' : '#1e1b3a'}
                        stroke={busySlot ? '#4ade80' : '#4c1d95'}
                        strokeWidth="1.5"
                      />
                      <text x="14" y="16" textAnchor="middle" fill={busySlot ? '#ffffff' : '#a78bfa'} fontSize="11" fontWeight="bold">
                        {busySlot ? '●' : `${bi + 1}`}
                      </text>
                    </g>
                  );
                })}
                <text x="68" y="75" textAnchor="middle" fill={convergePipeline.barrierAtBh ? '#f87171' : '#d8b4fe'} fontSize="11" fontWeight="bold">
                  {convergePipeline.bhText}
                </text>
              </g>

              {/* TRẠM 4 PORTAL: FEIGN TIMEOUT 1s (x=630, w=130) */}
              <g transform="translate(630, 48)" opacity={convergePipeline.barrierAtCb ? 0.5 : 1}>
                <rect
                  x="0" y="0" width="130" height="150" rx="10"
                  fill="none"
                  stroke={convergePipeline.cutAtFeign ? '#ef4444' : convergePipeline.activeGate === 4 ? '#f59e0b' : '#312a66'}
                  strokeWidth={convergePipeline.activeGate === 4 || convergePipeline.cutAtFeign ? '2.5' : '1.4'}
                />
                <rect x="0" y="0" width="130" height="88" rx="9" fill={convergePipeline.cutAtFeign ? '#2a1019' : convergePipeline.activeGate === 4 ? '#271e12' : '#0f0c24'} />
                <text x="65" y="26" textAnchor="middle" fill="#f59e0b" fontSize="12" fontWeight="bold">⏱️ 4. Feign 1s</text>
                <rect x="8" y="42" width="114" height="32" rx="6" fill="#161233" stroke="#2c2559" strokeWidth="1" />
                <text x="65" y="62" textAnchor="middle" fill={convergePipeline.feignColor} fontSize="11" fontWeight="bold">
                  {convergePipeline.feignText}
                </text>
              </g>

              {/* User Service Box (Right) */}
              <g transform="translate(806, 108)">
                <rect x="0" y="0" width="82" height="106" rx="12" fill="#181329" stroke={isUserError ? '#e11d48' : '#10b981'} strokeWidth="2.2" />
                <circle cx="41" cy="30" r="17" fill={isUserError ? '#3d1624' : '#133526'} />
                <text x="41" y="36" textAnchor="middle" fill={isUserError ? '#f43f5e' : '#34d399'} fontSize="17">
                  {isUserError ? '⚠️' : '👤'}
                </text>
                <text x="41" y="68" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="bold">User</text>
                <text x="41" y="86" textAnchor="middle" fill="#cbd5e1" fontSize="10.5">:8081</text>
              </g>

              {/* Road Barriers & Scissors right across y = 165 */}
              {convergePipeline.barrierAtCb && (
                <g transform="translate(369, 165)">
                  <line x1="0" y1="-26" x2="0" y2="26" stroke="#ef4444" strokeWidth="6" strokeLinecap="round" />
                  <rect x="-13" y="-15" width="26" height="30" rx="6" fill="#dc2626" stroke="#fecaca" strokeWidth="1.4" />
                  <text x="0" y="5" textAnchor="middle" fill="#ffffff" fontSize="14">⛔</text>
                </g>
              )}
              {convergePipeline.barrierAtBh && (
                <g transform="translate(542, 165)">
                  <line x1="0" y1="-24" x2="0" y2="24" stroke="#a855f7" strokeWidth="5" strokeLinecap="round" />
                  <rect x="-12" y="-14" width="24" height="28" rx="6" fill="#9333ea" stroke="#e9d5ff" strokeWidth="1.4" />
                  <text x="0" y="5" textAnchor="middle" fill="#ffffff" fontSize="13">🛑</text>
                </g>
              )}
              {convergePipeline.cutAtFeign && (
                <g transform="translate(772, 165)">
                  <circle cx="0" cy="0" r="15" fill="#dc2626" stroke="#fecaca" strokeWidth="1.4" />
                  <text x="0" y="5" textAnchor="middle" fill="#ffffff" fontSize="15">✂️</text>
                </g>
              )}

              {/* Swarm Packets on Road (Chặng 1) */}
              {convergePipeline.swarms && convergePipeline.swarms.map((sp, sIdx) => (
                <g key={`sw-${sIdx}`} transform={`translate(${sp.x}, ${sp.y})`} filter="url(#packetGlow)">
                  <circle cx="0" cy="0" r="6.5" fill={sp.color} />
                  <circle cx="0" cy="0" r="2.4" fill="#ffffff" />
                </g>
              ))}
              {convergePipeline.swarmLabels && convergePipeline.swarmLabels.map((sl, slIdx) => {
                const bw = Math.max(130, Math.ceil(sl.text.length * 7.2) + 22);
                const bx = Math.max(bw / 2 + 10, Math.min(900 - bw / 2 - 10, sl.x));
                return (
                  <g key={`sl-${slIdx}`} transform={`translate(${bx}, 250)`}>
                    <rect x={-bw / 2} y="-11" width={bw} height="22" rx="6" fill="#0b081d" stroke={sl.color} strokeWidth="1.5" />
                    <text x="0" y="4" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold">{sl.text}</text>
                  </g>
                );
              })}

              {/* Single Pipeline Packet + Clean Separate Bottom Status Pill (Chặng 2..5) */}
              {convergePipeline.singlePacket && (() => {
                const sp = convergePipeline.singlePacket;
                const bw = Math.max(150, Math.ceil(sp.label.length * 7.2) + 24);
                const labelX = Math.max(bw / 2 + 10, Math.min(900 - bw / 2 - 10, sp.x));
                return (
                  <>
                    <g transform={`translate(${sp.x}, ${sp.y})`} filter="url(#packetGlow)">
                      <circle cx="0" cy="0" r="11" fill={sp.color} className={isPlaying ? 'pulsing-packet' : ''} />
                      <circle cx="0" cy="0" r="4.5" fill="#ffffff" />
                    </g>
                    <g transform={`translate(${labelX}, 250)`}>
                      <rect x={-bw / 2} y="-11" width={bw} height="22" rx="6" fill="#0c0924" stroke={sp.color} strokeWidth="1.5" />
                      <text x="0" y="4" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold">{sp.label}</text>
                    </g>
                  </>
                );
              })()}
            </>
          ) : (
            <>
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

          {/* Multiple Particles (Bulkhead) - rendered behind service cards so transit never obscures text */}
          {multiPackets && multiPackets.map((p, idx) => {
            const boxW = Math.max(44, Math.ceil(String(p.label).length * 6.4) + 14);
            const inBox = (p.x >= 55 && p.x <= 203) || (p.x >= 340 && p.x <= 560) || (p.x >= 696 && p.x <= 845);
            return (
              <g key={idx} transform={`translate(${p.x}, ${p.y})`} opacity={inBox ? 0 : 1} filter={inBox ? undefined : 'url(#packetGlow)'}>
                <circle cx="0" cy="0" r="7" fill={p.color} />
                <circle cx="0" cy="0" r="2.5" fill="#ffffff" />
                {!inBox && (
                  <g transform="translate(0, -14)">
                    <rect x={-boxW / 2} y="-8" width={boxW} height="15" rx="3" fill="#0b081d" stroke={p.color} strokeWidth="1" />
                    <text x="0" y="3" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold">{p.label}</text>
                  </g>
                )}
              </g>
            );
          })}

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
                      <text x="85" y="46" textAnchor="middle" fill="#fca5a5" fontSize="11" fontWeight="600">Không giới hạn 3 chỗ</text>
                      <text x="85" y="66" textAnchor="middle" fill="#f87171" fontSize="10.5" fontWeight="bold">💥 Tràn 10/10 ➔ Sập 503</text>
                    </>
                  )}
                  {scenarioId === 'breaker' && (
                    <>
                      <text x="85" y="26" textAnchor="middle" fill="#ef4444" fontSize="13" fontWeight="bold">❌ KHÔNG CIRCUIT BREAKER</text>
                      <text x="85" y="46" textAnchor="middle" fill="#fca5a5" fontSize="11" fontWeight="600">Cầu dao đóng mù quáng</text>
                      <text x="85" y="66" textAnchor="middle" fill="#f87171" fontSize="10.5" fontWeight="bold">{cbUnprotectedSubLabel}</text>
                    </>
                  )}
                </>
              ) : (
                <>
                  {/* Physical Circuit Breaker Lever */}
                  {scenarioId === 'breaker' && (
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
                      <text x="85" y="68" textAnchor="middle" fill="#4ade80" fontSize="12" fontWeight="bold">{retryFailCount === 1 ? 'Thành công ngay lần 2' : 'Tự cứu ở lần 3'}</text>
                    </>
                  )}
                  {scenarioId === 'bulkhead' && (
                    <>
                      <text x="85" y="28" textAnchor="middle" fill="#c084fc" fontSize="12" fontWeight="bold">🛡️ Bulkhead (Tối đa 3)</text>
                      <text x="85" y="48" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600">Giữ #1–#3 · Chặn 7 (429)</text>
                      <text x="85" y="68" textAnchor="middle" fill="#4ade80" fontSize="10.5" fontWeight="bold">✅ Sống 3/3 · Bảo vệ Server</text>
                    </>
                  )}
                  {scenarioId === 'breaker' && (
                    <>
                      <text x="85" y="56" textAnchor="middle" fill={leverAngle > 20 ? '#ef4444' : leverAngle > 0 ? '#f59e0b' : '#10b981'} fontSize="13" fontWeight="bold">
                        Cầu dao: {leverAngle > 20 ? 'OPEN 🔴' : leverAngle > 0 ? 'HALF-OPEN 🟡' : 'CLOSED 🟢'}
                      </text>
                      <text x="85" y="73" textAnchor="middle" fill="#cbd5e1" fontSize="10.5" fontWeight="600">
                        {cbSubLabel}
                      </text>
                    </>
                  )}
                  {scenarioId === 'normal' && (
                    <>
                      <text x="85" y="36" textAnchor="middle" fill="#22c55e" fontSize="13" fontWeight="bold">✅ OpenFeign Chuẩn</text>
                      <text x="85" y="58" textAnchor="middle" fill="#cbd5e1" fontSize="12" fontWeight="600">Giao tiếp trực tiếp</text>
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

          {/* Single Continuous Packet */}
          {packetVisible && (() => {
            const badgeW = Math.max(140, Math.ceil(String(packetLabel).length * 7.2) + 22);
            return (
              <g transform={`translate(${packetX}, ${packetY})`} filter="url(#packetGlow)">
                <circle cx="0" cy="0" r="14" fill={packetColor} className={isPlaying ? 'pulsing-packet' : ''} />
                <circle cx="0" cy="0" r="6" fill="#ffffff" />
                {/* Opaque high-contrast badge behind label for 100% legibility */}
                <g transform="translate(0, -25)">
                  <rect x={-badgeW / 2} y="-12" width={badgeW} height="20" rx="6" fill="#0c0924" stroke={packetColor} strokeWidth="1.5" />
                  <text x="0" y="2" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="bold">
                    {packetLabel}
                  </text>
                </g>
              </g>
            );
          })()}
            </>
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
          {phaseMilestones.map((m, idx) => {
            const isChipActive = scenarioId === 'converge'
              ? activeBreakerRow === idx
              : (t >= m.time && (idx === phaseMilestones.length - 1 || t < phaseMilestones[idx + 1].time));
            return (
              <button
                key={m.name}
                className={`step-dot ${isChipActive ? 'active' : ''}`}
                style={{ width: 'auto', padding: '3px 8px', borderRadius: '6px', fontSize: '0.7rem' }}
                onClick={() => jumpToMilestone(m.time)}
                title={`Nhảy tới ${m.name}`}
              >
                {m.name}
              </button>
            );
          })}
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
