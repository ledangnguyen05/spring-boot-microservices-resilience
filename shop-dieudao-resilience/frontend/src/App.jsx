import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, ShieldCheck, Zap, Activity, Clock, RefreshCw,
  Layers, ArrowRight, ExternalLink, Play, CheckCircle2,
  AlertOctagon, AlertTriangle, Flame, Terminal, Server
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
      const res = await fetch(`${USER_SERVICE_URL}/api/users/chaos`);
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
      const res = await fetch(`${ORDER_SERVICE_URL}/api/orders/demo/status`);
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
      const res = await fetch(`${USER_SERVICE_URL}/api/users/chaos?delayMs=${d}&failPercent=${p}&failFirstN=${n}`, {
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
      const res = await fetch(`${USER_SERVICE_URL}/api/users/chaos/reset`, { method: 'POST' });
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
      const res = await fetch(`${GATEWAY_URL}/api/orders/demo/reset`, { method: 'POST' });
      const data = await res.json();
      setCbMetrics(data);
      addLog('CB_RESET', 200, 'Đã Reset toàn bộ CircuitBreaker về trạng thái CLOSED', 0);
    } catch (err) {
      addLog('CB_RESET', 500, `Lỗi Reset CB: ${err.message}`, 0);
    }
  };

  // Execute demo request
  const runDemo = async (key, url) => {
    setLoading((prev) => ({ ...prev, [key]: true }));
    const begin = Date.now();
    try {
      const res = await fetch(url);
      const data = await res.json();
      const elapsed = Date.now() - begin;
      setResults((prev) => ({ ...prev, [key]: data }));
      addLog(key.toUpperCase(), res.status, data.message || `Hoàn tất với outcome: ${data.outcome}`, elapsed);
      checkHealth();
    } catch (err) {
      const elapsed = Date.now() - begin;
      const errorObj = { outcome: 'ERROR', httpStatus: 500, message: err.message, elapsedMs: elapsed };
      setResults((prev) => ({ ...prev, [key]: errorObj }));
      addLog(key.toUpperCase(), 500, err.message, elapsed);
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Trigger burst sequence for CB
  const burstCb = async () => {
    setLoading((prev) => ({ ...prev, cbBurst: true }));
    for (let i = 1; i <= 6; i++) {
      await runDemo('cb', `${GATEWAY_URL}/api/orders/demo/circuit-breaker/1`);
      await new Promise((r) => setTimeout(r, 120));
    }
    setLoading((prev) => ({ ...prev, cbBurst: false }));
  };

  const getCbStateBadge = (state) => {
    if (state === 'OPEN') return <span className="outcome-tag outcome-cb">🔴 OPEN (Ngắt mạch - Fail Fast)</span>;
    if (state === 'HALF_OPEN') return <span className="outcome-tag outcome-fallback">🟡 HALF_OPEN (Đang thử nghiệm)</span>;
    return <span className="outcome-tag outcome-ok">🟢 CLOSED (Bình thường)</span>;
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
            <p>Hệ sinh thái Microservices Chịu Lỗi Cao (Resilience4j + OpenFeign)</p>
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
        <div className="pipeline-node active">
          <Layers size={16} color="#06b6d4" />
          <div>
            <div className="node-title">2. API Gateway</div>
            <div className="node-sub">Port :8080 (WebFlux)</div>
          </div>
        </div>
        <div className="pipeline-arrow"><ArrowRight size={16} /></div>
        <div className="pipeline-node active">
          <ShieldAlert size={16} color="#f59e0b" />
          <div>
            <div className="node-title">3. Order Service</div>
            <div className="node-sub">Retry ➔ CB ➔ Timeout ➔ Bulkhead (:8082)</div>
          </div>
        </div>
        <div className="pipeline-arrow"><ArrowRight size={16} /></div>
        <div className="pipeline-node active">
          <Flame size={16} color="#ef4444" />
          <div>
            <div className="node-title">4. User Service</div>
            <div className="node-sub">Downstream + Chaos (:8081)</div>
          </div>
        </div>
      </div>

      {/* Chaos Control Center */}
      <section className="chaos-card">
        <div className="chaos-header">
          <div className="chaos-title">
            <Flame size={20} color="#f87171" />
            <span>Chaos Injection Center (Điều khiển sự cố trên User Service :8081)</span>
          </div>
          <div className="presets-row">
            <span style={{ fontSize: '12px', color: '#94a3b8', marginRight: '6px' }}>Kịch bản mẫu:</span>
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
            <h3>TimeLimiter (Timeout)</h3>
            <p>Cắt đứt lời gọi sau 1.5s nếu User Service chậm phản hồi. Bảo vệ thread không bị treo vô hạn.</p>
            <div className="endpoint-tag">GET /api/orders/demo/timeout/1</div>
          </div>
          <div>
            <button
              className="action-btn"
              disabled={loading.timeout}
              onClick={() => runDemo('timeout', `${GATEWAY_URL}/api/orders/demo/timeout/1`)}
            >
              {loading.timeout ? 'Đang thực thi...' : 'Test Timeout (TimeLimiter 1.5s)'}
            </button>
            {results.timeout && (
              <div className="result-box">
                <div className="result-row">
                  <span>Kết quả:</span>
                  <span className={`outcome-tag ${results.timeout.outcome === 'TIMEOUT' ? 'outcome-timeout' : 'outcome-ok'}`}>
                    {results.timeout.outcome} (HTTP {results.timeout.httpStatus})
                  </span>
                </div>
                <div className="result-row">
                  <span>Thời gian:</span>
                  <strong style={{ color: '#38bdf8' }}>{results.timeout.elapsedMs} ms</strong>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{results.timeout.message}</div>
              </div>
            )}
          </div>
        </div>

        {/* Pattern 2: Retry */}
        <div className="pattern-card">
          <div className="card-top">
            <div className="card-badge badge-retry">Pattern 2</div>
            <h3>Resilience4j Retry</h3>
            <p>Tự động thử lại tối đa 3 lần với Exponential Backoff (500ms, 1000ms...) khi gặp sự cố mạng thoáng qua.</p>
            <div className="endpoint-tag">GET /api/orders/demo/retry/1</div>
          </div>
          <div>
            <button
              className="action-btn"
              disabled={loading.retry}
              onClick={() => runDemo('retry', `${GATEWAY_URL}/api/orders/demo/retry/1`)}
            >
              {loading.retry ? 'Đang thử lại...' : 'Test Retry (Tối đa 3 lần)'}
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
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{results.retry.message}</div>
              </div>
            )}
          </div>
        </div>

        {/* Pattern 3: Bulkhead */}
        <div className="pattern-card">
          <div className="card-top">
            <div className="card-badge badge-bulkhead">Pattern 3</div>
            <h3>Bulkhead (Vách ngăn cách ly)</h3>
            <p>Giới hạn tối đa 3 request đồng thời. Request vượt ngưỡng bị từ chối ngay lập tức với HTTP 429.</p>
            <div className="endpoint-tag">GET /api/orders/demo/burst/bulkhead?n={burstCount}</div>
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
              onClick={() => runDemo('bulkhead', `${GATEWAY_URL}/api/orders/demo/burst/bulkhead?n=${burstCount}`)}
            >
              {loading.bulkhead ? 'Đang bắn burst...' : `Bắn ${burstCount} Request song song`}
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
            <h3>Circuit Breaker (Ngắt mạch)</h3>
            <p>Mở mạch (OPEN) khi $\ge 50\%$ lỗi trong 5 lần gọi. Fail-fast trong 0ms bảo vệ downstream hồi phục.</p>
            <div style={{ marginBottom: '10px' }}>
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
                onClick={() => runDemo('cb', `${GATEWAY_URL}/api/orders/demo/circuit-breaker/1`)}
              >
                Gửi 1 Request
              </button>
              <button
                className="action-btn btn-secondary"
                disabled={loading.cbBurst}
                onClick={burstCb}
              >
                Bắn 6 Lần Liên Tiếp
              </button>
            </div>
            <button
              className="action-btn btn-secondary"
              onClick={resetCircuitBreaker}
              style={{ fontSize: '12px', padding: '6px' }}
            >
              Reset Circuit Breaker (CLOSED)
            </button>
            {results.cb && (
              <div className="result-box">
                <div className="result-row">
                  <span>Kết quả:</span>
                  <span className={`outcome-tag ${results.cb.outcome === 'CIRCUIT_OPEN' ? 'outcome-cb' : results.cb.outcome === 'OK' ? 'outcome-ok' : 'outcome-fallback'}`}>
                    {results.cb.outcome} (HTTP {results.cb.httpStatus})
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{results.cb.message}</div>
              </div>
            )}
          </div>
        </div>

        {/* Pattern 5: Combined + Fallback */}
        <div className="pattern-card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-top">
            <div className="card-badge badge-combined">Pattern 5: Hoàn chỉnh</div>
            <h3>Kết hợp 4 Pattern + Dữ liệu dự phòng (Fallback)</h3>
            <p>Trình tự lồng nhau: <strong>Retry( CircuitBreaker( TimeLimiter( ThreadPoolBulkhead( Feign ) ) ) )</strong>. Bất kể lỗi timeout hay sập nguồn, Fallback đều trả dữ liệu mềm dẻo với HTTP 200.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={fallbackEnabled}
                  onChange={(e) => setFallbackEnabled(e.target.checked)}
                />
                <span>Kích hoạt Fallback (Trả về khách dự phòng nếu lỗi)</span>
              </label>
            </div>
          </div>
          <div>
            <button
              className="action-btn"
              disabled={loading.combined}
              onClick={() => runDemo('combined', `${GATEWAY_URL}/api/orders/demo/combined/1?fallback=${fallbackEnabled}`)}
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              {loading.combined ? 'Đang thực thi pipeline...' : 'Chạy thử nghiệm Kết hợp Toàn diện'}
            </button>
            {results.combined && (
              <div className="result-box" style={{ marginTop: '14px' }}>
                <div className="result-row">
                  <span>Trạng thái phản hồi:</span>
                  <span className={`outcome-tag ${results.combined.fallback ? 'outcome-fallback' : 'outcome-ok'}`}>
                    {results.combined.outcome} (HTTP {results.combined.httpStatus}) {results.combined.fallback ? '🛡️ [ĐÃ DÙNG FALLBACK]' : '✅ [TRẢ VỀ GỐC]'}
                  </span>
                </div>
                <div className="result-row">
                  <span>Dữ liệu User nhận được:</span>
                  <strong>{results.combined.user?.name || 'Null'} - {results.combined.user?.address || ''}</strong>
                </div>
                <div className="result-row">
                  <span>Số lần gọi thực tế sang User Service:</span>
                  <strong>{results.combined.attempts} lần</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#cbd5e1' }}>{results.combined.message}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Activity Log Console */}
      <section className="log-card">
        <div className="log-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700' }}>
            <Terminal size={18} color="#6366f1" />
            <span>Live Activity Console (Nhật ký kiểm thử thời gian thực)</span>
          </div>
          <button
            className="preset-btn"
            onClick={() => setLogs([])}
            style={{ fontSize: '11px', padding: '4px 10px' }}
          >
            Xóa nhật ký
          </button>
        </div>

        <div className="log-list">
          {logs.length === 0 ? (
            <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>
              Chưa có request nào. Hãy bấm một nút test ở trên để xem hoạt động!
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="log-item">
                <span className="log-time">[{log.time}]</span>
                <span className="outcome-tag" style={{ background: '#1e293b', color: '#94a3b8' }}>{log.tag}</span>
                <span className="log-status" style={{ color: log.status >= 500 ? '#f87171' : log.status === 429 ? '#c084fc' : '#34d399' }}>
                  HTTP {log.status}
                </span>
                <span className="log-msg">{log.message}</span>
                {log.elapsedMs > 0 && <span className="log-ms">{log.elapsedMs}ms</span>}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

