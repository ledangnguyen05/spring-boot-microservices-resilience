import { useEffect, useState } from 'react';
import { Activity, Clock3, FileJson, ListChecks, Table2 } from 'lucide-react';
import { lessons } from './demoLessons.js';

const number = new Intl.NumberFormat('vi-VN');
const milliseconds = (value) => value == null ? '—' : `${number.format(value)} ms`;
const outcomeLabels = {
  OK: 'Thành công',
  TIMEOUT: 'TimeLimiter hết giờ (1.5s)',
  FEIGN_TIMEOUT: 'Feign hết giờ (3s)',
  UPSTREAM_DOWN: 'User Service mất kết nối (Offline)',
  UPSTREAM_5XX: 'User Service trả lỗi 5xx',
  UPSTREAM_4XX: 'User Service từ chối yêu cầu 4xx',
  BULKHEAD_FULL: 'Hết suất xử lý (429)',
  CIRCUIT_OPEN: 'Mạch đang mở (Fail-fast)',
  FALLBACK: 'Dùng dữ liệu dự phòng',
};
const runLabels = {
  timeout: ['Gọi trực tiếp User Service', 'Feign read timeout', 'Resilience4j TimeLimiter'],
  retry: ['Tra cứu khách hàng'],
  fallback: ['Tắt dự phòng', 'Bật dự phòng'],
};

