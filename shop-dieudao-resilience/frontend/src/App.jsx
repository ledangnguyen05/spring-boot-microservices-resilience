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
  { id: 'bulkhead', name: 'Bulkhead', icon: Layers3, label: 'Topic 3 · Giới hạn luồng', title: 'Giới hạn số luồng đồng thời để chống sập dây chuyền',
    chapter: 'CHỦ ĐỀ 03',
    detail: 'Gửi cùng lúc 10 lượt tra cứu User chậm (2s) khi ngưỡng chịu tải an toàn chỉ là 3 chỗ. Bulkhead giữ đúng 3 suất (#1–#3 = 200 OK) và báo bận nhanh HTTP 429 cho 7 lượt thừa — tránh cảnh cả 10/10 tràn vào cùng lúc làm vỡ kết nối.',
    condition: '10 lượt · tối đa 3 chỗ', action: 'Gửi 10 lượt cùng lúc', question: 'Bulkhead cứu hệ thống khi quá tải thế nào?' },
  { id: 'breaker', name: 'Circuit Breaker', icon: Zap, label: 'Topic 4 · Cầu dao tự ngắt', title: 'Ngừng gọi khi dịch vụ đang lỗi',
    chapter: 'CHỦ ĐỀ 04',
    detail: 'Khi User Service lỗi liên tiếp quá 50%, cầu dao sẽ tự ngắt (chuyển sang OPEN) để chặn ngay các cuộc gọi mới tại cửa, không dội thêm tải vào dịch vụ đang hỏng.',
    condition: 'Lỗi liên tiếp 100%', action: 'Gửi 6 lượt liên tiếp', question: 'Khi nào cầu dao ngắt mạch?' },
  { id: 'converge', name: 'Hội tụ 4 topic', icon: Network, label: 'Tổng hợp · 1 luồng 4 trạm', title: 'Hội tụ 4 trạm bảo vệ trên CÙNG 1 đường ống xử lý',
    chapter: 'HỘI TỤ 4 TOPIC',
    detail: 'Theo dõi 1 đường ống duy nhất đi xuyên qua 4 trạm lồng nhau theo đúng thứ tự: (1) Retry ➔ (2) Circuit Breaker [cửa sổ 5 mẫu] ➔ (3) Bulkhead [3 chỗ] ➔ (4) Feign Timeout [1s], qua 5 chặng nối tiếp khép kín.',
    condition: '4 Trạm lồng nhau · 5 Chặng', action: 'Chạy trọn vẹn 5 chặng', question: '4 lớp bảo vệ hợp lực trên cùng 1 đường ống như thế nào?' },
];

