import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowRight, BookOpen, ChevronRight, CircleCheck, CircleHelp, Clock3, Layers3, LoaderCircle,
  Package, Play, RefreshCw, RotateCcw, ShieldCheck, UserRound, Zap,
} from 'lucide-react';
import DemoResults, { TimeoutClock } from './DemoResults.jsx';
import { lessons } from './demoLessons.js';

const gateway = 'http://localhost:8080';
const order = 'http://localhost:8082';
const user = 'http://localhost:8081';
const resilience = '/api/orders/resilience';

const scenarios = [
  { id: 'normal', name: 'Bình thường', icon: CircleCheck, label: 'Dữ liệu đầy đủ', title: 'Xem đơn hàng #001',
    detail: 'Order Service đọc đơn hàng và lấy thông tin khách hàng tương ứng từ User Service.',
    condition: 'Không giả lập lỗi', action: 'Xem thông tin đơn hàng', question: 'Đơn hàng trả về dữ liệu gì?' },
  { id: 'timeout', name: 'Timeout', icon: Clock3, label: 'Phản hồi chậm', title: 'Khách hàng đang chờ',
    detail: 'Đo phản hồi trực tiếp sau khoảng 4 giây, rồi xem Feign và TimeLimiter dừng chờ ở mốc nào.',
    condition: 'Trễ 4 giây', action: 'So sánh thời gian chờ', question: 'Hệ thống chờ bao lâu?' },
  { id: 'retry', name: 'Retry', icon: RefreshCw, label: 'Lỗi tạm thời', title: 'Lỗi hai lần rồi hồi phục',
    detail: 'User Service trả lỗi ở hai lần gọi đầu. Order Service tự thử lại trong cùng một yêu cầu.',
    condition: 'Hai lỗi HTTP 500', action: 'Thử lấy thông tin khách', question: 'Có thể tự thử lại không?' },
  { id: 'bulkhead', name: 'Bulkhead', icon: Layers3, label: 'Lưu lượng tăng', title: 'Mười lượt đến cùng lúc',
    detail: 'Mỗi lượt mất 2 giây. Order Service chỉ cấp ba suất gọi User Service đồng thời.',
    condition: '10 lượt · 3 suất', action: 'Gửi 10 lượt song song', question: 'Nhận được bao nhiêu lượt?' },
  { id: 'breaker', name: 'Circuit Breaker', icon: Zap, label: 'Lỗi liên tục', title: 'Tạm ngừng gọi dịch vụ lỗi',
    detail: 'User Service liên tục trả lỗi. Quan sát khi Order Service bắt đầu chặn các lời gọi mới.',
    condition: '100% lỗi HTTP 500', action: 'Gửi 6 lượt liên tiếp', question: 'Khi nào nên ngừng gọi?' },
  { id: 'fallback', name: 'Fallback', icon: ShieldCheck, label: 'Chế độ dự phòng', title: 'Vẫn có dữ liệu để hiển thị',
    detail: 'So sánh phản hồi của luồng kết hợp khi bật và tắt dữ liệu khách hàng dự phòng.',
    condition: '100% lỗi HTTP 500', action: 'So sánh có và không dự phòng', question: 'Người dùng nhìn thấy gì?' },
];

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, method = 'GET') {
  const response = await fetch(url, { method, signal: AbortSignal.timeout(25000) });
  const body = await response.json().catch(() => null);
  return { body, status: response.status };
}

