import { Activity, FileJson, ListChecks, Table2 } from 'lucide-react';

const number = new Intl.NumberFormat('vi-VN');
const milliseconds = (value) => value == null ? '—' : `${number.format(value)} ms`;
const outcomeLabels = {
  OK: 'Thành công',
  TIMEOUT: 'TimeLimiter hết giờ',
  FEIGN_TIMEOUT: 'Feign hết giờ',
  UPSTREAM_5XX: 'User Service trả lỗi',
  UPSTREAM_4XX: 'User Service từ chối yêu cầu',
  BULKHEAD_FULL: 'Hết suất xử lý',
  CIRCUIT_OPEN: 'Mạch đang mở',
  FALLBACK: 'Dùng dữ liệu dự phòng',
};
const runLabels = {
  timeout: ['Feign read timeout', 'Resilience4j TimeLimiter'],
  retry: ['Tra cứu khách hàng'],
  fallback: ['Tắt dự phòng', 'Bật dự phòng'],
};

function ResultTable({ scenario, result }) {
  if (scenario === 'bulkhead') {
    const { body, status } = result;
    return <div className="table-frame" tabIndex={0} role="region" aria-label="Bảng tổng hợp Bulkhead">
      <table className="result-table">
        <caption>{body.parallelRequests} lượt song song · HTTP {status} cho API tổng hợp · {milliseconds(body.totalMs)}</caption>
        <thead><tr><th scope="col">Kết quả từng lượt</th><th scope="col">Mã kết quả</th><th scope="col">Số lượt</th></tr></thead>
        <tbody>{Object.entries(body.summary).map(([outcome, count]) => (
          <tr key={outcome}><th scope="row">{outcomeLabels[outcome] ?? outcome}</th><td><code>{outcome}</code></td><td className="numeric">{count}</td></tr>
        ))}</tbody>
      </table>
    </div>;
  }

  const responses = Array.isArray(result) ? result : [result];
  const showCustomer = scenario === 'retry' || scenario === 'fallback';
  return <div className="table-frame" tabIndex={0} role="region" aria-label="Bảng phản hồi API">
    <table className="result-table">
      <thead><tr>
        <th scope="col">Lượt thử</th><th scope="col">HTTP</th><th scope="col">Kết quả</th>
        <th scope="col">Thời gian</th><th scope="col">Số lần gọi User</th>
        {showCustomer && <th scope="col">Khách hàng</th>}
      </tr></thead>
      <tbody>{responses.map(({ body, status }, index) => (
        <tr key={index}>
          <th scope="row">{runLabels[scenario]?.[index] ?? (index < 6 ? `Lượt ${index + 1}` : `Thăm dò ${index - 5}`)}</th>
          <td><span className={`http-code ${status < 400 ? 'http-ok' : 'http-error'}`}>{status}</span></td>
          <td>{outcomeLabels[body.outcome] ?? body.outcome}</td>
          <td className="numeric">{milliseconds(body.elapsedMs)}</td>
          <td className="numeric">{body.attempts ?? '—'}</td>
          {showCustomer && <td>{body.user?.name ?? '—'}{body.user?.address && <small>{body.user.address}</small>}</td>}
        </tr>
      ))}</tbody>
    </table>
  </div>;
}

