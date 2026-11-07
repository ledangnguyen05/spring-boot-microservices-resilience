import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowRight, BookOpen, ChevronRight, CircleCheck, CircleHelp, Clock3, Layers3,
  Lightbulb, LoaderCircle, Network, Package, Play, RefreshCw, RotateCcw, ShieldCheck, Target,
  UserRound, Zap,
} from 'lucide-react';
import DemoResults, { TimeoutClock } from './DemoResults.jsx';

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
    detail: 'Một đường gọi duy nhất: Retry → Circuit Breaker → Bulkhead → Feign timeout. Kịch bản tự đổi sự cố qua 4 pha để thấy từng cơ chế ra tay.',
    condition: '4 pha · tự đổi sự cố', action: 'Chạy kịch bản 4 pha', question: 'Cơ chế nào ra tay ở mỗi pha?' },
  { id: 'fallback', name: 'Fallback & Kết hợp', icon: ShieldCheck, label: 'Bonus · Mở rộng', title: 'Vẫn có dữ liệu để hiển thị',
    chapter: 'MỞ RỘNG (BONUS)',
    detail: 'So sánh phản hồi của luồng kết hợp khi bật và tắt dữ liệu khách hàng dự phòng.',
    condition: '100% lỗi HTTP 500', action: 'So sánh có và không dự phòng', question: 'Người dùng nhìn thấy gì?' },
];