async function requireOk(url, method) {
  const { body, status } = await request(url, method);
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
  const [result, setResult] = useState(null);
  const [clock, setClock] = useState(null);
  const [resultView, setResultView] = useState('table');
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [route, setRoute] = useState(null);
  const [needsRecovery, setNeedsRecovery] = useState(false);
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
        requireOk(gateway + '/actuator/health'),
        requireOk(order + resilience + '/status'),
        requireOk(user + '/api/chaos'),
      ]);
      checking = false;
      if (!active || running.current) return;
      setServices({ gateway: gw.status === 'fulfilled', order: orders.status === 'fulfilled', user: users.status === 'fulfilled' });
      setBreaker(orders.value?.circuitBreaker_demo4?.state ?? null);
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
    setResult(null);
    setClock(null);
    setError('');
    setRoute(null);
    setNeedsRecovery(false);
  }

  async function readBreaker(baseUrl) {
    const status = await requireOk(baseUrl + resilience + '/status');
    setBreaker(status.circuitBreaker_demo4.state);
    return status.circuitBreaker_demo4.state;
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
    return perform(async () => {
      await requireOk(user + '/api/chaos/reset', 'POST');
      if (scenario.id === 'breaker' || scenario.id === 'fallback') {
        const status = await requireOk(base + resilience + '/reset', 'POST');
        setBreaker(status.circuitBreaker_demo4.state);
      }
      const query = { timeout: 'delayMs=4000', retry: 'failFirstN=2', bulkhead: 'delayMs=2000',
        breaker: 'failPercent=100', fallback: 'failPercent=100' }[scenario.id];
      if (query) await requireOk(`${user}/api/chaos?${query}`, 'POST');
      setStage('Đang gọi Order Service…');

      switch (scenario.id) {
        case 'normal': {
          const response = await request(base + '/api/orders/1');
          if (!response.body || (response.status === 200 && response.body.orderId !== 1)) {
            throw new Error(`Order Service trả phản hồi ngoài kịch bản (HTTP ${response.status}).`);
          }
          setResult(response);
          break;
        }
        case 'timeout': {
          const phases = [
            ['Gọi trực tiếp User Service', 4000, () => request(user + '/api/users/1')],
            ['Đo Feign read timeout', 3000, () => callOrder(base, '/bulkhead/1')],
            ['Đo Resilience4j TimeLimiter', 1500, () => callOrder(base, '/timeout/1')],
          ];
          const responses = [];
          for (const [label, targetMs, call] of phases) {
            setStage(label + '…');
            const start = performance.now();
            setClock({ label, targetMs, start });
            try {
              const response = await call();
              responses.push({ ...response, measuredMs: Math.round(performance.now() - start) });
              setResult([...responses]);
            } finally {
              setClock(null);
            }
          }
          break;
        }
        case 'retry':
          setStage('Đang chờ Order Service xử lý và thử lại…');
          setResult(await callOrder(base, '/retry/1'));
          break;
        case 'bulkhead':
          setStage('Đang gửi 10 lượt và thu kết quả từng lượt…');
          setResult(await callOrder(base, '/burst/bulkhead?n=10'));
          break;
        case 'breaker': {
          const calls = [];
          for (let index = 1; index <= 6; index += 1) {
            setStage(`Đang gửi lượt ${index}/6…`);
            calls.push(await callOrder(base, '/circuit-breaker/1'));
            setResult([...calls]);
          }
          await readBreaker(base);
          setNeedsRecovery(true);
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
      setStage('Đang khôi phục User Service…');
      await requireOk(user + '/api/chaos/reset', 'POST');
      setStage('Đang chờ mạch cho phép thăm dò…');
      let state = await readBreaker(target);
      for (let attempt = 0; state === 'OPEN' && attempt < 12; attempt += 1) {
        await pause(1000);
        state = await readBreaker(target);
      }
      if (state === 'OPEN') throw new Error('Mạch vẫn đang mở. Hãy thử thăm dò lại.');
      const calls = result.slice(0, 6);
      for (let index = 0; index < 2; index += 1) {
        setStage(`Đang gửi lượt thăm dò ${index + 1}/2…`);
        calls.push(await callOrder(target, '/circuit-breaker/1'));
        setResult([...calls]);
      }
      await readBreaker(target);
      setNeedsRecovery(false);
    });
  }

  function reset() {
    return perform(async () => {
      await requireOk(user + '/api/chaos/reset', 'POST');
      const status = await requireOk(base + resilience + '/reset', 'POST');
      setBreaker(status.circuitBreaker_demo4.state);
      setResult(null);
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
              <div className="stage-meta"><span className="chapter">KỊCH BẢN {String(selected + 1).padStart(2, '0')}</span><span className="condition"><i />{scenario.condition}</span></div>
              <h2>{scenario.title}</h2><p>{scenario.detail}</p>
              <div className="flow"><span><Package size={16} /> Order Service</span><ArrowRight size={17} aria-hidden="true" /><span className="flow-guard"><scenario.icon size={16} /> {scenario.id === 'normal' ? 'OpenFeign' : scenario.name}</span><ArrowRight size={17} aria-hidden="true" /><span><UserRound size={16} /> User Service</span></div>
              <section className="lesson" aria-label="Mục đích và quy trình demo">
                <p><strong>Mục đích</strong> {lesson.goal}</p>
                <ol aria-label="Các bước của kịch bản">{lesson.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                <details key={scenario.id} className="lesson-terms">
                  <summary><BookOpen size={16} aria-hidden="true" /> {scenario.id === 'breaker' ? 'Thuật ngữ · Vì sao lượt 6 bị chặn?' : 'Giải thích thuật ngữ'}</summary>
                  <dl>{lesson.terms.map(([term, explanation]) => <div key={term}><dt>{term}</dt><dd>{explanation}</dd></div>)}</dl>
                </details>
              </section>
              <div className="controls">
                <button className="primary" disabled={busy || !ready} onClick={run}><Play size={17} />{scenario.action}</button>
                {needsRecovery && <button className="reset" disabled={busy || !ready} onClick={recover}>Gửi 2 lượt thăm dò</button>}
              </div>
              {busy && <div className="live-stage" role="status"><LoaderCircle className="spinner" size={15} aria-hidden="true" />{stage}</div>}
              {needsRecovery && !busy && !error && <p className="notice">Nút thăm dò đợi mạch cho phép rồi mới gửi. Hai lượt này dùng cùng API với sáu lượt đầu.</p>}
              {services && !ready && <p className="notice">Khởi động Order Service và User Service để chạy demo.</p>}
              {error && <p className="error" role="alert">{error}</p>}
            </div>

            <div className="stage-results">
              <div className="result-heading"><div><div className="section-label">KẾT QUẢ</div><h3>{scenario.question}</h3></div>{route && <span className="route">{route === gateway ? 'Qua Gateway' : 'Gọi trực tiếp'}</span>}</div>
              {clock && <TimeoutClock key={clock.start} clock={clock} />}
              <div aria-live="polite" aria-busy={busy}>
                <DemoResults scenario={scenario.id} result={result} breaker={breaker} busy={busy} error={error} view={resultView} onViewChange={setResultView} />
              </div>
            </div>
          </section>
        </div>
        <footer>Order Service <span>→</span> User Service <span>·</span> Resilience4j</footer>
      </main>
    </div>
  );
}
