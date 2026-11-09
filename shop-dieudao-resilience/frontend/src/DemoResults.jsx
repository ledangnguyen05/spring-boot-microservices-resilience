import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Clock3, FileJson, ListChecks, ShieldCheck, Table2, Zap } from 'lucide-react';
import { lessons, comparisons } from './demoLessons.js';

const number = new Intl.NumberFormat('vi-VN');
const milliseconds = (value) => value == null ? '—' : `${number.format(value)} ms`;
const outcomeLabels = {
  OK: 'Thành công',
  TIMEOUT: 'Hết giờ ở tầng ứng dụng (TimeLimiter)',
  FEIGN_TIMEOUT: 'Hết giờ ở tầng mạng Feign',
  RESTCLIENT_TIMEOUT: 'Hết giờ ở tầng mạng RestClient',
  UPSTREAM_DOWN: 'User Service mất kết nối (Tắt server)',
  UPSTREAM_5XX: 'User Service báo lỗi 5xx',
  UPSTREAM_4XX: 'User Service từ chối yêu cầu 4xx',
  BULKHEAD_FULL: 'Hết chỗ xử lý (Quá tải)',
  CIRCUIT_OPEN: 'Cầu dao đang ngắt (Chặn luôn)',
  FALLBACK: 'Dùng dữ liệu tạm thay thế (Fallback)',
};
const runLabels = {
  timeout: [
    '1. Không cài Timeout (Gọi thẳng · Chờ tới khi xong 4s)',
    '2. Tầng kết nối Feign (Ví dụ đặt hạn 3s · Hết giờ cắt)',
    '3. Tầng kết nối RestClient (Ví dụ đặt hạn 2.5s · Hết giờ cắt)',
    '4. Tầng nghiệp vụ TimeLimiter (Ví dụ đặt hạn 1.5s · Hết giờ cắt)'
  ],
  retry: [
    '1. Thư viện Resilience4j Retry (Nghỉ 500ms ➔ 1000ms · Lần 3 thành công)',
    '2. Thư viện Spring Retry (Nghỉ 500ms ➔ 1000ms · Lần 3 thành công)'
  ],
  fallback: ['Khi TẮT dữ liệu dự phòng (Trả thẳng lỗi 500)', 'Khi BẬT dữ liệu dự phòng (Trả dữ liệu tạm HTTP 200)'],
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
    <div className="clock-label"><strong>{clock.label}</strong><small>Hạn mức đã đặt: {(clock.targetMs / 1000).toLocaleString('vi-VN')} giây</small></div>
    <strong className="clock-time" role="timer">{(elapsed / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s</strong>
    <progress aria-label="Thời gian đã chờ so với hạn mức" max={clock.targetMs} value={Math.min(elapsed, clock.targetMs)} />
  </div>;
}

function CallDetails({ rows, retry, customTitle }) {
  const title = customTitle || (retry ? 'Chi tiết từng lần gọi sang User Service' : 'Kết quả từng lượt chạy song song');
  return <div className="table-frame call-details" tabIndex={0} role="region" aria-label={title}>
    <table className="result-table">
      <caption>{title} · {rows.length} lượt</caption>
      <thead><tr>
        <th scope="col">Lượt</th><th scope="col">{retry ? 'Mã HTTP nhận về' : 'Mã HTTP từng lượt'}</th>
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
  const list = Array.isArray(result) ? result : [];
  return <div className="table-frame" tabIndex={0} role="region" aria-label="Bảng kịch bản hội tụ 4 topic">
    <table className="result-table">
      <caption>Kịch bản hội tụ · {list.length}/5 pha (Từ lúc bình thường ➔ gặp lỗi ➔ tự phục hồi)</caption>
      <thead><tr>
        <th scope="col">Pha</th><th scope="col">Cơ chế tham gia</th><th scope="col">HTTP</th>
        <th scope="col">Kết quả & Ý nghĩa</th><th scope="col">Thời gian</th><th scope="col">Số lần gọi User</th>
      </tr></thead>
      <tbody>{list.map((item, index) => {
        const { body = {}, status, measuredMs, phase = {} } = item || {};
        const burst = body?.summary;
        const outcome = burst
          ? Object.entries(burst).map(([key, count]) => `${count}× ${outcomeLabels[key] ?? key}`).join(' · ')
          : (outcomeLabels[body?.outcome] ?? body?.outcome);
        const calls = burst ? (body?.requestResults ?? []).reduce((sum, req) => sum + (req?.attempts ?? 0), 0) : body?.attempts;
        const isOk = status === 200;
        const isFailFast = status === 503 && body?.attempts === 0;
        return <tr key={index}>
          <th scope="row">
            {phase.title}
            <small style={{ display: 'block', color: isOk ? '#207833' : isFailFast ? '#a05800' : '#883a34', fontWeight: 600, marginTop: '2px' }}>
              {phase.statusDesc}
            </small>
          </th>
          <td>{phase.topics}<small>{phase.expect}</small></td>
          <td>
            <span className={`http-code ${isOk ? 'http-ok' : isFailFast ? 'http-warn' : 'http-error'}`}>
              {status}
            </span>
          </td>
          <td>
            <strong>{outcome}</strong>
            <small style={{ display: 'block', color: '#555273', marginTop: '2px', lineHeight: 1.4 }}>
              {index === 0 && '✔ Lọc bớt người vào: nhận đúng 3 lượt, 3 lượt thừa báo bận (429) ngay.'}
              {index === 1 && '✔ Tự thử lại: 2 lần đầu lỗi 500, lần 3 thành công 200 OK.'}
              {index === 2 && '⚠ Cắt treo & Bung cầu dao: User Service treo 3s, Timeout cắt sau 1s, cầu dao chuyển OPEN.'}
              {index === 3 && '🛡️ Chặn nhanh (Fail-fast): trả 503 ngay sau vài ms (0 lần gọi User), Retry cũng tự dừng.'}
              {index === 4 && '✔ Tự mở thông mạch lại: User Service khỏe lại, thăm dò 200 OK thành công, đóng cầu dao về CLOSED.'}
            </small>
          </td>
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
    const { body = {}, status } = result || {};
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
    const { body = {}, status, _stagedResults } = result || {};
    const displayResults = _stagedResults || body.requestResults || [];
    return <><div className="table-frame" tabIndex={0} role="region" aria-label="Bảng tổng hợp Bulkhead">
      <table className="result-table">
        <caption>{body.parallelRequests ?? 0} lượt gửi cùng lúc · HTTP {status} · {milliseconds(body.totalMs)}</caption>
        <thead><tr><th scope="col">Kết quả từng lượt</th><th scope="col">Mã kết quả</th><th scope="col">Số lượt</th></tr></thead>
        <tbody>{Object.entries(body.summary || {}).map(([outcome, count]) => (
          <tr key={outcome}><th scope="row">{outcomeLabels[outcome] ?? outcome}</th><td><code>{outcome}</code></td><td className="numeric">{count}</td></tr>
        ))}</tbody>
      </table>
    </div>
      {displayResults.length > 0
        ? <CallDetails rows={displayResults} />
        : <p className="note">Cần khởi động lại Order Service với bản mới để xem từng lượt.</p>}
    </>;
  }

  const responses = Array.isArray(result) ? result : [result];
  const showCustomer = scenario === 'retry' || scenario === 'fallback';
  const stagedAttempts = result?._stagedAttempts || (Array.isArray(result) ? result[0]?.body?.attemptResults : result?.body?.attemptResults);
  const showSummaryRow = result?._stagedSummary !== false;

  return <><div className="table-frame" tabIndex={0} role="region" aria-label="Bảng phản hồi API">
    <table className="result-table">
      <thead><tr>
        <th scope="col">Lượt thử</th><th scope="col">HTTP</th><th scope="col">Kết quả</th>
        <th scope="col">Thời gian</th><th scope="col">Số lần gọi User</th>
        {showCustomer && <th scope="col">Khách hàng</th>}
      </tr></thead>
      <tbody>
        {showSummaryRow ? (
          responses.map((item, index) => {
            const { body = {}, status, measuredMs } = item || {};
            let rowLabel = runLabels[scenario]?.[index];
            if (!rowLabel) {
              if (scenario === 'breaker') {
                if (index < 5) rowLabel = `Lượt ${index + 1}/6 (Mạch đang đóng CLOSED)`;
                else if (index === 5) rowLabel = `Lượt 6/6 (Cầu dao NGẮT · Trả lỗi ngay trong ${measuredMs ?? 14}ms)`;
                else if (index === 6) rowLabel = `Thăm dò 1/2 (Mạch đang mở hé HALF-OPEN)`;
                else if (index === 7) rowLabel = `Thăm dò 2/2 (Đủ 2 lượt tốt ➔ Đóng mạch lại CLOSED 🟢)`;
                else rowLabel = `Thăm dò ${index - 5}`;
              } else {
                rowLabel = `Lượt ${index + 1}`;
              }
            }
            return (
              <tr key={index}>
                <th scope="row">
                  {rowLabel}
                  {scenario === 'breaker' && index === 5 && (
                    <small style={{ display: 'block', color: '#ef4444', fontWeight: 600, marginTop: '2px' }}>
                      ⚡ 0 lần gọi User · Chặn ngay tại cửa không cần gọi qua mạng
                    </small>
                  )}
                  {scenario === 'breaker' && index === 6 && (
                    <small style={{ display: 'block', color: '#f59e0b', fontWeight: 600, marginTop: '2px' }}>
                      🟡 Lượt thử 1 đã qua · Chờ lượt thử 2 xác nhận
                    </small>
                  )}
                  {scenario === 'breaker' && index === 7 && (
                    <small style={{ display: 'block', color: '#16a34a', fontWeight: 600, marginTop: '2px' }}>
                      🟢 Cả 2 lượt thử đều ổn ➔ Mở đường hoạt động bình thường trở lại
                    </small>
                  )}
                </th>
                <td><span className={`http-code ${status < 400 ? 'http-ok' : 'http-error'}`}>{status}</span></td>
                <td>{outcomeLabels[body?.outcome] ?? body?.outcome ?? (status === 200 ? 'Đã nhận dữ liệu' : 'Yêu cầu thất bại')}</td>
                <td className="numeric">{milliseconds(measuredMs ?? body?.elapsedMs)}</td>
                <td className="numeric">{body?.attempts ?? '—'}</td>
                {showCustomer && <td>{body?.user?.name ?? '—'}{body?.user?.address && <small>{body.user.address}</small>}</td>}
              </tr>
            );
          })
        ) : (
          <tr>
            <th scope="row">Tra cứu khách hàng</th>
            <td><span className="http-code http-warn">Đang thử lại…</span></td>
            <td>Đang tự động thử lại qua Resilience4j Retry…</td>
            <td className="numeric">Đang đo…</td>
            <td className="numeric">{stagedAttempts?.length ?? 1} / 3</td>
            {showCustomer && <td>Đang chờ phản hồi…</td>}
          </tr>
        )}
      </tbody>
    </table>
  </div>
    {scenario === 'retry' && (
      Array.isArray(result) ? (
        result.map((item, idx) => (
          item?.body?.attemptResults?.length ? (
            <CallDetails
              key={idx}
              rows={item.body.attemptResults}
              retry
              customTitle={idx === 0
                ? 'Chi tiết 3 lần gọi · Thư viện 1: Resilience4j Retry'
                : 'Chi tiết 3 lần gọi · Thư viện 2: Spring Retry (RetryTemplate)'}
            />
          ) : null
        ))
      ) : (
        stagedAttempts?.length
          ? <CallDetails rows={stagedAttempts} retry />
          : <p className="note">Cần khởi động lại Order Service với bản mới để xem từng lần thử.</p>
      )
    )}
  </>;
}

function summarize(scenario, result, breaker) {
  if (!result) return '';
  if (scenario === 'normal') {
    const { body = {}, status } = result;
    if (status !== 200) return `API đơn hàng trả HTTP ${status}. Chưa lấy được dữ liệu đơn hàng.`;
    if (!body?.user) return 'API trả HTTP 200 và có thông tin đơn hàng, nhưng phản hồi thiếu dữ liệu khách hàng.';
    return `Hệ thống hoạt động bình thường: lấy được đơn #${body.orderId} kèm thông tin khách ${body.user.name} trong ${milliseconds(body.timeTakenMs)}.`;
  }

  if (scenario === 'timeout') {
    if (!Array.isArray(result) || result.length < 4) return 'Đang đo tuần tự cả 4 kịch bản để hiển thị đầy đủ trên bảng…';
    const [direct, feignRun, restClientRun, limiterRun] = result;
    return `Khi không cài Timeout, yêu cầu phải chờ suốt ${milliseconds(direct?.measuredMs ?? 4000)}. Khi cài Timeout: các con số ${milliseconds(feignRun?.measuredMs ?? 3000)} (Feign), ${milliseconds(restClientRun?.measuredMs ?? 2500)} (RestClient) và ${milliseconds(limiterRun?.measuredMs ?? 1500)} (TimeLimiter) là các mốc do chúng ta chủ động cấu hình để minh họa 2 lớp khác nhau: lớp kết nối mạng (Feign/RestClient) cắt một cuộc gọi HTTP bị kẹt, còn lớp ứng dụng (TimeLimiter) khống chế tổng thời gian chờ tối đa cho cả tính năng.`;
  }

  if (scenario === 'retry') {
    const list = Array.isArray(result) ? result : [result];
    const first = list[0]?.body ?? {};
    if (list.length > 1) {
      return `Cả 2 thư viện Resilience4j Retry và Spring Retry đều hoạt động giống nhau: tự động thử lại khi gặp lỗi 500 ở 2 lần đầu, giữ khoảng nghỉ (500ms rồi 1000ms) và lấy được dữ liệu thành công (HTTP 200) ở lần thứ 3.`;
    }
    if (first.outcome === 'OK' && first.attempts === 1) return 'Lần gọi đầu đã thành công ngay, nên không cần thử lại.';
    if (first.outcome === 'OK') return `Hệ thống tự thử lại và lấy thành công thông tin khách ở lần thứ ${first.attempts} (khách hàng không bị báo lỗi).`;
    return `Order Service đã thử gọi ${first.attempts ?? 1} lần nhưng kết quả cuối là ${outcomeLabels[first.outcome] ?? first.outcome}.`;
  }

  if (scenario === 'bulkhead') {
    const { parallelRequests = 0, summary = {} } = result?.body || {};
    const succeeded = summary.OK ?? 0;
    const rejected = summary.BULKHEAD_FULL ?? 0;
    const other = parallelRequests - succeeded - rejected;
    return `Trong ${parallelRequests} khách cùng gửi yêu cầu một lúc: hệ thống chỉ cho tối đa ${succeeded} người làm trước để giữ ổn định, còn ${rejected} người đến sau được báo bận (HTTP 429) ngay lập tức thay vì làm đơ toàn bộ máy chủ.${other > 0 ? ` Có ${other} lượt trả kết quả khác.` : ''}`;
  }

  if (scenario === 'breaker') {
    const list = Array.isArray(result) ? result : (result ? [result] : []);
    const blocked = list.filter((item) => item?.body?.outcome === 'CIRCUIT_OPEN' && item?.body?.attempts === 0).length;
    const probes = list.slice(6);
    if (probes.length === 2 && probes.every((item) => item?.body?.outcome === 'OK') && breaker === 'CLOSED') {
      return 'Cả 2 lượt thử thăm dò đều thành công! Cầu dao đã đóng lại như bình thường và cho các lượt mới đi qua.';
    }
    if (probes.length === 2) {
      const successful = probes.filter((item) => item?.body?.outcome === 'OK').length;
      return `Có ${successful}/2 lượt thăm dò thành công.${breaker ? ` Trạng thái hiện tại là ${breaker}.` : ''}`;
    }
    const summaryText = blocked > 0
      ? `Sau 5 lần lỗi liên tiếp, cầu dao đã ngắt (OPEN) và chặn đứng ngay lập tức ${blocked} lượt gọi tiếp theo tại Order Service mà không gửi tốn công sang User Service.`
      : 'Chưa ghi nhận lượt nào bị Circuit Breaker chặn.';
    return breaker ? `${summaryText} Trạng thái hiện tại: ${breaker}.` : summaryText;
  }

  if (scenario === 'converge') {
    const list = Array.isArray(result) ? result : [];
    if (list.length < 4) return 'Kịch bản đang chạy qua từng bước. Vui lòng chờ hoàn tất…';
    const [bulk, retry, hang, open, heal] = list;
    const counts = bulk?.body?.summary ?? {};
    let text = `Trọn vẹn 5 bước kết hợp: (1) Bulkhead giữ nhịp chỉ nhận ${counts.OK ?? 0} và chặn bớt ${counts.BULKHEAD_FULL ?? 0} lượt thừa; (2) Retry tự thử lại 3 lần cứu lỗi chập chờn; (3) Timeout ngắt cuộc gọi bị treo và cầu dao tự bung OPEN; (4) Chặn ngay các lượt sau trong ${open?.measuredMs ?? 14}ms để bảo vệ máy chủ.`;
    if (heal) {
      text += ` (5) Khi User Service khỏe lại, hệ thống tự thăm dò và phục hồi bình thường (HTTP 200 OK).`;
    }
    return text;
  }

  const list = Array.isArray(result) ? result : [result];
  const [off, on] = list;
  if (!on) return 'Đã có kết quả khi TẮT dự phòng. Đang chạy tiếp trường hợp BẬT dự phòng…';
  if (off?.status >= 400 && on?.body?.outcome === 'FALLBACK' && on?.body?.user) {
    return `Khi TẮT dữ liệu dự phòng, người dùng nhận trang báo lỗi HTTP ${off.status}. Khi BẬT dự phòng, app vẫn trả về thông tin tạm “${on.body.user.name}” để màn hình không bị lỗi trắng.`;
  }
  return `Khi tắt dự phòng: ${off?.body?.outcome}. Khi bật dự phòng: ${on?.body?.outcome}.`;
}

function describeProcess(scenario, result, breaker) {
  if (!result) return [];
  switch (scenario) {
    case 'normal':
      if (result?.status !== 200 || !result?.body?.user) return [];
      return [
        'Order Service lấy thông tin đơn hàng từ cơ sở dữ liệu.',
        'Order Service gọi sang User Service để lấy tên và địa chỉ của khách hàng.',
        'Order Service ghép dữ liệu đơn hàng + khách hàng và trả về cho màn hình.',
      ];
    case 'timeout': {
      const list = Array.isArray(result) ? result : [];
      if (list.length < 2) return [];
      return [
        'Thí nghiệm cố tình làm cho User Service xử lý chậm 4 giây mới trả lời.',
        'Ở tầng mạng (Feign 3s / RestClient 2.5s): Đây là giới hạn ta đặt cho MỘT lần gửi HTTP qua mạng. Nếu mạng hoặc đối tác kẹt lâu hơn ngưỡng này, kết nối sẽ tự ngắt.',
        'Ở tầng ứng dụng (TimeLimiter 1.5s): Đây là tổng thời gian tối đa ta cho phép cả nghiệp vụ được chờ. Lưu ý: các mốc 3s, 2.5s, 1.5s là do mình tự cài để minh họa cách 2 tầng phối hợp — KHÔNG dùng để thi xem thư viện nào nhanh hơn.',
      ];
    }
    case 'retry': {
      const list = Array.isArray(result) ? result : [result];
      const firstBody = list[0]?.body;
      if (!firstBody?.attemptResults?.length) return [];
      return [
        'User Service được giả lập bị lỗi tạm thời (HTTP 500) ở 2 lần gọi đầu tiên rồi tự hết ở lần thứ 3.',
        'Cả Resilience4j Retry lẫn Spring Retry đều giữ người dùng chờ trong âm thầm: gặp lỗi lần 1 nghỉ 500ms rồi gọi lại; lỗi lần 2 nghỉ tiếp 1.000ms rồi gọi lại lần 3.',
        'Ở lần thứ 3, User Service đã khỏe lại và trả dữ liệu thành công (HTTP 200 OK).',
      ];
    }
    case 'bulkhead':
      return [
        'Gửi 10 yêu cầu ập đến cùng một lúc (mỗi yêu cầu mất 2 giây xử lý).',
        'Bulkhead tạo ra đúng 3 "chỗ trống" (slot). 3 người vào trước lấy được chỗ để xử lý; 7 người đến sau thấy hết chỗ liền nhận thông báo bận (HTTP 429) ngay trong vài mili-giây, giúp máy chủ không bị treo đơ toàn bộ.',
      ];
    case 'breaker': {
      const list = Array.isArray(result) ? result : (result ? [result] : []);
      const blocked = list.findIndex((item) => item?.body?.outcome === 'CIRCUIT_OPEN' && item?.body?.attempts === 0);
      const firstFiveFailed = list.length >= 5 && list.slice(0, 5).every((item) => item?.body?.outcome === 'UPSTREAM_5XX');
      const steps = [firstFiveFailed && blocked === 5
        ? '5 lượt đầu đi qua bình thường và đều gặp lỗi (100% lỗi, vượt ngưỡng cho phép 50%). Cầu dao tự động chuyển sang trạng thái NGẮT MẠCH (OPEN).'
        : 'Circuit Breaker theo dõi kết quả các cuộc gọi gần đây (5 cuộc gọi gần nhất). Nếu có từ 50% lỗi trở lên, cầu dao sẽ ngắt.'];
      if (blocked >= 0) steps.push(`Lượt thứ ${blocked + 1} đến khi cầu dao đã ngắt: Order Service từ chối ngay tại chỗ (HTTP 503) với 0 lần gọi sang User Service.`);
      if (blocked >= 0) steps.push('Sau khoảng 10 giây nghỉ, cầu dao tự chuyển sang trạng thái thử (HALF-OPEN) để kiểm tra xem User Service đã sống lại chưa.');
      if (list.length === 8 && list.slice(6).every((item) => item?.body?.outcome === 'OK') && breaker === 'CLOSED') {
        steps.push('Sau khi bật lại User Service, 2 lượt thăm dò đều nhận HTTP 200 OK nên cầu dao đóng lại bình thường (CLOSED).');
      }
      return steps;
    }
    case 'converge': {
      const list = Array.isArray(result) ? result : [];
      if (list.length < 4) return [];
      return [
        'Pha 1 · Lọc bớt tải (Bulkhead): Có 6 lượt đến cùng lúc nhưng chỉ cho phép 3 lượt làm cùng lúc. 3 lượt thừa bị từ chối ngay (429) để giữ máy chủ không bị kẹt.',
        'Pha 2 · Tự thử lại (Retry): Gặp lỗi nhỏ 2 lần đầu, hệ thống tự thử lại lần 3 và lấy được dữ liệu (200 OK).',
        'Pha 3 · Cắt treo & Ngắt cầu dao (Timeout + Circuit Breaker): Khi User Service bị treo 3 giây, Timeout ngắt sau 1 giây để không chờ mãi, đồng thời cầu dao nhận thấy lỗi nhiều nên ngắt mạch (OPEN).',
        'Pha 4 · Từ chối nhanh khi đối tác đang sập (Fail-Fast): Lúc mạch đã mở OPEN, lượt gọi mới bị chặn ngay trong ~14ms (HTTP 503, 0 lần gọi qua mạng). Retry cũng tự dừng lại chứ không cố thử lại vô ích.',
        list[4] ? 'Pha 5 · Tự hồi phục (Self-Healing): Khi User Service hoạt động trở lại, hệ thống tự gửi 1 lượt dò đường thành công (200 OK) và mở thông mạch trở lại.' : '',
      ].filter(Boolean);
    }
    case 'fallback': {
      const list = Array.isArray(result) ? result : [result];
      if ((list[0]?.status ?? 200) < 400 || list[1]?.body?.outcome !== 'FALLBACK') return [];
      return [
        'User Service bị giả lập lỗi toàn bộ.',
        'Khi TẮT Fallback: lỗi sẽ trả thẳng về giao diện người dùng (HTTP 500/503).',
        'Khi BẬT Fallback: thay vì hiện trang lỗi trắng, hệ thống trả về dữ liệu khách hàng tạm ("Khách dự phòng") với HTTP 200 để trải nghiệm không bị đứt đoạn.',
      ];
    }
    default:
      return [];
  }
}

function CompareMatrix({ scenario }) {
  const comp = comparisons[scenario];
  if (!comp) {
    return (
      <div className="table-frame" tabIndex={0} role="region" aria-label="So sánh">
        <p className="note">Chủ đề này không thuộc 4 chủ đề Resilience cốt lõi cần đối chiếu so sánh.</p>
      </div>
    );
  }

  return (
    <div className="compare-matrix-container">
      <div className="compare-matrix-header">
        <div className="compare-title">
          <Activity size={18} />
          <h4>{comp.title}</h4>
        </div>
        <div className="compare-warning-callout">
          <AlertTriangle size={18} />
          <span>{comp.warning}</span>
        </div>
      </div>

      <div className="table-frame" tabIndex={0} role="region" aria-label={comp.title}>
        <table className="result-table compare-table">
          <thead>
            <tr>
              <th scope="col" style={{ width: '22%' }}>Tiêu chí so sánh</th>
              <th scope="col" style={{ width: '28%' }} className="col-protected">
                <span className="badge-pill protected">🛡️ CÓ BẢO VỆ (Resilience Active)</span>
              </th>
              <th scope="col" style={{ width: '28%' }} className="col-unprotected">
                <span className="badge-pill unprotected">⚠️ KHÔNG BẢO VỆ (Sự cố sập)</span>
              </th>
              <th scope="col" style={{ width: '22%' }}>Đánh giá & Bản chất kỹ thuật</th>
            </tr>
          </thead>
          <tbody>
            {comp.rows.map((row, idx) => (
              <tr key={idx}>
                <th scope="row">
                  <strong>{row.criterion}</strong>
                </th>
                <td className="cell-protected">
                  <span className="text-protected">{row.protectedVal}</span>
                </td>
                <td className="cell-unprotected">
                  <span className="text-unprotected">{row.unprotectedVal}</span>
                </td>
                <td>
                  <small className="impact-text">{row.impact}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UnprotectedTable({ scenario, result }) {
  if (scenario === 'retry') {
    const first = Array.isArray(result) ? result[0] : result;
    const { body = {}, status, measuredMs } = first || {};
    return (
      <>
        <div className="unprotected-danger-banner">
          <AlertTriangle size={18} />
          <div>
            <strong>HẬU QUẢ KHI THIẾU RETRY:</strong>
            <p>User Service chỉ bị lỗi tạm thời ở lần gọi đầu tiên. Vì không cài cơ chế tự thử lại, Order Service bỏ cuộc ngay và ném thẳng lỗi HTTP 500 về cho người dùng!</p>
          </div>
        </div>
        <div className="table-frame" tabIndex={0} role="region" aria-label="Bảng kết quả không có Retry">
          <table className="result-table">
            <thead>
              <tr>
                <th scope="col">Lượt thử</th>
                <th scope="col">HTTP</th>
                <th scope="col">Kết quả</th>
                <th scope="col">Thời gian</th>
                <th scope="col">Số lần gọi User</th>
                <th scope="col">Khách hàng</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">
                  Tra cứu khách hàng (Không có Retry)
                  <small style={{ display: 'block', color: '#ef4444', fontWeight: 600, marginTop: '2px' }}>
                    💥 Gặp lỗi lần 1 là hỏng luôn
                  </small>
                </th>
                <td><span className="http-code http-error">{status ?? 500}</span></td>
                <td><strong style={{ color: '#ef4444' }}>User Service báo lỗi 5xx</strong></td>
                <td className="numeric">{milliseconds(measuredMs ?? body?.elapsedMs)}</td>
                <td className="numeric" style={{ color: '#ef4444', fontWeight: 'bold' }}>1 (Không thử lại)</td>
                <td><span style={{ color: '#ef4444' }}>— (Hủy đơn hàng)</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    );
  }

  if (scenario === 'timeout') {
    const r = Array.isArray(result) ? result[0] : result;
    const { status, measuredMs, body = {} } = r || {};
    return (
      <>
        <div className="unprotected-danger-banner">
          <AlertTriangle size={18} />
          <div>
            <strong>HIỂM HỌA KHI KHÔNG ĐẶT TIMEOUT:</strong>
            <p>User Service bị chậm 4 giây. Vì không có giới hạn chờ (Timeout), luồng xử lý bên Order Service cũng bị đứng im chờ hết 4 giây. Nếu nhiều người bấm cùng lúc, máy chủ sẽ cạn sạch luồng và đơ cứng!</p>
          </div>
        </div>
        <div className="table-frame" tabIndex={0} role="region" aria-label="Bảng kết quả không có Timeout">
          <table className="result-table">
            <thead>
              <tr>
                <th scope="col">Lượt thử</th>
                <th scope="col">HTTP</th>
                <th scope="col">Kết quả</th>
                <th scope="col">Thời gian</th>
                <th scope="col">Số lần gọi User</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">
                  Gọi thẳng User Service (Không Timeout)
                  <small style={{ display: 'block', color: '#f59e0b', fontWeight: 600, marginTop: '2px' }}>
                    ⏳ Giữ chết 1 luồng xử lý suốt 4 giây
                  </small>
                </th>
                <td><span className="http-code http-ok">{status ?? 200}</span></td>
                <td><strong>Nhận được dữ liệu (nhưng mất 4 giây chờ)</strong></td>
                <td className="numeric" style={{ color: '#ef4444', fontWeight: 'bold' }}>{milliseconds(measuredMs ?? body?.elapsedMs ?? 4016)}</td>
                <td className="numeric">1</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    );
  }

  if (scenario === 'bulkhead') {
    const { body = {}, status } = result || {};
    return (
      <>
        <div className="unprotected-danger-banner">
          <AlertTriangle size={18} />
          <div>
            <strong>CẠN KIỆT LUỒNG XỬ LÝ DO THIẾU BULKHEAD:</strong>
            <p>10 người cùng bấm một lúc. Vì không có giới hạn số chỗ (Bulkhead 3 chỗ), cả 10 người đều ùa vào chiếm hết 10/10 luồng làm việc của máy chủ trong 2 giây. Các chức năng quan trọng khác (tạo đơn, thanh toán) bị đơ theo!</p>
          </div>
        </div>
        <div className="table-frame" tabIndex={0} role="region" aria-label="Bảng kết quả không có Bulkhead">
          <table className="result-table">
            <caption>10 lượt cùng lúc · HTTP {status} · {milliseconds(body?.totalMs)} (Chiếm hết 10/10 luồng)</caption>
            <thead>
              <tr>
                <th scope="col">Kết quả từng lượt</th>
                <th scope="col">Số lượt</th>
                <th scope="col">Tác động tới máy chủ</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Nhận vào xử lý hết nhưng đơ 2 giây</th>
                <td className="numeric">10 / 10</td>
                <td><strong style={{ color: '#ef4444' }}>Chiếm sạch 10/10 luồng suốt 2.000ms 🚨</strong></td>
              </tr>
              <tr>
                <th scope="row">Lượt bị chặn báo bận để bảo vệ (429)</th>
                <td className="numeric">0 / 10</td>
                <td><span style={{ color: '#ef4444' }}>Không chặn bớt lượt nào (Không có Bulkhead)</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        {body?.requestResults && <CallDetails rows={body.requestResults} />}
      </>
    );
  }

  if (scenario === 'breaker') {
    const responses = Array.isArray(result) ? result : (result ? [result] : []);
    return (
      <>
        <div className="unprotected-danger-banner">
          <AlertTriangle size={18} />
          <div>
            <strong>HẬU QUẢ KHI THIẾU CIRCUIT BREAKER (CẦU DAO NGẮT):</strong>
            <p>User Service đã hỏng 100%, nhưng vì không có cầu dao tự ngắt, Order Service vẫn cố gửi cả 6 cuộc gọi qua mạng. Vừa tốn thời gian chờ, vừa làm dịch vụ hỏng càng quá tải thêm!</p>
          </div>
        </div>
        <div className="table-frame" tabIndex={0} role="region" aria-label="Bảng kết quả không có Circuit Breaker">
          <table className="result-table">
            <thead>
              <tr>
                <th scope="col">Lượt thử</th>
                <th scope="col">HTTP</th>
                <th scope="col">Kết quả</th>
                <th scope="col">Thời gian</th>
                <th scope="col">Số lần gọi User</th>
              </tr>
            </thead>
            <tbody>
              {responses.map((item, index) => {
                const { body = {}, status, measuredMs } = item || {};
                return (
                <tr key={index}>
                  <th scope="row">
                    Lượt {index + 1}/6 (Không tự ngắt)
                    {index === 5 && (
                      <small style={{ display: 'block', color: '#ef4444', fontWeight: 600, marginTop: '2px' }}>
                        💥 Vẫn cố gửi qua mạng sang User Service đang hỏng
                      </small>
                    )}
                  </th>
                  <td><span className="http-code http-error">{status ?? 500}</span></td>
                  <td><strong style={{ color: '#ef4444' }}>User Service báo lỗi 5xx</strong></td>
                  <td className="numeric">{milliseconds(measuredMs ?? body?.elapsedMs)}</td>
                  <td className="numeric" style={{ color: '#ef4444', fontWeight: 'bold' }}>{body?.attempts ?? 1} (Gọi thật)</td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return <ResultTable scenario={scenario} result={result} />;
}

export default function DemoResults({ scenario, result, breaker, busy, error, view, onViewChange, scenarioMode = 'protected' }) {
  if (scenarioMode === 'compare') {
    return <CompareMatrix scenario={scenario} />;
  }

  if (scenarioMode === 'unprotected') {
    if (!result) {
      return (
        <div className="empty" role="status">
          <AlertTriangle size={20} />
          {busy ? 'Đang chạy kịch bản không bảo vệ…' : 'Bấm nút "Chạy KHÔNG bảo vệ" ở trên để quan sát sự cố thực tế.'}
        </div>
      );
    }
    const payload = Array.isArray(result) ? result.map((item) => item?.body ?? item) : result?.body;
    return (
      <>
        <div className="result-toolbar">
          <div className="view-switch" role="group" aria-label="Định dạng kết quả">
            <button type="button" aria-pressed={view === 'table'} onClick={() => onViewChange('table')}><Table2 size={15} /> Bảng</button>
            <button type="button" aria-pressed={view === 'json'} onClick={() => onViewChange('json')}><FileJson size={15} /> JSON</button>
          </div>
          <span className="unprotected-badge-indicator">⚠️ CHẾ ĐỘ: KHÔNG CÓ BẢO VỆ</span>
        </div>
        {view === 'table' ? (
          <UnprotectedTable scenario={scenario} result={result} />
        ) : (
          <pre className="json-response" tabIndex={0} aria-label="Nội dung JSON từ API">{JSON.stringify(payload, null, 2)}</pre>
        )}
      </>
    );
  }

  if (!result) return <div className="empty" role="status"><Activity size={20} />{busy ? 'Đang chờ phản hồi…' : 'Chạy kịch bản để xem kết quả.'}</div>;

  const payload = Array.isArray(result) ? result.map((item) => item?.body ?? item) : result?.body;
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
