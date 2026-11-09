import { useEffect, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, BookOpen, ChevronRight, CircleCheck, CircleHelp, Clock3, Layers3,
  LoaderCircle, Network, Package, Play, RefreshCw, RotateCcw, ShieldCheck, Target,
  UserRound, Zap,
} from 'lucide-react';
import DemoResults, { TimeoutClock } from './DemoResults.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import FlowVisualizer from './FlowVisualizer.jsx';
import { lessons } from './demoLessons.js';

const gateway = 'http://localhost:8080';
const order = 'http://localhost:8082';
const user = 'http://localhost:8081';
const resilience = '/api/orders/resilience';

const scenarios = [
  { id: 'normal', name: 'Bình thường', icon: CircleCheck, label: 'Dữ liệu đầy đủ', title: 'Xem đơn hàng #001',
    chapter: 'KHỞI ĐỘNG',
    detail: 'Order Service đọc đơn hàng và lấy thông tin khách hàng tương ứng từ User Service.',
    condition: 'Không giả lập lỗi', action: 'Xem thông tin đơn hàng', question: 'Đơn hàng trả về dữ liệu gì?' },
  { id: 'timeout', name: 'Timeout', icon: Clock3, label: 'Topic 1 · Giới hạn chờ', title: 'Đặt thời gian chờ tối đa (Timeout)',
    chapter: 'CHỦ ĐỀ 01',
    detail: 'Cố tình làm User Service chậm 4 giây để quan sát sự khác nhau giữa: không cài Timeout, Timeout ở lớp kết nối HTTP (Feign 3s / RestClient 2.5s), và Timeout ở lớp ứng dụng (TimeLimiter 1.5s).',
    condition: 'Chậm 4 giây', action: 'Kiểm tra các lớp Timeout', question: 'Hai lớp Timeout bảo vệ thế nào?' },
  { id: 'retry', name: 'Retry', icon: RefreshCw, label: 'Topic 2 · Tự thử lại', title: 'Lỗi 2 lần đầu rồi tự hồi phục',
    chapter: 'CHỦ ĐỀ 02',
    detail: 'User Service bị lỗi tạm thời ở 2 lần gọi đầu. Hệ thống tự động thử lại (chạy cả Resilience4j Retry lẫn Spring Retry) kèm khoảng nghỉ tăng dần nên lần thứ 3 vẫn thành công.',
    condition: 'Lỗi 2 lần đầu', action: 'Thử lấy thông tin khách', question: 'Tự thử lại có cứu được đơn hàng?' },
  { id: 'bulkhead', name: 'Bulkhead', icon: Layers3, label: 'Topic 3 · Giới hạn luồng', title: '10 người bấm cùng lúc',
    chapter: 'CHỦ ĐỀ 03',
    detail: 'Mỗi lượt xử lý mất 2 giây. Bulkhead giới hạn tối đa 3 người được xử lý cùng lúc, 7 người đến sau bị báo bận ngay để tránh treo toàn bộ máy chủ.',
    condition: '10 lượt · tối đa 3 chỗ', action: 'Gửi 10 lượt cùng lúc', question: 'Hệ thống nhận tối đa bao nhiêu lượt?' },
  { id: 'breaker', name: 'Circuit Breaker', icon: Zap, label: 'Topic 4 · Cầu dao tự ngắt', title: 'Ngừng gọi khi dịch vụ đang lỗi',
    chapter: 'CHỦ ĐỀ 04',
    detail: 'Khi User Service lỗi liên tiếp quá 50%, cầu dao sẽ tự ngắt (chuyển sang OPEN) để chặn ngay các cuộc gọi mới tại cửa, không dội thêm tải vào dịch vụ đang hỏng.',
    condition: 'Lỗi liên tiếp 100%', action: 'Gửi 6 lượt liên tiếp', question: 'Khi nào cầu dao ngắt mạch?' },
  { id: 'converge', name: 'Hội tụ 4 topic', icon: Network, label: 'Tổng hợp · Cả 4 cùng chạy', title: 'Kết hợp cả 4 cơ chế trong 1 luồng',
    chapter: 'HỘI TỤ 4 TOPIC',
    detail: 'Một luồng xử lý hoàn chỉnh ghép cả 4 lớp bảo vệ theo thứ tự: Retry ➔ Circuit Breaker ➔ Bulkhead ➔ Timeout. Xem cả 5 giai đoạn từ lọc tải, tự cứu, ngắt cầu dao đến tự mở lại.',
    condition: '5 giai đoạn · khép kín', action: 'Chạy trọn vẹn 5 giai đoạn', question: 'Mỗi cơ chế làm gì qua từng giai đoạn?' },
  { id: 'fallback', name: 'Fallback & Kết hợp', icon: ShieldCheck, label: 'Bonus · Dữ liệu tạm', title: 'Trả dữ liệu tạm khi mọi cách đều lỗi',
    chapter: 'MỞ RỘNG (BONUS)',
    detail: 'So sánh giữa việc hiện trang lỗi thẳng (khi tắt Fallback) với việc trả dữ liệu dự phòng an toàn (khi bật Fallback) để ứng dụng không bị đơ.',
    condition: 'Lỗi liên tiếp 100%', action: 'So sánh có và không dự phòng', question: 'Người dùng sẽ thấy gì trên màn hình?' },
];

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, method = 'GET') {
  const response = await fetch(url, { method, signal: AbortSignal.timeout(25000) });
  const body = await response.json().catch(() => null);
  return { body, status: response.status };
}

