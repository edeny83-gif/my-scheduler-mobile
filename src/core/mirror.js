'use strict';
// 폰 공용 캘린더 복사본 맞추기 — 순수 로직(React·Node 기능 없음, PC와는 무관).
// 이 앱의 일정(원본)을 폰의 공용 캘린더(삼성·구글 캘린더가 함께 쓰는 곳)에 어떻게 옮겨 적을지 정한다.
// 실제 쓰기는 services/deviceCalendar.js가 한다.

const DAY = 86_400_000;
/** 지난 일정은 이만큼만 복사한다(다른 앱이 최근 몇 주를 보는 데 충분, 처음 맞출 때 너무 오래 걸리지 않게). */
const PAST_WINDOW = 400 * DAY;
/** "제목도 함께 저장"을 끈 경우 제목 대신 쓰는 말 */
const PLACEHOLDER = '일정';

/** ms 시각이 속한 이 기기 날짜의 UTC 자정(+addDays일) — 안드로이드 종일 일정은 UTC 자정으로 적어야 날짜가 밀리지 않는다 */
function utcMidnightOf(ms, addDays = 0) {
  const d = new Date(ms);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + addDays);
}

/**
 * 이 앱의 일정 → 폰 캘린더에 적을 내용.
 * 종일: 이 앱은 end = 마지막 날 00:00(포함)이고, 안드로이드는 [첫날, 마지막 날 다음날) UTC 자정이다.
 * 시간 일정: end가 없으면 시작과 같게(길이 0) 적는다.
 */
function toDeviceEvent(ev, { withTitles = false } = {}) {
  const title = withTitles ? String(ev.title || PLACEHOLDER) : PLACEHOLDER;
  if (ev.allDay) {
    const last = ev.end != null && ev.end > ev.start ? ev.end : ev.start;
    return { title, allDay: true, startDate: utcMidnightOf(ev.start), endDate: utcMidnightOf(last, 1), timeZone: 'UTC' };
  }
  const end = ev.end != null && ev.end >= ev.start ? ev.end : ev.start;
  return { title, allDay: false, startDate: ev.start, endDate: end, timeZone: null };
}

/** 내용이 바뀌었는지 비교하는 글자 */
const signature = (d) => JSON.stringify([d.title, d.allDay, d.startDate, d.endDate]);

function inWindow(ev, now) {
  const last = ev.end != null ? Math.max(ev.end, ev.start) : ev.start;
  return last >= now - PAST_WINDOW;
}

/**
 * 지난번에 적어 둔 기록(prev: 일정 id → { deviceId, sig })과 지금 일정 목록을 비교해 할 일을 정한다.
 * 반환: { create: [{id, details, sig}], update: [{id, deviceId, details, sig}], remove: [{id, deviceId}], keep: {id: {deviceId, sig}} }
 */
function planMirror(prev, events, { now, withTitles = false }) {
  const create = [];
  const update = [];
  const remove = [];
  const keep = {};
  const wanted = new Set();
  for (const ev of events || []) {
    if (!ev || !ev.id || ev.deleted || !Number.isFinite(ev.start) || !inWindow(ev, now)) continue;
    wanted.add(ev.id);
    const details = toDeviceEvent(ev, { withTitles });
    const sig = signature(details);
    const old = prev && prev[ev.id];
    if (!old) create.push({ id: ev.id, details, sig });
    else if (old.sig !== sig) update.push({ id: ev.id, deviceId: old.deviceId, details, sig });
    else keep[ev.id] = old;
  }
  for (const [id, old] of Object.entries(prev || {})) if (!wanted.has(id)) remove.push({ id, deviceId: old.deviceId });
  return { create, update, remove, keep };
}

module.exports = { PAST_WINDOW, PLACEHOLDER, toDeviceEvent, signature, planMirror };
