import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowRight, BookOpen, ChevronRight, CircleCheck, CircleHelp, Clock3, Layers3,
  LoaderCircle, Network, Package, Play, RefreshCw, RotateCcw, ShieldCheck, Target,
  UserRound, Zap,
} from 'lucide-react';
import DemoResults, { TimeoutClock } from './DemoResults.jsx';
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
  { id: 'timeout', name: 'Timeout', icon: Clock3, label: 'Topic 1 · Feign Timeout', title: 'Khách hàng đang chờ',
    chapter: 'CHỦ ĐỀ 01',
    detail: 'Đo phản hồi trực tiếp sau khoảng 4 giây, rồi xem Feign (3s) và TimeLimiter (1.5s) dừng chờ ở mốc nào.',
    condition: 'Trễ 4 giây', action: 'So sánh thời gian chờ', question: 'Hệ thống chờ bao lâu?' },
  { id: 'retry', name: 'Retry', icon: RefreshCw, label: 'Topic 2 · Lỗi tạm thời', title: 'Lỗi hai lần rồi hồi phục',
    chapter: 'CHỦ ĐỀ 02',
    detail: 'User Service trả lỗi ở hai lần gọi đầu. Order Service tự thử lại trong cùng một yêu cầu với Exponential Backoff.',
    condition: 'Hai lỗi HTTP 500', action: 'Thử lấy thông tin khách', question: 'Có thể tự thử lại không?' },
  { id: 'bulkhead', name: 'Bulkhead', icon: Layers3, label: 'Topic 3 · Lưu lượng tăng', title: 'Mười lượt đến cùng lúc',
    chapter: 'CHỦ ĐỀ 03',
    detail: 'Mỗi lượt mất 2 giây. Order Service chỉ cấp ba suất gọi User Service đồng thời, quá tải từ chối 429 ngay.',
    condition: '10 lượt · 3 suất', action: 'Gửi 10 lượt song song', question: 'Nhận được bao nhiêu lượt?' },
  { id: 'breaker', name: 'Circuit Breaker', icon: Zap, label: 'Topic 4 · Lỗi liên tục', title: 'Tạm ngừng gọi dịch vụ lỗi',
    chapter: 'CHỦ ĐỀ 04',
    detail: 'User Service liên tục trả lỗi. Quan sát khi Order Service chuyển sang OPEN chặn đứng các lời gọi mới.',
    condition: '100% lỗi HTTP 500', action: 'Gửi 6 lượt liên tiếp', question: 'Khi nào nên ngừng gọi?' },
  { id: 'converge', name: 'Hội tụ 4 topic', icon: Network, label: 'Tổng hợp · Cả 4 cùng chạy', title: 'Bốn cơ chế bảo vệ cùng một lời gọi',
    chapter: 'HỘI TỤ 4 TOPIC',
    detail: 'Một đường gọi duy nhất: Retry → Circuit Breaker → Bulkhead → Feign timeout. Kịch bản tự động chạy qua 5 pha để thấy trọn vẹn vòng đời: lọc tải, tự cứu, tự bảo vệ fail-fast, và tự chữa lành về 200 OK.',
    condition: '5 pha · tự chữa lành', action: 'Chạy trọn vẹn 5 pha', question: 'Cơ chế nào ra tay và kết quả ra sao ở mỗi pha?' },
  { id: 'fallback', name: 'Fallback & Kết hợp', icon: ShieldCheck, label: 'Bonus · Mở rộng', title: 'Vẫn có dữ liệu để hiển thị',
    chapter: 'MỞ RỘNG (BONUS)',
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
    setResult(null);
    setClock(null);
    setError('');
    setRoute(null);
    setNeedsRecovery(false);
    setRunCount(0);
  }

  async function readBreaker(baseUrl) {
    const status = await requireOk(baseUrl + resilience + '/status');
    setBreaker(status.circuitBreaker_demo4.state);
    if (status.circuitBreaker_converge) setConvergeBreaker(status.circuitBreaker_converge.state);
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
    setRunCount((prev) => prev + 1);
    return perform(async () => {
      await requireOk(user + '/api/chaos/reset', 'POST');
      if (['breaker', 'fallback', 'converge'].includes(scenario.id)) {
        const status = await requireOk(base + resilience + '/reset', 'POST');
        setBreaker(status.circuitBreaker_demo4.state);
        if (status.circuitBreaker_converge) setConvergeBreaker(status.circuitBreaker_converge.state);
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
          await pause(300);
          setResult(response);
          break;
        }
        case 'timeout': {
          const phases = [
            ['Gọi trực tiếp User Service', 4000, () => request(user + '/api/users/1')],
            ['Đo Feign read timeout', 3000, () => callOrder(base, '/feign-timeout/1')],
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
            } finally {
              setClock(null);
            }
            setResult([...responses]);
            await pause(450);
          }
          break;
        }
        case 'retry': {
          setStage('Lần 1: Đang gọi User Service…');
          const callPromise = callOrder(base, '/retry/1');
          const response = await callPromise;
          const attempts = response.body?.attemptResults ?? [];
          if (attempts.length >= 3) {
            setStage('Lần 1: User Service trả lỗi 500. Đang chờ 500ms (Exponential Backoff)…');
            setResult({ ...response, _stagedAttempts: [attempts[0]], _stagedSummary: false });
            await pause(700);

            setStage('Lần 2: User Service vẫn lỗi 500. Đang chờ 1000ms…');
            setResult({ ...response, _stagedAttempts: [attempts[0], attempts[1]], _stagedSummary: false });
            await pause(950);

            setStage('Lần 3: User Service đã phục hồi, trả dữ liệu 200 OK!');
            setResult({ ...response, _stagedAttempts: attempts, _stagedSummary: false });
            await pause(500);

            setResult({ ...response, _stagedAttempts: attempts, _stagedSummary: true });
          } else {
            setResult(response);
          }
          break;
        }
        case 'bulkhead': {
          setStage('Đang gửi 10 lượt song song vào Order Service…');
          const response = await callOrder(base, '/burst/bulkhead?n=10');
          const results = response.body?.requestResults ?? [];
          const rejected = results.filter((r) => r.httpStatus === 429);
          const accepted = results.filter((r) => r.httpStatus === 200);

          if (rejected.length > 0 && accepted.length > 0) {
            setStage('7 lượt quá tải bị vách ngăn Bulkhead từ chối ngay tức thì (429)…');
            setResult({ ...response, _stagedResults: rejected });
            await pause(900);

            setStage('3 lượt trong hạn ngạch đã hoàn tất xử lý (200 OK)!');
            setResult({ ...response, _stagedResults: [...rejected, ...accepted] });
          } else {
            setResult(response);
          }
          break;
        }
        case 'breaker': {
          const calls = [];
          for (let index = 1; index <= 6; index += 1) {
            setStage(`Đang gửi lượt ${index}/6…`);
            const res = await callOrder(base, '/circuit-breaker/1');
            calls.push(res);
            setResult([...calls]);
            await pause(450);
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
            await pause(600);
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
          await pause(600);
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
        await pause(450);
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
              )}

              <div className="controls">
                <button className="primary" disabled={busy || !ready} onClick={run}>
                  <Play size={17} />{scenario.action}
                </button>
                {needsRecovery && <button className="reset" disabled={busy || !ready} onClick={recover}>Gửi 2 lượt thăm dò</button>}
              </div>
              {busy && <div className="live-stage" role="status"><LoaderCircle className="spinner" size={15} aria-hidden="true" />{stage}</div>}
              {needsRecovery && !busy && !error && <p className="notice">Nút thăm dò đợi mạch cho phép rồi mới gửi. Hai lượt này dùng cùng API với sáu lượt đầu.</p>}
              {services && !ready && <p className="notice">Khởi động Order Service và User Service để chạy demo.</p>}
              {error && <p className="error" role="alert">{error}</p>}
            </div>

            <div className="stage-results">
              <div className="result-heading"><div><div className="section-label">MÔ PHỎNG & KẾT QUẢ ĐO ĐẠC</div><h3>{scenario.question}</h3></div>{route && <span className="route">{route === gateway ? 'Qua Gateway' : 'Gọi trực tiếp'}</span>}</div>
              {clock && <TimeoutClock key={clock.start} clock={clock} />}
              <FlowVisualizer
                scenarioId={scenario.id}
                busy={busy}
                liveStage={stage}
                breakerState={scenario.id === 'converge' ? convergeBreaker : breaker}
                runCount={runCount}
                actionLabel={scenario.action}
              />
              <div aria-live="polite" aria-busy={busy}>
                <DemoResults scenario={scenario.id} result={result} breaker={scenario.id === 'converge' ? convergeBreaker : breaker} busy={busy} error={error} view={resultView} onViewChange={setResultView} />
              </div>
            </div>
          </section>
        </div>
        <footer>Order Service <span>→</span> User Service <span>·</span> Resilience4j</footer>
      </main>
    </div>
  );
}
