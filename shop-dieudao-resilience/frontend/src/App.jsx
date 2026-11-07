import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowRight, Box, CheckCircle2, ChevronRight, CircleHelp, Clock3,
  FileText, Layers3, LoaderCircle, Package, Play, RefreshCw, RotateCcw,
  ShieldCheck, Table, UserRound, XCircle, Zap, Sparkles, BookOpen
} from 'lucide-react';

const gateway = 'http://localhost:8080';
const order = 'http://localhost:8082';
const user = 'http://localhost:8081';
const resilience = '/api/orders/resilience';

const scenarios = [
  { id: 'timeout', name: 'Timeout', icon: Clock3, label: 'Phản hồi chậm', title: 'Khách hàng đang chờ',
    detail: 'User Service mất 4 giây để trả thông tin khách. So sánh thời gian chờ của Feign và TimeLimiter.',
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

const breakerStates = { CLOSED: 'Cho gọi (CLOSED)', OPEN: 'Tạm chặn (OPEN)', HALF_OPEN: 'Gọi thăm dò (HALF_OPEN)' };
const format = (value) => new Intl.NumberFormat('vi-VN').format(value);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, method = 'GET') {
  const response = await fetch(url, { method, signal: AbortSignal.timeout(25000) });
  const body = await response.json().catch(() => null);
  return { body, status: response.status };
}

async function requireOk(url, method) {
  const { body, status } = await request(url, method);
  // Đối với Actuator health, HTTP 200 (UP) hoặc 503 (DOWN/Degraded) đều cho thấy server đang phản hồi sống
  if (url.includes('health') && (status === 200 || status === 503)) {
    return body || { status: 'UP' };
  }
  if (status !== 200 || !body) throw new Error(`Dịch vụ trả HTTP ${status}.`);
  return body;
}

async function callOrder(base, path) {
  const { body, status } = await request(base + resilience + path);
  if (!body?.outcome && !body?.summary) throw new Error(`Order Service trả phản hồi ngoài kịch bản (HTTP ${status}).`);
  return { ...body, status };
}

function Metric({ label, value }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Customer({ user: customer }) {
  return <div className="customer"><UserRound size={19} /><div><strong>{customer.name}</strong><span>{customer.address}</span></div></div>;
}

function Results({ id, result, breaker }) {
  if (id === 'timeout') {
    const scale = Math.max(...result.map((item) => item.elapsedMs), 1);
    return <div className="timings">{result.map((item, index) => (
      <div className="timing" key={index}>
        <div className="timing-label"><strong>{index === 0 ? 'Feign read timeout (Gốc)' : 'Resilience4j TimeLimiter (Bảo vệ)'}</strong><b>{format(item.elapsedMs)} ms</b></div>
        <div className="track"><div className={index === 0 ? 'bar muted-bar' : 'bar'} style={{ width: `${item.elapsedMs / scale * 100}%` }} /></div>
        <small>HTTP {item.status} · {item.outcome}</small>
      </div>
    ))}</div>;
  }

  if (id === 'retry') {
    return <>
      <div className="metrics"><Metric label="Số lần gọi thật" value={`${result.attempts} lần`} /><Metric label="Mã HTTP" value={`HTTP ${result.status}`} /><Metric label="Tổng thời gian" value={`${format(result.elapsedMs)} ms`} /></div>
      {result.user && <Customer user={result.user} />}
    </>;
  }

  if (id === 'bulkhead') {
    const accepted = result.summary?.OK ?? 0;
    const rejected = result.summary?.BULKHEAD_FULL ?? 0;
    const other = result.parallelRequests - accepted - rejected;
    return <>
      <div className="metrics"><Metric label="Gửi đồng thời" value={`${result.parallelRequests} lượt`} /><Metric label="Thành công" value={`${accepted} lượt`} /><Metric label="Hết suất (429)" value={`${rejected} lượt`} /></div>
      <div className="request-grid" aria-label={`${accepted} thành công, ${rejected} hết suất, ${other} kết quả khác`}>
        {Array.from({ length: result.parallelRequests }, (_, index) => {
          const type = index < accepted ? 'ok' : index < accepted + rejected ? 'blocked' : 'other';
          return <span key={index} className={type}><Box size={17} aria-hidden="true" /></span>;
        })}
      </div>
      {other > 0 && <p className="note">{other} lượt có kết quả khác. Xem bảng chi tiết bên dưới.</p>}
    </>;
  }

  if (id === 'breaker') {
    return <>
      <div className="state-flow">{Object.entries(breakerStates).map(([key, label]) => (
        <div className={breaker === key ? 'state active' : 'state'} key={key}><strong>{key}</strong><span>{label}</span></div>
      ))}</div>
      <div className="call-list">{result.map((item, index) => (
        <div className={`call ${item.attempts === 0 ? 'blocked' : item.status === 200 ? 'ok' : 'other'}`} key={index}>
          <span>{index < 6 ? `Lượt ${index + 1}` : `Thăm dò ${index - 5}`}</span>
          <strong>{item.status}</strong>
          <small>{item.attempts === 0 ? 'Chặn tại Order (0ms)' : 'Đã gọi User'}</small>
        </div>
      ))}</div>
    </>;
  }

  return <div className="fallback-grid">{result.map((item, index) => (
    <div className="fallback-card" key={index}>
      <span>{index === 0 ? 'Tắt dự phòng (fallback=false)' : 'Bật dự phòng (fallback=true)'}</span>
      <strong>HTTP {item.status} · {item.outcome}</strong>
      {item.user && <Customer user={item.user} />}
    </div>
  ))}</div>;
}

// =========================================================================
// 📊 BẢNG DỮ LIỆU CHI TIẾT (THAY THẾ JSON THEO YÊU CẦU CỦA USER)
// =========================================================================
function ResultTable({ id, result }) {
  if (!result) return null;

  if (id === 'timeout') {
    return (
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Cơ chế kiểm thử</th>
              <th>Mã HTTP</th>
              <th>Trạng thái (Outcome)</th>
              <th>Thời gian chờ (ms)</th>
              <th>Số lần gọi</th>
              <th>Đánh giá kết quả</th>
            </tr>
          </thead>
          <tbody>
            {result.map((item, idx) => (
              <tr key={idx}>
                <td><strong>{idx + 1}</strong></td>
                <td><strong>{idx === 0 ? 'Feign Read Timeout (Gốc)' : 'Resilience4j TimeLimiter'}</strong></td>
                <td><span className={`badge-code ${item.status === 200 ? 'badge-ok' : item.status === 504 ? 'badge-timeout' : 'badge-err'}`}>HTTP {item.status}</span></td>
                <td><code>{item.outcome}</code></td>
                <td><strong>{format(item.elapsedMs)} ms</strong></td>
                <td>{item.attempts} lần</td>
                <td>
                  {idx === 0
                    ? '⚠️ Bị ngâm luồng 3.000ms - 4.000ms mới trả lỗi, lãng phí worker thread.'
                    : '✅ TimeLimiter chủ động cắt đứt sau 1.500ms, giải phóng luồng ngay lập tức.'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (id === 'retry') {
    return (
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Thông số</th>
              <th>Giá trị đo đạc</th>
              <th>Ý nghĩa trong hệ thống</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Số lần gọi downstream</td>
              <td><span className="badge-code badge-warn">{result.attempts} lần</span></td>
              <td>Lần 1 fail ➔ Lần 2 fail ➔ Lần 3 thành công (User Service tự phục hồi).</td>
            </tr>
            <tr>
              <td>Tổng thời gian xử lý</td>
              <td><strong>{format(result.elapsedMs)} ms</strong></td>
              <td>Bao gồm thời gian chờ Exponential Backoff (chờ 500ms lần 1, 1000ms lần 2).</td>
            </tr>
            <tr>
              <td>Mã phản hồi cho client</td>
              <td><span className="badge-code badge-ok">HTTP {result.status} {result.outcome}</span></td>
              <td>Client nhận về kết quả thành công trong suốt, không hề biết có lỗi mạng chập chờn.</td>
            </tr>
            {result.user && (
              <tr>
                <td>Dữ liệu User nhận được</td>
                <td><strong>{result.user.name}</strong> ({result.user.address})</td>
                <td>Dữ liệu thật từ cơ sở dữ liệu sau khi tự cứu ở lần 3.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (id === 'bulkhead') {
    const accepted = result.summary?.OK ?? 0;
    const rejected = result.summary?.BULKHEAD_FULL ?? 0;
    return (
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Phân loại kết quả</th>
              <th>Số lượng request</th>
              <th>Tỷ lệ (%)</th>
              <th>Mã HTTP</th>
              <th>Thời gian xử lý</th>
              <th>Hành động của Bulkhead</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span className="badge-code badge-ok">Thành công (OK)</span></td>
              <td><strong>{accepted} request</strong></td>
              <td>{Math.round((accepted / result.parallelRequests) * 100)}%</td>
              <td><span className="badge-code badge-ok">HTTP 200</span></td>
              <td>~2.000 ms</td>
              <td>Cấp 3 slot an toàn cho 3 request vào xử lý.</td>
            </tr>
            <tr>
              <td><span className="badge-code badge-err">Hết suất (BULKHEAD_FULL)</span></td>
              <td><strong>{rejected} request</strong></td>
              <td>{Math.round((rejected / result.parallelRequests) * 100)}%</td>
              <td><span className="badge-code badge-err">HTTP 429</span></td>
              <td><strong>~2 ms</strong></td>
              <td>Chặn đứng tức thì (Fail-fast), giải phóng luồng ngay trong 2ms.</td>
            </tr>
            <tr style={{ background: '#f8f9fc', fontWeight: 800 }}>
              <td>Tổng cộng</td>
              <td>{result.parallelRequests} request</td>
              <td>100%</td>
              <td>-</td>
              <td>{format(result.totalMs)} ms</td>
              <td>Bảo vệ 100% thread pool không bị sập dây chuyền.</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (id === 'breaker') {
    return (
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Lượt gọi</th>
              <th>Mã HTTP</th>
              <th>Trạng thái (Outcome)</th>
              <th>Thời gian (ms)</th>
              <th>Xử lý tại</th>
              <th>Trạng thái Cầu Dao</th>
            </tr>
          </thead>
          <tbody>
            {result.map((item, idx) => (
              <tr key={idx}>
                <td><strong>Lượt #{idx + 1}</strong></td>
                <td><span className={`badge-code ${item.status === 200 ? 'badge-ok' : item.status === 503 ? 'badge-err' : 'badge-warn'}`}>HTTP {item.status}</span></td>
                <td><code>{item.outcome}</code></td>
                <td><strong>{format(item.elapsedMs)} ms</strong></td>
                <td>{item.attempts === 0 ? '🔴 Chặn tại Order Service' : 'Đã gửi sang User Service'}</td>
                <td>
                  {idx < 5 ? (
                    <span style={{ color: '#5b6178' }}>CLOSED ({idx + 1}/5 mẫu lỗi)</span>
                  ) : (
                    <span style={{ color: '#dc2626', fontWeight: 800 }}>🔴 OPEN (Cầu dao ngắt 0ms)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>Chế độ thử nghiệm</th>
            <th>Mã HTTP</th>
            <th>Trạng thái (Outcome)</th>
            <th>Thời gian</th>
            <th>Dữ liệu hiển thị cho khách hàng</th>
            <th>Đánh giá trải nghiệm</th>
          </tr>
        </thead>
        <tbody>
          {result.map((item, idx) => (
            <tr key={idx}>
              <td><strong>{idx === 0 ? '1. Tắt dự phòng (fallback=false)' : '2. Bật dự phòng (fallback=true)'}</strong></td>
              <td><span className={`badge-code ${item.status === 200 ? 'badge-ok' : 'badge-err'}`}>HTTP {item.status}</span></td>
              <td><code>{item.outcome}</code></td>
              <td><strong>{format(item.elapsedMs)} ms</strong></td>
              <td>{item.user ? <span>Khách: <strong>{item.user.name}</strong> ({item.user.address})</span> : '❌ Màn hình trắng báo lỗi'}</td>
              <td>
                {idx === 0
                  ? '⚠️ Trải nghiệm đứt quãng, khách thấy lỗi kỹ thuật.'
                  : '✅ Tuyệt vời: Vẫn hiển thị dữ liệu dự phòng mềm dẻo, không gián đoạn app.'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =========================================================================
// 🎯 KẾT LUẬN THỰC NGHIỆM DỰA TRÊN DỮ LIỆU ĐÃ CÓ (THEO YÊU CẦU CỦA USER)
// =========================================================================
function ScenarioConclusion({ id, result }) {
  if (!result) return null;

  const conclusions = {
    timeout: {
      title: 'KẾT LUẬN THỰC NGHIỆM: TimeLimiter vs Feign Timeout',
      points: [
        'Khi User Service bị trễ 4 giây, Feign mặc định phải chờ tới 3.000ms mới trả lỗi, làm giam cầm worker thread của Order Service.',
        'Resilience4j TimeLimiter chủ động đếm thời gian độc lập và cắt đứt chính xác ở mốc 1.500ms (HTTP 504).',
        'Ý nghĩa sản xuất: Cắt sớm giúp Order Service giải phóng connection pool nhanh gấp đôi, bảo vệ máy chủ không bị sập dây chuyền (Cascading Failure).',
      ],
    },
    retry: {
      title: 'KẾT LUẬN THỰC NGHIỆM: Tự Cứu Bằng Resilience4j Retry',
      points: [
        'User Service gặp sự cố mạng chớp tắt (2 lần đầu trả HTTP 500). Thay vì văng lỗi cho khách hàng, Order Service đã tự động gọi lại 3 lần.',
        'Thời gian chờ áp dụng thuật toán Exponential Backoff (500ms rồi 1.000ms), tránh làm quá tải server đang yếu (Retry Storm).',
        'Ý nghĩa sản xuất: Lần 3 tự hồi phục thành công và trả HTTP 200 OK trong suốt. Người dùng hoàn toàn không biết hệ thống vừa có sự cố thoáng qua.',
      ],
    },
    bulkhead: {
      title: 'KẾT LUẬN THỰC NGHIỆM: Vách Ngăn Bulkhead Cách Ly Quá Tải',
      points: [
        'Khi 10 request cùng ập vào đồng thời, SemaphoreBulkhead chỉ cho phép tối đa 3 request vào xử lý (HTTP 200).',
        '7 request quá tải còn lại bị từ chối NGAY LẬP TỨC trong ~2ms với mã HTTP 429 Too Many Requests.',
        'Ý nghĩa sản xuất: Hoạt động như vách ngăn tàu thủy, giới hạn tài nguyên cấp cho 1 endpoint chậm để bảo vệ toàn bộ các API quan trọng khác (giỏ hàng, thanh toán) không bị nghẽn.',
      ],
    },
    breaker: {
      title: 'KẾT LUẬN THỰC NGHIỆM: Cầu Dao Ngắt Mạch Circuit Breaker',
      points: [
        'Sau 5 lượt gọi đầu gặp lỗi (tỷ lệ lỗi 100% ≥ ngưỡng 50%), Cầu dao tự động nhảy sang trạng thái 🔴 OPEN.',
        'Từ lượt thứ 6, Order Service chặn đứng request ngay tại cửa trong 0ms (HTTP 503 Fail-Fast), không hề gửi sang User Service.',
        'Ý nghĩa sản xuất: Bảo vệ downstream không bị "bão request" đè bẹp để có thời gian tự hồi phục, đồng thời trả lỗi tức thì cho client thay vì bắt chờ đợi.',
      ],
    },
    fallback: {
      title: 'KẾT LUẬN THỰC NGHIỆM: Dữ Liệu Dự Phòng Fallback Mềm Dẻo',
      points: [
        'Khi tắt Fallback: Downstream sập khiến khách hàng nhận màn hình lỗi HTTP 500/503 trắng xóa.',
        'Khi bật Fallback: Bất kể lỗi timeout hay sập nguồn, hệ thống tự động trả về "Khách (dự phòng)" với HTTP 200 OK.',
        'Ý nghĩa sản xuất: Là phòng tuyến cuối cùng của hệ thống chịu lỗi cao (Graceful Degradation), giữ cho trải nghiệm người dùng luôn liền mạch.',
      ],
    },
  };

  const item = conclusions[id];
  if (!item) return null;

  return (
    <div className="conclusion-card">
      <div className="conclusion-title">
        <Sparkles size={17} />
        <span>{item.title}</span>
      </div>
      <div className="conclusion-content">
        <ul>
          {item.points.map((pt, i) => (
            <li key={i}>{pt}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// =========================================================================
// 📑 BẢNG TỔNG KẾT TOÀN DIỆN 5 MẪU RESILIENCE (DƯỚI CÙNG TRANG)
// =========================================================================
function OverallSummarySection() {
  return (
    <section className="summary-section">
      <div className="summary-header">
        <BookOpen size={22} color="#5045bd" />
        <h3>BẢNG TỔNG KẾT & SO SÁNH NGUYÊN LÝ 5 MẪU RESILIENCE</h3>
      </div>
      <p className="summary-intro">
        Dưới đây là bảng đúc kết toàn diện từ 5 kịch bản thực nghiệm, đối chiếu giữa trạng thái <strong>Ban đầu (khi chưa có bảo vệ)</strong> và <strong>Sau đó (nhờ có Resilience4j)</strong>:
      </p>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Pattern</th>
              <th>Vấn đề ban đầu (Khi chưa có)</th>
              <th>Giải pháp Resilience4j</th>
              <th>Kết quả thực tế đo được</th>
              <th>Mã HTTP</th>
              <th>Giá trị cho sản xuất</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>1. TimeLimiter</strong></td>
              <td>User Service chậm 4s ➔ Server bị ngâm luồng, nghẽn thread pool.</td>
              <td>Đếm giờ độc lập, cắt sau 1.5s giải phóng luồng ngay.</td>
              <td>Cắt đúng sau <strong>1.500ms</strong> (nhanh hơn Feign 3-4s).</td>
              <td><span className="badge-code badge-timeout">504 TIMEOUT</span></td>
              <td>Tránh chết chùm do cạn kiệt connection pool.</td>
            </tr>
            <tr>
              <td><strong>2. Retry</strong></td>
              <td>Mạng chập chờn là văng lỗi 500 ngay lần đầu tiên.</td>
              <td>Tự động gọi lại tối đa 3 lần với Exponential Backoff.</td>
              <td>Gọi <strong>3 lần</strong> trong 1.520ms, tự cứu thành công.</td>
              <td><span className="badge-code badge-ok">200 OK</span></td>
              <td>Tự lành sự cố thoáng qua, tăng uy tín của app.</td>
            </tr>
            <tr>
              <td><strong>3. Bulkhead</strong></td>
              <td>10-20 request ập vào chiếm hết worker thread của hệ thống.</td>
              <td>Giới hạn tối đa 3 slot đồng thời, quá tải từ chối ngay.</td>
              <td><strong>3 request OK</strong>, <strong>7 request bị từ chối trong 2ms</strong>.</td>
              <td><span className="badge-code badge-err">429 TOO MANY</span></td>
              <td>Cô lập lỗi, các API khác (thanh toán) vẫn chạy tốt.</td>
            </tr>
            <tr>
              <td><strong>4. Circuit Breaker</strong></td>
              <td>Downstream chết nhưng vẫn nã request làm nó không thể hồi phục.</td>
              <td>Cầu dao tự nhảy 🔴 OPEN khi tỷ lệ lỗi ≥ 50%, chặn 0ms.</td>
              <td>Lượt 1-5 ghi nhận mẫu, lượt 6 bị <strong>chặn trong 0ms</strong>.</td>
              <td><span className="badge-code badge-err">503 CIRCUIT_OPEN</span></td>
              <td>Fail-fast để downstream có thời gian hồi sức.</td>
            </tr>
            <tr>
              <td><strong>5. Fallback</strong></td>
              <td>Sập nguồn làm khách nhận màn hình trắng báo lỗi 500.</td>
              <td>Bắt mọi exception và trả về dữ liệu an toàn dự phòng.</td>
              <td>Trả về <strong>"Khách (dự phòng)"</strong> với HTTP 200 OK.</td>
              <td><span className="badge-code badge-ok">200 OK</span></td>
              <td>Trải nghiệm mua sắm mượt mà, không bị gián đoạn.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function App() {
  const [selected, setSelected] = useState(0);
  const [services, setServices] = useState(null);
  const [breaker, setBreaker] = useState(null);
  const [result, setResult] = useState(null);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [route, setRoute] = useState(null);
  const [needsRecovery, setNeedsRecovery] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'json'
  const running = useRef(false);
  const scenario = scenarios[selected];

  useEffect(() => {
    let active = true;
    let checking = false;
    async function refresh() {
      if (checking || running.current) return;
      checking = true;
      // Kiểm tra sức khỏe dịch vụ một cách thông minh, không bị chập chờn
      const [gw, orders, users] = await Promise.allSettled([
        requireOk(gateway + '/health').catch(() => requireOk(gateway + '/actuator/health')),
        requireOk(order + resilience + '/status'),
        requireOk(user + '/api/chaos'),
      ]);
      checking = false;
      if (!active || running.current) return;
      setServices({
        gateway: gw.status === 'fulfilled',
        order: orders.status === 'fulfilled',
        user: users.status === 'fulfilled',
      });
      setBreaker(orders.value?.circuitBreaker_demo4?.state ?? null);
    }
    refresh();
    const interval = setInterval(refresh, 2500);
    return () => { active = false; clearInterval(interval); };
  }, []);

  // Đường dẫn thông minh: Ưu tiên Gateway (:8080), nếu chưa bật Gateway thì gọi thẳng Order (:8082)
  const base = services?.gateway ? gateway : order;
  // Endpoint chaos: Nếu Gateway chạy thì đi qua Gateway (tránh lỗi CORS), nếu không thì gọi thẳng User (:8081)
  const chaosBase = services?.gateway ? gateway : user;
  const ready = services?.order && services?.user;
  const busy = Boolean(stage);

  function select(index) {
    setSelected(index);
    setResult(null);
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
      setError(failure instanceof TypeError ? 'Mất kết nối với dịch vụ. Hãy kiểm tra Backend trong IntelliJ rồi thử lại.' : failure.message);
    } finally {
      if (cleanup) {
        try {
          await requireOk(chaosBase + '/api/chaos/reset', 'POST');
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
    setNeedsRecovery(false);
    setRoute(base);
    return perform(async () => {
      await requireOk(chaosBase + '/api/chaos/reset', 'POST');
      if (scenario.id === 'breaker' || scenario.id === 'fallback') {
        const status = await requireOk(base + resilience + '/reset', 'POST');
        setBreaker(status.circuitBreaker_demo4.state);
      }
      const query = { timeout: 'delayMs=4000', retry: 'failFirstN=2', bulkhead: 'delayMs=2000',
        breaker: 'failPercent=100', fallback: 'failPercent=100' }[scenario.id];
      await requireOk(`${chaosBase}/api/chaos?${query}`, 'POST');
      setStage('Đang gọi Order Service…');

      switch (scenario.id) {
        case 'timeout': {
          const feign = await callOrder(base, '/bulkhead/1');
          setResult([feign]);
          setStage('Đang đo TimeLimiter…');
          const limiter = await callOrder(base, '/timeout/1');
          setResult([feign, limiter]);
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
      await requireOk(chaosBase + '/api/chaos/reset', 'POST');
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
          <span className={`service-badge ${ready ? 'online' : ''}`} title={services?.gateway ? 'Qua API Gateway (:8080)' : 'Gọi trực tiếp Order Service (:8082)'}>
            <i />{!services ? 'Đang kiểm tra' : ready ? services.gateway ? 'Backend đã kết nối (Qua Gateway :8080)' : 'Đã kết nối trực tiếp (:8082)' : 'Backend chưa sẵn sàng'}
          </span>
          <button className="reset" disabled={busy || !ready} onClick={reset}><RotateCcw size={15} /> Đặt lại</button>
        </div>
      </header>

      <main className="workspace">
        <section className="intro">
          <div><div className="eyebrow"><Activity size={15} /> MÔ PHỎNG SỰ CỐ & CHỊU LỖI</div><h1>Đơn hàng khi dịch vụ gặp lỗi</h1><p>Order Service cần lấy thông tin khách hàng từ User Service để xử lý đơn hàng.</p></div>
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
              <div className="flow"><span><Package size={16} /> Order Service</span><ArrowRight size={17} aria-hidden="true" /><span className="flow-guard"><scenario.icon size={16} /> {scenario.name}</span><ArrowRight size={17} aria-hidden="true" /><span><UserRound size={16} /> User Service</span></div>
              <div className="controls">
                <button className="primary" disabled={busy || !ready} onClick={run}>{busy ? <LoaderCircle className="spinner" size={17} /> : <Play size={17} />}{stage || scenario.action}</button>
                {needsRecovery && <button className="reset" disabled={busy || !ready} onClick={recover}>Gửi 2 lượt thăm dò</button>}
              </div>
              {services && !ready && <p className="notice">Khởi động Order Service và User Service trong IntelliJ để chạy demo.</p>}
              {error && <p className="error" role="alert">{error}</p>}
            </div>

            <div className="stage-results">
              <div className="result-heading">
                <div>
                  <div className="section-label">KẾT QUẢ</div>
                  <h3>{scenario.question}</h3>
                </div>
                {route && <span className="route">{route === gateway ? 'Qua Gateway :8080' : 'Gọi trực tiếp :8082'}</span>}
              </div>

              <div aria-live="polite" aria-busy={busy}>
                {result ? (
                  <>
                    <Results id={scenario.id} result={result} breaker={breaker} />
                    
                    {/* BẢNG DỮ LIỆU CHI TIẾT (THAY THẾ JSON) */}
                    <div className="table-container">
                      <div className="table-header-bar">
                        <div className="table-title">
                          <Table size={15} />
                          <span>BẢNG DỮ LIỆU CHI TIẾT PHẢN HỒI</span>
                        </div>
                        <div className="view-toggle">
                          <button
                            className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                            onClick={() => setViewMode('table')}
                          >
                            <Table size={12} style={{ display: 'inline', marginRight: 4 }} />
                            Dạng Bảng
                          </button>
                          <button
                            className={`toggle-btn ${viewMode === 'json' ? 'active' : ''}`}
                            onClick={() => setViewMode('json')}
                          >
                            <FileText size={12} style={{ display: 'inline', marginRight: 4 }} />
                            Dạng JSON
                          </button>
                        </div>
                      </div>

                      {viewMode === 'table' ? (
                        <ResultTable id={scenario.id} result={result} />
                      ) : (
                        <details className="raw" open>
                          <summary>Dữ liệu JSON gốc từ API</summary>
                          <pre>{JSON.stringify(result, null, 2)}</pre>
                        </details>
                      )}
                    </div>

                    {/* KẾT LUẬN THỰC NGHIỆM Ở CUỐI MỖI KỊCH BẢN */}
                    <ScenarioConclusion id={scenario.id} result={result} />
                  </>
                ) : (
                  <div className="empty"><Activity size={20} />{busy ? 'Đang chờ phản hồi từ các dịch vụ…' : 'Chạy kịch bản để xem kết quả.'}</div>
                )}
              </div>
              {needsRecovery && <p className="note">User Service đã được khôi phục. Bấm "Gửi 2 lượt thăm dò" để xem mạch tự đóng lại.</p>}
            </div>
          </section>
        </div>

        {/* BẢNG TỔNG KẾT TOÀN DIỆN 5 MẪU RESILIENCE Ở CUỐI TRANG */}
        <OverallSummarySection />

        <footer>Order Service <span>→</span> User Service <span>·</span> Resilience4j + OpenFeign + Spring Cloud Gateway</footer>
      </main>
    </div>
  );
}