export function TimeoutClock({ clock }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, performance.now() - clock.start));
    tick();
    const interval = setInterval(tick, 50);
    return () => clearInterval(interval);
  }, [clock]);

  return <div className="demo-clock">
    <Clock3 size={22} aria-hidden="true" />
    <div className="clock-label"><strong>{clock.label}</strong><small>Mốc dự kiến {(clock.targetMs / 1000).toLocaleString('vi-VN')} giây</small></div>
    <strong className="clock-time" role="timer">{(elapsed / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s</strong>
    <progress aria-label="Thời gian đã chờ so với mốc dự kiến" max={clock.targetMs} value={Math.min(elapsed, clock.targetMs)} />
  </div>;
}

function CallDetails({ rows, retry }) {
  const title = retry ? 'Phản hồi từng lần gọi User Service' : 'Kết quả từng lượt song song';
  return <div className="table-frame call-details" tabIndex={0} role="region" aria-label={title}>
    <table className="result-table">
      <caption>{title} · {rows.length} lượt</caption>
      <thead><tr>
        <th scope="col">Lượt</th><th scope="col">{retry ? 'HTTP từ User' : 'Mã HTTP từng lượt'}</th>
        <th scope="col">Kết quả</th><th scope="col">Thời gian</th>
        {!retry && <th scope="col">Số lần gọi User</th>}
      </tr></thead>
      <tbody>{rows.map(({ number, httpStatus, outcome, elapsedMs, attempts }) => (
        <tr key={number}>
          <th scope="row">#{number}</th>
          <td><span className={`http-code ${httpStatus == null || httpStatus >= 400 ? 'http-error' : 'http-ok'}`}>{httpStatus ?? '—'}</span></td>
          <td>{outcomeLabels[outcome] ?? outcome}</td><td className="numeric">{milliseconds(elapsedMs)}</td>
          {!retry && <td className="numeric">{attempts}</td>}
        </tr>
      ))}</tbody>
    </table>
  </div>;
}

function ConvergeTable({ result }) {
  return <div className="table-frame" tabIndex={0} role="region" aria-label="Bảng kịch bản hội tụ 4 topic">
    <table className="result-table">
      <caption>Kịch bản hội tụ · {result.length}/4 pha</caption>
      <thead><tr>
        <th scope="col">Pha</th><th scope="col">Cơ chế ra tay</th><th scope="col">HTTP</th>
        <th scope="col">Kết quả</th><th scope="col">Thời gian</th><th scope="col">Số lần gọi User</th>
      </tr></thead>
      <tbody>{result.map(({ body, status, measuredMs, phase }, index) => {
        const burst = body?.summary;
        const outcome = burst
          ? Object.entries(burst).map(([key, count]) => `${count}× ${outcomeLabels[key] ?? key}`).join(' · ')
          : (outcomeLabels[body?.outcome] ?? body?.outcome);
        const calls = burst ? (body.requestResults ?? []).reduce((sum, item) => sum + (item.attempts ?? 0), 0) : body?.attempts;
        return <tr key={index}>
          <th scope="row">{phase.title}</th>
          <td>{phase.topics}<small>{phase.expect}</small></td>
          <td><span className={`http-code ${status < 400 ? 'http-ok' : 'http-error'}`}>{status}</span></td>
          <td>{outcome}</td>
          <td className="numeric">{milliseconds(measuredMs)}</td>
          <td className="numeric">{calls ?? '—'}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

function ResultTable({ scenario, result }) {
  if (scenario === 'converge') return <ConvergeTable result={result} />;

  if (scenario === 'normal') {
    const { body, status } = result;
    const rows = [
      ['Mã HTTP', <span className={`http-code ${status === 200 ? 'http-ok' : 'http-error'}`}>{status}</span>],
      ...(status === 200 ? [
        ['Đơn hàng', `#${body.orderId}`],
        ['Sản phẩm', body.productName],
        ['Số lượng', body.quantity],
        ['Đơn giá', body.price == null ? '—' : `${number.format(body.price)} ₫`],
        ['Trạng thái đơn', body.status],
        ['Khách hàng', body.user?.name],
        ['Địa chỉ', body.user?.address],
        ['Thời gian tra cứu khách', milliseconds(body.timeTakenMs)],
      ] : [['Phản hồi', body.message ?? body.error]]),
    ];
    return <div className="table-frame" tabIndex={0} role="region" aria-label="Bảng thông tin đơn hàng">
      <table className="result-table">
        <thead><tr><th scope="col">Thông tin</th><th scope="col">Giá trị</th></tr></thead>
        <tbody>{rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value ?? '—'}</td></tr>)}</tbody>
      </table>
    </div>;
  }

  if (scenario === 'bulkhead') {
    const { body, status } = result;
    return <><div className="table-frame" tabIndex={0} role="region" aria-label="Bảng tổng hợp Bulkhead">
      <table className="result-table">
        <caption>{body.parallelRequests} lượt song song · HTTP {status} cho API tổng hợp · {milliseconds(body.totalMs)}</caption>
        <thead><tr><th scope="col">Kết quả từng lượt</th><th scope="col">Mã kết quả</th><th scope="col">Số lượt</th></tr></thead>
        <tbody>{Object.entries(body.summary).map(([outcome, count]) => (
          <tr key={outcome}><th scope="row">{outcomeLabels[outcome] ?? outcome}</th><td><code>{outcome}</code></td><td className="numeric">{count}</td></tr>
        ))}</tbody>
      </table>
    </div>
      {body.requestResults?.length
        ? <CallDetails rows={body.requestResults} />
        : <p className="note">Cần khởi động lại Order Service với bản mới để xem từng lượt.</p>}
    </>;
  }

  const responses = Array.isArray(result) ? result : [result];
  const showCustomer = scenario === 'retry' || scenario === 'fallback';
  return <><div className="table-frame" tabIndex={0} role="region" aria-label="Bảng phản hồi API">
    <table className="result-table">
      <thead><tr>
        <th scope="col">Lượt thử</th><th scope="col">HTTP</th><th scope="col">Kết quả</th>
        <th scope="col">Thời gian</th><th scope="col">Số lần gọi User</th>
        {showCustomer && <th scope="col">Khách hàng</th>}
      </tr></thead>
      <tbody>{responses.map(({ body, status, measuredMs }, index) => (
        <tr key={index}>
          <th scope="row">{runLabels[scenario]?.[index] ?? (index < 6 ? `Lượt ${index + 1}` : `Thăm dò ${index - 5}`)}</th>
          <td><span className={`http-code ${status < 400 ? 'http-ok' : 'http-error'}`}>{status}</span></td>
          <td>{outcomeLabels[body?.outcome] ?? body?.outcome ?? (status === 200 ? 'Đã nhận dữ liệu' : 'Yêu cầu thất bại')}</td>
          <td className="numeric">{milliseconds(measuredMs ?? body?.elapsedMs)}</td>
          <td className="numeric">{body?.attempts ?? '—'}</td>
          {showCustomer && <td>{body.user?.name ?? '—'}{body.user?.address && <small>{body.user.address}</small>}</td>}
        </tr>
      ))}</tbody>
    </table>
  </div>
    {scenario === 'retry' && (result.body.attemptResults?.length
      ? <CallDetails rows={result.body.attemptResults} retry />
      : <p className="note">Cần khởi động lại Order Service với bản mới để xem từng lần thử.</p>)}
  </>;
}

function summarize(scenario, result, breaker) {
  if (scenario === 'normal') {
    const { body, status } = result;
    if (status !== 200) return `API đơn hàng trả HTTP ${status}. Chưa lấy được dữ liệu đơn hàng.`;
    if (!body.user) return 'API trả HTTP 200 và có thông tin đơn hàng, nhưng phản hồi thiếu dữ liệu khách hàng.';
    return `API trả HTTP 200 với đơn #${body.orderId} và thông tin của ${body.user.name}. Thời gian tra cứu khách là ${milliseconds(body.timeTakenMs)}.`;
  }

  if (scenario === 'timeout') {
    const [direct, feignRun, limiterRun] = result;
    if (!feignRun || !limiterRun) return 'Cần đủ ba lượt đo để so sánh thời gian chờ.';
    const { body: feign, measuredMs: feignMs } = feignRun;
    const { body: limiter, measuredMs: limiterMs } = limiterRun;
    const difference = feignMs - limiterMs;
    if (feign.outcome === 'FEIGN_TIMEOUT' && limiter.outcome === 'TIMEOUT' && difference > 0) {
      return `Gọi trực tiếp nhận HTTP ${direct.status} sau ${milliseconds(direct.measuredMs)}. Qua Order Service, cả hai lượt đều trả HTTP 504, nhưng TimeLimiter giúp người dùng nhận phản hồi sớm hơn Feign ${milliseconds(difference)}.`;
    }
    return `Feign trả ${feign.outcome} sau ${milliseconds(feignMs)}. TimeLimiter trả ${limiter.outcome} sau ${milliseconds(limiterMs)}. Kết quả chưa cho thấy TimeLimiter hết giờ trước Feign.`;
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
    if (probes.length === 2) {
      const successful = probes.filter(({ body }) => body.outcome === 'OK').length;
      return `Có ${successful}/2 lượt thăm dò thành công.${breaker ? ` Trạng thái hiện tại là ${breaker}.` : ''}`;
    }
    const summary = blocked > 0
      ? `Circuit Breaker đã chặn ${blocked} lượt tại Order Service. Những lượt này không gọi sang User Service.`
      : 'Chưa ghi nhận lượt nào bị Circuit Breaker chặn.';
    return breaker ? `${summary} Trạng thái hiện tại là ${breaker}.` : summary;
  }

  if (scenario === 'converge') {
    if (result.length < 4) return 'Kịch bản đang chạy. Cần đủ 4 pha để kết luận.';
    const [bulk, retry, hang, open] = result;
    const counts = bulk.body.summary ?? {};
    const retryText = retry.body.outcome === 'OK'
      ? `Retry cứu được yêu cầu ở lần gọi thứ ${retry.body.attempts}`
      : `Retry không cứu được yêu cầu (${outcomeLabels[retry.body.outcome] ?? retry.body.outcome})`;
    const hangText = `${outcomeLabels[hang.body.outcome] ?? hang.body.outcome} sau ${hang.body.attempts} lần gọi thật`;
    const openText = open.body.outcome === 'CIRCUIT_OPEN'
      ? `mạch từ chối ngay (${open.body.attempts} lần gọi User)`
      : `kết quả ${outcomeLabels[open.body.outcome] ?? open.body.outcome}`;
    return `Pha 1: ${counts.OK ?? 0} lượt thành công, ${counts.BULKHEAD_FULL ?? 0} lượt bị Bulkhead từ chối. Pha 2: ${retryText}. Pha 3: ${hangText}. Pha 4: ${openText}.${breaker ? ` Trạng thái mạch hiện tại là ${breaker}.` : ''}`;
  }

  const [off, on] = result;
  if (!on) return 'Đã nhận phản hồi khi tắt dự phòng. Cần thêm kết quả khi bật để so sánh.';
  if (off.status >= 400 && on.body.outcome === 'FALLBACK' && on.body.user) {
    return `Khi tắt dự phòng, yêu cầu trả HTTP ${off.status}. Khi bật, giao diện có thể hiển thị “${on.body.user.name}” từ dữ liệu dự phòng.`;
  }
  return `Khi tắt dự phòng, API trả ${off.body.outcome}. Khi bật, API trả ${on.body.outcome}.`;
}

function describeProcess(scenario, result, breaker) {
  switch (scenario) {
    case 'normal':
      if (result.status !== 200 || !result.body.user) return [];
      return [
        'Order Service đọc đơn hàng từ cơ sở dữ liệu H2.',
        'Order Service dùng mã khách trên đơn để gọi User Service qua OpenFeign.',
        'Order Service ghép thông tin khách hàng với thông tin đơn rồi trả về cho giao diện.',
      ];
    case 'timeout':
      if (result[1]?.body.outcome !== 'FEIGN_TIMEOUT' || result[2]?.body.outcome !== 'TIMEOUT') return [];
      return [
        'User Service nhận yêu cầu nhưng được cấu hình chờ 4 giây trước khi phản hồi.',
        'Đồng hồ đo từ lúc trình duyệt gửi từng lượt đến khi nhận phản hồi. Lượt gọi trực tiếp cho thấy độ trễ thật của User Service.',
        'Qua Order Service, Feign hết giới hạn đọc trước khi User Service phản hồi. Ở lượt dùng TimeLimiter, giới hạn chờ ngắn hơn nên HTTP 504 về sớm hơn.',
      ];
    case 'retry':
      if (result.body.attemptResults?.map(({ httpStatus }) => httpStatus).join(',') !== '500,500,200') return [];
      return [
        'User Service trả HTTP 500 ở hai lần đầu. Retry chờ theo cấu hình mặc định, 500 ms sau lỗi đầu và 1.000 ms sau lỗi thứ hai.',
        'Lần thứ ba nhận được thông tin khách hàng. Order Service trả HTTP 200 cho yêu cầu ban đầu.',
      ];
    case 'bulkhead':
      return [
        'Order Service gửi một đợt yêu cầu song song. Mỗi lượt cần lấy một suất trước khi gọi User Service.',
        'Lượt lấy được suất tiếp tục xử lý và trả suất khi xong. Nếu hết suất, lượt mới bị từ chối ngay theo cấu hình của demo.',
      ];
    case 'breaker': {
      const blocked = result.findIndex(({ body }) => body.outcome === 'CIRCUIT_OPEN' && body.attempts === 0);
      const firstFiveFailed = result.length >= 5 && result.slice(0, 5).every(({ body }) => body.outcome === 'UPSTREAM_5XX');
      const steps = [firstFiveFailed && blocked === 5
        ? 'Năm lượt đầu đi qua khi mạch còn CLOSED. Cả năm đều gặp lỗi, nên tỷ lệ lỗi 100% vượt ngưỡng 50% và mạch chuyển sang OPEN.'
        : 'Circuit Breaker ghi nhận kết quả các lời gọi. Với cấu hình mặc định, mạch cần 5 mẫu và mở khi tỷ lệ lỗi đạt ít nhất 50%.'];
      if (blocked >= 0) steps.push(`Lượt ${blocked + 1} đến khi mạch đang OPEN. Order Service trả HTTP 503 ngay, với 0 lần gọi User.`);
      if (blocked >= 0) steps.push('Sau khoảng 10 giây, mạch tự chuyển sang HALF_OPEN. Lúc này chỉ một số lượt được phép đi qua để kiểm tra dịch vụ.');
      if (result.length === 8 && result.slice(6).every(({ body }) => body.outcome === 'OK') && breaker === 'CLOSED') {
        steps.push('Demo đã khôi phục User Service trước khi gửi thăm dò. Cả hai lượt được phép gọi thật, đều nhận HTTP 200 và mạch trở lại CLOSED.');
      }
      return steps;
    }
    case 'converge':
      if (result.length < 4) return [];
      return [
        'Pha 1 (Bulkhead): 6 lượt đến cùng lúc nhưng chỉ có 3 suất. Lượt dư bị từ chối ngay, không được thử lại và không bị tính là lỗi của User Service.',
        'Pha 2 (Retry): hai lần gọi đầu nhận HTTP 500. Retry chờ 500 ms rồi 1.000 ms, lần thứ ba thành công nên người dùng không thấy lỗi.',
        'Pha 3 (Feign timeout → Circuit Breaker → Retry): User Service treo 3 giây nhưng Feign cắt mỗi lần gọi sau 1 giây. Lỗi này làm tỷ lệ lỗi của mạch vượt ngưỡng nên mạch mở; Retry gặp mạch mở thì dừng thay vì gọi tiếp.',
        'Pha 4 (Circuit Breaker): mạch đang mở nên yêu cầu bị từ chối ngay tại Order Service, 0 lần gọi sang User Service, không chờ timeout và không retry.',
      ];
    case 'fallback':
      if (result[0]?.status < 400 || result[1]?.body.outcome !== 'FALLBACK') return [];
      return [
        'User Service liên tục báo lỗi. Luồng kết hợp xử lý các lần thử theo chính sách Retry.',
        'Khi tắt fallback, lỗi được trả về giao diện. Khi bật fallback, Order Service trả dữ liệu khách dự phòng sau khi luồng gọi thất bại.',
      ];
    default:
      return [];
  }
}

export default function DemoResults({ scenario, result, breaker, busy, error, view, onViewChange }) {
  if (!result) return <div className="empty" role="status"><Activity size={20} />{busy ? 'Đang chờ phản hồi…' : 'Chạy kịch bản để xem kết quả.'}</div>;

  const payload = Array.isArray(result) ? result.map(({ body }) => body) : result.body;
  const steps = busy || error ? [] : describeProcess(scenario, result, breaker);
  return <>
    <div className="result-toolbar">
      <div className="view-switch" role="group" aria-label="Định dạng kết quả">
        <button type="button" aria-pressed={view === 'table'} onClick={() => onViewChange('table')}><Table2 size={15} /> Bảng</button>
        <button type="button" aria-pressed={view === 'json'} onClick={() => onViewChange('json')}><FileJson size={15} /> JSON</button>
      </div>
      {(scenario === 'breaker' || scenario === 'converge') && breaker && <span className="breaker-state">Mạch hiện tại <strong>{breaker}</strong></span>}
    </div>
    {view === 'table'
      ? <ResultTable scenario={scenario} result={result} />
      : <pre className="json-response" tabIndex={0} aria-label="Nội dung JSON từ API">{JSON.stringify(payload, null, 2)}</pre>}
    <div className="conclusion">
      <ListChecks size={19} aria-hidden="true" />
      <div>
        <h4>Kết luận</h4>
        {steps.length > 0 && <ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol>}
        <p>{busy ? 'Đang chờ các lượt gọi hoàn tất.' : error ? 'Kịch bản gặp lỗi khi chạy. Bên trên là các phản hồi đã nhận.' : summarize(scenario, result, breaker)}</p>
        {!busy && !error && lessons[scenario]?.takeaway && (
          <p className="takeaway"><strong>Ý nghĩa cốt lõi:</strong> {lessons[scenario].takeaway}</p>
        )}
      </div>
    </div>
  </>;
}
