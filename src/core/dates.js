// 날짜 도우미 (플랫폼 공통: 폰·PC·아이폰에서 같이 씀)
const pad = (n) => String(n).padStart(2, '0');
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const DAY = 86_400_000;

const sod = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (ms, n) => { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); };
const addMonths = (ms, n) => { const d = new Date(ms); d.setDate(1); d.setMonth(d.getMonth() + n); return d.getTime(); };
const dayDiff = (a, b) => Math.round((sod(b) - sod(a)) / DAY);
const ymd = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const monthStart = (ms) => { const d = new Date(sod(ms)); d.setDate(1); return d.getTime(); };
const dayLabel = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; };

function parseYmd(s) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d.getTime() : null;
}
function parseHm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return [Number(m[1]), Number(m[2])];
}
const atTime = (dayMs, [h, mi]) => { const d = new Date(dayMs); d.setHours(h, mi, 0, 0); return d.getTime(); };

/** 일정의 첫날/마지막 날(자정 기준). 종일 일정의 end는 "마지막 날 00:00(포함)" */
function spanOf(e) {
  const first = sod(e.start);
  const lastRaw = e.allDay ? sod(e.end ?? e.start) : sod(e.end && e.end > e.start ? e.end - 1 : e.start);
  const last = Math.max(first, lastRaw);
  return { first, last, multi: last > first };
}

module.exports = { pad, DOW, DAY, sod, addDays, addMonths, dayDiff, ymd, hm, monthStart, dayLabel, parseYmd, parseHm, atTime, spanOf };