function summarize(scenario, result, breaker) {
  if (scenario === 'timeout') {
    const [feign, limiter] = result.map(({ body }) => body);
    if (!limiter) return 'Đã nhận phản hồi từ Feign. Cần thêm kết quả TimeLimiter để so sánh.';
    const difference = feign.elapsedMs - limiter.elapsedMs;
    if (feign.outcome === 'FEIGN_TIMEOUT' && limiter.outcome === 'TIMEOUT' && difference > 0) {
      return `TimeLimiter trả lỗi sớm hơn Feign ${milliseconds(difference)}. Order Service dừng chờ sau ${milliseconds(limiter.elapsedMs)}.`;
    }
    return `Feign trả ${feign.outcome} sau ${milliseconds(feign.elapsedMs)}. TimeLimiter trả ${limiter.outcome} sau ${milliseconds(limiter.elapsedMs)}. Kết quả chưa cho thấy TimeLimiter hết giờ trước Feign.`;
  }

  if (scenario === 'retry') {
    const { body } = result;
    if (body.outcome === 'OK' && body.attempts === 1) return 'Lần gọi đầu đã thành công, nên Order Service không cần thử lại.';
    if (body.outcome === 'OK') return `Order Service tự thử lại và lấy được thông tin khách hàng ở lần gọi thứ ${body.attempts}.`;
    return `Order Service đã gọi User Service ${body.attempts} lần. Kết quả cuối là ${outcomeLabels[body.outcome] ?? body.outcome}.`;
  }

  if (scenario === 'bulkhead') {
    const { parallelRequests, summary } = result.body;
    const succeeded = summary.OK ?? 0;
    const rejected = summary.BULKHEAD_FULL ?? 0;
    const other = parallelRequests - succeeded - rejected;
    return `Trong ${parallelRequests} lượt đồng thời, ${succeeded} lượt thành công và ${rejected} lượt bị từ chối vì hết suất.${other > 0 ? ` Có ${other} lượt trả kết quả khác.` : ''}${rejected > 0 ? ' Các lượt hết suất bị chặn trước khi gọi User Service.' : ''}`;
  }

  if (scenario === 'breaker') {
    const blocked = result.filter(({ body }) => body.outcome === 'CIRCUIT_OPEN' && body.attempts === 0).length;
    const probes = result.slice(6);
    if (probes.length === 2 && probes.every(({ body }) => body.outcome === 'OK') && breaker === 'CLOSED') {
      return 'Hai lượt thăm dò đều thành công. Mạch đã đóng và cho phép các lượt tiếp theo đi qua.';
    }
    const summary = blocked > 0
      ? `Circuit Breaker đã chặn ${blocked} lượt tại Order Service. Những lượt này không gọi sang User Service.`
      : 'Chưa ghi nhận lượt nào bị Circuit Breaker chặn.';
    return breaker ? `${summary} Trạng thái hiện tại là ${breaker}.` : summary;
  }

  const [off, on] = result;
  if (!on) return 'Đã nhận phản hồi khi tắt dự phòng. Cần thêm kết quả khi bật để so sánh.';
  if (off.status >= 400 && on.body.outcome === 'FALLBACK' && on.body.user) {
    return `Khi tắt dự phòng, yêu cầu trả HTTP ${off.status}. Khi bật, giao diện có thể hiển thị “${on.body.user.name}” từ dữ liệu dự phòng.`;
  }
  return `Khi tắt dự phòng, API trả ${off.body.outcome}. Khi bật, API trả ${on.body.outcome}.`;
}

export default function DemoResults({ scenario, result, breaker, busy, error, view, onViewChange }) {
  if (!result) return <div className="empty" role="status"><Activity size={20} />{busy ? 'Đang chờ phản hồi…' : 'Chạy kịch bản để xem kết quả.'}</div>;

  const payload = Array.isArray(result) ? result.map(({ body }) => body) : result.body;
  return <>
    <div className="result-toolbar">
      <div className="view-switch" role="group" aria-label="Định dạng kết quả">
        <button type="button" aria-pressed={view === 'table'} onClick={() => onViewChange('table')}><Table2 size={15} /> Bảng</button>
        <button type="button" aria-pressed={view === 'json'} onClick={() => onViewChange('json')}><FileJson size={15} /> JSON</button>
      </div>
      {scenario === 'breaker' && breaker && <span className="breaker-state">Mạch hiện tại <strong>{breaker}</strong></span>}
    </div>
    {view === 'table'
      ? <ResultTable scenario={scenario} result={result} />
      : <pre className="json-response" tabIndex={0} aria-label="Nội dung JSON từ API">{JSON.stringify(payload, null, 2)}</pre>}
    <div className="conclusion">
      <ListChecks size={19} aria-hidden="true" />
      <div><h4>Kết luận</h4><p>{busy ? 'Đang chờ các lượt gọi hoàn tất.' : error ? 'Kịch bản gặp lỗi khi chạy. Bên trên là các phản hồi đã nhận.' : summarize(scenario, result, breaker)}</p></div>
    </div>
  </>;
}