const educationalInfo = {
  normal: {
    purpose: 'Kiểm tra đường truyền khi hệ thống chạy lý tưởng: Order Service gọi User Service lấy thông tin khách và trả về đơn hàng đầy đủ.',
    realLife: 'Như việc mua hàng online lúc mạng mượt: bấm thanh toán, hệ thống lấy ngay địa chỉ đã lưu và tạo đơn hàng thành công trong chớp mắt.',
    glossary: [
      { term: 'OpenFeign', desc: 'Thư viện client dạng khai báo giúp gọi service khác dễ dàng như một hàm Java.' },
      { term: 'Downstream', desc: 'Dịch vụ phía sau nhận cuộc gọi (ở đây là User Service).' },
    ],
  },
  timeout: {
    purpose: 'Kiểm chứng khả năng tự ngắt cuộc gọi khi dịch vụ đối tác phản hồi quá chậm (trễ 4s), giải phóng luồng xử lý (thread) cho Order Service.',
    realLife: 'Khi đi ăn quán quá đông, nếu quán báo chờ quá 15 phút, bạn sẽ chọn đi quán khác thay vì đứng chôn chân cả buổi. Tương tự, app Shopee/Tiki khi gọi ngân hàng bị đơ phải cắt sau vài giây để người dùng đổi thẻ.',
    glossary: [
      { term: 'Feign readTimeout (3s)', desc: 'Giới hạn chờ dữ liệu của HTTP client ở tầng kết nối socket.' },
      { term: 'TimeLimiter (1.5s)', desc: 'Tầng bảo vệ thứ hai ở mức ứng dụng (Resilience4j), chủ động ngắt chờ sớm hơn để nhả thread.' },
      { term: 'Thread Exhaustion', desc: 'Hiện tượng cạn kiệt luồng: tất cả worker đều bận chờ khiến server bị đơ hoàn toàn.' },
      { term: 'HTTP 504', desc: 'Mã Gateway Timeout thông báo cuộc gọi bị dừng vì quá thời gian chờ quy định.' },
    ],
  },
  retry: {
    purpose: 'Kiểm chứng khả năng tự thử lại khi gặp lỗi mạng chớp nhoáng (transient fault) và tự cứu vãn yêu cầu mà người dùng không hề hay biết.',
    realLife: 'Khi bạn gửi tin nhắn Zalo trong thang máy sóng yếu, app tự âm thầm gửi lại 2-3 lần đến khi có mạng là xong, bạn không cần phải tự gõ lại tin nhắn. Tương tự máy quẹt thẻ POS tự ping lại khi mạng chập chờn.',
    glossary: [
      { term: 'Transient Fault', desc: 'Sự cố thoáng qua vài trăm mili-giây tự hết (rung lắc đường truyền, service vừa reboot).' },
      { term: 'Exponential Backoff', desc: 'Thời gian chờ nhân đôi sau mỗi lần thử (500ms ➔ 1000ms) để server đối tác kịp hồi phục.' },
      { term: 'Retry Storm', desc: 'Hiểm họa hàng triệu client cùng ồ ạt thử lại, biến lỗi nhỏ thành thảm họa sập toàn diện.' },
      { term: 'Idempotency', desc: 'Tính chất lặp lại thao tác nhiều lần cho cùng kết quả (thao tác đọc an toàn để thử lại).' },
    ],
  },
  bulkhead: {
    purpose: 'Kiểm chứng việc giới hạn số cuộc gọi đồng thời (3 suất) để cô lập tài nguyên: dù lượng truy cập tăng vọt (10 request), hệ thống vẫn không bị quá tải.',
    realLife: 'Khoang chống chìm của tàu Titanic: tàu được chia nhiều khoang kín nước độc lập; nếu 1 khoang bị thủng, nước chỉ vào khoang đó chứ không làm chìm tàu. Tương tự phòng cách ly tại bệnh viện tránh lây nhiễm chéo.',
    glossary: [
      { term: 'Bulkhead', desc: 'Vách ngăn phân chia và cô lập tài nguyên cho từng dịch vụ độc lập.' },
      { term: 'Semaphore Bulkhead', desc: 'Bộ đếm cấp phép giới hạn số request đang chạy cùng lúc (ở đây là 3 suất).' },
      { term: 'Fail-fast (HTTP 429)', desc: 'Từ chối dứt khoát ngay trong 2ms khi hết suất thay vì bắt người dùng xếp hàng chờ.' },
      { term: 'Cascading Failure', desc: 'Hiệu ứng domino sập dây chuyền khi một mắt xích nhỏ quá tải kéo theo toàn bộ hệ thống.' },
    ],
  },
  breaker: {
    purpose: 'Kiểm chứng khi User Service sập 100%, Circuit Breaker tự ngắt mạch để từ chối ngay lập tức (0ms), bảo vệ server và tạo điều kiện hồi phục.',
    realLife: 'Cầu dao tự động (Aptomat) trong gia đình: khi chập điện hoặc sét đánh, cầu dao tự nhảy "tách" để bảo vệ tivi, tủ lạnh không bị cháy nổ. Sau khi sửa điện xong, gạt cầu dao lên để cấp điện trở lại.',
    glossary: [
      { term: 'CLOSED (Đóng mạch)', desc: 'Trạng thái bình thường: cho phép request đi qua và ghi nhận tỷ lệ lỗi.' },
      { term: 'OPEN (Ngắt mạch)', desc: 'Cầu dao nhảy: chặn đứng ngay mọi request tại cửa (fail-fast 0ms, HTTP 503) để bảo vệ server.' },
      { term: 'HALF_OPEN (Thăm dò)', desc: 'Sau 10s chờ, hé mở cho 2 request đi qua thăm dò. Nếu êm thì đóng lại (CLOSED).' },
      { term: 'Sliding Window', desc: 'Cửa sổ trượt lưu 5 lần gọi gần nhất để tính tỷ lệ lỗi (nếu ≥ 50% thì ngắt mạch).' },
    ],
  },
  converge: {
    purpose: 'Kịch bản hội tụ cả 4 cơ chế trong 1 chức năng duy nhất: Retry (ngoài) ➔ Circuit Breaker ➔ Bulkhead ➔ Feign Timeout (trong) ➔ User Service.',
    realLife: 'Hệ thống mua sắm ngày Siêu Sale 11/11 của Shopee: Bulkhead chặn dòng người quá đông, Retry gỡ rối khi mạng lag, Feign Timeout ngắt khi kho chậm, và Circuit Breaker ngắt cầu dao bảo vệ khi kho sập!',
    glossary: [
      { term: 'Pipeline Hội Tụ', desc: 'Thứ tự lồng chuẩn: Retry (ngoài) ➔ Circuit Breaker ➔ Bulkhead ➔ Feign Timeout ➔ User Service.' },
      { term: 'Non-retryable Barrier', desc: 'Khi Circuit Breaker đã OPEN hoặc Bulkhead đầy, Retry KHÔNG được gọi lại để chống Retry Storm.' },
      { term: 'Hội tụ 4-in-1', desc: 'Tất cả 4 chủ đề seminar cùng tham gia bảo vệ một endpoint duy nhất /converge/{userId}.' },
    ],
  },
  fallback: {
    purpose: 'Kiểm chứng khi mọi tầng bảo vệ đều báo lỗi, hàm Fallback tự động trả về dữ liệu dự phòng an toàn để giao diện không bị gián đoạn.',
    realLife: 'Máy phát điện dự phòng tại tòa nhà hay bình dưỡng khí trên máy bay. Trên app nghe nhạc (Spotify), khi mất mạng app vẫn hiển thị danh sách bài hát tải offline thay vì báo lỗi trắng xóa.',
    glossary: [
      { term: 'Fallback (Dự phòng)', desc: 'Dữ liệu thay thế an toàn trả về cho khách hàng khi downstream gặp sự cố.' },
      { term: 'Graceful Degradation', desc: 'Hạ cấp mềm dẻo: chấp nhận thiếu một phần thông tin phụ để giữ hệ thống chính luôn chạy.' },
    ],
  },
};

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
  const running = useRef(false);
  const scenario = scenarios[selected];
  const info = educationalInfo[scenario.id];

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
            await pause(300);
          }
          break;
        }
        case 'retry':
          setResult(await callOrder(base, '/retry/1'));
          break;
        case 'bulkhead':
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
        case 'converge': {
          const phases = [];
          const step = async (stageText, chaosQuery, path, phase) => {
            setStage(stageText);
            await requireOk(user + '/api/chaos/reset', 'POST');
            await requireOk(`${user}/api/chaos?${chaosQuery}`, 'POST');
            const start = performance.now();
            const response = await callOrder(base, path);
            phases.push({ ...response, measuredMs: Math.round(performance.now() - start), phase });
            setResult([...phases]);
          };
          await step('Pha 1/4 · Bulkhead: gửi 6 lượt song song…', 'delayMs=600', '/burst/converge?n=6',
            { title: 'Pha 1 · Lưu lượng tăng đột biến', topics: 'Bulkhead', expect: '3 suất xử lý, các lượt dư bị từ chối ngay' });
          await step('Pha 2/4 · Retry: User Service lỗi thoáng qua…', 'failFirstN=2', '/converge/1',
            { title: 'Pha 2 · Lỗi thoáng qua', topics: 'Retry', expect: '2 lần đầu lỗi 500, lần 3 thành công' });
          await step('Pha 3/4 · Feign timeout: User Service bị treo…', 'delayMs=3000', '/converge/1',
            { title: 'Pha 3 · User Service bị treo', topics: 'Feign timeout + Circuit Breaker + Retry', expect: 'Feign cắt sau 1 giây, mạch mở, Retry dừng' });
          await step('Pha 4/4 · Circuit Breaker: gọi lại khi mạch đang mở…', 'delayMs=3000', '/converge/1',
            { title: 'Pha 4 · Mạch đang mở', topics: 'Circuit Breaker + Retry', expect: 'Từ chối ngay, không gọi User, không retry' });
          const status = await requireOk(base + resilience + '/status');
          setConvergeBreaker(status.circuitBreaker_converge.state);
          break;
        }
        case 'fallback': {
          const noFallback = await callOrder(base, '/combined/1?fallback=false');
          setResult([noFallback]);
          await requireOk(base + resilience + '/reset', 'POST');
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
      setStage('Đang chờ mạch cho phép thăm dò…');
      let state = await readBreaker(target);
      for (let attempt = 0; state === 'OPEN' && attempt < 12; attempt += 1) {
        await pause(1000);
        state = await readBreaker(target);
      }
      if (state === 'OPEN') throw new Error('Mạch vẫn đang mở. Hãy thử thăm dò lại.');
      setStage('Đang gửi 2 lượt thăm dò…');
      const calls = result.slice(0, 6);
      for (let index = 0; index < 2; index += 1) {
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
              <div className="controls">
                <button className="primary" disabled={busy || !ready} onClick={run}>{busy ? <LoaderCircle className="spinner" size={17} /> : <Play size={17} />}{stage || scenario.action}</button>
                {needsRecovery && <button className="reset" disabled={busy || !ready} onClick={recover}>Gửi lượt thăm dò</button>}
              </div>

              {info && (
                <div className="knowledge-panel">
                  <div className="knowledge-card">
                    <div className="knowledge-title"><Target size={16} /> Ý NGHĨA KIỂM TRA</div>
                    <p>{info.purpose}</p>
                  </div>
                  <div className="knowledge-card">
                    <div className="knowledge-title"><Lightbulb size={16} /> ỨNG DỤNG THỰC TẾ ĐỜI SỐNG</div>
                    <p>{info.realLife}</p>
                  </div>
                  <div className="knowledge-card full-width">
                    <div className="knowledge-title"><BookOpen size={16} /> GIẢI ĐÁP THUẬT NGỮ CHUYÊN MÔN</div>
                    <div className="glossary-grid">
                      {info.glossary.map((g, idx) => (
                        <div key={idx} className="glossary-item">
                          <strong>{g.term}:</strong> <span>{g.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {services && !ready && <p className="notice">Khởi động Order Service và User Service để chạy demo.</p>}
              {error && <p className="error" role="alert">{error}</p>}
            </div>

            <div className="stage-results">
              <div className="result-heading"><div><div className="section-label">KẾT QUẢ ĐO ĐẠC</div><h3>{scenario.question}</h3></div>{route && <span className="route">{route === gateway ? 'Qua Gateway' : 'Gọi trực tiếp'}</span>}</div>
              {clock && <TimeoutClock key={clock.start} clock={clock} />}
              <div aria-live="polite" aria-busy={busy}>
                <DemoResults scenario={scenario.id} result={result} breaker={scenario.id === 'converge' ? convergeBreaker : breaker} busy={busy} error={error} view={resultView} onViewChange={setResultView} />
              </div>
              {needsRecovery && <p className="note">User Service đã được khôi phục. Gửi lượt thăm dò để kiểm tra mạch đóng lại.</p>}
            </div>
          </section>
        </div>
        <footer>Order Service <span>→</span> User Service <span>·</span> Resilience4j</footer>
      </main>
    </div>
  );
}