const convergeActs = [
  { num: 1, clock: 'Trạm 3', name: 'Bulkhead lọc 3/6', guard: 'CB: 3/5 [✓✓✓]', time: 3600 },
  { num: 2, clock: 'Trạm 1', name: 'Retry tự cứu (#3)', guard: 'CB: 40% CLOSED', time: 15600 },
  { num: 3, clock: 'Trạm 4 ➔ 2', name: 'Cắt 1s ➔ Bung OPEN', guard: 'CB: 60% OPEN 🔴', time: 20500 },
  { num: 4, clock: 'Trạm 2', name: 'Chặn cửa 503', guard: 'CB: OPEN (0 lượt)', time: 26800 },
  { num: 5, clock: 'Trạm 2', name: 'Thăm dò ➔ Mở lại', guard: 'CB: 2/2 CLOSED 🟢', time: 36800 },
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
  const [retryFailCount, setRetryFailCount] = useState(2); // 1 (lần đầu retry OK luôn) | 2 (lần 3 mới OK)
  const [activeCallIndex, setActiveCallIndex] = useState(null);
  const [externalJump, setExternalJump] = useState(null);
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
    setActiveCallIndex(null);
    setExternalJump(null);
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
    setActiveCallIndex(null);
    setRoute(base);
    setRunCount((prev) => prev + 1);
    return perform(async () => {
      await requireOk(user + '/api/chaos/reset', 'POST');
      if (['breaker', 'converge'].includes(scenario.id) && scenarioMode !== 'unprotected') {
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
            setStage('Đang gửi 10 lượt cùng lúc khi KHÔNG có Bulkhead (vượt ngưỡng 3 chỗ)…');
            await requireOk(`${user}/api/chaos?delayMs=2000`, 'POST');
            const response = await callOrder(base, '/burst/no-protection?n=10');
            setResult(response);
            break;
          }
          case 'breaker': {
            await requireOk(`${user}/api/chaos?failPercent=100`, 'POST');
            const calls = [];
            for (let index = 1; index <= 6; index += 1) {
              setStage(`Lượt ${index}/6: Đang gửi qua mạng sang User Service (Không có cầu dao)…`);
              const res = await callOrder(base, '/no-protection/1');
              calls.push(res);
              setResult([...calls]);
              if (index < 6) await pause(1480);
            }
            break;
          }
        }
        return;
      }
      const query = { timeout: 'delayMs=4000', retry: `failFirstN=${retryFailCount}`, bulkhead: 'delayMs=2000',
        breaker: 'failPercent=100' }[scenario.id];
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
          setStage(`1/2: Đang chạy Resilience4j Retry (lỗi ${retryFailCount} lần đầu)…`);
          const r4jResponse = await callOrder(base, '/retry/1');
          const item1 = { ...r4jResponse, library: 'Resilience4j Retry' };
          setResult([item1]);
          await requireOk(`${user}/api/chaos?failFirstN=${retryFailCount}`, 'POST');
          setStage(`2/2: Đang chạy Spring Retry RetryTemplate (lỗi ${retryFailCount} lần đầu)…`);
          const springResponse = await callOrder(base, '/spring-retry/1');
          const item2 = { ...springResponse, library: 'Spring Retry' };
          setResult([item1, item2]);
          break;
        }
        case 'bulkhead': {
          setStage('Đang gửi 10 lượt cùng lúc (Bulkhead chỉ cấp 3 chỗ, chặn nhanh 7 lượt 429)…');
          const response = await callOrder(base, '/burst/bulkhead?n=10');
          setResult(response);
          break;
        }
        case 'breaker': {
          const calls = [];
          for (let index = 1; index <= 5; index += 1) {
            setStage(`Lượt ${index}/6: Đang gọi User Service (Đếm mẫu ${index}/5 · Mạch vẫn CLOSED)…`);
            const res = await callOrder(base, '/circuit-breaker/1');
            calls.push(res);
            setResult([...calls]);
            if (index < 5) await pause(1480);
          }
          await readBreaker(base);
          setStage('Đủ 5/5 mẫu lỗi (100% ≥ 50%) ➔ CẦU DAO BUNG OPEN 🔴! Chuẩn bị gửi lượt 6/6…');
          await pause(3000);
          setStage('Lượt 6/6: Gửi khi cầu dao đang OPEN ➔ Bị chặn ngay Fail-Fast (HTTP 503)…');
          const res6 = await callOrder(base, '/circuit-breaker/1');
          calls.push(res6);
          setResult([...calls]);
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

          // Chặng 1: 6 lượt cùng ùa vào ➔ Trạm 3 (Bulkhead) giữ 3 & chặn 3 (429), nạp 3 ô xanh CB
          await step('Chặng 1/5 · 6 lượt cùng ùa vào ➔ Trạm 3 (Bulkhead) giữ 3, chặn 3 (429) & nạp 3 ô CB…', 'delayMs=600', '/burst/converge?n=6',
            { title: 'Chặng 1 · Trạm 3 (Bulkhead) lọc tải', topics: 'Trạm 3 (3 chỗ) · Nạp CB [✓✓✓]', expect: 'Giữ #1–#3 qua Trạm 4 (200 OK), chặn nhanh #4–#6 (429 — Retry & CB bỏ qua)', statusDesc: 'Lọc 3/6 & Nạp 3 ô xanh CB' });
          await pause(1500);

          // Chặng 2: Mạng chập chờn 2 lần 500 ➔ CB mới 40% CLOSED ➔ Trạm 1 (Retry) cứu lần #3
          await step('Chặng 2/5 · Mạng chập chờn 2 lỗi 500 (CB mới 40% CLOSED) ➔ Trạm 1 Retry cứu lần #3…', 'failFirstN=2', '/converge/1',
            { title: 'Chặng 2 · Trạm 1 (Retry) tự cứu khi CB 40%', topics: 'Trạm 1 Retry + Trạm 2 (40% < 50%)', expect: '2 lỗi 500 đẩy CB = 40% (VẪN CLOSED) ➔ Retry nghỉ 500ms+1s cứu #3 (200 OK)', statusDesc: 'Tự cứu #3 · CB giữ 40% CLOSED' });
          await pause(850);

          // Chặng 3: User treo cứng 3s ➔ Trạm 4 (Feign) cắt 1s ➔ CB vọt 60% BUNG OPEN chặn Retry #2
          await step('Chặng 3/5 · User treo 3s ➔ Trạm 4 (Feign) cắt 1s ➔ Trạm 2 vọt 60% BUNG OPEN!', 'delayMs=3000', '/converge/1',
            { title: 'Chặng 3 · Trạm 4 cắt 1s ➔ Trạm 2 bung OPEN', topics: 'Trạm 4 Feign 1s + Trạm 2 (60% OPEN)', expect: 'Lần 1 cắt ở 1s ➔ CB đạt 60% bung OPEN ➔ Chặn luôn Retry #2 (HTTP 503)', statusDesc: 'Cắt treo 1s & Bung OPEN 🔴' });
          const midStatus = await requireOk(base + resilience + '/status');
          setConvergeBreaker(midStatus.circuitBreaker_converge?.state ?? 'OPEN');
          await pause(750);

          // Chặng 4: Trạm 2 đang OPEN ➔ Chặn Fail-Fast ngay tại cửa (503, 0 lượt gọi User), Retry dừng
          await step('Chặng 4/5 · Trạm 2 (CB OPEN) chặn ngay lượt mới (503, 0 lượt User), Retry dừng hẳn…', 'delayMs=3000', '/converge/1',
            { title: 'Chặng 4 · Trạm 2 chặn cửa Fail-Fast', topics: 'Trạm 2 OPEN 🔴 (Bảo vệ Trạm 3–4)', expect: 'Chặn ngay ở Trạm 2 (~10ms, 503, 0 lượt sang Trạm 3–4–User) để đối tác nghỉ', statusDesc: 'Fail-fast · 0 bão Retry' });
          await pause(1100);

          // Chặng 5: User khỏe lại ➔ Hết 3s OPEN ➔ Hé HALF-OPEN thăm dò 2 lượt xuyên 4 trạm ➔ CLOSED 🟢
          setStage('Chặng 5/5 · User Service khỏe lại! Đang chờ Trạm 2 hết 3s OPEN để hé HALF-OPEN…');
          await requireOk(user + '/api/chaos/reset', 'POST');
          let cbState = 'OPEN';
          for (let i = 0; i < 6 && cbState === 'OPEN'; i++) {
            await pause(1000);
            const status = await requireOk(base + resilience + '/status');
            cbState = status.circuitBreaker_converge?.state;
            setConvergeBreaker(cbState);
          }

          setStage('Chặng 5/5 · Trạm 2 hé HALF-OPEN: gửi 2 lượt thăm dò xuyên cả 4 trạm ➔ CLOSED 🟢…');
          const start5 = performance.now();
          let probeResponse = await callOrder(base, '/converge/1');
          let probeCount = 1;
          let afterProbe1 = await requireOk(base + resilience + '/status');
          if (afterProbe1.circuitBreaker_converge?.state === 'HALF_OPEN') {
            await pause(300);
            probeResponse = await callOrder(base, '/converge/1');
            probeCount = 2;
            afterProbe1 = await requireOk(base + resilience + '/status');
          }
          phases.push({
            ...probeResponse,
            measuredMs: Math.round(performance.now() - start5),
            body: { ...probeResponse.body, probeCalls: probeCount },
            phase: {
              title: 'Chặng 5 · Thăm dò xuyên 4 trạm ➔ CLOSED',
              topics: `Trạm 2 HALF-OPEN (${probeCount}/${probeCount} OK) ➔ CLOSED`,
              expect: `Thăm dò ${probeCount}/${probeCount} xuyên Trạm 1–4 thành công (200 OK) ➔ Đóng CLOSED 🟢!`,
              statusDesc: 'Tự chữa lành 200 OK 🟢',
            },
          });
          setResult([...phases]);
          setConvergeBreaker(afterProbe1.circuitBreaker_converge?.state);
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
      setActiveCallIndex(null);
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
              <div className="flow"><span><Package size={16} /> Order Service</span><ArrowRight size={17} aria-hidden="true" /><span className="flow-guard"><scenario.icon size={16} /> {scenario.id === 'normal' ? 'OpenFeign' : scenario.id === 'converge' ? '1. Retry ➔ 2. CB ➔ 3. Bulkhead ➔ 4. Feign 1s' : scenario.name}</span><ArrowRight size={17} aria-hidden="true" /><span><UserRound size={16} /> User Service</span></div>
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
                      onClick={() => { setScenarioMode('protected'); setResult(null); setActiveCallIndex(null); }}
                      disabled={busy}
                    >
                      <ShieldCheck size={16} />
                      <span>1. CÓ BẢO VỆ (Resilience Active)</span>
                    </button>
                    <button
                      type="button"
                      className={`mode-tab unprotected ${scenarioMode === 'unprotected' ? 'active' : ''}`}
                      onClick={() => { setScenarioMode('unprotected'); setResult(null); setActiveCallIndex(null); }}
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
                      {scenario.id === 'bulkhead' && 'Không bật Bulkhead (giới hạn 3 chỗ). Cả 10/10 lượt chậm tràn thẳng sang User Service cùng lúc, vượt xa ngưỡng chịu tải an toàn (3 luồng) ➔ Nghẽn sập kết nối tập thể khiến 0/10 lượt thành công (10× HTTP 503)!'}
                      {scenario.id === 'breaker' && 'Không bật Circuit Breaker (cầu dao ngắt). User Service đã hỏng 100% nhưng Order Service vẫn cố gửi cả 6 cuộc gọi qua mạng, vừa tốn thời gian chờ vừa dội tải thêm.'}
                    </p>
                  </div>
                </div>
              )}

              {scenario.id === 'retry' && scenarioMode === 'protected' && (
                <div className="resilience-mode-selector" style={{ marginTop: '0.2rem' }}>
                  <div className="mode-selector-label">GIẢ LẬP SỐ LẦN LỖI TRƯỚC KHI HỒI PHỤC:</div>
                  <div className="layout-switcher" style={{ width: 'fit-content' }}>
                    <button
                      type="button"
                      className={`layout-btn ${retryFailCount === 1 ? 'active' : ''}`}
                      disabled={busy}
                      onClick={() => { setRetryFailCount(1); setResult(null); }}
                    >
                      Lỗi 1 lần đầu (Thử lại phát đầu #2 thành công luôn)
                    </button>
                    <button
                      type="button"
                      className={`layout-btn ${retryFailCount === 2 ? 'active' : ''}`}
                      disabled={busy}
                      onClick={() => { setRetryFailCount(2); setResult(null); }}
                    >
                      Lỗi 2 lần đầu (Nghỉ 500ms + 1.000ms ➔ Lần #3 thành công)
                    </button>
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
                        {scenario.id === 'bulkhead' && '⚠️ Gửi 10 lượt KHÔNG có Bulkhead (Tràn 10/3 chỗ ➔ Sập 503)'}
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

              {scenario.id === 'converge' && (
                <div className="story-ribbon" aria-label="Tiến trình 5 chặng trên đường ống 4 trạm">
                  <div className="story-ribbon-header">
                    <strong>🔗 5 CHẶNG TRÊN CÙNG 1 ĐƯỜNG ỐNG (Retry ➔ CB ➔ Bulkhead ➔ Feign 1s)</strong>
                    <span>Bấm từng chặng bên dưới để xem chậm hoặc tua thẳng tới bước đó</span>
                  </div>
                  <div className="story-acts-grid">
                    {convergeActs.map((act, idx) => {
                      const doneCount = Array.isArray(result) ? result.length : 0;
                      const currentVisual = activeCallIndex !== null ? activeCallIndex : (busy ? doneCount : null);
                      const isActive = currentVisual === idx;
                      const isDone = !isActive && doneCount > idx;
                      return (
                        <button
                          key={act.num}
                          type="button"
                          className={`story-act-card ${isActive ? 'is-active' : isDone ? 'is-done' : ''}`}
                          onClick={() => setExternalJump({ time: act.time, nonce: Date.now() })}
                          title={`Bấm để xem ${act.name}`}
                        >
                          <div className="story-act-top">
                            <span className="story-clock">{act.clock}</span>
                            <span className="story-badge">Chặng {act.num}/5</span>
                          </div>
                          <strong>{act.name}</strong>
                          <span className="story-guard">{act.guard}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className={`demo-dashboard layout-${dashboardLayout}`}>
                <div className="dashboard-visualizer">
                  <ErrorBoundary resetKey={`${scenario.id}:${scenarioMode}:${retryFailCount}:${runCount}:${probeRunCount}`} onReset={() => setResult(null)}>
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
                      retryFailCount={retryFailCount}
                      externalJump={externalJump}
                      onActiveCallChange={setActiveCallIndex}
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
                        activeCallIndex={activeCallIndex}
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