async function requireOk(url, method) {
  const { body, status } = await request(url, method);
  if (url.includes('health') && (status === 200 || status === 503)) return body || { status: 'UP' };
  if (status !== 200 || !body) throw new Error(`Dịch vụ trả HTTP ${status}.`);
  return body;
}

async function callOrder(base, path) {
  const { body, status } = await request(base + resilience + path);
  if (!body?.outcome && !body?.summary) throw new Error(`Order Service trả phản hồi ngoài kịch bản (HTTP ${status}).`);
  return { body, status };
}

export default function App() {
  const [selected, setSelected] = useState(0);
  const [services, setServices] = useState(null);
  const [breaker, setBreaker] = useState(null);
  const [convergeBreaker, setConvergeBreaker] = useState(null);
  const [result, setResult] = useState(null);
  const [clock, setClock] = useState(null);
  const [resultView, setResultView] = useState('table');
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [route, setRoute] = useState(null);
  const [needsRecovery, setNeedsRecovery] = useState(false);
  const [runCount, setRunCount] = useState(0);
  const [probeRunCount, setProbeRunCount] = useState(0);
  const [dashboardLayout, setDashboardLayout] = useState('stacked'); // 'stacked' (full-width) or 'split' (2-column)
  const [scenarioMode, setScenarioMode] = useState('protected'); // 'protected' | 'unprotected' | 'compare'
  const running = useRef(false);
  const scenario = scenarios[selected];
  const lesson = lessons[scenario.id];

  useEffect(() => {
    let active = true;
    let checking = false;
    async function refresh() {
      if (checking || running.current) return;
      checking = true;
      const [gw, orders, users] = await Promise.allSettled([
        requireOk(gateway + '/health').catch(() => requireOk(gateway + '/actuator/health')),
        requireOk(order + resilience + '/status'),
        requireOk(user + '/api/chaos'),
      ]);
      checking = false;
      if (!active || running.current) return;
      setServices({ gateway: gw.status === 'fulfilled', order: orders.status === 'fulfilled', user: users.status === 'fulfilled' });
      setBreaker(orders.value?.circuitBreaker_demo4?.state ?? null);
      setConvergeBreaker(orders.value?.circuitBreaker_converge?.state ?? null);
    }
    refresh();
    const interval = setInterval(refresh, 2500);
    return () => { active = false; clearInterval(interval); };
  }, []);

  const base = services?.gateway ? gateway : order;
  const ready = services?.order && services?.user;
  const busy = Boolean(stage);

  function select(index) {
    setSelected(index);
    setScenarioMode('protected');
    setResult(null);
    setClock(null);
    setError('');
    setRoute(null);
    setNeedsRecovery(false);
    setRunCount(0);
    setProbeRunCount(0);
  }

  async function readBreaker(baseUrl) {
    const status = await requireOk(baseUrl + resilience + '/status');
    setBreaker(status?.circuitBreaker_demo4?.state ?? null);
    if (status?.circuitBreaker_converge) setConvergeBreaker(status.circuitBreaker_converge.state);
    return status?.circuitBreaker_demo4?.state ?? null;
  }

  async function perform(work, cleanup = true) {
    if (running.current) return;
    running.current = true;
    setError('');
    setStage('Đang chuẩn bị…');
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof TypeError ? 'Mất kết nối với dịch vụ. Kiểm tra backend rồi thử lại.' : failure.message);
    } finally {
      if (cleanup) {
        try {
          await requireOk(user + '/api/chaos/reset', 'POST');
        } catch {
          setError((message) => [message, 'Chưa khôi phục được User Service. Hãy thử nút Đặt lại.'].filter(Boolean).join(' '));
        }
      }
      running.current = false;
      setStage('');
    }
  }

  function run() {
    setResult(null);
    setClock(null);
    setNeedsRecovery(false);
    setRoute(base);
    setRunCount((prev) => prev + 1);
    return perform(async () => {
      await requireOk(user + '/api/chaos/reset', 'POST');
      if (['breaker', 'fallback', 'converge'].includes(scenario.id) && scenarioMode !== 'unprotected') {
        const status = await requireOk(base + resilience + '/reset', 'POST');
        setBreaker(status.circuitBreaker_demo4.state);
        if (status.circuitBreaker_converge) setConvergeBreaker(status.circuitBreaker_converge.state);
      }

      if (scenarioMode === 'unprotected') {
        switch (scenario.id) {
          case 'timeout': {
            setStage('Đang gọi trực tiếp User Service không có Timeout (ngâm trễ 4 giây)…');
            await requireOk(`${user}/api/chaos?delayMs=4000`, 'POST');
            const start = performance.now();
            setClock({ label: 'Gọi không Timeout (Treo luồng 4s)', targetMs: 4000, start });
            try {
              const res = await request(user + '/api/users/1');
              setResult([{
                body: { outcome: 'OK', user: res.body, elapsedMs: Math.round(performance.now() - start), attempts: 1 },
                status: res.status,
                measuredMs: Math.round(performance.now() - start)
              }]);
            } finally {
              setClock(null);
            }
            break;
          }
          case 'retry': {
            setStage('Đang gọi User Service KHÔNG qua Retry (gặp lỗi 500 chập chờn)…');
            await requireOk(`${user}/api/chaos?failFirstN=2`, 'POST');
            const response = await callOrder(base, '/no-protection/1');
            setResult(response);
            break;
          }
          case 'bulkhead': {
            setStage('Đang gửi 10 lượt cùng lúc khi KHÔNG có Bulkhead (chiếm hết 10 luồng xử lý trong 2 giây)…');
            await requireOk(`${user}/api/chaos?delayMs=2000`, 'POST');
            const response = await callOrder(base, '/burst/no-protection?n=10');
            setResult(response);
            break;
          }
          case 'breaker': {
            await requireOk(`${user}/api/chaos?failPercent=100`, 'POST');
            const calls = [];
            for (let index = 1; index <= 6; index += 1) {
              setStage(`Đang gửi lượt ${index}/6 (không có cầu dao nên vẫn tiếp tục gửi sang User Service đang lỗi)…`);
              const res = await callOrder(base, '/no-protection/1');
              calls.push(res);
              setResult([...calls]);
              await pause(200);
            }
            break;
          }
        }
        return;
      }
      const query = { timeout: 'delayMs=4000', retry: 'failFirstN=2', bulkhead: 'delayMs=2000',
        breaker: 'failPercent=100', fallback: 'failPercent=100' }[scenario.id];
      if (query) await requireOk(`${user}/api/chaos?${query}`, 'POST');
      setStage('Đang gọi Order Service…');

      switch (scenario.id) {
        case 'normal': {
          setStage('Đang gọi API đơn hàng…');
          const response = await request(base + '/api/orders/1');
          if (!response.body || (response.status === 200 && response.body.orderId !== 1)) {
            throw new Error(`Order Service trả phản hồi ngoài kịch bản (HTTP ${response.status}).`);
          }
          setResult(response);
          break;
        }
        case 'timeout': {
          const phases = [
            ['1/4: Gọi trực tiếp (Không Timeout · Chờ hết 4s)', 4000, () => request(user + '/api/users/1')],
            ['2/4: Lớp kết nối OpenFeign (Cấu hình mẫu: cắt ở 3s)', 3000, () => callOrder(base, '/feign-timeout/1')],
            ['3/4: Lớp kết nối RestClient (Cấu hình mẫu: cắt ở 2.5s)', 2500, () => callOrder(base, '/restclient-timeout/1')],
            ['4/4: Lớp nghiệp vụ TimeLimiter (Cấu hình mẫu: cắt ở 1.5s)', 1500, () => callOrder(base, '/timeout/1')],
          ];
          const responses = [];
          for (const [label, targetMs, call] of phases) {
            setStage(label + '…');
            const start = performance.now();
            setClock({ label, targetMs, start });
            try {
              const response = await call();
              responses.push({ ...response, measuredMs: Math.round(performance.now() - start) });
            } finally {
              setClock(null);
            }
            setResult([...responses]);
          }
          break;
        }
        case 'retry': {
          setStage('1/2: Đang chạy Resilience4j Retry (tự thử lại 3 lần)…');
          const r4jResponse = await callOrder(base, '/retry/1');
          const item1 = { ...r4jResponse, library: 'Resilience4j Retry' };
          setResult([item1]);
          await requireOk(`${user}/api/chaos?failFirstN=2`, 'POST');
          setStage('2/2: Đang chạy Spring Retry (RetryTemplate tự thử lại 3 lần)…');
          const springResponse = await callOrder(base, '/spring-retry/1');
          const item2 = { ...springResponse, library: 'Spring Retry' };
          setResult([item1, item2]);
          break;
        }
        case 'bulkhead': {
          setStage('Đang gửi 10 lượt song song (Bulkhead cấp 3 slot / từ chối 7 lượt)…');
          const response = await callOrder(base, '/burst/bulkhead?n=10');
          setResult(response);
          break;
        }
        case 'breaker': {
          const calls = [];
          for (let index = 1; index <= 6; index += 1) {
            setStage(`Đang gửi lượt ${index}/6…`);
            const res = await callOrder(base, '/circuit-breaker/1');
            calls.push(res);
            setResult([...calls]);
          }
          await readBreaker(base);
          setNeedsRecovery(true);
          break;
        }
        case 'converge': {
          const phases = [];
          const step = async (stageText, chaosQuery, path, phase) => {
            setStage(stageText);
            await requireOk(user + '/api/chaos/reset', 'POST');
            if (chaosQuery) await requireOk(`${user}/api/chaos?${chaosQuery}`, 'POST');
            const start = performance.now();
            const response = await callOrder(base, path);
            phases.push({ ...response, measuredMs: Math.round(performance.now() - start), phase });
            setResult([...phases]);
          };
          await step('Pha 1/5 · Bulkhead: gửi 6 lượt song song (lọc bão tải)…', 'delayMs=600', '/burst/converge?n=6',
            { title: 'Pha 1 · Lọc bão lưu lượng', topics: 'Bulkhead', expect: '3 suất cấp phép (200 OK), 3 lượt quá tải bị từ chối (429)', statusDesc: 'Thành công lọc tải' });
          await step('Pha 2/5 · Retry: User Service lỗi chập chờn 2 lần đầu…', 'failFirstN=2', '/converge/1',
            { title: 'Pha 2 · Lỗi mạng chập chờn', topics: 'Retry', expect: 'Lần 1 & 2 lỗi 500, Retry tự gọi lại lần 3 thành công (200 OK)', statusDesc: 'Thành công tự cứu' });
          await step('Pha 3/5 · Feign timeout: User Service bị treo 3s…', 'delayMs=3000', '/converge/1',
            { title: 'Pha 3 · Dịch vụ đối tác bị treo', topics: 'Feign timeout + CB', expect: 'Feign cắt sau 1s (504), CB ghi nhận lỗi và bung mạch OPEN', statusDesc: 'Can thiệp ngắt mạch' });
          await step('Pha 4/5 · Circuit Breaker: gọi khi đối tác đang chết…', 'delayMs=3000', '/converge/1',
            { title: 'Pha 4 · Mạch OPEN (Bảo vệ sinh tồn)', topics: 'Circuit Breaker + Retry', expect: 'Từ chối ngay trong 14ms (503), 0 lần gọi User, Retry dừng chống Retry Storm', statusDesc: 'Bảo vệ sinh tồn (Fail-fast)' });

          // Pha 5: Tự chữa lành & Khôi phục về 200 OK
          setStage('Pha 5/5 · Tự chữa lành: khôi phục User Service & chờ mạch thăm dò…');
          await requireOk(user + '/api/chaos/reset', 'POST');
          let cbState = 'OPEN';
          for (let i = 0; i < 5 && cbState === 'OPEN'; i++) {
            await pause(1000);
            const status = await requireOk(base + resilience + '/status');
            cbState = status.circuitBreaker_converge?.state;
            setConvergeBreaker(cbState);
          }
          setStage('Pha 5/5 · Gửi lượt thăm dò hoàn tất khép mạch…');
          const start5 = performance.now();
          const response5 = await callOrder(base, '/converge/1');
          phases.push({
            ...response5,
            measuredMs: Math.round(performance.now() - start5),
            phase: {
              title: 'Pha 5 · Tự chữa lành (Self-Healing)',
              topics: 'Circuit Breaker (CLOSED)',
              expect: 'Thăm dò thành công (200 OK), mạch tự đóng lại CLOSED, khép lại trọn vẹn 1 flow!',
              statusDesc: 'Thành công khôi phục (200 OK)',
            },
          });
          setResult([...phases]);
          const finalStatus = await requireOk(base + resilience + '/status');
          setConvergeBreaker(finalStatus.circuitBreaker_converge?.state);
          break;
        }
        case 'fallback': {
          setStage('Đang gọi khi tắt dữ liệu dự phòng…');
          const noFallback = await callOrder(base, '/combined/1?fallback=false');
          setResult([noFallback]);
          await requireOk(base + resilience + '/reset', 'POST');
          setStage('Đang gọi khi bật dữ liệu dự phòng…');
          const withFallback = await callOrder(base, '/combined/1?fallback=true');
          setResult([noFallback, withFallback]);
          break;
        }
      }
    });
  }

  function recover() {
    return perform(async () => {
      const target = route ?? base;
      setProbeRunCount((prev) => prev + 1);
      setStage('Đang khôi phục User Service (bỏ giả lập sự cố)…');
      await requireOk(user + '/api/chaos/reset', 'POST');

      let state = await readBreaker(target);
      for (let attempt = 0; state === 'OPEN' && attempt < 12; attempt += 1) {
        setStage(`Mạch đang OPEN. Đếm ngược chờ chuyển HALF-OPEN (còn khoảng ${Math.max(1, 10 - attempt)}s)…`);
        await pause(1000);
        state = await readBreaker(target);
      }
      if (state === 'OPEN') throw new Error('Mạch vẫn đang mở. Hãy thử lại sau vài giây.');

      const calls = Array.isArray(result) ? result.slice(0, 6) : [];
      setStage('Mạch đã chuyển HALF-OPEN! Đang gửi lượt thăm dò 1/2…');
      const probe1 = await callOrder(target, '/circuit-breaker/1');
      calls.push(probe1);
      setResult([...calls]);
      await pause(600);

      setStage('Lượt 1 thành công 200 OK! Đang gửi lượt thăm dò 2/2 để xác nhận đóng mạch…');
      const probe2 = await callOrder(target, '/circuit-breaker/1');
      calls.push(probe2);
      setResult([...calls]);
      await pause(500);

      const finalState = await readBreaker(target);
      setStage(`Cả 2/2 lượt thăm dò thành công 200 OK! Cầu dao đã chuyển về ${finalState === 'CLOSED' ? 'CLOSED 🟢' : finalState}`);
      setNeedsRecovery(false);
    });
  }

  function reset() {
    return perform(async () => {
      await requireOk(user + '/api/chaos/reset', 'POST');
      const status = await requireOk(base + resilience + '/reset', 'POST');
      setBreaker(status.circuitBreaker_demo4.state);
      if (status.circuitBreaker_converge) setConvergeBreaker(status.circuitBreaker_converge.state);
      setResult(null);
      setClock(null);
      setNeedsRecovery(false);
      setRoute(null);
    }, false);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-icon"><Package size={22} /></span><div>Điều phối đơn hàng<small>Phòng demo microservices</small></div></div>
        <div className="top-actions">
          <span className={`service-badge ${ready ? 'online' : ''}`} title={services?.gateway ? 'Qua API Gateway' : 'Gọi trực tiếp Order Service'}>
            <i />{!services ? 'Đang kiểm tra' : ready ? services.gateway ? 'Backend đã kết nối' : 'Đã kết nối trực tiếp' : 'Backend chưa sẵn sàng'}
          </span>
          <button className="reset" disabled={busy || !ready} onClick={reset}><RotateCcw size={15} /> Đặt lại</button>
        </div>
      </header>

      <main className="workspace">
        <section className="intro">
          <div><div className="eyebrow"><Activity size={15} /> MÔ PHỎNG SỰ CỐ</div><h1>Đơn hàng khi dịch vụ gặp lỗi</h1><p>Order Service cần lấy thông tin khách hàng để hiển thị đơn hàng.</p></div>
          <div className="order-chip"><Package size={19} /><div><strong>Đơn hàng #001</strong><small>Tra cứu khách hàng</small></div></div>
        </section>

        <div className="layout">
          <aside className="sidebar">
            <div className="section-label">KỊCH BẢN</div>
            <nav aria-label="Kịch bản demo">{scenarios.map((item, index) => (
              <button key={item.id} className={index === selected ? 'scenario active' : 'scenario'} aria-current={index === selected ? 'true' : undefined} disabled={busy} onClick={() => { if (index !== selected) select(index); }}>
                <span className="scenario-icon"><item.icon size={19} /></span>
                <span><strong>{item.name}</strong><small>{item.label}</small></span>
                <ChevronRight className="chevron" size={16} />
              </button>
            ))}</nav>
            <details className="connection"><summary><CircleHelp size={15} /> Kết nối dịch vụ</summary>
              {Object.entries({ 'API Gateway · 8080': services?.gateway, 'Order Service · 8082': services?.order, 'User Service · 8081': services?.user }).map(([name, online]) => <div key={name}><span>{name}</span><b>{online == null ? 'Đang kiểm tra' : online ? 'Đã kết nối' : 'Ngoại tuyến'}</b></div>)}
            </details>
          </aside>

          <section className="stage">
            <div className="stage-header">
              <div className="stage-meta"><span className="chapter">{scenario.chapter ?? `KỊCH BẢN ${String(selected).padStart(2, '0')}`}</span><span className="condition"><i />{scenario.condition}</span></div>
              <h2>{scenario.title}</h2><p>{scenario.detail}</p>
              <div className="flow"><span><Package size={16} /> Order Service</span><ArrowRight size={17} aria-hidden="true" /><span className="flow-guard"><scenario.icon size={16} /> {scenario.id === 'normal' ? 'OpenFeign' : scenario.name}</span><ArrowRight size={17} aria-hidden="true" /><span><UserRound size={16} /> User Service</span></div>
              {lesson && (
                <details className="knowledge-accordion">
                  <summary>
                    <BookOpen size={16} />
                    <span>Xem giải thích lý thuyết & thuật ngữ chuyên môn ({scenario.name})</span>
                  </summary>
                  <div className="knowledge-panel">
                    <div className="knowledge-card">
                      <div className="knowledge-title"><Target size={16} /> Ý NGHĨA KIỂM TRA & QUY TRÌNH</div>
                      <p>{lesson.goal}</p>
                      <ol className="lesson-steps">
                        {lesson.steps.map((st) => <li key={st}>{st}</li>)}
                      </ol>
                    </div>
                    <div className="knowledge-card">
                      <div className="knowledge-title"><Zap size={16} /> CÔNG DỤNG CHÍNH CỦA CƠ CHẾ</div>
                      <p>{lesson.mainPurpose}</p>
                    </div>
                    <div className="knowledge-card full-width">
                      <div className="knowledge-title"><BookOpen size={16} /> THUẬT NGỮ TRÊN GIAO DIỆN & LIÊN QUAN</div>
                      <div className="glossary-grid">
                        {lesson.terms.map(([term, desc]) => (
                          <div key={term} className="glossary-item">
                            <strong>{term}:</strong> <span>{desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>
              )}

              {['timeout', 'retry', 'bulkhead', 'breaker'].includes(scenario.id) && (
                <div className="resilience-mode-selector">
                  <div className="mode-selector-label">CHẾ ĐỘ KIỂM TRA & ĐỐI CHIẾU:</div>
                  <div className="mode-tabs">
                    <button
                      type="button"
                      className={`mode-tab protected ${scenarioMode === 'protected' ? 'active' : ''}`}
                      onClick={() => { setScenarioMode('protected'); setResult(null); }}
                      disabled={busy}
                    >
                      <ShieldCheck size={16} />
                      <span>1. CÓ BẢO VỆ (Resilience Active)</span>
                    </button>
                    <button
                      type="button"
                      className={`mode-tab unprotected ${scenarioMode === 'unprotected' ? 'active' : ''}`}
                      onClick={() => { setScenarioMode('unprotected'); setResult(null); }}
                      disabled={busy}
                    >
                      <AlertTriangle size={16} />
                      <span>2. KHÔNG BẢO VỆ (Xem sự cố sập)</span>
                    </button>
                    <button
                      type="button"
                      className={`mode-tab compare ${scenarioMode === 'compare' ? 'active' : ''}`}
                      onClick={() => { setScenarioMode('compare'); }}
                      disabled={busy}
                    >
                      <Activity size={16} />
                      <span>3. SO SÁNH ĐỐI CHIẾU 2 BÊN</span>
                    </button>
                  </div>
                </div>
              )}

              {scenarioMode === 'unprotected' && ['timeout', 'retry', 'bulkhead', 'breaker'].includes(scenario.id) && (
                <div className="unprotected-banner">
                  <AlertTriangle size={18} className="unprotected-banner-icon" />
                  <div>
                    <strong>ĐANG Ở CHẾ ĐỘ: KHÔNG CÓ CƠ CHẾ BẢO VỆ (Xem sự cố thực tế)</strong>
                    <p>
                      {scenario.id === 'timeout' && 'Không bật Timeout. Khi User Service chậm 4 giây, luồng xử lý bên Order Service phải đứng chờ đủ 4 giây. Nếu nhiều người bấm cùng lúc, máy chủ sẽ hết luồng và đơ cứng.'}
                      {scenario.id === 'retry' && 'Không bật Retry. Khi User Service bị lỗi tạm thời (500) ngay lần đầu, đơn hàng lập tức bị hủy và báo lỗi về màn hình thay vì tự thử lại.'}
                      {scenario.id === 'bulkhead' && 'Không bật Bulkhead giới hạn luồng. Cả 10 người bấm cùng lúc đều được đẩy vào xử lý, chiếm trọn 10/10 luồng trong 2 giây khiến các chức năng khác đứng hình theo.'}
                      {scenario.id === 'breaker' && 'Không bật Circuit Breaker (cầu dao ngắt). User Service đã hỏng 100% nhưng Order Service vẫn cố gửi cả 6 cuộc gọi qua mạng, vừa tốn thời gian chờ vừa dội tải thêm.'}
                    </p>
                  </div>
                </div>
              )}

              {scenarioMode !== 'compare' && (
                <div className="controls">
                  <button
                    className={`primary ${scenarioMode === 'unprotected' ? 'unprotected-run-btn' : ''}`}
                    disabled={busy || !ready}
                    onClick={run}
                  >
                    {scenarioMode === 'unprotected' ? (
                      <>
                        <AlertTriangle size={17} />
                        {scenario.id === 'timeout' && '⚠️ Chạy KHÔNG có Timeout (Đứng chờ 4s)'}
                        {scenario.id === 'retry' && '⚠️ Gọi KHÔNG có Retry (Báo lỗi ngay lần 1)'}
                        {scenario.id === 'bulkhead' && '⚠️ Gửi 10 lượt KHÔNG có Bulkhead (Chiếm hết luồng)'}
                        {scenario.id === 'breaker' && '⚠️ Gửi 6 lượt KHÔNG có Circuit Breaker (Gửi mù 6/6 lần)'}
                      </>
                    ) : (
                      <>
                        <Play size={17} />{scenario.action}
                      </>
                    )}
                  </button>
                  {scenarioMode === 'protected' && needsRecovery && (
                    <button className="reset probe-action-btn" disabled={busy || !ready} onClick={recover} title="Gửi đúng 2 lượt thăm dò theo chuẩn Resilience4j">
                      <Play size={15} /> Gửi 2 lượt thăm dò (HALF-OPEN)
                    </button>
                  )}
                </div>
              )}
              {busy && <div className="live-stage" role="status"><LoaderCircle className="spinner" size={15} aria-hidden="true" />{stage}</div>}
              {needsRecovery && !busy && !error && (
                <div className="probe-reason-box">
                  <strong>💡 Tại sao cần đúng 2 lượt thăm dò?</strong> Khi cầu dao sang chế độ dò đường (HALF-OPEN), hệ thống quy định (<code>permittedNumberOfCallsInHalfOpenState = 2</code>) phải có <strong>2 lần thử liên tiếp thành công</strong> mới chắc chắn User Service đã khỏe hẳn — tránh trường hợp lần 1 thành công do ăn may rồi vừa mở lại đã sập tiếp.
                </div>
              )}
              {services && !ready && <p className="notice">Khởi động Order Service và User Service để chạy demo.</p>}
              {error && <p className="error" role="alert">{error}</p>}
            </div>

            <div className="stage-results">
              <div className="result-heading">
                <div>
                  <div className="section-label">MÔ PHỎNG & KẾT QUẢ ĐO ĐẠC THỰC TẾ</div>
                  <h3>{scenario.question}</h3>
                </div>
                <div className="heading-actions">
                  {route && <span className="route">{route === gateway ? 'Qua Gateway' : 'Gọi trực tiếp'}</span>}
                  <div className="layout-switcher">
                    <button
                      type="button"
                      className={`layout-btn ${dashboardLayout === 'stacked' ? 'active' : ''}`}
                      onClick={() => setDashboardLayout('stacked')}
                      title="Chế độ to rõ: Minh họa toàn màn hình, chữ to nhất"
                    >
                      To rõ (Toàn chiều rộng)
                    </button>
                    <button
                      type="button"
                      className={`layout-btn ${dashboardLayout === 'split' ? 'active' : ''}`}
                      onClick={() => setDashboardLayout('split')}
                      title="Chế độ song song: Xem minh họa và bảng kết quả cạnh nhau"
                    >
                      Song song (2 cột)
                    </button>
                  </div>
                </div>
              </div>

              <div className={`demo-dashboard layout-${dashboardLayout}`}>
                <div className="dashboard-visualizer">
                  <ErrorBoundary resetKey={`${scenario.id}:${scenarioMode}:${runCount}:${probeRunCount}`} onReset={() => setResult(null)}>
                    <FlowVisualizer
                      scenarioId={scenario.id}
                      busy={busy}
                      liveStage={stage}
                      breakerState={scenario.id === 'converge' ? convergeBreaker : breaker}
                      runCount={runCount}
                      probeRunCount={probeRunCount}
                      actionLabel={scenarioMode === 'unprotected' ? 'Chạy không bảo vệ' : scenario.action}
                      scenarioMode={scenarioMode}
                      isUnprotected={scenarioMode === 'unprotected'}
                    />
                  </ErrorBoundary>
                </div>
                <div className="dashboard-results">
                  {clock && <TimeoutClock key={clock.start} clock={clock} />}
                  <div aria-live="polite" aria-busy={busy}>
                    <ErrorBoundary resetKey={`${scenario.id}:${scenarioMode}:${runCount}:${probeRunCount}`} onReset={() => setResult(null)}>
                      <DemoResults
                        scenario={scenario.id}
                        result={result}
                        breaker={scenario.id === 'converge' ? convergeBreaker : breaker}
                        busy={busy}
                        error={error}
                        view={resultView}
                        onViewChange={setResultView}
                        scenarioMode={scenarioMode}
                      />
                    </ErrorBoundary>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
        <footer>Order Service <span>→</span> User Service <span>·</span> Resilience4j</footer>
      </main>
    </div>
  );
}
