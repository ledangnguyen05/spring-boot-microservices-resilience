import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, ShieldCheck, Zap, Activity, Clock, RefreshCw,
  Layers, ArrowRight, ExternalLink, Play, CheckCircle2,
  AlertOctagon, AlertTriangle, Flame, Terminal, Server,
  Sliders, Info, HelpCircle, Check, XCircle, ArrowUpRight
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

    // 3. API Gateway (:8080)
    try {
      const res = await fetch(`${GATEWAY_URL}/health`);
      if (res.ok) {
        setGatewayOnline(true);
      } else {
        setGatewayOnline(false);
      }
    } catch {
      setGatewayOnline(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 3000);
    return () => clearInterval(interval);
  }, []);

  // Configure chaos
  const applyChaos = async (d, p, n) => {
    try {
      const res = await fetch(`${USER_SERVICE_URL}/api/chaos?delayMs=${d}&failPercent=${p}&failFirstN=${n}`, {
        method: 'POST',
      });
      const data = await res.json();
      setChaos(data);
      setDelayInput(data.delayMs || 0);
      setFailPercentInput(data.failPercent || 0);
      setFailFirstNInput(data.failFirstNLeft || 0);
      addLog('CHAOS', 200, `Cập nhật Chaos: delay=${data.delayMs}ms, fail=${data.failPercent}%, failFirstN=${data.failFirstNLeft}`, 0);
    } catch (err) {
      addLog('CHAOS', 500, `Lỗi cập nhật Chaos: ${err.message}`, 0);
    }
  };

  const resetChaos = async () => {
    try {
      const res = await fetch(`${USER_SERVICE_URL}/api/chaos/reset`, { method: 'POST' });
      const data = await res.json();
      setChaos(data);
      setDelayInput(0);
      setFailPercentInput(0);
      setFailFirstNInput(0);
      addLog('CHAOS', 200, 'Đã Reset User Service về bình thường (delay=0, fail=0)', 0);
    } catch (err) {
      addLog('CHAOS', 500, `Lỗi Reset Chaos: ${err.message}`, 0);
    }
  };

  // Reset Circuit Breaker
  const resetCircuitBreaker = async () => {
    try {
      const res = await fetch(`${GATEWAY_URL}/api/orders/resilience/reset`, { method: 'POST' });
      const data = await res.json();
      setCbMetrics(data);
      addLog('CB_RESET', 200, 'Đã Reset toàn bộ CircuitBreaker về trạng thái CLOSED', 0);
    } catch (err) {
      addLog('CB_RESET', 500, `Lỗi Reset CB: ${err.message}`, 0);
    }
  };

  // Execute demo request
  const runDemo = async (key, url, patternInfo) => {
    setLoading((prev) => ({ ...prev, [key]: true }));
    const begin = Date.now();
    try {
      const res = await fetch(url);
      const data = await res.json();
      const elapsed = Date.now() - begin;
      setResults((prev) => ({ ...prev, [key]: data }));
      
      const resultPayload = {
        ...data,
        key,
        patternTitle: patternInfo.title,
        patternBadge: patternInfo.badge,
        beforeDesc: patternInfo.beforeDesc,
        afterDesc: patternInfo.afterDesc,
        timestamp: new Date().toLocaleTimeString('vi-VN'),
      };
      setLastTestedResult(resultPayload);
      
      addLog(key.toUpperCase(), res.status, data.message || `Hoàn tất với outcome: ${data.outcome}`, elapsed);
      checkHealth();
    } catch (err) {
      const elapsed = Date.now() - begin;
      const isConnectionRefused = !gatewayOnline || !orderOnline || err.message.includes('fetch');
      const errorObj = {
        outcome: isConnectionRefused ? 'SERVER_OFFLINE' : 'ERROR',
        httpStatus: isConnectionRefused ? 0 : 500,
        message: isConnectionRefused
          ? '❌ Không thể kết nối tới Backend (:8080 / :8082). Hãy kiểm tra xem bạn đã khởi động ApiGatewayApplication và OrderServiceApplication trong IntelliJ chưa!'
          : err.message,
        elapsedMs: elapsed,
        key,
        patternTitle: patternInfo.title,
        patternBadge: patternInfo.badge,
        beforeDesc: patternInfo.beforeDesc,
        afterDesc: patternInfo.afterDesc,
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
  const runOriginalDemo = async (key, url, patternInfo) => {
    setLoading((prev) => ({ ...prev, [`${key}_orig`]: true }));
    const begin = Date.now();
    try {
      const res = await fetch(url);
      const text = await res.text();
      const elapsed = Date.now() - begin;
      const payload = {
        outcome: res.ok ? 'OK (CHƯA BẢO VỆ)' : 'ERROR',
        httpStatus: res.status,
        message: text,
        elapsedMs: elapsed,
        attempts: 1,
        key: `${key}_orig`,
        patternTitle: `${patternInfo.title} [BAN ĐẦU]`,
        patternBadge: 'BAN ĐẦU',
        beforeDesc: patternInfo.beforeDesc,
        afterDesc: patternInfo.afterDesc,
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
        message: '❌ Không thể kết nối tới Backend. Hãy bật Backend trong IntelliJ trước!',
        elapsedMs: elapsed,
        key: `${key}_orig`,
        patternTitle: `${patternInfo.title} [BAN ĐẦU]`,
        patternBadge: 'BAN ĐẦU',
        beforeDesc: patternInfo.beforeDesc,
        afterDesc: patternInfo.afterDesc,
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
      await runDemo('cb', `${GATEWAY_URL}/api/orders/resilience/circuit-breaker/1`, patternInfo);
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
      beforeDesc: 'Ban đầu (Không có TimeLimiter): Thread bị treo cứng theo User Service (4 giây). Người dùng đợi mỏi mòn, connection pool cạn kiệt, các API khác bị nghẽn dây chuyền.',
      afterDesc: 'Sau đó (Có TimeLimiter 1.5s): Đúng 1.5s ngắt ngay lập tức, giải phóng luồng cho Order Service, trả về HTTP 504 TIMEOUT. Hệ thống không bao giờ bị nghẽn luồng.',
    },
    retry: {
      badge: 'Pattern 2',
      title: 'Resilience4j Retry (Tối đa 3 lần)',
      beforeDesc: 'Ban đầu (Không có Retry): Gặp sự cố chớp tắt hay mạng chập chờn là văng ngay lỗi HTTP 500 vào mặt khách hàng ở lần đầu tiên.',
      afterDesc: 'Sau đó (Có Retry 3 lần): Tự động thử lại lần 2, lần 3 (chờ 500ms, 1000ms), tự vượt qua lỗi và trả về HTTP 200 OK mượt mà trong suốt với người dùng.',
    },
    bulkhead: {
      badge: 'Pattern 3',
      title: 'Bulkhead (Vách ngăn cách ly - Tối đa 3 slot)',
      beforeDesc: 'Ban đầu (Không có Bulkhead): 10 request cùng ập vào chiếm hết sạch mọi luồng xử lý của server, khiến toàn bộ chức năng khác bị sập theo.',
      afterDesc: 'Sau đó (Có Bulkhead 3 slot): Cấp đúng 3 slot cho 3 request, 7 request vượt ngưỡng bị từ chối NGAY LẬP TỨC trong 2ms với mã HTTP 429 BULKHEAD_FULL.',
    },
    cb: {
      badge: 'Pattern 4',
      title: 'Circuit Breaker (Cầu dao ngắt mạch tự động)',
      beforeDesc: 'Ban đầu (Không có Circuit Breaker): Downstream đã sập 100% nhưng Order Service vẫn liên tục nã request sang, lãng phí tài nguyên và làm downstream không thể ngóc đầu dậy.',
      afterDesc: 'Sau đó (Có Circuit Breaker): Khi tỷ lệ lỗi >= 50% trong 5 lần gọi, Cầu dao tự nhảy OPEN, chặn đứng mọi cuộc gọi trong 0ms với HTTP 503 Fail-Fast để bảo vệ hệ thống.',
    },
    combined: {
      badge: 'Pattern 5: Hoàn chỉnh',
      title: 'Combined 4 Pattern + Fallback Dự Phòng',
      beforeDesc: 'Ban đầu (Không có Fallback): Bất kể khi nào downstream sập, khách hàng đều nhận màn hình lỗi trắng xóa (HTTP 500/503), trải nghiệm bị đứt quãng.',
      afterDesc: 'Sau đó (Có Fallback): Bất kể lỗi mạng, timeout hay sập nguồn, hệ thống tự động trả về dữ liệu an toàn "Khách (dự phòng)" với HTTP 200 OK, người dùng không hề hay biết có sự cố.',
    },
  };

  const isAllServicesOnline = gatewayOnline && orderOnline && userOnline;

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
            <strong>CHÚ Ý: Có dịch vụ Backend chưa được khởi động!</strong>
            <div style={{ fontSize: '13px', marginTop: '2px', color: '#cbd5e1' }}>
              Trạng thái: Gateway :8080 ({gatewayOnline ? '🟢 Bật' : '🔴 Tắt'}), Order Service :8082 ({orderOnline ? '🟢 Bật' : '🔴 Tắt'}), User Service :8081 ({userOnline ? '🟢 Bật' : '🔴 Tắt'}).
              <br />
              👉 <em>Vui lòng mở IntelliJ IDEA và bấm <strong>Run</strong> cho cả 3 ứng dụng: <code>ApiGatewayApplication</code>, <code>OrderServiceApplication</code>, <code>UserServiceApplication</code> trước khi bấm Test!</em>
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
                  lastTestedResult.outcome === 'OK' ? 'outcome-ok' :
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

            {/* Hàng 3: ĐỐI CHIẾU BAN ĐẦU VS SAU ĐÓ (ĐÚNG YÊU CẦU CỦA USER) */}
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
                <strong>Giải thích chi tiết:</strong> {lastTestedResult.message || `Đã hoàn tất kiểm thử mẫu ${lastTestedResult.pattern || lastTestedResult.key}`}
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

      {/* Chaos Control Center */}
      <section className="chaos-card">
        <div className="chaos-header">
          <div className="chaos-title">
            <Flame size={20} color="#f87171" />
            <span>Chaos Injection Center (Điều khiển sự cố trên User Service :8081)</span>
          </div>
          <div className="presets-row">
            <span style={{ fontSize: '12px', color: '#94a3b8', marginRight: '6px' }}>Kịch bản mẫu 1-Click:</span>
            <button className="preset-btn reset" onClick={resetChaos}>🟢 1. Reset Bình thường</button>
            <button className="preset-btn timeout" onClick={() => applyChaos(4000, 0, 0)}>⏱️ 2. Chậm 4s (Timeout)</button>
            <button className="preset-btn retry" onClick={() => applyChaos(0, 0, 2)}>⚡ 3. Lỗi 2 lần đầu (Retry)</button>
            <button className="preset-btn crash" onClick={() => applyChaos(0, 100, 0)}>💥 4. Sập 100% 500 (CB)</button>
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
              onClick={() => applyChaos(delayInput, failPercentInput, failFirstNInput)}
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
                onClick={() => applyChaos(4000, 0, 0)}
              >
                ⏱️ Tạo sự cố: User Service chậm 4s
              </button>
            </div>
          </div>

          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <button
                className="action-btn btn-secondary"
                disabled={loading.timeout_orig}
                onClick={() => runOriginalDemo('timeout', `${GATEWAY_URL}/api/orders/1`, patternDefs.timeout)}
                title="Gọi endpoint gốc không có TimeLimiter (mất trọn 4 giây)"
                style={{ fontSize: '12px', padding: '8px 6px' }}
              >
                {loading.timeout_orig ? 'Đang đợi 4s...' : '🔴 Test Ban Đầu (Chờ 4s)'}
              </button>
              <button
                className="action-btn"
                disabled={loading.timeout}
                onClick={() => runDemo('timeout', `${GATEWAY_URL}/api/orders/resilience/timeout/1`, patternDefs.timeout)}
                style={{ fontSize: '12px', padding: '8px 6px' }}
              >
                {loading.timeout ? 'Đang ngắt 1.5s...' : '🟢 Test Sau Đó (Cắt 1.5s)'}
              </button>
            </div>

            {results.timeout && (
              <div className="result-box">
                <div className="result-row">
                  <span>Kết quả đo được:</span>
                  <span className={`outcome-tag ${results.timeout.outcome === 'TIMEOUT' ? 'outcome-timeout' : results.timeout.outcome === 'OK' ? 'outcome-ok' : 'outcome-cb'}`}>
                    {results.timeout.outcome} (HTTP {results.timeout.httpStatus})
                  </span>
                </div>
                <div className="result-row">
                  <span>Thời gian phản hồi:</span>
                  <strong style={{ color: '#38bdf8' }}>{results.timeout.elapsedMs} ms</strong>
                </div>
                <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '4px' }}>
                  {results.timeout.message}
                </div>
              </div>
            )}
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
                onClick={() => applyChaos(0, 0, 2)}
              >
                ⚡ Tạo sự cố: Lỗi 2 lần đầu rồi tự hồi
              </button>
            </div>
          </div>

          <div>
            <button
              className="action-btn"
              disabled={loading.retry}
              onClick={() => runDemo('retry', `${GATEWAY_URL}/api/orders/resilience/retry/1`, patternDefs.retry)}
            >
              {loading.retry ? 'Đang tự động thử lại 3 lần...' : '▶ Bấm Test Retry (Tự cứu ở lần 3)'}
            </button>
            {results.retry && (
              <div className="result-box">
                <div className="result-row">
                  <span>Kết quả:</span>
                  <span className={`outcome-tag ${results.retry.outcome === 'OK' ? 'outcome-ok' : 'outcome-cb'}`}>
                    {results.retry.outcome} (HTTP {results.retry.httpStatus})
                  </span>
                </div>
                <div className="result-row">
                  <span>Số lần gọi thực tế:</span>
                  <strong style={{ color: '#fbbf24' }}>{results.retry.attempts} lần</strong>
                </div>
                <div className="result-row">
                  <span>Tổng thời gian:</span>
                  <strong>{results.retry.elapsedMs} ms</strong>
                </div>
                <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '4px' }}>
                  {results.retry.message}
                </div>
              </div>
            )}
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
              onClick={() => runDemo('bulkhead', `${GATEWAY_URL}/api/orders/resilience/burst/bulkhead?n=${burstCount}`, patternDefs.bulkhead)}
            >
              {loading.bulkhead ? 'Đang bắn burst...' : `▶ Bắn ${burstCount} Request song song`}
            </button>
            {results.bulkhead && (
              <div className="result-box">
                <div className="result-row">
                  <span>Tóm tắt kết quả:</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {results.bulkhead.summary?.OK && <span className="outcome-tag outcome-ok">{results.bulkhead.summary.OK} OK</span>}
                    {results.bulkhead.summary?.BULKHEAD_FULL && <span className="outcome-tag outcome-bulkhead">{results.bulkhead.summary.BULKHEAD_FULL} ĐẦY (429)</span>}
                  </div>
                </div>
                <div className="result-row">
                  <span>Tổng thời gian:</span>
                  <strong>{results.bulkhead.totalMs} ms</strong>
                </div>
              </div>
            )}
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
                onClick={() => applyChaos(0, 100, 0)}
              >
                💥 Tạo sự cố: User Service sập 100%
              </button>
            </div>

            <div style={{ margin: '8px 0' }}>
              Trạng thái: {getCbStateBadge(cbMetrics?.circuitBreaker_demo4?.state || 'CLOSED')}
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
                onClick={() => runDemo('cb', `${GATEWAY_URL}/api/orders/resilience/circuit-breaker/1`, patternDefs.cb)}
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
            {results.cb && (
              <div className="result-box">
                <div className="result-row">
                  <span>Kết quả:</span>
                  <span className={`outcome-tag ${results.cb.outcome === 'CIRCUIT_OPEN' ? 'outcome-cb' : results.cb.outcome === 'OK' ? 'outcome-ok' : 'outcome-fallback'}`}>
                    {results.cb.outcome} (HTTP {results.cb.httpStatus})
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#cbd5e1' }}>{results.cb.message}</div>
              </div>
            )}
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
              onClick={() => runDemo('combined', `${GATEWAY_URL}/api/orders/resilience/combined/1?fallback=${fallbackEnabled}`, patternDefs.combined)}
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              {loading.combined ? 'Đang thực thi pipeline kết hợp...' : '▶ Chạy thử nghiệm Kết hợp Toàn diện (Combined + Fallback)'}
            </button>
            {results.combined && (
              <div className="result-box" style={{ marginTop: '12px' }}>
                <div className="result-row">
                  <span>Kết quả:</span>
                  <span className={`outcome-tag ${results.combined.outcome === 'FALLBACK' ? 'outcome-fallback' : results.combined.outcome === 'OK' ? 'outcome-ok' : 'outcome-cb'}`}>
                    {results.combined.outcome} (HTTP {results.combined.httpStatus})
                  </span>
                </div>
                <div className="result-row">
                  <span>Số lần gọi:</span>
                  <strong>{results.combined.attempts} lần</strong>
                </div>
                <div className="result-row">
                  <span>Thời gian:</span>
                  <strong>{results.combined.elapsedMs} ms</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '4px' }}>
                  {results.combined.message}
                </div>
              </div>
            )}
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
