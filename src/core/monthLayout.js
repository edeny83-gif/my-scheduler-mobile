// 월간 달력 배치 계산 (화면 그리기와 분리 → 폰·폴드·위젯·테스트에서 같이 씀)
const { sod, addDays, dayDiff, ymd, spanOf } = require('./dates');

/**
 * @returns {{ weeks: Array<{ days: number[], segs: Array<{e,a,b,lane,contL,contR}>, lanes: number, singles: Array<Array>, hidden: number[] }> }}
 */
function buildMonth(viewMs, items, { maxLanes = 3 } = {}) {
  const first = new Date(viewMs);
  first.setDate(1); first.setHours(0, 0, 0, 0);
  const offset = first.getDay();
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const weeksCount = Math.ceil((offset + daysInMonth) / 7);
  const gridStart = addDays(first.getTime(), -offset);
  const all = items.map((e) => ({ ...e, ...spanOf(e) }));

  const weeks = [];
  for (let w = 0; w < weeksCount; w++) {
    const weekStart = addDays(gridStart, w * 7);
    const days = [...Array(7)].map((_, i) => addDays(weekStart, i));
    const weekEnd = days[6];
    const multis = all
      .filter((e) => e.multi && e.first <= weekEnd && e.last >= weekStart)
      .sort((x, y) => x.first - y.first || (y.last - y.first) - (x.last - x.first));
    const laneEnd = [];
    const hidden = Array(7).fill(0);
    const segs = [];
    for (const e of multis) {
      const a = Math.max(0, dayDiff(weekStart, e.first));
      const b = Math.min(6, dayDiff(weekStart, e.last));
      let lane = laneEnd.findIndex((end) => end < a);
      if (lane < 0) { lane = laneEnd.length; laneEnd.push(b); } else laneEnd[lane] = b;
      if (lane < maxLanes) segs.push({ e, a, b, lane, contL: e.first < weekStart, contR: e.last > weekEnd });
      else for (let i = a; i <= b; i++) hidden[i]++;
    }
    const singles = days.map((d) => all
      .filter((e) => !e.multi && e.first === d)
      .sort((x, y) => (y.allDay - x.allDay) || (x.start - y.start)));
    weeks.push({ days, segs, lanes: Math.min(laneEnd.length, maxLanes), singles, hidden });
  }
  return { month: first.getMonth(), year: first.getFullYear(), weeks };
}

/** 특정 날짜에 걸친 일정 (목록용) */
function itemsOnDay(dayMs, items) {
  const d = sod(dayMs);
  return items
    .map((e) => ({ ...e, ...spanOf(e) }))
    .filter((e) => e.first <= d && e.last >= d)
    .sort((x, y) => (y.allDay - x.allDay) || (x.start - y.start));
}

/** 오늘부터 다가오는 일정 (위젯용) */
function upcoming(items, fromMs, limit = 6) {
  const t = sod(fromMs);
  return items
    .map((e) => ({ ...e, ...spanOf(e) }))
    .filter((e) => e.last >= t)
    .sort((x, y) => x.start - y.start)
    .slice(0, limit);
}

const holidayMap = (list, withObservances) => {
  const m = new Map();
  for (const h of list || []) {
    if (!h.holiday && !withObservances) continue;
    if (!m.has(h.date)) m.set(h.date, []);
    m.get(h.date).push(h);
  }
  return m;
};

module.exports = { buildMonth, itemsOnDay, upcoming, holidayMap, ymd };
