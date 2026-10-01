// iCal(.ics) 해석: 반복 일정 펼치기, 공휴일 — PC 버전 feeds.js의 해석 부분과 동일
const ICAL = require('ical.js');
const { ymd, addDays, DAY } = require('./dates');

const HOLIDAY_URL = 'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics';
const normalizeUrl = (u) => String(u || '').trim().replace(/^webcal:\/\//i, 'https://');
const googlePublicUrl = (email) => `https://calendar.google.com/calendar/ical/${encodeURIComponent(email.trim())}/public/basic.ics`;

function expandICS(text, rangeDays = 400) {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try { ICAL.TimezoneService.register(tz); } catch { /* 이미 등록됨 */ }
  }
  const masters = new Map();
  const exceptions = [];
  for (const v of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(v);
    if (ev.isRecurrenceException()) exceptions.push(ev); else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) {
    const m = masters.get(ex.uid);
    if (m) m.relateException(ex); else masters.set(`${ex.uid}#${ex.recurrenceId}`, ex);
  }
  const from = ICAL.Time.fromJSDate(new Date(Date.now() - rangeDays * DAY), false);
  const to = ICAL.Time.fromJSDate(new Date(Date.now() + rangeDays * DAY), false);
  const out = [];
  const push = (item, s, e) => {
    if (String(item.component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED') return;
    const allDay = s.isDate;
    const start = s.toJSDate().getTime();
    let end = e ? e.toJSDate().getTime() : null;
    if (allDay) end = end && end > start ? addDays(end, -1) : start;
    else if (end != null && end < start) end = start;
    out.push({ uid: item.uid, title: item.summary || '(제목 없음)', start, end, allDay, location: item.location || '', memo: item.description || '' });
  };
  for (const ev of masters.values()) {
    if (!ev.startDate) continue;
    if (ev.isRecurring()) {
      const it = ev.iterator();
      let t; let steps = 0;
      while ((t = it.next()) && steps++ < 20_000) {
        if (t.compare(to) > 0) break;
        const d = ev.getOccurrenceDetails(t);
        if (d.endDate && d.endDate.compare(from) < 0) continue;
        push(d.item, d.startDate, d.endDate);
      }
    } else push(ev, ev.startDate, ev.endDate);
  }
  return out;
}

function parseHolidays(text) {
  const list = [];
  for (const o of expandICS(text, 800)) {
    const holiday = !/기념일|observance/i.test(o.memo || '');
    for (let t = o.start; t <= (o.end ?? o.start); t = addDays(t, 1)) list.push({ date: ymd(t), name: o.title, holiday });
  }
  return list;
}

/** 설정 → 받아올 캘린더 목록 */
function sourcesFrom(settings) {
  const s = [];
  if (settings.holidays?.enabled) s.push({ id: 'holidays', kind: 'holidays', name: '대한민국 공휴일', url: HOLIDAY_URL });
  const g = settings.google || {};
  if (g.enabled) {
    const url = normalizeUrl(g.privateUrl) || (g.email ? googlePublicUrl(g.email) : '');
    if (url) s.push({ id: 'google', kind: 'events', name: '구글 캘린더', url, color: g.color });
  }
  for (const c of settings.calendars || []) {
    if (c.enabled === false || !normalizeUrl(c.url)) continue;
    s.push({ id: `cal-${c.id}`, kind: 'events', name: c.name || '외부 캘린더', url: normalizeUrl(c.url), color: c.color });
  }
  return s;
}

module.exports = { expandICS, parseHolidays, sourcesFrom, HOLIDAY_URL };
