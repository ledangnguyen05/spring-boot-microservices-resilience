import { useState, useEffect, useRef } from 'react';
import {
  Play, Pause, RotateCcw, Clock, RefreshCw, Layers, Zap,
  Activity, ArrowRight, ShieldCheck, CheckCircle2, AlertTriangle
} from 'lucide-react';

export default function FlowVisualizer({ scenarioId, busy, liveStage, breakerState, runCount = 0, actionLabel = 'Chạy kịch bản' }) {
  const canvasRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [manualPreview, setManualPreview] = useState(false);
  const [currentNarrative, setCurrentNarrative] = useState({
    phase: 'Bắt đầu',
    action: 'Đang chuẩn bị',
    desc: 'Hạt request chuẩn bị khởi hành từ Client...',
    resilience: 'Cơ chế sẵn sàng bảo vệ.',
    statusColor: '#6366f1',
    code: 'INIT'
  });

  // Animation timeline state (in milliseconds)
  const animTimeRef = useRef(0);
  const isPlayingRef = useRef(true);
  const lastFrameTimeRef = useRef(performance.now());
  const reqIdRef = useRef(null);

  // Sync isPlaying with ref
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Reset timeline on scenario change
  useEffect(() => {
    animTimeRef.current = 0;
    setIsPlaying(true);
    setManualPreview(false);
  }, [scenarioId]);

  // Triggered when user clicks Run button
  useEffect(() => {
    if (runCount > 0) {
      animTimeRef.current = 0;
      setIsPlaying(true);
      setManualPreview(true);
    }
  }, [runCount]);

  const showCanvas = runCount > 0 || busy || manualPreview;

  // Handle Canvas Rendering Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // High DPI scaling
    const dpr = window.devicePixelRatio || 1;
    const width = 900;
    const height = 280;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Node Positions
    const gwNode = { x: 130, y: 140, w: 140, h: 100 };
    const orderNode = { x: 450, y: 140, w: 210, h: 140 };
    const userNode = { x: 770, y: 140, w: 140, h: 100 };

    // Easing helpers
    const easeInOut = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const easeInQuad = (t) => t * t;

    function render(now) {
      const delta = Math.min(now - lastFrameTimeRef.current, 60);
      lastFrameTimeRef.current = now;

      if (isPlayingRef.current) {
        animTimeRef.current += delta;
      }

      // Loop duration based on scenario
      let loopDuration = 6000;
      if (scenarioId === 'retry') loopDuration = 9000;
      else if (scenarioId === 'timeout') loopDuration = 6500;
      else if (scenarioId === 'bulkhead') loopDuration = 6500;
      else if (scenarioId === 'breaker') loopDuration = 8000;
      else if (scenarioId === 'converge') loopDuration = 12000;

      const t = animTimeRef.current % loopDuration;

      // Clear Canvas
      ctx.clearRect(0, 0, width, height);

      // Background Grid Effect
      ctx.strokeStyle = '#1b1738';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw Main Pipeline Pipes
      // Pipe 1: Gateway -> Order
      ctx.beginPath();
      ctx.moveTo(gwNode.x + gwNode.w / 2, gwNode.y);
      ctx.lineTo(orderNode.x - orderNode.w / 2, orderNode.y);
      ctx.strokeStyle = '#2d2856';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Flowing glow dots in pipe 1
      const flowOffset1 = (animTimeRef.current * 0.08) % 20;
      ctx.beginPath();
      ctx.setLineDash([4, 16]);
      ctx.lineDashOffset = -flowOffset1;
      ctx.moveTo(gwNode.x + gwNode.w / 2, gwNode.y);
      ctx.lineTo(orderNode.x - orderNode.w / 2, orderNode.y);
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]);

      // Pipe 2: Order -> User
      const pipe2StartX = orderNode.x + orderNode.w / 2;
      const pipe2EndX = userNode.x - userNode.w / 2;

      let pipe2Cut = false;
      let pipe2Blocked = false;

      // Check cuts/blocks according to scenario
      if (scenarioId === 'timeout' && t > 2500 && t < 5500) pipe2Cut = true;
      if (scenarioId === 'breaker' && t > 2800 && t < 6500) pipe2Blocked = true;
      if (scenarioId === 'converge') {
        const pT = (t % 12000);
        if (pT > 5000 && pT < 7200) pipe2Cut = true;
        if (pT > 7200 && pT < 9600) pipe2Blocked = true;
      }

      ctx.beginPath();
      ctx.moveTo(pipe2StartX, orderNode.y);
      ctx.lineTo(pipe2EndX, userNode.y);
      ctx.strokeStyle = pipe2Cut ? '#ef444433' : pipe2Blocked ? '#374151' : '#2d2856';
      ctx.lineWidth = 8;
      ctx.stroke();

      if (!pipe2Cut && !pipe2Blocked) {
        const flowOffset2 = (animTimeRef.current * 0.08) % 20;
        ctx.beginPath();
        ctx.setLineDash([4, 16]);
        ctx.lineDashOffset = -flowOffset2;
        ctx.moveTo(pipe2StartX, orderNode.y);
        ctx.lineTo(pipe2EndX, userNode.y);
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw Scissors or Barrier if cut/blocked
      if (pipe2Cut) {
        const cutX = (pipe2StartX + pipe2EndX) / 2;
        ctx.save();
        ctx.translate(cutX, orderNode.y);
        // Blade animation
        const bladeAngle = Math.sin(animTimeRef.current * 0.015) * 0.2;
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✂️', 0, -2);
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 11px system-ui';
        ctx.fillText('NGẮT TIMEOUT (1s)', 0, -26);
        ctx.restore();
      }

      if (pipe2Blocked) {
        const barrierX = (pipe2StartX + pipe2EndX) / 2;
        ctx.save();
        ctx.translate(barrierX, orderNode.y);
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 10;
        ctx.fillRect(-12, -25, 24, 50);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⛔', 0, 0);
        ctx.font = 'bold 10px system-ui';
        ctx.fillStyle = '#fca5a5';
        ctx.fillText('CHẶN ĐỨNG (0 LƯỢT)', 0, -32);
        ctx.restore();
      }

      // Draw Nodes
      // Node 1: API Gateway
      drawServiceNode(ctx, gwNode, '🌐 API Gateway', ':8080 · Client', '#4338ca', '#1a1640');

      // Node 2: Order Service (Resilience Hub)
      drawServiceNode(ctx, orderNode, '📦 Order Service (:8082)', 'Trung tâm điều phối & Bảo vệ', '#6366f1', '#161331');

      // Inside Order: Active Guard Visual
      drawGuardBadge(ctx, orderNode.x, orderNode.y + 12, scenarioId, t, isCircuitOpen(scenarioId, t, breakerState));

      // Node 3: User Service
      const isUserError = (scenarioId === 'retry' && t < 5500) ||
                          (scenarioId === 'timeout' && t > 1200 && t < 3800) ||
                          (scenarioId === 'breaker' && t > 1500 && t < 6500) ||
                          (scenarioId === 'converge' && t > 4800 && t < 9600);
      drawServiceNode(
        ctx, userNode, '👤 User Service',
        isUserError ? 'Giả lập sự cố (:8081)' : 'Hoạt động tốt (:8081)',
        isUserError ? '#e11d48' : '#10b981', '#1d152e'
      );

      // SCENARIO ANIMATIONS (Dynamic fluid packets & particles)
      let narrative = { ...currentNarrative };

      if (scenarioId === 'normal') {
        narrative = animateNormal(ctx, t, gwNode, orderNode, userNode);
      } else if (scenarioId === 'timeout') {
        narrative = animateTimeout(ctx, t, gwNode, orderNode, userNode);
      } else if (scenarioId === 'retry') {
        narrative = animateRetry(ctx, t, gwNode, orderNode, userNode);
      } else if (scenarioId === 'bulkhead') {
        narrative = animateBulkhead(ctx, t, gwNode, orderNode, userNode);
      } else if (scenarioId === 'breaker') {
        narrative = animateCircuitBreaker(ctx, t, gwNode, orderNode, userNode);
      } else if (scenarioId === 'converge') {
        narrative = animateConverge(ctx, t, gwNode, orderNode, userNode);
      } else if (scenarioId === 'fallback') {
        narrative = animateFallback(ctx, t, gwNode, orderNode, userNode);
      }

      setCurrentNarrative(narrative);

      reqIdRef.current = requestAnimationFrame(render);
    }

    reqIdRef.current = requestAnimationFrame(render);

    return () => {
      if (reqIdRef.current) cancelAnimationFrame(reqIdRef.current);
    };
  }, [scenarioId, breakerState]);

  function isCircuitOpen(scId, t, realBreaker) {
    if (scId === 'breaker') return (t > 2400 && t < 6500);
    if (scId === 'converge') {
      const pT = (t % 12000);
      return (pT > 6500 && pT < 9800);
    }
    return realBreaker === 'OPEN';
  }

  // Draw node helper
  function drawServiceNode(ctx, node, title, subtitle, strokeColor, fillColor) {
    ctx.save();
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 8;

    const r = 12;
    const x = node.x - node.w / 2;
    const y = node.y - node.h / 2;
    ctx.beginPath();
    ctx.roundRect(x, y, node.w, node.h, r);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(title, node.x, y + 14);

    // Subtitle
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px system-ui, -apple-system, sans-serif';
    ctx.fillText(subtitle, node.x, y + 33);
    ctx.restore();
  }

  // Draw guard badge inside Order Service
  function drawGuardBadge(ctx, cx, cy, scId, t, cbOpen) {
    ctx.save();
    ctx.fillStyle = '#0f0c24';
    ctx.strokeStyle = '#3730a3';
    ctx.lineWidth = 1.2;
    const bw = 176;
    const bh = 60;
    ctx.beginPath();
    ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 8);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (scId === 'timeout') {
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 11px system-ui';
      ctx.fillText('⏱️ Feign Timeout (1.0s)', cx, cy - 12);
      ctx.fillStyle = t > 2500 ? '#ef4444' : '#94a3b8';
      ctx.font = '10px system-ui';
      ctx.fillText(t > 2500 ? 'Đã cắt luồng bảo vệ!' : 'Đang theo dõi thời gian...', cx, cy + 12);
    } else if (scId === 'retry') {
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px system-ui';
      ctx.fillText('🔄 Resilience4j Retry', cx, cy - 12);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '10px system-ui';
      let attemptText = 'Chuẩn bị';
      if (t < 2500) attemptText = 'Lần 1: Lỗi 500';
      else if (t < 5500) attemptText = 'Lần 2: Backoff & thử lại';
      else attemptText = 'Lần 3: Tự cứu thành công ✅';
      ctx.fillText(attemptText, cx, cy + 12);
    } else if (scId === 'bulkhead') {
      ctx.fillStyle = '#c084fc';
      ctx.font = 'bold 11px system-ui';
      ctx.fillText('🛡️ Bulkhead (3 Slots)', cx, cy - 12);
      ctx.fillStyle = '#fde047';
      ctx.font = '10px system-ui';
      ctx.fillText('3 Cho phép · 7 Dội lại (429)', cx, cy + 12);
    } else if (scId === 'breaker') {
      ctx.fillStyle = cbOpen ? '#ef4444' : '#10b981';
      ctx.font = 'bold 11px system-ui';
      ctx.fillText(`⚡ Cầu dao: ${cbOpen ? 'OPEN (BẬT MỞ) 🔴' : 'CLOSED 🟢'}`, cx, cy - 12);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px system-ui';
      ctx.fillText(cbOpen ? 'Chặn đứng Fail-Fast (14ms)' : 'Cho phép lưu thông bình thường', cx, cy + 12);
    } else if (scId === 'converge') {
      ctx.fillStyle = '#818cf8';
      ctx.font = 'bold 11px system-ui';
      ctx.fillText('🛡️ 4 Tầng lồng nhau', cx, cy - 12);
      ctx.fillStyle = '#34d399';
      ctx.font = '10px system-ui';
      ctx.fillText('Retry ➔ CB ➔ Bulkhead ➔ Feign', cx, cy + 12);
    } else {
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 11px system-ui';
      ctx.fillText('✅ OpenFeign Chuẩn', cx, cy - 10);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px system-ui';
      ctx.fillText('Giao tiếp trực tiếp', cx, cy + 12);
    }
    ctx.restore();
  }

  // Draw glowing moving packet
  function drawPacket(ctx, x, y, color, label, radius = 10, shadow = true) {
    ctx.save();
    if (shadow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
    }
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Inner bright core
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    if (label) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, y - radius - 5);
    }
    ctx.restore();
  }

  // --- 1. NORMAL SCENARIO ---
  function animateNormal(ctx, t, gw, order, user) {
    // 0 -> 2000: Gateway to User
    // 2000 -> 4000: User to Gateway
    let px, py, color, label, statusColor, desc, action, code, resilience;
    if (t < 2000) {
      const p = t / 2000;
      px = gw.x + p * (user.x - gw.x);
      py = gw.y;
      color = '#6366f1';
      label = 'GET /api/orders/1';
      statusColor = '#6366f1';
      action = 'Gửi request';
      desc = 'Khách hàng gửi yêu cầu xem đơn hàng #001. Request đang lướt mượt mà qua Order Service sang User Service.';
      code = 'HTTP GET';
      resilience = 'Đường truyền ổn định, không có lỗi giả lập.';
    } else {
      const p = (t - 2000) / 2000;
      px = user.x - p * (user.x - gw.x);
      py = gw.y;
      color = '#10b981';
      label = '200 OK (User Data)';
      statusColor = '#10b981';
      action = 'Phản hồi thành công';
      desc = 'User Service xử lý xong và phản hồi dữ liệu khách hàng. Order Service gộp dữ liệu đơn hàng và trả về Client.';
      code = 'HTTP 200 OK';
      resilience = 'Giao dịch hoàn tất thành công trong ~15ms.';
    }
    drawPacket(ctx, px, py, color, label, 11);
    return { phase: t < 2000 ? 'Lượt đi (Request)' : 'Lượt về (Response)', action, desc, resilience, statusColor, code };
  }

  // --- 2. TIMEOUT SCENARIO ---
  function animateTimeout(ctx, t, gw, order, user) {
    let px = gw.x, py = gw.y, color = '#6366f1', label = 'GET', statusColor = '#6366f1', action = '', desc = '', code = '', resilience = '';

    if (t < 1500) {
      // Traveling Gateway -> User
      const p = t / 1500;
      px = gw.x + p * (user.x - gw.x);
      py = gw.y;
      color = '#6366f1';
      label = 'GET';
      action = 'Đang chuyển tiếp';
      desc = 'Request từ Order Service gửi sang User Service (:8081).';
      resilience = 'Order Service cấp phát 1 luồng (thread) để xử lý yêu cầu này.';
      code = 'START';
      statusColor = '#6366f1';
    } else if (t < 3500) {
      // Stuck at User Service with rotating countdown gauge
      px = user.x;
      py = user.y;
      color = '#f59e0b';
      label = 'BỊ NGHẼN 4s';

      // Draw countdown circle
      const waitP = (t - 1500) / 2000;
      ctx.save();
      ctx.beginPath();
      ctx.arc(user.x, user.y, 28, 0, Math.PI * 2);
      ctx.strokeStyle = '#332a54';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(user.x, user.y, 28, -Math.PI / 2, -Math.PI / 2 + waitP * Math.PI * 2);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();

      action = 'User Service bị treo 4000ms';
      desc = 'User Service bị ngâm nghẽn I/O. Order Service bắt đầu kích hoạt đồng hồ đếm ngược Timeout.';
      resilience = 'Nếu KHÔNG CÓ Timeout, luồng này sẽ bị treo chết trong 4s, nhanh chóng làm sập cạn kiệt Connection Pool!';
      code = `Chờ ${(waitP * 1000).toFixed(0)}ms / 1000ms`;
      statusColor = '#f59e0b';
    } else if (t < 4000) {
      // Cut event! Scissors cut and spark
      px = (order.x + user.x) / 2;
      py = order.y;
      color = '#ef4444';
      label = 'CẮT ĐỨT!';

      // Spark particles
      for (let i = 0; i < 6; i++) {
        const sparkAngle = (i / 6) * Math.PI * 2 + (t * 0.05);
        const dist = 18;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(px + Math.cos(sparkAngle) * dist, py + Math.sin(sparkAngle) * dist, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      action = 'TIMEOUT KÍCH HOẠT (1.0s)';
      desc = 'Đúng mốc 1000ms, Feign Timeout ra tay cắt phăng kết nối, chủ động hủy việc chờ đợi vô vọng!';
      resilience = 'Bản chất sinh tồn: Giải phóng ngay luồng worker thread để server không bị nghẽn dây chuyền.';
      code = 'CẮT 1000ms';
      statusColor = '#ef4444';
    } else {
      // Retreating fast to Gateway with 504
      const p = (t - 4000) / 2000;
      px = order.x - p * (order.x - gw.x);
      py = order.y;
      color = '#ef4444';
      label = '504 TIMEOUT';
      action = 'Trả lỗi kiểm soát & Giải phóng luồng';
      desc = 'Order Service trả về HTTP 504 Gateway Timeout cho Client sau đúng 1s. Toàn bộ tài nguyên đã được thu hồi an toàn.';
      resilience = 'Thành công bảo vệ Order Service tiếp tục phục vụ hàng triệu người dùng khác.';
      code = 'HTTP 504 TIMEOUT';
      statusColor = '#ef4444';
    }

    drawPacket(ctx, px, py, color, label, 11);
    return { phase: 'Topic 1 · Feign Timeout', action, desc, resilience, statusColor, code };
  }

  // --- 3. RETRY SCENARIO ---
  function animateRetry(ctx, t, gw, order, user) {
    let px = order.x, py = order.y, color = '#6366f1', label = '', statusColor = '#6366f1', action = '', desc = '', code = '', resilience = '';

    if (t < 1500) {
      // Attempt 1: Order -> User
      const p = t / 1500;
      px = order.x + p * (user.x - order.x);
      py = order.y;
      color = '#6366f1';
      label = 'Thử lần 1';
      action = 'Lần thử 1: Gọi User Service';
      desc = 'Order Service phát lệnh gọi lần 1 sang User Service.';
      resilience = 'Cơ chế Retry đang theo dõi kết quả.';
      code = 'LẦN 1';
    } else if (t < 2300) {
      // Attempt 1 fail explosion at User
      px = user.x;
      py = user.y;
      color = '#ef4444';
      label = '500 LỖI 💥';
      action = 'Lần 1 thất bại (HTTP 500)';
      desc = 'User Service gặp lỗi tạm thời và phản hồi HTTP 500. Retry chặn lỗi lại, CHƯA BÁO VỀ CLIENT!';
      resilience = 'Chặn lỗi ở tầng mạng để tự động cứu chữa thay vì làm gián đoạn trải nghiệm người dùng.';
      code = 'LỖI 500';
      statusColor = '#ef4444';
    } else if (t < 3500) {
      // Backoff 1: 500ms countdown at Order
      px = order.x;
      py = order.y;
      color = '#f59e0b';
      label = 'Backoff 500ms ⏳';
      action = 'Tạm dừng 500ms (Exponential Backoff)';
      desc = 'Hệ thống đệm thời gian nghỉ 500ms để đối tác có thời gian tự hồi phục, tránh bão Retry Storm.';
      resilience = 'Exponential Backoff: Chống dội tải ngược dồn dập.';
      code = 'BACKOFF 500ms';
      statusColor = '#f59e0b';
    } else if (t < 5000) {
      // Attempt 2: Order -> User
      const p = (t - 3500) / 1500;
      px = order.x + p * (user.x - order.x);
      py = order.y;
      color = '#f59e0b';
      label = 'Thử lần 2';
      action = 'Lần thử 2: Gọi lại User Service';
      desc = 'Sau 500ms, Order Service tự động bắn lại request lần 2.';
      resilience = 'Tự động thử lại không cần người dùng bấm F5.';
      code = 'LẦN 2';
    } else if (t < 5800) {
      // Attempt 2 fail explosion
      px = user.x;
      py = user.y;
      color = '#ef4444';
      label = '500 LỖI 💥';
      action = 'Lần 2 vẫn thất bại (HTTP 500)';
      desc = 'User Service vẫn chưa hồi phục kịp ở lần 2. Retry tiếp tục giữ lại và nhân đôi thời gian chờ lên 1000ms!';
      resilience = 'Nhân đôi thời gian chờ (1000ms) trước khi buông xuôi.';
      code = 'LỖI 500';
      statusColor = '#ef4444';
    } else if (t < 7200) {
      // Attempt 3: Order -> User (Success!)
      const p = (t - 5800) / 1400;
      px = order.x + p * (user.x - order.x);
      py = order.y;
      color = '#10b981';
      label = 'Thử lần 3';
      action = 'Lần thử 3: Gọi lại lần cuối';
      desc = 'Sau 1000ms, Order Service thử lại lần 3. Lúc này User Service đã hoàn tất reboot và trả về dữ liệu thành công!';
      resilience = 'Cứu vãn thành công yêu cầu từ cõi chết!';
      code = '200 OK';
      statusColor = '#10b981';
    } else {
      // Smooth return to Gateway
      const p = (t - 7200) / 1800;
      px = user.x - p * (user.x - gw.x);
      py = gw.y;
      color = '#10b981';
      label = '200 OK ✅';
      action = 'Tự cứu thành công — Trả 200 OK';
      desc = 'Client nhận được dữ liệu hoàn hảo với HTTP 200 OK. Khách hàng hoàn toàn không hề hay biết đã có 2 lần lỗi trước đó!';
      resilience = 'Độ kiên cường tuyệt đối trước các sự cố mạng chớp nhoáng (Transient Faults).';
      code = 'HTTP 200 OK';
      statusColor = '#10b981';
    }

    drawPacket(ctx, px, py, color, label, 11);
    return { phase: 'Topic 2 · Resilience4j Retry', action, desc, resilience, statusColor, code };
  }

  // --- 4. BULKHEAD SCENARIO (10 concurrent packets with physics bounce) ---
  function animateBulkhead(ctx, t, gw, order, user) {
    // 10 packets flying towards Order
    const packetCount = 10;
    const barrierX = order.x - 20;

    // Draw 3 open slots vs shield wall in Order
    ctx.save();
    ctx.fillStyle = '#1e1b4b';
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2;

    // Draw 3 green slots
    for (let s = 0; s < 3; s++) {
      const slotY = order.y - 30 + s * 30;
      ctx.fillStyle = '#064e3b';
      ctx.strokeStyle = '#10b981';
      ctx.fillRect(barrierX - 10, slotY - 10, 40, 20);
      ctx.strokeRect(barrierX - 10, slotY - 10, 40, 20);
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 9px system-ui';
      ctx.fillText(`Slot ${s + 1}`, barrierX + 10, slotY + 3);
    }

    // Draw Bulkhead Shield Barrier
    ctx.fillStyle = '#dc2626';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 10;
    ctx.fillRect(barrierX - 8, order.y + 25, 16, 45);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui';
    ctx.fillText('🛡️ CHẮN', barrierX, order.y + 48);
    ctx.restore();

    let action = '', desc = '', code = '', resilience = '', statusColor = '#c084fc';

    // Simulate 10 particles
    for (let i = 0; i < packetCount; i++) {
      const isAccepted = i < 3; // First 3 accepted
      const startX = gw.x - 50 + (i % 3) * 20;
      const startY = gw.y - 40 + i * 9;

      let px, py, pColor;

      if (t < 2000) {
        // All flying towards Order
        const p = t / 2000;
        px = startX + p * (barrierX - startX);
        py = startY + (order.y - startY) * p * 0.4;
        pColor = '#818cf8';
      } else if (isAccepted) {
        // 3 accepted packets proceed smoothly into slots and to User
        const p = (t - 2000) / 4000;
        const targetSlotY = order.y - 30 + i * 30;
        px = barrierX + p * (user.x - barrierX);
        py = targetSlotY;
        pColor = '#10b981';
      } else {
        // 7 rejected packets bounce back off barrier with elastic rebound!
        const bounceP = (t - 2000) / 2500;
        const bounceDist = Math.sin(Math.min(bounceP * Math.PI, Math.PI)) * 140;
        px = barrierX - bounceDist;
        py = startY + Math.sin(i * 1.5) * 25;
        pColor = '#ef4444';
      }

      drawPacket(ctx, px, py, pColor, isAccepted ? `OK #${i + 1}` : '429', 7, false);
    }

    if (t < 2000) {
      action = '10 Request ập đến cùng lúc';
      desc = 'Bão lưu lượng 10 request đồng thời đổ vào Order Service.';
      resilience = 'Nếu không có vách ngăn Bulkhead, 10 request này sẽ chiếm trọn connection pool!';
      code = '10 REQUESTS';
    } else if (t < 4500) {
      action = 'Bulkhead cấp 3 slot · Từ chối 7 lượt (429)';
      desc = 'Chỉ có 3 request lọt vào 3 slot xử lý. 7 request còn lại va vào vách ngăn Bulkhead và bị nảy ngược ra ngoài với HTTP 429 chỉ trong 1ms!';
      resilience = 'Không để request rác ngâm lâu trong RAM hoặc Thread Pool; bảo vệ an toàn cho các API khác.';
      code = '3x 200 OK · 7x 429';
      statusColor = '#ef4444';
    } else {
      action = '3 Request hợp lệ hoàn tất an toàn';
      desc = '3 request được cấp phép hoàn tất xử lý sau 2 giây và trả về 200 OK.';
      resilience = 'Hệ thống vận hành vững như bàn thạch ngay cả trong tâm bão lưu lượng.';
      code = 'HOÀN THÀNH';
      statusColor = '#10b981';
    }

    return { phase: 'Topic 3 · Resilience4j Bulkhead', action, desc, resilience, statusColor, code };
  }

  // --- 5. CIRCUIT BREAKER SCENARIO (Physical lever switch & Fail-Fast 14ms bounce) ---
  function animateCircuitBreaker(ctx, t, gw, order, user) {
    let px = gw.x, py = gw.y, color = '#6366f1', label = '', statusColor = '#6366f1', action = '', desc = '', code = '', resilience = '';

    // Draw Breaker Switch inside Order
    const switchX = order.x + 30;
    const switchY = order.y;
    const isLeverOpen = t > 2400 && t < 6500;
    const isHalfOpen = t >= 6500 && t < 7500;

    ctx.save();
    ctx.translate(switchX, switchY);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';

    if (isLeverOpen) {
      // Lever opened UP at 50 degrees (red spark)
      ctx.strokeStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(-15, 0);
      ctx.lineTo(15, -35); // lifted lever
      ctx.stroke();

      // Electrical arc sparks
      ctx.fillStyle = '#fef08a';
      ctx.font = '16px system-ui';
      ctx.fillText('⚡', 12, -38);
    } else if (isHalfOpen) {
      // Lever half open (yellow)
      ctx.strokeStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(-15, 0);
      ctx.lineTo(15, -16);
      ctx.stroke();
    } else {
      // Lever closed (green solid)
      ctx.strokeStyle = '#10b981';
      ctx.beginPath();
      ctx.moveTo(-15, 0);
      ctx.lineTo(15, 0);
      ctx.stroke();
    }
    ctx.restore();

    if (t < 2400) {
      // Phase 1: Requests passing through, but User failing 100%
      const p = (t % 1200) / 1200;
      px = order.x + p * (user.x - order.x);
      py = order.y;
      color = '#ef4444';
      label = 'User lỗi 500';
      action = 'User Service sập liên tục 100%';
      desc = 'Các request gửi sang User Service đều nhận về lỗi HTTP 500. Tỷ lệ lỗi trong cửa sổ trượt vượt quá 50%.';
      resilience = 'Circuit Breaker phát hiện downstream đã chết, chuẩn bị cơ chế ngắt cầu dao khẩn cấp.';
      code = 'FAILURE > 50%';
      statusColor = '#ef4444';
    } else if (t < 4000) {
      // Phase 2: Breaker snaps OPEN!
      px = switchX;
      py = switchY;
      color = '#ef4444';
      label = 'CẦU DAO BUNG OPEN 🔴';
      action = 'CẦU DAO BẬT MỞ (OPEN) — Cắt đứt mạch';
      desc = 'Cầu dao an toàn lập tức bung mở! Mọi kết nối tới User Service bị ngắt đứt hoàn toàn.';
      resilience = 'Từ thời điểm này, KHÔNG CÓ BẤT KỲ REQUEST NÀO được phép gọi sang User Service nữa!';
      code = 'CIRCUIT: OPEN';
      statusColor = '#ef4444';
    } else if (t < 6500) {
      // Phase 3: Fail-Fast 14ms Bounce!
      // Packet arrives at switch, bounces right off back to Client!
      const p = (t - 4000) / 2500;
      if (p < 0.4) {
        // Fast arrival
        px = gw.x + (p / 0.4) * (switchX - gw.x);
      } else {
        // Bounces back immediately!
        const bounceBack = (p - 0.4) / 0.6;
        px = switchX - bounceBack * (switchX - gw.x);
      }
      py = order.y;
      color = '#ef4444';
      label = '503 FAIL-FAST (14ms)';
      action = 'Fail-Fast: Nảy ngược trong 14ms (0 lượt gọi User)';
      desc = 'Request mới vừa chạm vào Order Service lập tức va phải cầu dao đang OPEN và bị dội ngược ra ngay trong 14ms!';
      resilience = 'Bảo vệ sinh tồn: Cứu Order Service; Cho User Service thời gian thở để tự phục hồi; Chống sập dây chuyền (Cascading Failure).';
      code = 'HTTP 503 FAIL-FAST';
      statusColor = '#ef4444';
    } else if (t < 7500) {
      // Phase 4: HALF-OPEN probe trial
      const p = (t - 6500) / 1000;
      px = switchX + p * (user.x - switchX);
      py = order.y;
      color = '#f59e0b';
      label = 'Thăm dò (Probe)';
      action = 'Chuyển sang HALF-OPEN — Cho 1 lượt thăm dò';
      desc = 'Sau thời gian chờ, cầu dao hé mở cho đúng 1 request thăm dò đi qua để kiểm tra sức khỏe User Service.';
      resilience = 'Cơ chế tự kiểm tra phục hồi thông minh.';
      code = 'HALF_OPEN 🟡';
      statusColor = '#f59e0b';
    } else {
      // Phase 5: Probe success, Breaker snaps CLOSED!
      const p = (t - 7500) / 500;
      px = user.x - p * (user.x - gw.x);
      py = order.y;
      color = '#10b981';
      label = '200 OK (CLOSED)';
      action = 'Thăm dò thành công — Đóng cầu dao CLOSED 🟢';
      desc = 'Lượt thăm dò thành công 200 OK! Cầu dao đóng sập lại hoàn toàn (CLOSED), hệ thống tự chữa lành trọn vẹn!';
      resilience = 'Khép kín vòng đời kiên cường tự động.';
      code = 'CIRCUIT: CLOSED';
      statusColor = '#10b981';
    }

    drawPacket(ctx, px, py, color, label, 11);
    return { phase: 'Topic 4 · Resilience4j Circuit Breaker', action, desc, resilience, statusColor, code };
  }

  // --- 6. CONVERGE 4-IN-1 PIPELINE (5 Phases) ---
  function animateConverge(ctx, t, gw, order, user) {
    const phaseIndex = Math.floor(t / 2400); // 5 phases across 12000ms
    const pT = t % 2400;
    const progress = pT / 2400;

    let px = gw.x, py = order.y, color = '#6366f1', label = '', action = '', desc = '', resilience = '', code = '', statusColor = '#6366f1';

    if (phaseIndex === 0) {
      // Phase 1: Bulkhead
      px = gw.x + progress * (order.x - gw.x);
      color = '#c084fc';
      label = 'Pha 1 · Bulkhead (6 lượt)';
      action = 'Pha 1/5: Bulkhead tiếp nhận 6 lượt tải';
      desc = 'Gửi 6 request song song. Bulkhead cấp 3 slot chạy (200 OK) và từ chối ngay 3 lượt quá tải bằng HTTP 429.';
      resilience = 'Tầng Bulkhead lọc sạch bão tải bảo vệ Order Service.';
      code = 'PHA 1: BULKHEAD';
      statusColor = '#c084fc';
    } else if (phaseIndex === 1) {
      // Phase 2: Retry
      px = order.x + progress * (user.x - order.x);
      color = '#38bdf8';
      label = 'Pha 2 · Retry tự cứu';
      action = 'Pha 2/5: Retry tự thử lại 3 lần';
      desc = 'User Service lỗi 2 lần đầu (500). Tầng Retry tự động thử lại lần 3 và lấy được dữ liệu thành công.';
      resilience = 'Tầng Retry ngoài cùng tự xóa bỏ tác động của lỗi chập chờn.';
      code = 'PHA 2: RETRY 200';
      statusColor = '#38bdf8';
    } else if (phaseIndex === 2) {
      // Phase 3: Feign Timeout + CB Open
      px = order.x + Math.min(progress * 1.5, 0.8) * (user.x - order.x);
      color = '#ef4444';
      label = 'Pha 3 · Feign cắt sau 1s';
      action = 'Pha 3/5: User Service treo 3s — Feign cắt đứt!';
      desc = 'User Service bị treo 3s. Feign Timeout cắt đứt chính xác sau 1000ms. Lỗi này kích hoạt Circuit Breaker BUNG OPEN!';
      resilience = 'Feign Timeout chuyển giao tín hiệu nguy cấp cho Circuit Breaker.';
      code = 'PHA 3: TIMEOUT 504';
      statusColor = '#ef4444';
    } else if (phaseIndex === 3) {
      // Phase 4: Circuit Breaker OPEN Fail-Fast
      // Bounces back at Order in 14ms!
      const bounce = progress < 0.5 ? progress * 2 : 2 - progress * 2;
      px = gw.x + bounce * (order.x - gw.x);
      color = '#ef4444';
      label = 'Pha 4 · Fail-Fast 14ms (503)';
      action = 'Pha 4/5: Circuit Breaker OPEN — Từ chối 503 ngay ở cửa!';
      desc = 'Mạch đang OPEN. Request mới tới bị dội ngược ngay trong 14ms (HTTP 503). Retry tuyệt đối không gọi lại để chống bão Retry Storm!';
      resilience = 'Sự phối hợp hoàn hảo: CB bảo vệ downstream, dập tắt bão Retry.';
      code = 'PHA 4: FAIL-FAST';
      statusColor = '#ef4444';
    } else {
      // Phase 5: Self Healing
      px = user.x - (1 - progress) * (user.x - gw.x);
      color = '#10b981';
      label = 'Pha 5 · Tự chữa lành (200 OK)';
      action = 'Pha 5/5: User Service phục hồi — Thăm dò & Khép mạch CLOSED 🟢';
      desc = 'User Service được sửa. Sau 3s mạch chuyển HALF_OPEN, gửi 1 request thăm dò thành công 200 OK và đóng mạch về CLOSED!';
      resilience = 'Khép lại trọn vẹn 100% vòng đời kiên cường của hệ thống Microservices.';
      code = 'PHA 5: 200 OK';
      statusColor = '#10b981';
    }

    drawPacket(ctx, px, py, color, label, 11);
    return { phase: 'Hội tụ 4 Topic (5 Pha)', action, desc, resilience, statusColor, code };
  }

  // --- 7. FALLBACK SCENARIO ---
  function animateFallback(ctx, t, gw, order, user) {
    const isReturning = t > 2500;
    let px, py, color, label;
    if (!isReturning) {
      const p = t / 2500;
      px = gw.x + p * (order.x - gw.x);
      py = order.y;
      color = '#ef4444';
      label = 'Downstream sập';
    } else {
      const p = (t - 2500) / 2500;
      px = order.x - p * (order.x - gw.x);
      py = order.y;
      color = '#10b981';
      label = 'Fallback: Khách dự phòng';
    }
    drawPacket(ctx, px, py, color, label, 11);
    return {
      phase: 'Mở rộng · Fallback',
      action: isReturning ? 'Fallback trả đối tượng dự phòng an toàn' : 'User Service bị sập nguồn',
      desc: isReturning ? 'Hàm Fallback tự động can thiệp, đóng gói dữ liệu "Khách hàng dự phòng" trả về HTTP 200 OK mượt mà.' : 'User Service không phản hồi.',
      resilience: 'Bảo toàn trải nghiệm mua sắm không bị đứt đoạn.',
      statusColor: isReturning ? '#10b981' : '#ef4444',
      code: isReturning ? '200 OK (FALLBACK)' : 'DOWNSTREAM DOWN'
    };
  }

  function handleReplay() {
    animTimeRef.current = 0;
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
          <span className="live-badge" style={{ color: showCanvas ? currentNarrative.statusColor : '#94a3b8', borderColor: showCanvas ? currentNarrative.statusColor : '#475569' }}>
            ● {showCanvas ? currentNarrative.code : 'CHỜ LỆNH'}
          </span>
          {showCanvas && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Standby Banner or Fluid Canvas Stage */}
      {!showCanvas ? (
        <div className="visualizer-standby">
          <div className="standby-icon"><Activity size={24} /></div>
          <div className="standby-text">
            <strong>Mô phỏng chuyển động đang chờ lệnh</strong>
            <p>Bấm nút <strong>&quot;{actionLabel}&quot;</strong> ở trên để khởi chạy chuyển động hạt request và xem kết quả đổ về từng bước trên bảng.</p>
          </div>
          <button className="vis-btn play-btn" onClick={() => setManualPreview(true)}>
            <Play size={14} /> <span>Xem trước chuyển động</span>
          </button>
        </div>
      ) : (
        <>
          <div className="canvas-wrapper">
            <canvas ref={canvasRef} className="flow-canvas" />
          </div>

          {/* Live Continuous Narration Card */}
          <div className="flow-explanation-card">
            <div className="step-badge-row">
              <span className="step-pill" style={{ backgroundColor: currentNarrative.statusColor + '25', color: currentNarrative.statusColor, borderColor: currentNarrative.statusColor }}>
                {currentNarrative.phase}
              </span>
              <span className="step-action-tag">
                <ArrowRight size={13} /> {currentNarrative.action}
              </span>
            </div>
            <p className="step-desc" style={{ fontSize: '0.92rem', color: '#f1f5f9', fontWeight: 600 }}>
              {currentNarrative.desc}
            </p>
            <div className="step-resilience-box" style={{ borderLeftColor: currentNarrative.statusColor }}>
              <strong>Bản chất kiên cường:</strong> {currentNarrative.resilience}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
