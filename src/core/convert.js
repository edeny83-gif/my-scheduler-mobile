// AI·외부 도구가 주는 항목(날짜 문자열) ↔ 저장 형식(ms) 변환, 알림 기본값, 중복 판별 — PC 버전과 동일 규칙
const { parseYmd, parseHm, atTime, ymd, hm, sod } = require('./dates');

/** 알림(분). 종일 일정은 00:00 기준: -480 = 당일 오전 8시, 900 = 전날 오전 9시 */
function defaultRemind(kind, allDay) {
  if (allDay) return kind === '마감' ? [900] : [-480];
  return kind === '마감' ? [60] : [30];
}

function itemToEvent(it, { color = '', source = 'ai', fileName = '' } = {}) {
  const title = String(it.title ?? '').trim();
  if (!title) throw new Error('제목이 없습니다');
  const d = parseYmd(it.date);
  if (d == null) throw new Error(`날짜 형식이 올바르지 않습니다: "${it.date}"`);
  let ed = parseYmd(it.endDate);
  if (ed == null || ed < d) ed = d;
  const t = parseHm(it.time);
  const et = parseHm(it.endTime);
  const allDay = it.allDay != null ? !!it.allDay : t == null;
  let start, end;
  if (allDay) { start = d; end = ed; }
  else {
    start = atTime(d, t || [9, 0]);
    if (et) end = atTime(ed, et);
    else if (ed > d) end = atTime(ed, t || [9, 0]);
    else end = start + 3_600_000;
    if (end < start) end = start + 3_600_000;
  }
  const memo = [
    String(it.memo ?? '').trim(),
    it.evidence ? `근거: "${String(it.evidence).trim()}"` : '',
    fileName ? `출처: ${fileName}` : '',
  ].filter(Boolean).join('\n');
  const remind = Array.isArray(it.remind) ? it.remind.map(Number).filter(Number.isInteger) : defaultRemind(it.kind, allDay);
  return { title, start, end, allDay, location: String(it.location ?? '').trim(), memo, color: it.color ?? color, remind, source };
}

function eventToItem(e) {
  const multi = e.end != null && sod(e.end) > sod(e.start);
  return {
    id: e.id, title: e.title, date: ymd(e.start), endDate: multi ? ymd(e.end) : '',
    time: e.allDay ? '' : hm(e.start), endTime: e.allDay || e.end == null ? '' : hm(e.end),
    allDay: !!e.allDay, location: e.location || '', memo: e.memo || '', remind: e.remind || [], color: e.color || '', source: e.source || '',
  };
}

const norm = (s) => String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
function findDuplicate(ev, events) {
  const a = norm(ev.title);
  if (a.length < 2) return null;
  return events.find((x) => {
    if (sod(x.start) !== sod(ev.start)) return false;
    const b = norm(x.title);
    return b.length >= 2 && (a === b || a.includes(b) || b.includes(a));
  }) || null;
}

/** 저장 전 검사·정리 (PC store.js의 clean과 동일) */
function cleanEvent(e) {
  const title = String(e.title ?? '').trim();
  if (!title) throw new Error('제목을 입력하세요');
  const start = Number(e.start);
  if (!Number.isFinite(start)) throw new Error('시작 시각이 올바르지 않습니다');
  const end = e.end == null ? null : Number(e.end);
  if (end != null && (!Number.isFinite(end) || end < start)) throw new Error('종료가 시작보다 빠릅니다');
  return {
    title, start, end, allDay: !!e.allDay,
    location: String(e.location ?? ''), memo: String(e.memo ?? ''),
    color: /^#[0-9a-f]{6}$/i.test(e.color || '') ? e.color : '',
    remind: [...new Set((e.remind || []).map(Number).filter((n) => Number.isInteger(n) && n >= -1440 && n <= 40320))].sort((a, b) => a - b),
    source: ['ai', 'claude-code'].includes(e.source) ? e.source : '',
  };
}

module.exports = { defaultRemind, itemToEvent, eventToItem, findDuplicate, cleanEvent };
