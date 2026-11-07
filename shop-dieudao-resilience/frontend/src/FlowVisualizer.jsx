import { useState, useEffect, useRef } from 'react';
import {
  Play, Pause, RotateCcw, Activity, ArrowRight, Server, Shield,
  Zap, Clock, Layers, RefreshCw, Scissors, Ban, CheckCircle2
} from 'lucide-react';

export default function FlowVisualizer({
  scenarioId = 'normal',
  busy = false,
  liveStage = '',
  breakerState = null,
  runCount = 0,
  actionLabel = 'Chạy kịch bản'
}) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const animTimeRef = useRef(0);
  const isPlayingRef = useRef(true);
  const lastTimeRef = useRef(performance.now());
  const reqIdRef = useRef(null);

  // Sync isPlaying with ref
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Reset timeline on scenario change
  useEffect(() => {
    animTimeRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(true);
  }, [scenarioId]);

  // When runCount increments, restart animation from t=0
  useEffect(() => {
    if (runCount > 0) {
      animTimeRef.current = 0;
      setCurrentTime(0);
      setIsPlaying(true);
    }
  }, [runCount]);

  // Continuous 60 FPS animation loop
  useEffect(() => {
    function loop(now) {
      const delta = Math.min(now - lastTimeRef.current, 50);
      lastTimeRef.current = now;

      if (isPlayingRef.current) {
        animTimeRef.current += delta;
        setCurrentTime(animTimeRef.current);
      }

      reqIdRef.current = requestAnimationFrame(loop);
    }

    reqIdRef.current = requestAnimationFrame(loop);
    return () => {
      if (reqIdRef.current) cancelAnimationFrame(reqIdRef.current);
    };
  }, []);

  // Duration settings per scenario
  let loopDuration = 5500;
  if (scenarioId === 'retry') loopDuration = 7500;
  else if (scenarioId === 'timeout') loopDuration = 6000;
  else if (scenarioId === 'bulkhead') loopDuration = 6000;
  else if (scenarioId === 'breaker') loopDuration = 7500;
  else if (scenarioId === 'converge') loopDuration = 10000;

  const t = currentTime % loopDuration;

  // Easing helper
  const easeInOut = (p) => (p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p);

  // Node Centers in SVG (900x240)
  const gwX = 130;
  const gwY = 120;
  const orderX = 450;
  const orderY = 120;
  const userX = 770;
  const userY = 120;

  // Compute positions, states and narrative based on scenario & time t
  let packetX = gwX;
  let packetY = gwY;
  let packetColor = '#6366f1';
  let packetLabel = 'GET';
  let packetVisible = true;
  let pipe2Cut = false;
  let pipe2Blocked = false;
  let leverAngle = 0; // for Circuit Breaker
  let isUserError = false;
  let multiPackets = null; // for Bulkhead

  let narrative = {
    phase: 'Bắt đầu',
    action: 'Đang chuyển tiếp',
    desc: 'Request đang chuẩn bị di chuyển...',
    resilience: 'Cơ chế sẵn sàng bảo vệ.',
    statusColor: '#6366f1',
    code: 'INIT'
  };

  if (scenarioId === 'normal') {
    if (t < 2500) {
      const p = easeInOut(t / 2500);
      packetX = gwX + p * (userX - gwX);
      packetColor = '#6366f1';
      packetLabel = 'GET /api/orders/1';
      narrative = {
        phase: 'Lượt đi (Request)',
        action: 'Chuyển tiếp qua Order Service',
        desc: 'Yêu cầu xem đơn hàng #001 lướt mượt mà từ Gateway qua Order Service sang User Service.',
        resilience: 'Đường truyền ổn định, OpenFeign giao tiếp trực tiếp không có lỗi.',
        statusColor: '#6366f1',
        code: 'HTTP GET'
      };
    } else {
      const p = easeInOut((t - 2500) / 2500);
      packetX = userX - p * (userX - gwX);
      packetColor = '#22c55e';
      packetLabel = '200 OK';
      narrative = {
        phase: 'Lượt về (Response)',
        action: 'Trả dữ liệu về Client',
        desc: 'User Service xử lý xong, trả về thông tin khách hàng. Order Service gộp dữ liệu đơn hàng và trả về Client thành công.',
        resilience: 'Giao dịch hoàn tất hoàn hảo trong ~15ms.',
        statusColor: '#22c55e',
        code: 'HTTP 200 OK'
      };
    }
  } else if (scenarioId === 'timeout') {
    isUserError = t > 1500 && t < 4000;
    if (t < 1600) {
      const p = easeInOut(t / 1600);
      packetX = gwX + p * (userX - gwX);
      packetColor = '#6366f1';
      packetLabel = 'GET';
      narrative = {
        phase: 'Bước 1: Gọi sang User Service',
        action: 'Chuyển tiếp yêu cầu',
        desc: 'Order Service dùng Feign gọi sang User Service (:8081).',
        resilience: 'Order Service bắt đầu cấp phát 1 worker thread cho kết nối này.',
        statusColor: '#6366f1',
        code: 'START'
      };
    } else if (t < 3600) {
      packetX = userX;
      packetColor = '#f59e0b';
      const waitMs = Math.round(((t - 1600) / 2000) * 1000);
      packetLabel = `CHỜ ${waitMs}ms / 1000ms ⏳`;
      narrative = {
        phase: 'Bước 2: User Service bị nghẽn 4000ms',
        action: 'Đang ngâm chờ phản hồi...',
        desc: 'User Service gặp sự cố nghẽn I/O, không phản hồi. Đồng hồ Timeout của Order Service bắt đầu đếm lùi.',
        resilience: 'Nếu KHÔNG CÓ Timeout: Thread của Order Service sẽ bị giam giữ 4s, làm cạn kiệt toàn bộ Connection Pool!',
        statusColor: '#f59e0b',
        code: `ĐỢI ${waitMs}ms`
      };
    } else if (t < 4200) {
      pipe2Cut = true;
      packetX = (orderX + userX) / 2;
      packetColor = '#ef4444';
      packetLabel = 'CẮT TIMEOUT! ✂️';
      narrative = {
        phase: 'Bước 3: Mốc Timeout 1.0s kích hoạt!',
        action: 'Lưỡi cắt Timeout can thiệp',
        desc: 'Đúng 1000ms, Feign Timeout ra tay cắt phăng kết nối, đơn phương hủy bỏ việc chờ đợi User Service!',
        resilience: 'Bản chất sinh tồn: Giải phóng ngay luồng worker thread để server không bị nghẽn dây chuyền.',
        statusColor: '#ef4444',
        code: 'CẮT 1000ms'
      };
    } else {
      pipe2Cut = true;
      const p = easeInOut((t - 4200) / 1800);
      packetX = orderX - p * (orderX - gwX);
      packetColor = '#ef4444';
      packetLabel = '504 TIMEOUT';
      narrative = {
        phase: 'Bước 4: Giải phóng luồng an toàn',
        action: 'Trả về HTTP 504 Gateway Timeout',
        desc: 'Order Service trả mã 504 về Client đúng sau 1s thay vì phải chờ 4s vô ích. Luồng xử lý đã được thu hồi an toàn.',
        resilience: 'Ngăn chặn thành công thảm họa sập dây chuyền (Cascading Failure).',
        statusColor: '#ef4444',
        code: 'HTTP 504 TIMEOUT'
      };
    }
  } else if (scenarioId === 'retry') {
    isUserError = t < 5200;
    if (t < 1400) {
      const p = easeInOut(t / 1400);
      packetX = orderX + p * (userX - orderX);
      packetColor = '#6366f1';
      packetLabel = 'Lần 1: Gọi User';
      narrative = {
        phase: 'Lần thử 1',
        action: 'Gửi request lần 1',
        desc: 'Order Service gọi User Service lần 1. User Service gặp sự cố mạng chớp nhoáng (lỗi 500).',
        resilience: 'Retry can thiệp: Giữ lại lỗi, CHƯA BÁO VỀ CLIENT để bảo vệ trải nghiệm.',
        statusColor: '#6366f1',
        code: 'LẦN 1: GỬI'
      };
    } else if (t < 2400) {
      packetX = userX;
      packetColor = '#ef4444';
      packetLabel = '500 LỖI 💥';
      narrative = {
        phase: 'Lần 1 Thất bại',
        action: 'User Service trả 500',
        desc: 'User Service trả về HTTP 500. Retry chặn lỗi lại và kích hoạt Exponential Backoff.',
        resilience: 'Không làm gián đoạn người dùng; chuẩn bị đệm thời gian nghỉ.',
        statusColor: '#ef4444',
        code: '500 ERROR'
      };
    } else if (t < 3500) {
      packetX = orderX;
      packetColor = '#f59e0b';
      packetLabel = 'Backoff 500ms ⏳';
      narrative = {
        phase: 'Exponential Backoff 500ms',
        action: 'Nghỉ 500ms trước khi thử lại',
        desc: 'Tạm dừng 500ms để đối tác có thời gian tự hồi phục, tránh bão Retry Storm dội tải dồn dập.',
        resilience: 'Kiểm soát tần suất thử lại, bảo vệ đối tác downstream.',
        statusColor: '#f59e0b',
        code: 'BACKOFF 500ms'
      };
    } else if (t < 4800) {
      const p = easeInOut((t - 3500) / 1300);
      packetX = orderX + p * (userX - orderX);
      packetColor = '#f59e0b';
      packetLabel = 'Lần 2: Thử lại';
      narrative = {
        phase: 'Lần thử 2',
        action: 'Tự động thử lại lần 2',
        desc: 'Hết 500ms, Order Service tự động bắn lại request lần 2. User Service vẫn chưa hồi phục kịp (vẫn lỗi 500).',
        resilience: 'Retry tiếp tục giữ lại và nhân đôi thời gian chờ lên 1000ms!',
        statusColor: '#f59e0b',
        code: 'LẦN 2: THỬ LẠI'
      };
    } else if (t < 5800) {
      packetX = orderX;
      packetColor = '#f59e0b';
      packetLabel = 'Backoff 1000ms ⏳';
      narrative = {
        phase: 'Exponential Backoff 1000ms',
        action: 'Nghỉ 1000ms trước lần cuối',
        desc: 'Nhân đôi thời gian chờ lên 1000ms để cho User Service thêm cơ hội reboot.',
        resilience: 'Cơ chế tự điều chỉnh nhịp độ thông minh.',
        statusColor: '#f59e0b',
        code: 'BACKOFF 1000ms'
      };
    } else if (t < 6800) {
      const p = easeInOut((t - 5800) / 1000);
      packetX = orderX + p * (userX - orderX);
      packetColor = '#22c55e';
      packetLabel = 'Lần 3: Thành công!';
      narrative = {
        phase: 'Lần thử 3: Tự cứu thành công!',
        action: 'User Service đã hồi phục',
        desc: 'Sau 1000ms, Order Service thử lại lần 3. Lúc này User Service đã hoàn tất reboot và trả về dữ liệu 200 OK!',
        resilience: 'Cứu vãn giao dịch thành công trong suốt với người dùng.',
        statusColor: '#22c55e',
        code: '200 OK'
      };
    } else {
      const p = easeInOut((t - 6800) / 700);
      packetX = userX - p * (userX - gwX);
      packetColor = '#22c55e';
      packetLabel = '200 OK ✅';
      narrative = {
        phase: 'Hoàn tất giao dịch',
        action: 'Trả về Client 200 OK',
        desc: 'Client nhận dữ liệu hoàn hảo với mã 200 OK. Khách hàng hoàn toàn không hay biết đã có 2 lần lỗi trước đó!',
        resilience: 'Độ kiên cường tối đa trước sự cố mạng chớp nhoáng (Transient Faults).',
        statusColor: '#22c55e',
        code: 'HTTP 200 OK'
      };
    }
  } else if (scenarioId === 'bulkhead') {
    // 10 concurrent requests
    const p10 = [];
    const barrierX = orderX - 25;
    for (let i = 0; i < 10; i++) {
      const isAccepted = i < 3;
      const startX = gwX - 40 + (i % 3) * 20;
      const startY = gwY - 35 + i * 8;
      let px, py, col, lbl;

      if (t < 1800) {
        const p = easeInOut(t / 1800);
        px = startX + p * (barrierX - startX);
        py = startY + (orderY - startY) * p * 0.4;
        col = '#818cf8';
        lbl = `#${i + 1}`;
      } else if (isAccepted) {
        const p = easeInOut((t - 1800) / 4200);
        px = barrierX + p * (userX - barrierX);
        py = orderY - 24 + i * 24;
        col = '#22c55e';
        lbl = `Slot ${i + 1} (200)`;
      } else {
        const bounceP = Math.min((t - 1800) / 2500, 1);
        const bounceDist = Math.sin(bounceP * Math.PI) * 140;
        px = barrierX - bounceDist;
        py = startY + Math.sin(i * 1.5) * 20;
        col = '#ef4444';
        lbl = '429';
      }
      p10.push({ x: px, y: py, color: col, label: lbl, accepted: isAccepted });
    }
    multiPackets = p10;
    packetVisible = false;

    if (t < 1800) {
      narrative = {
        phase: 'Bão lưu lượng ập đến',
        action: '10 Request đồng thời gửi đến',
        desc: '10 khách hàng cùng lúc gửi lệnh gọi tới Order Service.',
        resilience: 'Nếu không giới hạn, 10 request này sẽ chiếm trọn connection pool!',
        statusColor: '#6366f1',
        code: '10 REQUESTS'
      };
    } else if (t < 4500) {
      narrative = {
        phase: 'Bulkhead phân phối hạn ngạch',
        action: 'Cấp 3 slot · Từ chối 7 lượt (429)',
        desc: 'Vách ngăn Bulkhead chỉ cấp 3 suất vào xử lý. 7 lượt quá tải bị dội ngược ngay tức thì trong 1ms với mã HTTP 429!',
        resilience: 'Cách ly tài nguyên: Không để request ngâm lâu làm cạn luồng; bảo vệ các API khác an toàn.',
        statusColor: '#ef4444',
        code: '3x 200 · 7x 429'
      };
    } else {
      narrative = {
        phase: 'Hoàn tất an toàn',
        action: '3 Lượt hợp lệ hoàn thành',
        desc: '3 request được cấp phép hoàn tất xử lý sau 2 giây và trả về 200 OK an toàn.',
        resilience: 'Hệ thống vận hành vững như bàn thạch ngay cả trong tâm bão lưu lượng.',
        statusColor: '#22c55e',
        code: '3x 200 OK'
      };
    }
  } else if (scenarioId === 'breaker') {
    isUserError = t > 1200 && t < 5800;
    if (t < 2000) {
      leverAngle = 0; // CLOSED
      const p = easeInOut(t / 2000);
      packetX = orderX + p * (userX - orderX);
      packetColor = '#ef4444';
      packetLabel = 'User lỗi 500';
      narrative = {
        phase: 'Giai đoạn 1: Lỗi liên tiếp',
        action: 'User Service sập 100%',
        desc: 'User Service liên tục trả về lỗi HTTP 500. Tỷ lệ lỗi trong cửa sổ trượt vượt ngưỡng 50%.',
        resilience: 'Circuit Breaker phát hiện đối tác đã chết, chuẩn bị cơ chế ngắt cầu dao khẩn cấp.',
        statusColor: '#ef4444',
        code: 'LỖI > 50%'
      };
    } else if (t < 5200) {
      leverAngle = 45; // OPEN
      pipe2Blocked = true;
      const bounceP = ((t - 2000) % 1600) / 1600;
      if (bounceP < 0.4) {
        packetX = gwX + (bounceP / 0.4) * (orderX - 30 - gwX);
      } else {
        const ret = (bounceP - 0.4) / 0.6;
        packetX = orderX - 30 - ret * (orderX - 30 - gwX);
      }
      packetColor = '#ef4444';
      packetLabel = '503 FAIL-FAST (14ms)';
      narrative = {
        phase: 'Giai đoạn 2: CẦU DAO BUNG OPEN 🔴',
        action: 'Fail-Fast từ chối ngay trong 14ms',
        desc: 'Cầu dao bung mở! Request mới tới lập tức va phải cầu dao đang OPEN và bị nảy ngược trở ra với mã 503 trong 14ms (0 lượt gọi User).',
        resilience: 'Bảo vệ sinh tồn: Cứu Order Service; cho User Service thời gian thở để tự phục hồi; dập tắt bão lỗi dây chuyền.',
        statusColor: '#ef4444',
        code: '503 FAIL-FAST'
      };
    } else if (t < 6500) {
      leverAngle = 20; // HALF_OPEN
      const p = easeInOut((t - 5200) / 1300);
      packetX = orderX + p * (userX - orderX);
      packetColor = '#f59e0b';
      packetLabel = 'Thăm dò (Probe)';
      narrative = {
        phase: 'Giai đoạn 3: HALF-OPEN',
        action: 'Cho 1 request thăm dò đi qua',
        desc: 'Sau thời gian chờ, cầu dao hé mở cho đúng 1 request thăm dò đi qua để kiểm tra sức khỏe User Service.',
        resilience: 'Tự động kiểm tra phục hồi thông minh.',
        statusColor: '#f59e0b',
        code: 'HALF_OPEN 🟡'
      };
    } else {
      leverAngle = 0; // CLOSED
      const p = easeInOut((t - 6500) / 1000);
      packetX = userX - p * (userX - gwX);
      packetColor = '#22c55e';
      packetLabel = '200 OK (CLOSED 🟢)';
      narrative = {
        phase: 'Giai đoạn 4: Tự chữa lành hoàn tất',
        action: 'Đóng cầu dao CLOSED 🟢',
        desc: 'Lượt thăm dò thành công 200 OK! Cầu dao tự động đóng sập lại hoàn toàn (CLOSED), hệ thống hồi phục 100%!',
        resilience: 'Khép kín vòng đời kiên cường tự động.',
        statusColor: '#22c55e',
        code: 'CIRCUIT: CLOSED'
      };
    }
  } else if (scenarioId === 'converge') {
    const phaseIdx = Math.floor(t / 2000); // 5 phases across 10000ms
    const pT = (t % 2000) / 2000;
    const progress = easeInOut(pT);

    if (phaseIdx === 0) {
      packetX = gwX + progress * (orderX - gwX);
      packetColor = '#c084fc';
      packetLabel = 'Pha 1 · Bulkhead';
      narrative = {
        phase: 'Pha 1/5 · Bulkhead lọc bão tải',
        action: 'Cấp 3 slot (200) · Từ chối 3 slot (429)',
        desc: 'Gửi 6 request song song. Bulkhead cấp 3 slot chạy (200 OK) và từ chối ngay 3 lượt quá tải bằng HTTP 429.',
        resilience: 'Tầng Bulkhead lọc sạch bão tải bảo vệ Order Service.',
        statusColor: '#c084fc',
        code: 'PHA 1: BULKHEAD'
      };
    } else if (phaseIdx === 1) {
      packetX = orderX + progress * (userX - orderX);
      packetColor = '#38bdf8';
      packetLabel = 'Pha 2 · Retry';
      narrative = {
        phase: 'Pha 2/5 · Retry tự cứu',
        action: 'Thử lại 3 lần thành công (200 OK)',
        desc: 'User Service lỗi 2 lần đầu (500). Tầng Retry tự động thử lại lần 3 và lấy được dữ liệu thành công.',
        resilience: 'Tầng Retry xóa bỏ tác động của sự cố thoáng qua đối với người dùng.',
        statusColor: '#38bdf8',
        code: 'PHA 2: RETRY 200'
      };
    } else if (phaseIdx === 2) {
      pipe2Cut = progress > 0.5;
      packetX = orderX + Math.min(progress * 1.5, 0.8) * (userX - orderX);
      packetColor = '#ef4444';
      packetLabel = 'Pha 3 · Feign Timeout';
      narrative = {
        phase: 'Pha 3/5 · Feign Timeout cắt trễ & Bung mạch',
        action: 'Cắt sau 1s (504) kích hoạt Circuit Breaker',
        desc: 'User Service bị treo 3s. Feign Timeout cắt đứt sau 1000ms. Lỗi này kích hoạt Circuit Breaker BUNG OPEN!',
        resilience: 'Feign Timeout chuyển giao tín hiệu nguy cấp cho Circuit Breaker.',
        statusColor: '#ef4444',
        code: 'PHA 3: TIMEOUT 504'
      };
    } else if (phaseIdx === 3) {
      pipe2Blocked = true;
      leverAngle = 45;
      const bP = progress < 0.5 ? progress * 2 : 2 - progress * 2;
      packetX = gwX + bP * (orderX - 30 - gwX);
      packetColor = '#ef4444';
      packetLabel = 'Pha 4 · Fail-Fast 14ms (503)';
      narrative = {
        phase: 'Pha 4/5 · Circuit Breaker OPEN',
        action: 'Fail-Fast 14ms (0 lượt gọi User)',
        desc: 'Mạch đang OPEN. Request mới tới bị dội ngược ngay trong 14ms (HTTP 503). Retry tuyệt đối không gọi lại để chống bão Retry Storm!',
        resilience: 'CB bảo vệ downstream, dập tắt nguy cơ sập dây chuyền.',
        statusColor: '#ef4444',
        code: 'PHA 4: FAIL-FAST'
      };
    } else {
      leverAngle = 0;
      packetX = userX - (1 - progress) * (userX - gwX);
      packetColor = '#22c55e';
      packetLabel = 'Pha 5 · Tự chữa lành (200 OK)';
      narrative = {
        phase: 'Pha 5/5 · Tự chữa lành hoàn tất',
        action: 'Khôi phục, thăm dò thành công 200 OK',
        desc: 'User Service được sửa. Sau 3s mạch chuyển HALF_OPEN, gửi 1 request thăm dò thành công 200 OK và đóng mạch về CLOSED!',
        resilience: 'Khép lại trọn vẹn 100% vòng đời kiên cường của hệ thống Microservices.',
        statusColor: '#22c55e',
        code: 'PHA 5: 200 OK'
      };
    }
  } else if (scenarioId === 'fallback') {
    const isRet = t > 2500;
    if (!isRet) {
      const p = easeInOut(t / 2500);
      packetX = gwX + p * (orderX - gwX);
      packetColor = '#ef4444';
      packetLabel = 'User Service sập';
      narrative = {
        phase: 'Downstream sập nguồn',
        action: 'Mất kết nối User Service',
        desc: 'User Service gặp sự cố và không thể phản hồi.',
        resilience: 'Nếu KHÔNG CÓ Fallback: Khách hàng sẽ thấy màn hình lỗi 500 trắng xóa.',
        statusColor: '#ef4444',
        code: 'USER DOWN'
      };
    } else {
      const p = easeInOut((t - 2500) / 2500);
      packetX = orderX - p * (orderX - gwX);
      packetColor = '#22c55e';
      packetLabel = 'Khách dự phòng (200 OK)';
      narrative = {
        phase: 'Fallback can thiệp',
        action: 'Trả về dữ liệu dự phòng an toàn',
        desc: 'Hàm Fallback tự động can thiệp, tạo đối tượng "Khách hàng dự phòng" trả về mã 200 OK.',
        resilience: 'Bảo toàn trải nghiệm mua sắm không bị gián đoạn (Graceful Degradation).',
        statusColor: '#22c55e',
        code: '200 OK (FALLBACK)'
      };
    }
  }

  function handleReplay() {
    animTimeRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(true);
  }

  return (
    <div className="flow-visualizer-container">
      {/* Top Controller Bar */}
      <div className="visualizer-header">
        <div className="visualizer-title">
          <Activity size={17} className="pulse-icon" />
          <span>MÔ PHỎNG CHUYỂN ĐỘNG LIÊN TỤC 60 FPS (FLUID REQUEST MOTION)</span>
        </div>
        <div className="visualizer-controls">
          <span className="live-badge" style={{ color: narrative.statusColor, borderColor: narrative.statusColor }}>
            ● {narrative.code}
          </span>
          <button
            className={`vis-btn play-btn ${isPlaying ? 'active' : ''}`}
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? 'Tạm dừng chuyển động' : 'Tiếp tục phát'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            <span>{isPlaying ? 'Tạm dừng' : 'Phát chuyển động'}</span>
          </button>
          <button className="vis-btn" onClick={handleReplay} title="Chạy lại từ đầu">
            <RotateCcw size={14} />
            <span>Phát lại</span>
          </button>
        </div>
      </div>

      {/* Fluid SVG Stage (Always Rendered & Crisp Vector Graphics) */}
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
          </defs>

          {/* Background Grid Pattern */}
          <pattern id="gridPattern" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1c183a" strokeWidth="1" />
          </pattern>
          <rect width="900" height="240" fill="url(#gridPattern)" />

          {/* Pipe 1: Gateway -> Order */}
          <line x1="200" y1="120" x2="345" y2="120" stroke="#2c2559" strokeWidth="8" strokeLinecap="round" />
          <line x1="200" y1="120" x2="345" y2="120" stroke="url(#pipeGlow)" strokeWidth="3" strokeDasharray="6,12" className="animated-flow-line" />

          {/* Pipe 2: Order -> User */}
          <line
            x1="555" y1="120" x2="700" y2="120"
            stroke={pipe2Cut ? '#ef444433' : pipe2Blocked ? '#374151' : '#2c2559'}
            strokeWidth="8"
            strokeLinecap="round"
          />
          {!pipe2Cut && !pipe2Blocked && (
            <line x1="555" y1="120" x2="700" y2="120" stroke="url(#pipeGlow)" strokeWidth="3" strokeDasharray="6,12" className="animated-flow-line" />
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
              {/* 3 Green Slots */}
              <rect x="0" y="5" width="46" height="24" rx="6" fill="#064e3b" stroke="#10b981" strokeWidth="1.5" />
              <text x="23" y="21" textAnchor="middle" fill="#34d399" fontSize="10" fontWeight="bold">Slot 1</text>

              <rect x="0" y="35" width="46" height="24" rx="6" fill="#064e3b" stroke="#10b981" strokeWidth="1.5" />
              <text x="23" y="51" textAnchor="middle" fill="#34d399" fontSize="10" fontWeight="bold">Slot 2</text>

              <rect x="0" y="65" width="46" height="24" rx="6" fill="#064e3b" stroke="#10b981" strokeWidth="1.5" />
              <text x="23" y="81" textAnchor="middle" fill="#34d399" fontSize="10" fontWeight="bold">Slot 3</text>

              {/* Red Barrier for excess */}
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
                  {/* Lever base */}
                  <circle cx="-20" cy="0" r="4" fill="#94a3b8" />
                  <circle cx="20" cy="0" r="4" fill="#94a3b8" />
                  {/* Rotating Lever Arm */}
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
              stroke={isUserError ? '#e11d48' : '#10b981'}
              strokeWidth="2.5"
            />
            <circle cx="70" cy="35" r="20" fill={isUserError ? '#3d1624' : '#133526'} />
            <text x="70" y="42" textAnchor="middle" fill={isUserError ? '#f43f5e' : '#34d399'} fontSize="20">
              {isUserError ? '⚠️' : '👤'}
            </text>
            <text x="70" y="75" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="bold">User Service</text>
            <text x="70" y="93" textAnchor="middle" fill="#94a3b8" fontSize="10">
              {isUserError ? 'Giả lập lỗi (:8081)' : 'Bình thường (:8081)'}
            </text>
          </g>

          {/* Multiple Particles (Bulkhead) */}
          {multiPackets && multiPackets.map((p, idx) => (
            <g key={idx} transform={`translate(${p.x}, ${p.y})`} filter="url(#packetGlow)">
              <circle cx="0" cy="0" r="7" fill={p.color} />
              <circle cx="0" cy="0" r="3" fill="#ffffff" />
              <text x="0" y="-10" textAnchor="middle" fill={p.color} fontSize="9" fontWeight="bold">{p.label}</text>
            </g>
          ))}

          {/* Single Fluid Packet */}
          {packetVisible && (
            <g transform={`translate(${packetX}, ${packetY})`} filter="url(#packetGlow)">
              <circle cx="0" cy="0" r="13" fill={packetColor} className="pulsing-packet" />
              <circle cx="0" cy="0" r="6" fill="#ffffff" />
              <text x="0" y="-20" textAnchor="middle" fill={packetColor} fontSize="11" fontWeight="bold">
                {packetLabel}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Live Continuous Narration Card */}
      <div className="flow-explanation-card">
        <div className="step-badge-row">
          <span className="step-pill" style={{ backgroundColor: narrative.statusColor + '25', color: narrative.statusColor, borderColor: narrative.statusColor }}>
            {narrative.phase}
          </span>
          <span className="step-action-tag">
            <ArrowRight size={13} /> {narrative.action}
          </span>
        </div>
        <p className="step-desc" style={{ fontSize: '0.92rem', color: '#f1f5f9', fontWeight: 600 }}>
          {narrative.desc}
        </p>
        <div className="step-resilience-box" style={{ borderLeftColor: narrative.statusColor }}>
          <strong>Bản chất kiên cường:</strong> {narrative.resilience}
        </div>
      </div>
    </div>
  );
}
