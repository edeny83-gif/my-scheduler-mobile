// 안드로이드 홈 화면 위젯 (react-native-android-widget). 배경색·불투명도·표시 방식은 앱 설정 → 위젯.
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { buildMonth, upcoming, holidayMap } from '../core/monthLayout';
import { ymd, hm, DOW, sod, dayLabel } from '../core/dates';

const rgba = (hex, a) => {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(a * 100) / 100})`;
};

export function CalendarWidget({ events = [], external = [], holidays = [], settings, width = 320, height = 320 }) {
  const w = settings.widget;
  const c = settings.colors;
  const text = w.textColor || c.text;
  const dim = rgba(text, 0.55);
  const items = [...events, ...external];
  const now = Date.now();
  const hol = holidayMap(holidays, settings.holidays?.observances);
  const showMonth = w.mode === 'month' && height >= 250;
  const listCount = Math.max(1, Math.floor((showMonth ? height - 250 : height - 70) / 22));
  const next = upcoming(items, now, listCount);
  const eventDays = new Map();
  for (const e of items) {
    const k = ymd(e.start);
    if (!eventDays.has(k)) eventDays.set(k, e.color || c.event);
  }

  const header = (
    <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: 'match_parent', marginBottom: 6 }}>
      <TextWidget text={showMonth ? `${new Date(now).getMonth() + 1}월` : dayLabel(now)} style={{ fontSize: showMonth ? 20 : 16, color: text, fontWeight: showMonth ? '300' : '600' }} />
      <FlexWidget style={{ flexDirection: 'row' }}>
        <TextWidget text="✦" clickAction="OPEN_URI" clickActionData={{ uri: 'myscheduler://assistant' }} style={{ fontSize: 16, color: '#ffd28a', paddingHorizontal: 8 }} />
        <TextWidget text="＋" clickAction="OPEN_URI" clickActionData={{ uri: 'myscheduler://add' }} style={{ fontSize: 18, color: text, paddingLeft: 8 }} />
      </FlexWidget>
    </FlexWidget>
  );

  let month = null;
  if (showMonth) {
    const m = buildMonth(now, [], { maxLanes: 0 });
    const cellH = Math.max(18, Math.floor((height - 110 - listCount * 22) / (m.weeks.length + 1)));
    month = (
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        <FlexWidget style={{ flexDirection: 'row', width: 'match_parent' }}>
          {DOW.map((d, i) => (
            <TextWidget key={d} text={d} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: i === 0 ? c.sunday : i === 6 ? c.saturday : dim }} />
          ))}
        </FlexWidget>
        {m.weeks.map((wk, wi) => (
          <FlexWidget key={wi} style={{ flexDirection: 'row', width: 'match_parent', height: cellH }}>
            {wk.days.map((d, i) => {
              const k = ymd(d);
              const other = new Date(d).getMonth() !== m.month;
              const isToday = d === sod(now);
              const isHol = hol.get(k)?.some((h) => h.holiday);
              const evColor = eventDays.get(k);
              let color = i === 0 || isHol ? c.sunday : i === 6 ? c.saturday : text;
              if (evColor && !other) color = evColor; // 일정이 있는 날은 그 일정 글자색
              return (
                <FlexWidget key={i} style={{ flex: 1, height: 'match_parent', justifyContent: 'center', alignItems: 'center', borderRadius: 6, backgroundColor: isToday ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0)' }}>
                  <TextWidget text={String(new Date(d).getDate())} style={{ fontSize: 12, color: other ? rgba(text, 0.25) : color, fontWeight: evColor && !other ? '700' : '400' }} />
                </FlexWidget>
              );
            })}
          </FlexWidget>
        ))}
      </FlexWidget>
    );
  }

  const list = (
    <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', marginTop: showMonth ? 6 : 0 }}>
      {next.length === 0 && <TextWidget text="예정된 일정이 없어요" style={{ fontSize: 12, color: dim }} />}
      {next.map((e) => (
        <FlexWidget key={e.id} style={{ flexDirection: 'row', width: 'match_parent', height: 22, alignItems: 'center' }}>
          <TextWidget text={`${new Date(e.start).getMonth() + 1}/${new Date(e.start).getDate()} ${e.allDay ? '종일' : hm(e.start)}`} style={{ fontSize: 11, color: e.color || c.event, width: 78 }} />
          <TextWidget text={e.title} maxLines={1} truncate="END" style={{ fontSize: 12, color: text, flex: 1 }} />
        </FlexWidget>
      ))}
    </FlexWidget>
  );

  return (
    <FlexWidget clickAction="OPEN_APP" style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', padding: 12, borderRadius: 18, backgroundColor: rgba(w.bgColor, w.bgOpacity) }}>
      {header}
      {month}
      {list}
    </FlexWidget>
  );
}
