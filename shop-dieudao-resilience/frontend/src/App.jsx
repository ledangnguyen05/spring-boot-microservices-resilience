import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, ShieldCheck, Zap, Activity, Clock, RefreshCw,
  Layers, ArrowRight, ExternalLink, Play, CheckCircle2,
  AlertOctagon, AlertTriangle, Flame, Terminal, Server,
  Sliders, Info, HelpCircle, Check, XCircle, ArrowUpRight, Sparkles
} from 'lucide-react';

const GATEWAY_URL = 'http://localhost:8080';
const USER_SERVICE_URL = 'http://localhost:8081';
const ORDER_SERVICE_URL = 'http://localhost:8082';

export default function App() {
  // Service health status
  const [gatewayOnline, setGatewayOnline] = useState(false);
  const [orderOnline, setOrderOnline] = useState(false);
  const [userOnline, setUserOnline] = useState(false);

  // Chaos state
  const [chaos, setChaos] = useState({ delayMs: 0, failPercent: 0, failFirstNLeft: 0, totalCalls: 0 });
  const [delayInput, setDelayInput] = useState(0);
  const [failPercentInput, setFailPercentInput] = useState(0);
  const [failFirstNInput, setFailFirstNInput] = useState(0);

  // Inspector for Chaos applied
  const [lastChaosApplied, setLastChaosApplied] = useState(null);

  // Pattern results & loading
  const [loading, setLoading] = useState({});
  const [results, setResults] = useState({});
  const [lastTestedResult, setLastTestedResult] = useState(null);
  const [cbMetrics, setCbMetrics] = useState(null);
  const [burstCount, setBurstCount] = useState(10);
  const [fallbackEnabled, setFallbackEnabled] = useState(true);

  // Activity logs
  const [logs, setLogs] = useState([]);

  const addLog = (tag, status, message, elapsedMs) => {
    const time = new Date().toLocaleTimeString('vi-VN');
    setLogs((prev) => [
      { id: Date.now() + Math.random(), time, tag, status, message, elapsedMs },
      ...prev.slice(0, 49),
    ]);
  };

  // Poll health & status
  const checkHealth = async () => {
    // 1. User Service (:8081)
    try {
      const res = await fetch(`${USER_SERVICE_URL}/api/chaos`);
      if (res.ok) {
        const data = await res.json();
        setUserOnline(true);
        setChaos(data);
      } else {
        setUserOnline(false);
      }
    } catch {
      setUserOnline(false);
    }

    // 2. Order Service (:8082)
    try {
      const res = await fetch(`${ORDER_SERVICE_URL}/api/orders/resilience/status`);
      if (res.ok) {
        const data = await res.json();
        setOrderOnline(true);
        setCbMetrics(data);
      } else {
        setOrderOnline(false);
      }
    } catch {
      setOrderOnline(false);
    }

    // 3. API Gateway (:8080) - Thử cả /actuator/health và /health
    let gwOk = false;
    try {
      const res = await fetch(`${GATEWAY_URL}/actuator/health`);
      if (res.ok) gwOk = true;
    } catch {}
    if (!gwOk) {
      try {
        const res = await fetch(`${GATEWAY_URL}/health`);
        if (res.ok) gwOk = true;
      } catch {}
    }
    setGatewayOnline(gwOk);
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 3000);
    return () => clearInterval(interval);
  }, []);

  // Xác định base URL thông minh: Ưu tiên Gateway (:8080), nếu Gateway chưa bật thì gọi thẳng Order (:8082)
  const getEffectiveOrderBaseUrl = () => {
    if (gatewayOnline) return GATEWAY_URL;
    if (orderOnline) return ORDER_SERVICE_URL;
    return GATEWAY_URL;
  };

  // Helper sinh giải thích nguyên lý cho Chaos
  const getChaosExplanation = (d, p, n) => {
    if (d >= 1500) {
      return {
        preset: `Chậm ${d}ms (Giả lập nghẽn mạng / treo DB)`,
        principle: `Mô phỏng User Service bị nghẽn I/O hoặc truy vấn database quá tải khiến request bị ngâm tới ${d}ms. Trong kiến trúc Microservices, nếu không có Timeout, các request gọi sang sẽ chiếm giữ luồng (thread) vô tận làm cạn kiệt connection pool của Order Service.`,
        targetPattern: 'Pattern 1: TimeLimiter (Timeout 1.5s)',
        testHint: 'Kéo xuống thẻ [Pattern 1] và bấm nút "🟢 Test Sau Đó (Cắt 1.5s)" để xem TimeLimiter cắt đứt chính xác ở mốc 1500ms thay vì bị ngâm 4s!',
      };
    }
    if (n > 0) {
      return {
        preset: `Lỗi ${n} lần đầu rồi tự hồi (Sự cố chớp tắt / Transient Fault)`,
        principle: `Mô phỏng sự cố mạng chập chờn hoặc instance User Service đang khởi động lại (warm-up). Đúng ${n} request đầu tiên sẽ trả HTTP 500, từ request thứ ${n + 1} sẽ bình thường trở lại.`,
        targetPattern: 'Pattern 2: Resilience4j Retry (Tối đa 3 lần)',
        testHint: 'Kéo xuống thẻ [Pattern 2] và bấm "▶ Bấm Test Retry" để xem cơ chế tự động thử lại 3 lần với Exponential Backoff tự cứu sống request!',
      };
    }
    if (p >= 50) {
      return {
        preset: `Sập ${p}% (Giả lập dịch vụ sập hoàn toàn / Hard Outage)`,
        principle: `Mô phỏng User Service bị sập hoàn toàn. Tỷ lệ lỗi 500 lên tới ${p}%. Khi downstream sập, upstream phải có cơ chế ngắt cầu dao (Circuit Breaker) để không làm kiệt quệ tài nguyên và có dữ liệu dự phòng (Fallback) cho khách hàng.`,
        targetPattern: 'Pattern 4 (Circuit Breaker) & Pattern 5 (Combined + Fallback)',
        testHint: 'Kéo xuống thẻ [Pattern 4] bấm "▶ Bắn 6 Lần" để cầu dao nhảy sang OPEN (ngắt mạch 0ms), hoặc xuống [Pattern 5] để xem dữ liệu Fallback an toàn!',
      };
    }
    return {
      preset: 'Bình thường (Reset sạch sẽ)',
      principle: 'User Service hoạt động ở điều kiện lý tưởng: độ trễ 0ms, tỷ lệ lỗi 0%. Mọi cuộc gọi sẽ phản hồi ngay lập tức trong vài mili-giây với HTTP 200 OK.',
      targetPattern: 'Tất cả các Pattern',
      testHint: 'Bây giờ mọi request sẽ thành công với trạng thái bình thường 200 OK.',
    };
  };

  // Configure chaos
  const applyChaos = async (d, p, n, presetName = null) => {
    const prev = { ...chaos };
    try {
      const res = await fetch(`${USER_SERVICE_URL}/api/chaos?delayMs=${d}&failPercent=${p}&failFirstN=${n}`, {
        method: 'POST',
      });
      const data = await res.json();
      setChaos(data);
      setDelayInput(data.delayMs || 0);
      setFailPercentInput(data.failPercent || 0);
      setFailFirstNInput(data.failFirstNLeft || 0);

      const explanation = getChaosExplanation(d, p, n);
      setLastChaosApplied({
        timestamp: new Date().toLocaleTimeString('vi-VN'),
        name: presetName || explanation.preset,
        before: {
          delayMs: prev.delayMs,
          failPercent: prev.failPercent,
          failFirstNLeft: prev.failFirstNLeft,
        },
        after: {
          delayMs: data.delayMs,
          failPercent: data.failPercent,
          failFirstNLeft: data.failFirstNLeft,
        },
        principle: explanation.principle,
        targetPattern: explanation.targetPattern,
        testHint: explanation.testHint,
      });

      addLog('CHAOS', 200, `Cập nhật Chaos: delay=${data.delayMs}ms, fail=${data.failPercent}%, failFirstN=${data.failFirstNLeft}`, 0);
    } catch (err) {
      addLog('CHAOS', 500, `Lỗi cập nhật Chaos: ${err.message}`, 0);
    }
  };

  const resetChaos = async () => {
    const prev = { ...chaos };
    try {
      const res = await fetch(`${USER_SERVICE_URL}/api/chaos/reset`, { method: 'POST' });
      const data = await res.json();
      setChaos(data);
      setDelayInput(0);
      setFailPercentInput(0);
      setFailFirstNInput(0);

      const explanation = getChaosExplanation(0, 0, 0);
      setLastChaosApplied({
        timestamp: new Date().toLocaleTimeString('vi-VN'),
        name: '🟢 Đã Reset User Service về bình thường',
        before: {
          delayMs: prev.delayMs,
          failPercent: prev.failPercent,
          failFirstNLeft: prev.failFirstNLeft,
        },
        after: {
          delayMs: 0,
          failPercent: 0,
          failFirstNLeft: 0,
        },
        principle: explanation.principle,
        targetPattern: explanation.targetPattern,
        testHint: explanation.testHint,
      });

      addLog('CHAOS', 200, 'Đã Reset User Service về bình thường (delay=0, fail=0)', 0);
    } catch (err) {
      addLog('CHAOS', 500, `Lỗi Reset Chaos: ${err.message}`, 0);
    }
  };

  // Reset Circuit Breaker
  const resetCircuitBreaker = async () => {
    const baseUrl = getEffectiveOrderBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/orders/resilience/reset`, { method: 'POST' });
      const data = await res.json();
      setCbMetrics(data);
      addLog('CB_RESET', 200, 'Đã Reset toàn bộ CircuitBreaker về trạng thái CLOSED', 0);
    } catch (err) {
      addLog('CB_RESET', 500, `Lỗi Reset CB: ${err.message}`, 0);
    }
  };

  // Execute demo request
  const runDemo = async (key, path, patternInfo) => {
    setLoading((prev) => ({ ...prev, [key]: true }));
    const baseUrl = getEffectiveOrderBaseUrl();
    const fullUrl = `${baseUrl}${path}`;
    const begin = Date.now();
    try {
      const res = await fetch(fullUrl);
      const data = await res.json();
      const elapsed = Date.now() - begin;
      
      const resultPayload = {
        ...data,
        key,
        routeUsed: baseUrl === GATEWAY_URL ? 'Qua API Gateway (:8080)' : 'Trực tiếp Order Service (:8082)',
        patternTitle: patternInfo.title,
        patternBadge: patternInfo.badge,
        beforeDesc: patternInfo.beforeDesc,
        afterDesc: patternInfo.afterDesc,
        principleDesc: patternInfo.principleDesc,
        timestamp: new Date().toLocaleTimeString('vi-VN'),
      };
      
      setResults((prev) => ({ ...prev, [key]: resultPayload }));
      setLastTestedResult(resultPayload);
      addLog(key.toUpperCase(), res.status, data.message || `Hoàn tất với outcome: ${data.outcome}`, elapsed);
      checkHealth();
    } catch (err) {
      const elapsed = Date.now() - begin;
      const isConnectionRefused = (!gatewayOnline && !orderOnline) || err.message.includes('fetch');
      const errorObj = {
        outcome: isConnectionRefused ? 'SERVER_OFFLINE' : 'ERROR',
        httpStatus: isConnectionRefused ? 0 : 500,
        message: isConnectionRefused
          ? '❌ Không thể kết nối tới Backend (:8080 / :8082). Hãy kiểm tra xem bạn đã bấm Run cho ApiGatewayApplication hoặc OrderServiceApplication trong IntelliJ chưa!'
          : err.message,
        elapsedMs: elapsed,
        key,
        routeUsed: 'Không kết nối được',
        patternTitle: patternInfo.title,
        patternBadge: patternInfo.badge,
        beforeDesc: patternInfo.beforeDesc,
        afterDesc: patternInfo.afterDesc,
        principleDesc: patternInfo.principleDesc,
        timestamp: new Date().toLocaleTimeString('vi-VN'),
      };
      setResults((prev) => ({ ...prev, [key]: errorObj }));
      setLastTestedResult(errorObj);
      addLog(key.toUpperCase(), 500, errorObj.message, elapsed);
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Test unshielded original endpoint (Before Resilience)
  const runOriginalDemo = async (key, path, patternInfo) => {
    setLoading((prev) => ({ ...prev, [`${key}_orig`]: true }));
    const baseUrl = getEffectiveOrderBaseUrl();
    const fullUrl = `${baseUrl}${path}`;
    const begin = Date.now();
    try {
      const res = await fetch(fullUrl);
      const text = await res.text();
      const elapsed = Date.now() - begin;
      const payload = {
        outcome: res.ok ? 'OK (CHƯA BẢO VỆ)' : 'ERROR',
        httpStatus: res.status,
        message: text,
        elapsedMs: elapsed,
        attempts: 1,
        key: `${key}_orig`,
        routeUsed: baseUrl === GATEWAY_URL ? 'Qua API Gateway (:8080)' : 'Trực tiếp Order Service (:8082)',
        patternTitle: `${patternInfo.title} [BAN ĐẦU]`,
        patternBadge: 'BAN ĐẦU',
        beforeDesc: patternInfo.beforeDesc,
        afterDesc: patternInfo.afterDesc,
        principleDesc: 'Không có TimeLimiter của Resilience4j: Request phụ thuộc hoàn toàn vào tốc độ phản hồi của User Service (ngâm trọn 4000ms), không thể tự ngắt sớm để cứu luồng.',
        timestamp: new Date().toLocaleTimeString('vi-VN'),
      };
      setResults((prev) => ({ ...prev, [key]: payload }));
      setLastTestedResult(payload);
      addLog(`${key.toUpperCase()}_ORIG`, res.status, `Ban đầu: ${text}`, elapsed);
    } catch (err) {
      const elapsed = Date.now() - begin;
      const errorObj = {
        outcome: 'SERVER_OFFLINE',
        httpStatus: 0,
        message: '❌ Không thể kết nối tới Backend. Hãy khởi động Backend trong IntelliJ!',
        elapsedMs: elapsed,
        key: `${key}_orig`,
        routeUsed: 'Không kết nối được',
        patternTitle: `${patternInfo.title} [BAN ĐẦU]`,
        patternBadge: 'BAN ĐẦU',
        beforeDesc: patternInfo.beforeDesc,
        afterDesc: patternInfo.afterDesc,
        principleDesc: patternInfo.principleDesc,
        timestamp: new Date().toLocaleTimeString('vi-VN'),
      };
      setResults((prev) => ({ ...prev, [key]: errorObj }));
      setLastTestedResult(errorObj);
      addLog(`${key.toUpperCase()}_ORIG`, 500, err.message, elapsed);
    } finally {
      setLoading((prev) => ({ ...prev, [`${key}_orig`]: false }));
    }
  };

  // Trigger burst sequence for CB
  const burstCb = async (patternInfo) => {
    setLoading((prev) => ({ ...prev, cbBurst: true }));
    for (let i = 1; i <= 6; i++) {
      await runDemo('cb', '/api/orders/resilience/circuit-breaker/1', patternInfo);
      await new Promise((r) => setTimeout(r, 120));
    }
    setLoading((prev) => ({ ...prev, cbBurst: false }));
  };

  const getCbStateBadge = (state) => {
    if (state === 'OPEN') return <span className="outcome-tag outcome-cb">🔴 OPEN (Ngắt mạch - Fail Fast)</span>;
    if (state === 'HALF_OPEN') return <span className="outcome-tag outcome-fallback">🟡 HALF_OPEN (Đang thử nghiệm)</span>;
    return <span className="outcome-tag outcome-ok">🟢 CLOSED (Bình thường)</span>;
  };

  // Pattern metadata
  const patternDefs = {
    timeout: {
      badge: 'Pattern 1',
      title: 'TimeLimiter (Timeout 1.5s)',
      beforeDesc: 'Ban đầu (Khi KHÔNG CÓ TimeLimiter): Thread của Order Service bị treo cứng 4 giây để chờ User Service. Khi hàng trăm khách cùng vào, thread pool cạn kiệt, server sập dây chuyền (Cascading Failure).',
      afterDesc: 'Sau đó (Khi CÓ TimeLimiter 1.5s): TimeLimiter đếm độc lập và cắt đứt chính xác sau 1500ms, trả về HTTP 504 TIMEOUT. Luồng được giải phóng ngay lập tức để phục vụ khách khác.',
      principleDesc: 'TimeLimiter bao bọc cuộc gọi CompletionStage/Future. Nếu tác vụ không hoàn thành trước thời hạn 1500ms, nó chủ động hủy chờ và trả về mã lỗi 504 Gateway Timeout.',
    },
    retry: {
      badge: 'Pattern 2',
      title: 'Resilience4j Retry (Tối đa 3 lần)',
      beforeDesc: 'Ban đầu (Khi KHÔNG CÓ Retry): Sự cố chớp tắt (transient fault) dù chỉ diễn ra trong 100ms cũng khiến khách hàng bị ném lỗi HTTP 500 vào mặt ngay lần đầu tiên.',
      afterDesc: 'Sau đó (Khi CÓ Retry 3 lần): Tự động thử lại lần 2, lần 3 (chờ 500ms, 1000ms), tự vượt qua lỗi và trả về HTTP 200 OK mượt mà, khách hàng không hề hay biết có sự cố.',
      principleDesc: 'Cơ chế Exponential Backoff: Lần 1 fail -> chờ 500ms; lần 2 fail -> nhân đôi chờ 1000ms rồi gọi lại. Điều này giúp tránh hiện tượng "Retry Storm" làm sập vĩnh viễn server.',
    },
    bulkhead: {
      badge: 'Pattern 3',
      title: 'Bulkhead (Vách ngăn cách ly - 3 slot)',
      beforeDesc: 'Ban đầu (Khi KHÔNG CÓ Bulkhead): 10-30 request ồ ạt ùa vào chiếm sạch toàn bộ worker thread của Order Service, làm các API khác (giỏ hàng, thanh toán) chết chùm theo.',
      afterDesc: 'Sau đó (Khi CÓ Bulkhead 3 slot): Cấp đúng 3 slot cho 3 request, 7 request quá tải bị từ chối NGAY LẬP TỨC trong 2ms với HTTP 429 BULKHEAD_FULL (fail-fast an toàn).',
      principleDesc: 'Sử dụng SemaphoreBulkhead giới hạn số cuộc gọi đồng thời. Khi số cuộc gọi chạm trần (3 slot), các request đến sau bị từ chối ngay tức thì mà không phải xếp hàng chờ đợi.',
    },
    cb: {
      badge: 'Pattern 4',
      title: 'Circuit Breaker (Cầu dao ngắt mạch tự động)',
      beforeDesc: 'Ban đầu (Khi KHÔNG CÓ Circuit Breaker): Downstream đã chết hẳn nhưng Order Service vẫn tiếp tục dồn dập gửi request sang, gây lãng phí tài nguyên và làm downstream không thể ngóc đầu dậy.',
      afterDesc: 'Sau đó (Khi CÓ Circuit Breaker): Khi tỷ lệ lỗi >= 50% trong 5 lần gọi gần nhất, Cầu dao tự nhảy OPEN, chặn đứng mọi cuộc gọi trong 0ms với HTTP 503 Fail-Fast để downstream hồi sức.',
      principleDesc: 'Theo dõi cửa sổ trượt (sliding window 5 mẫu). Khi tỷ lệ lỗi vượt ngưỡng, chuyển sang OPEN. Sau 10s chuyển HALF_OPEN thử nghiệm 2 request: nếu phục hồi thì đóng lại CLOSED (tự lành bệnh).',
    },
    combined: {
      badge: 'Pattern 5: Hoàn chỉnh',
      title: 'Combined 4 Pattern + Fallback Dự Phòng',
      beforeDesc: 'Ban đầu (Khi KHÔNG CÓ Fallback): Bất kể khi nào downstream sập, khách hàng đều nhận màn hình lỗi trắng xóa (HTTP 500/503), trải nghiệm mua sắm bị đứt đoạn.',
      afterDesc: 'Sau đó (Khi CÓ Fallback): Bất kể lỗi mạng, timeout hay sập nguồn, hệ thống tự động trả về dữ liệu an toàn "Khách (dự phòng)" với HTTP 200 OK, người dùng vẫn tiếp tục sử dụng app bình thường.',
      principleDesc: 'Trình tự lồng nhau: Retry -> CircuitBreaker -> TimeLimiter -> Bulkhead -> Feign. Nếu bất kỳ mắt xích nào ném ngoại lệ, hàm Fallback lập tức can thiệp và trả về object dự phòng mềm dẻo.',
    },
  };

  const isAllServicesOnline = gatewayOnline && orderOnline && userOnline;

  // Component hiển thị kết quả ngay dưới nút bấm trong từng Card
  const renderCardResultPanel = (key, res) => {
    if (!res) return null;
    return (
      <div className="card-result-panel">
        <div className="panel-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 800, color: '#fff' }}>KẾT QUẢ ĐO ĐẠC:</span>
            <span className={`outcome-tag ${
              res.outcome === 'OK' || res.outcome === 'OK (CHƯA BẢO VỆ)' ? 'outcome-ok' :
              res.outcome === 'TIMEOUT' ? 'outcome-timeout' :
              res.outcome === 'BULKHEAD_FULL' ? 'outcome-bulkhead' :
              res.outcome === 'CIRCUIT_OPEN' ? 'outcome-cb' :
              res.outcome === 'FALLBACK' ? 'outcome-fallback' : 'outcome-cb'
            }`}>
              {res.outcome} (HTTP {res.httpStatus})
            </span>
          </div>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>{res.timestamp}</span>
        </div>

        <div className="panel-metrics-row">
          <div className="panel-metric-item">
            Thời gian: <strong>{res.elapsedMs || res.totalMs || 0} ms</strong>
          </div>
          <div className="panel-metric-item">
            Số lần gọi: <strong>{res.attempts || (res.parallelRequests ? `${res.parallelRequests} luồng` : '1')} lần</strong>
          </div>
          {res.routeUsed && (
            <div className="panel-metric-item">
              Đường truyền: <strong style={{ color: '#38bdf8' }}>{res.routeUsed}</strong>
            </div>
          )}
        </div>

        {/* 2 Cột: Trước nó như thế nào vs Sau đó ra sao */}
        <div className="panel-compare-grid">
          <div className="panel-box-before">
            <div style={{ fontWeight: 800, marginBottom: '4px' }}>🔴 1. TRƯỚC ĐÓ (Không bảo vệ):</div>
            <div>{res.beforeDesc}</div>
          </div>
          <div className="panel-box-after">
            <div style={{ fontWeight: 800, marginBottom: '4px' }}>🟢 2. SAU ĐÓ (Có bảo vệ):</div>
            <div>{res.afterDesc}</div>
          </div>
        </div>

        {/* Nguyên lý hoạt động */}
        <div className="panel-principle-text">
          <div style={{ fontWeight: 800, color: '#a5b4fc', marginBottom: '2px' }}>💡 NGUYÊN LÝ HOẠT ĐỘNG:</div>
          <div>{res.principleDesc || res.message}</div>
          {res.user && (
            <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
              📦 Dữ liệu trả về: ID: <code>{res.user.id}</code> | Tên: <code>{res.user.name}</code> | Địa chỉ: <code>{res.user.address}</code>
              {res.fallback && <span className="fallback-chip">Dữ liệu dự phòng (Fallback)</span>}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="brand">
          <div className="logo-badge">
            <ShieldCheck size={26} color="#fff" />
          </div>
          <div>
            <h1>Nexus Resilience Studio</h1>
            <p>Hệ sinh thái Microservices Chịu Lỗi Cao (Resilience4j + OpenFeign + API Gateway)</p>
          </div>
        </div>

        <div className="health-status-bar">
          <div className="status-pill">
            <span className={`dot ${gatewayOnline ? 'online' : 'offline'}`} />
            Gateway :8080
          </div>
          <div className="status-pill">
            <span className={`dot ${orderOnline ? 'online' : 'offline'}`} />
            Order Service :8082
          </div>
          <div className="status-pill">
            <span className={`dot ${userOnline ? 'online' : 'offline'}`} />
            User Service :8081
          </div>
          <a href="http://localhost:8082/swagger-ui/index.html" target="_blank" rel="noreferrer" className="swagger-link">
            Swagger Order <ExternalLink size={12} />
          </a>
          <a href="http://localhost:8081/swagger-ui/index.html" target="_blank" rel="noreferrer" className="swagger-link">
            Swagger User <ExternalLink size={12} />
          </a>
        </div>
      </header>

      {/* Warning banner when any service is offline */}
      {!isAllServicesOnline && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '12px',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#fca5a5',
        }}>
          <AlertOctagon size={24} color="#ef4444" style={{ flexShrink: 0 }} />
          <div>
            <strong>THÔNG BÁO KẾT NỐI:</strong>
            <div style={{ fontSize: '13px', marginTop: '2px', color: '#cbd5e1' }}>
              Trạng thái hiện tại: Gateway :8080 ({gatewayOnline ? '🟢 Đang chạy' : '🔴 Chưa kết nối'}), Order Service :8082 ({orderOnline ? '🟢 Đang chạy' : '🔴 Tắt'}), User Service :8081 ({userOnline ? '🟢 Đang chạy' : '🔴 Tắt'}).
              {!gatewayOnline && orderOnline && (
                <div style={{ color: '#38bdf8', marginTop: '4px' }}>
                  ℹ️ <em>Hệ thống đang tự động chuyển hướng gọi thẳng vào <strong>Order Service :8082</strong> để bạn vẫn có thể kiểm thử mượt mà mà không bị chặn!</em>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Architecture Pipeline Bar */}
      <div className="pipeline-bar">
        <div className="pipeline-node active">
          <Server size={16} color="#6366f1" />
          <div>
            <div className="node-title">1. Client / UI</div>
            <div className="node-sub">React :3000</div>
          </div>
        </div>
        <div className="pipeline-arrow"><ArrowRight size={16} /></div>
        <div className={`pipeline-node ${gatewayOnline ? 'active' : ''}`}>
          <Layers size={16} color="#06b6d4" />
          <div>
            <div className="node-title">2. API Gateway</div>
            <div className="node-sub">Port :8080 (WebFlux)</div>
          </div>
        </div>
        <div className="pipeline-arrow"><ArrowRight size={16} /></div>
        <div className={`pipeline-node ${orderOnline ? 'active' : ''}`}>
          <ShieldAlert size={16} color="#f59e0b" />
          <div>
            <div className="node-title">3. Order Service</div>
            <div className="node-sub">Retry ➔ CB ➔ Timeout ➔ Bulkhead (:8082)</div>
          </div>
        </div>
        <div className="pipeline-arrow"><ArrowRight size={16} /></div>
        <div className={`pipeline-node ${userOnline ? 'active' : ''}`}>
          <Flame size={16} color="#ef4444" />
          <div>
            <div className="node-title">4. User Service</div>
            <div className="node-sub">Downstream + Chaos (:8081)</div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🚀 MÀN HÌNH HIỂN THỊ KẾT QUẢ TRỰC TIẾP (INSTANT RESULT MONITOR - GHIM TRÊN ĐẦU) */}
      {/* ========================================================================= */}
      <section className="instant-monitor-card">
        <div className="monitor-header">
          <div className="monitor-title">
            <Activity size={20} color="#38bdf8" />
            <span>Màn Hình Kết Quả Trực Diện (Live Result Monitor - Thấy Ngay Kết Quả)</span>
          </div>
          {lastTestedResult && (
            <span className="timestamp-badge">Lần test gần nhất: {lastTestedResult.timestamp}</span>
          )}
        </div>

        {lastTestedResult ? (
          <div className="monitor-body">
            {/* Hàng 1: Tiêu đề + Badge Trạng Thái */}
            <div className="monitor-top-row">
              <div className="monitor-pattern-info">
                <span className="pattern-pill">{lastTestedResult.patternBadge}</span>
                <span className="pattern-name">{lastTestedResult.patternTitle}</span>
              </div>
              <div className="monitor-outcome-box">
                <span className={`outcome-tag-large ${
                  lastTestedResult.outcome === 'OK' || lastTestedResult.outcome === 'OK (CHƯA BẢO VỆ)' ? 'outcome-ok' :
                  lastTestedResult.outcome === 'TIMEOUT' ? 'outcome-timeout' :
                  lastTestedResult.outcome === 'BULKHEAD_FULL' ? 'outcome-bulkhead' :
                  lastTestedResult.outcome === 'CIRCUIT_OPEN' ? 'outcome-cb' :
                  lastTestedResult.outcome === 'FALLBACK' ? 'outcome-fallback' : 'outcome-cb'
                }`}>
                  {lastTestedResult.outcome} (HTTP {lastTestedResult.httpStatus})
                </span>
              </div>
            </div>

            {/* Hàng 2: Các chỉ số đo đạc thực tế */}
            <div className="monitor-metrics-grid">
              <div className="metric-box">
                <div className="metric-label"><Clock size={14} /> Thời gian phản hồi thực tế</div>
                <div className="metric-value highlight-cyan">{lastTestedResult.elapsedMs || lastTestedResult.totalMs || 0} ms</div>
              </div>
              <div className="metric-box">
                <div className="metric-label"><RefreshCw size={14} /> Số lần gọi downstream thực tế</div>
                <div className="metric-value highlight-yellow">{lastTestedResult.attempts || (lastTestedResult.parallelRequests ? `${lastTestedResult.parallelRequests} luồng` : '1')} lần</div>
              </div>
              <div className="metric-box">
                <div className="metric-label"><ShieldCheck size={14} /> Đánh giá cơ chế</div>
                <div className="metric-value highlight-green">
                  {lastTestedResult.outcome === 'SERVER_OFFLINE' ? '⚠️ Mất kết nối backend' :
                   lastTestedResult.fallback ? '🛡️ Fallback cứu nạn thành công' :
                   lastTestedResult.outcome === 'TIMEOUT' ? '⏱️ Cắt đúng 1.5s bảo vệ luồng' :
                   lastTestedResult.outcome === 'BULKHEAD_FULL' ? '🧱 Chặn quá tải trong 2ms' :
                   lastTestedResult.outcome === 'CIRCUIT_OPEN' ? '⚡ Cầu dao ngắt mạch 0ms' :
                   lastTestedResult.outcome === 'OK' ? '✅ Thành công' : 'Đã can thiệp an toàn'}
                </div>
              </div>
            </div>

            {/* Hàng 3: ĐỐI CHIẾU BAN ĐẦU VS SAU ĐÓ */}
            <div className="comparison-container">
              <div className="comparison-box before-box">
                <div className="comparison-header text-danger">
                  <XCircle size={16} /> 1. BAN ĐẦU (Khi KHÔNG CÓ Resilience)
                </div>
                <p className="comparison-text">{lastTestedResult.beforeDesc}</p>
              </div>

              <div className="comparison-box after-box">
                <div className="comparison-header text-success">
                  <CheckCircle2 size={16} /> 2. SAU ĐÓ (Nhờ có Resilience bảo vệ)
                </div>
                <p className="comparison-text">{lastTestedResult.afterDesc}</p>
              </div>
            </div>

            {/* Hàng 4: Giải thích chi tiết & Dữ liệu trả về */}
            <div className="monitor-detail-box">
              <div className="detail-message">
                <strong>Giải thích chi tiết:</strong> {lastTestedResult.principleDesc || lastTestedResult.message}
              </div>
              {lastTestedResult.user && (
                <div className="detail-user-data">
                  <strong>Dữ liệu User nhận được:</strong> ID: <code>{lastTestedResult.user.id}</code> | Tên: <code>{lastTestedResult.user.name}</code> | Địa chỉ: <code>{lastTestedResult.user.address}</code>
                  {lastTestedResult.fallback && <span className="fallback-chip">Dữ liệu dự phòng an toàn</span>}
                </div>
              )}
              {lastTestedResult.summary && (
                <div className="detail-user-data">
                  <strong>Phân bổ luồng Bulkhead:</strong> {lastTestedResult.summary.OK || 0} request thành công, {lastTestedResult.summary.BULKHEAD_FULL || 0} request bị từ chối ngay lập tức.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="monitor-empty-state">
            <Sliders size={32} color="#64748b" />
            <div>
              <h4>Chưa có lần chạy nào. Hãy chọn và bấm nút Test ở bất kỳ Card nào bên dưới!</h4>
              <p>Mỗi khi bạn bấm nút Test, kết quả đo đạc thời gian thực và bảng so sánh trực quan <strong>"Ban đầu vs Sau đó"</strong> sẽ hiển thị trực tiếp tại đây.</p>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 💥 CHAOS CONTROL CENTER & THANH HIỂN THỊ KẾT QUẢ ÁP DỤNG NGAY DƯỚI NÚT */}
      {/* ========================================================================= */}
      <section className="chaos-card">
        <div className="chaos-header">
          <div className="chaos-title">
            <Flame size={20} color="#f87171" />
            <span>Chaos Injection Center (Điều khiển sự cố trên User Service :8081)</span>
          </div>
          <div className="presets-row">
            <span style={{ fontSize: '12px', color: '#94a3b8', marginRight: '6px' }}>Kịch bản mẫu 1-Click:</span>
            <button className="preset-btn reset" onClick={resetChaos}>🟢 1. Reset Bình thường</button>
            <button className="preset-btn timeout" onClick={() => applyChaos(4000, 0, 0, '⏱️ Chậm 4s (Timeout Test)')}>⏱️ 2. Chậm 4s (Timeout)</button>
            <button className="preset-btn retry" onClick={() => applyChaos(0, 0, 2, '⚡ Lỗi 2 lần đầu (Retry Test)')}>⚡ 3. Lỗi 2 lần đầu (Retry)</button>
            <button className="preset-btn crash" onClick={() => applyChaos(0, 100, 0, '💥 Sập 100% (CircuitBreaker Test)')}>💥 4. Sập 100% 500 (CB)</button>
          </div>
        </div>

        <div className="chaos-controls">
          <div className="control-group">
            <label>
              <span>Độ trễ phản hồi (delayMs)</span>
              <span style={{ color: '#38bdf8' }}>{delayInput} ms</span>
            </label>
            <input
              type="number"
              min="0"
              max="10000"
              step="500"
              value={delayInput}
              onChange={(e) => setDelayInput(Number(e.target.value))}
            />
          </div>

          <div className="control-group">
            <label>
              <span>Tỷ lệ lỗi HTTP 500 (failPercent)</span>
              <span style={{ color: '#f87171' }}>{failPercentInput} %</span>
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="10"
              value={failPercentInput}
              onChange={(e) => setFailPercentInput(Number(e.target.value))}
            />
          </div>

          <div className="control-group">
            <label>
              <span>Lỗi N lần đầu rồi tự hồi (failFirstN)</span>
              <span style={{ color: '#fbbf24' }}>{failFirstNInput} lần</span>
            </label>
            <input
              type="number"
              min="0"
              max="10"
              value={failFirstNInput}
              onChange={(e) => setFailFirstNInput(Number(e.target.value))}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              className="action-btn"
              onClick={() => applyChaos(delayInput, failPercentInput, failFirstNInput, 'Tùy chỉnh thông số Chaos')}
              style={{ height: '42px' }}
            >
              Áp dụng Chaos
            </button>
          </div>
        </div>

        <div style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <span>Trạng thái hiện tại: <strong>delay = {chaos.delayMs}ms</strong></span>
          <span>Lỗi 500 = <strong>{chaos.failPercent}%</strong></span>
          <span>Lỗi còn lại = <strong>{chaos.failFirstNLeft}</strong></span>
          <span>Tổng số lượt gọi đến User Service = <strong>{chaos.totalCalls}</strong></span>
        </div>

        {/* 🌟 BẢNG CHI TIẾT HIỆN NGAY DƯỚI NÚT ÁP DỤNG THEO YÊU CẦU CỦA BẠN 🌟 */}
        {lastChaosApplied && (
          <div className="chaos-applied-card">
            <div className="chaos-applied-header">
              <div className="chaos-applied-title">
                <Sparkles size={16} />
                <span>KẾT QUẢ ÁP DỤNG: {lastChaosApplied.name}</span>
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Thời điểm áp dụng: {lastChaosApplied.timestamp}</span>
            </div>

            <div className="chaos-diff-grid">
              <div className="chaos-diff-box chaos-diff-before">
                <div className="diff-title text-danger">
                  <XCircle size={14} /> 1. TRƯỚC KHI ÁP DỤNG:
                </div>
                <div className="diff-content">
                  • Độ trễ (delayMs): <strong>{lastChaosApplied.before.delayMs} ms</strong><br />
                  • Tỷ lệ lỗi 500: <strong>{lastChaosApplied.before.failPercent}%</strong><br />
                  • Lỗi N lần đầu: <strong>{lastChaosApplied.before.failFirstNLeft} lần</strong>
                </div>
              </div>

              <div className="chaos-diff-box chaos-diff-after">
                <div className="diff-title text-success">
                  <CheckCircle2 size={14} /> 2. SAU KHI ÁP DỤNG (ĐÃ NẠP VÀO USER SERVICE):
                </div>
                <div className="diff-content">
                  • Độ trễ (delayMs): <strong>{lastChaosApplied.after.delayMs} ms</strong><br />
                  • Tỷ lệ lỗi 500: <strong>{lastChaosApplied.after.failPercent}%</strong><br />
                  • Lỗi N lần đầu: <strong>{lastChaosApplied.after.failFirstNLeft} lần</strong>
                </div>
              </div>
            </div>

            <div className="chaos-principle-box">
              <div style={{ fontWeight: 800, color: '#38bdf8', marginBottom: '4px' }}>💡 NGUYÊN LÝ HOẠT ĐỘNG & MỤC ĐÍCH:</div>
              <div>{lastChaosApplied.principle}</div>
              <div style={{ marginTop: '6px', color: '#facc15', fontWeight: 600 }}>
                👉 {lastChaosApplied.testHint}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Resilience Patterns Matrix */}
      <div className="patterns-grid">
        {/* Pattern 1: Timeout */}
        <div className="pattern-card">
          <div className="card-top">
            <div className="card-badge badge-timeout">Pattern 1</div>
            <h3>TimeLimiter (Timeout 1.5s)</h3>
            <div className="endpoint-tag">GET /api/orders/resilience/timeout/1</div>
            
            {/* Mục so sánh ban đầu vs sau đó */}
            <div className="mini-comparison">
              <div className="mini-before">
                <span className="tag-sm danger">Ban đầu:</span> Server bị treo 4 giây, cạn kiệt luồng nếu User Service bị đơ.
              </div>
              <div className="mini-after">
                <span className="tag-sm success">Sau đó:</span> TimeLimiter cắt đứt sau 1.5s, trả mã 504 TIMEOUT giải phóng luồng ngay.
              </div>
            </div>

            {/* Quick Chaos helper */}
            <div style={{ margin: '8px 0', display: 'flex', gap: '8px' }}>
              <button
                className="preset-btn timeout"
                style={{ fontSize: '11px', padding: '4px 8px' }}
                onClick={() => applyChaos(4000, 0, 0, '⏱️ Chậm 4s cho TimeLimiter')}
              >
                ⏱️ 1-Click: Gây trễ 4s trên User Service
              </button>
            </div>
          </div>

          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <button
                className="action-btn btn-secondary"
                disabled={loading.timeout_orig}
                onClick={() => runOriginalDemo('timeout', '/api/orders/1', patternDefs.timeout)}
                title="Gọi endpoint gốc không có TimeLimiter (mất trọn 4 giây)"
                style={{ fontSize: '12px', padding: '8px 6px' }}
              >
                {loading.timeout_orig ? 'Đang đợi 4s...' : '🔴 Test Ban Đầu (Chờ 4s)'}
              </button>
              <button
                className="action-btn"
                disabled={loading.timeout}
                onClick={() => runDemo('timeout', '/api/orders/resilience/timeout/1', patternDefs.timeout)}
                style={{ fontSize: '12px', padding: '8px 6px' }}
              >
                {loading.timeout ? 'Đang ngắt 1.5s...' : '🟢 Test Sau Đó (Cắt 1.5s)'}
              </button>
            </div>

            {/* HIỂN THỊ KẾT QUẢ NGAY DƯỚI NÚT BẤM CỦA CARD */}
            {renderCardResultPanel('timeout', results.timeout)}
          </div>
        </div>

        {/* Pattern 2: Retry */}
        <div className="pattern-card">
          <div className="card-top">
            <div className="card-badge badge-retry">Pattern 2</div>
            <h3>Resilience4j Retry (Tối đa 3 lần)</h3>
            <div className="endpoint-tag">GET /api/orders/resilience/retry/1</div>

            {/* Mục so sánh ban đầu vs sau đó */}
            <div className="mini-comparison">
              <div className="mini-before">
                <span className="tag-sm danger">Ban đầu:</span> Gặp lỗi chớp tắt 500 là văng lỗi cho khách hàng ngay lập tức ở lần đầu.
              </div>
              <div className="mini-after">
                <span className="tag-sm success">Sau đó:</span> Tự động thử lại 3 lần (chờ 500ms, 1000ms), tự cứu ở lần 3 trả 200 OK.
              </div>
            </div>

            {/* Quick Chaos helper */}
            <div style={{ margin: '8px 0', display: 'flex', gap: '8px' }}>
              <button
                className="preset-btn retry"
                style={{ fontSize: '11px', padding: '4px 8px' }}
                onClick={() => applyChaos(0, 0, 2, '⚡ Lỗi 2 lần đầu cho Retry')}
              >
                ⚡ 1-Click: Gây lỗi 2 lần đầu rồi tự hồi
              </button>
            </div>
          </div>

          <div>
            <button
              className="action-btn"
              disabled={loading.retry}
              onClick={() => runDemo('retry', '/api/orders/resilience/retry/1', patternDefs.retry)}
            >
              {loading.retry ? 'Đang tự động thử lại 3 lần...' : '▶ Bấm Test Retry (Tự cứu ở lần 3)'}
            </button>

            {/* HIỂN THỊ KẾT QUẢ NGAY DƯỚI NÚT BẤM CỦA CARD */}
            {renderCardResultPanel('retry', results.retry)}
          </div>
        </div>

        {/* Pattern 3: Bulkhead */}
        <div className="pattern-card">
          <div className="card-top">
            <div className="card-badge badge-bulkhead">Pattern 3</div>
            <h3>Bulkhead (Vách ngăn cách ly - 3 slot)</h3>
            <div className="endpoint-tag">GET /api/orders/resilience/burst/bulkhead?n={burstCount}</div>

            {/* Mục so sánh ban đầu vs sau đó */}
            <div className="mini-comparison">
              <div className="mini-before">
                <span className="tag-sm danger">Ban đầu:</span> 10 request cùng ập vào chiếm trọn thread pool, làm sập các API khác.
              </div>
              <div className="mini-after">
                <span className="tag-sm success">Sau đó:</span> Cấp đúng 3 slot cho 3 request, 7 request quá tải bị từ chối trong 2ms với 429.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Số request song song:</span>
              <input
                type="number"
                min="1"
                max="30"
                value={burstCount}
                onChange={(e) => setBurstCount(Number(e.target.value))}
                style={{ width: '60px', padding: '4px 8px', background: '#121826', color: '#fff', border: '1px solid #334155', borderRadius: '6px' }}
              />
            </div>
          </div>

          <div>
            <button
              className="action-btn"
              disabled={loading.bulkhead}
              onClick={() => runDemo('bulkhead', `/api/orders/resilience/burst/bulkhead?n=${burstCount}`, patternDefs.bulkhead)}
            >
              {loading.bulkhead ? 'Đang bắn burst...' : `▶ Bắn ${burstCount} Request song song`}
            </button>

            {/* HIỂN THỊ KẾT QUẢ NGAY DƯỚI NÚT BẤM CỦA CARD */}
            {renderCardResultPanel('bulkhead', results.bulkhead)}
          </div>
        </div>

        {/* Pattern 4: Circuit Breaker */}
        <div className="pattern-card">
          <div className="card-top">
            <div className="card-badge badge-cb">Pattern 4</div>
            <h3>Circuit Breaker (Ngắt mạch tự động)</h3>
            <div className="endpoint-tag">GET /api/orders/resilience/circuit-breaker/1</div>

            {/* Mục so sánh ban đầu vs sau đó */}
            <div className="mini-comparison">
              <div className="mini-before">
                <span className="tag-sm danger">Ban đầu:</span> Downstream sập nhưng vẫn nã request liên tục làm server kiệt quệ không thể phục hồi.
              </div>
              <div className="mini-after">
                <span className="tag-sm success">Sau đó:</span> Lỗi ≥ 50% trong 5 lần gọi ➔ Ngắt mạch OPEN, fail-fast trong 0ms với mã 503.
              </div>
            </div>

            {/* Quick Chaos helper */}
            <div style={{ margin: '8px 0', display: 'flex', gap: '8px' }}>
              <button
                className="preset-btn crash"
                style={{ fontSize: '11px', padding: '4px 8px' }}
                onClick={() => applyChaos(0, 100, 0, '💥 Sập 100% cho Circuit Breaker')}
              >
                💥 1-Click: Gây sập 100% User Service
              </button>
            </div>

            <div style={{ margin: '8px 0' }}>
              Trạng thái Cầu Dao: {getCbStateBadge(cbMetrics?.circuitBreaker_demo4?.state || 'CLOSED')}
            </div>
            {cbMetrics?.circuitBreaker_demo4 && (
              <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <span>Tỷ lệ lỗi: <strong>{cbMetrics.circuitBreaker_demo4.failureRatePercent >= 0 ? `${cbMetrics.circuitBreaker_demo4.failureRatePercent}%` : 'Chưa đủ mẫu'}</strong></span>
                <span>Số cuộc gọi đệm: <strong>{cbMetrics.circuitBreaker_demo4.bufferedCalls}/5</strong></span>
              </div>
            )}
          </div>

          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <button
                className="action-btn"
                disabled={loading.cb}
                onClick={() => runDemo('cb', '/api/orders/resilience/circuit-breaker/1', patternDefs.cb)}
              >
                Gửi 1 Request
              </button>
              <button
                className="action-btn btn-secondary"
                disabled={loading.cbBurst}
                onClick={() => burstCb(patternDefs.cb)}
              >
                {loading.cbBurst ? 'Đang bắn 6 lần...' : '▶ Bắn 6 Lần (Kích hoạt OPEN)'}
              </button>
            </div>
            <button
              className="action-btn btn-secondary"
              onClick={resetCircuitBreaker}
              style={{ fontSize: '12px', padding: '6px' }}
            >
              🔄 Reset Circuit Breaker (CLOSED)
            </button>

            {/* HIỂN THỊ KẾT QUẢ NGAY DƯỚI NÚT BẤM CỦA CARD */}
            {renderCardResultPanel('cb', results.cb)}
          </div>
        </div>

        {/* Pattern 5: Combined + Fallback */}
        <div className="pattern-card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-top">
            <div className="card-badge badge-combined">Pattern 5: Hoàn chỉnh</div>
            <h3>Kết hợp 4 Pattern + Dữ liệu dự phòng (Fallback)</h3>
            <p>Trình tự lồng nhau: <strong>Retry( CircuitBreaker( TimeLimiter( ThreadPoolBulkhead( Feign ) ) ) )</strong>.</p>
            
            {/* Mục so sánh ban đầu vs sau đó */}
            <div className="mini-comparison" style={{ gridTemplateColumns: '1fr 1fr', display: 'grid', gap: '12px', margin: '12px 0' }}>
              <div className="mini-before" style={{ padding: '10px' }}>
                <span className="tag-sm danger">Ban đầu (Không có Fallback):</span> Khi downstream sập, khách hàng nhận trang lỗi 500/503 trắng xóa, trải nghiệm bị gián đoạn hoàn toàn.
              </div>
              <div className="mini-after" style={{ padding: '10px' }}>
                <span className="tag-sm success">Sau đó (Có Fallback):</span> Bất kể lỗi mạng, timeout hay sập server, hệ thống luôn trả về dữ liệu an toàn "Khách (dự phòng)" với HTTP 200 OK.
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#38bdf8' }}>
                <input
                  type="checkbox"
                  checked={fallbackEnabled}
                  onChange={(e) => setFallbackEnabled(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                />
                <strong>Kích hoạt Fallback (Trả về khách dự phòng nếu có lỗi)</strong>
              </label>
            </div>
          </div>

          <div>
            <button
              className="action-btn"
              disabled={loading.combined}
              onClick={() => runDemo('combined', `/api/orders/resilience/combined/1?fallback=${fallbackEnabled}`, patternDefs.combined)}
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              {loading.combined ? 'Đang thực thi pipeline kết hợp...' : '▶ Chạy thử nghiệm Kết hợp Toàn diện (Combined + Fallback)'}
            </button>

            {/* HIỂN THỊ KẾT QUẢ NGAY DƯỚI NÚT BẤM CỦA CARD */}
            {renderCardResultPanel('combined', results.combined)}
          </div>
        </div>
      </div>

      {/* Live Activity Console */}
      <section className="console-card">
        <div className="console-header">
          <div className="console-title">
            <Terminal size={18} color="#38bdf8" />
            <span>Live Activity Console (Nhật ký kiểm thử thời gian thực)</span>
          </div>
          <button className="clear-btn" onClick={() => setLogs([])}>Xóa nhật ký</button>
        </div>
        <div className="console-body">
          {logs.length === 0 ? (
            <div style={{ color: '#64748b', fontStyle: 'italic', padding: '12px' }}>Chưa có hoạt động nào. Hãy bấm nút kiểm thử để xem log ghi nhận.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="log-line">
                <span className="log-time">[{log.time}]</span>
                <span className={`log-tag log-${log.tag.toLowerCase()}`}>{log.tag}</span>
                <span className={`log-status status-${log.status}`}>HTTP {log.status}</span>
                <span className="log-msg">{log.message}</span>
                {log.elapsedMs > 0 && <span className="log-elapsed">({log.elapsedMs}ms)</span>}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
