// 월간 달력. 오늘 = 연한 흰 바탕, 일정 = 글자색만, 여러 날 일정 = ←── 제목 ──→
import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import { buildMonth, holidayMap } from '../core/monthLayout';
import { DOW, ymd, sod, addMonths, monthStart } from '../core/dates';

export default function MonthView({ t, view, setView, selected, onSelectDay, onAddDay, onOpenItem, items, holidays, settings, onHeaderAction, compactHeader, syncPhase }) {
  const month = useMemo(() => buildMonth(view, items, { maxLanes: settings.maxLanes ?? 3 }), [view, items, settings.maxLanes]);
  const hol = useMemo(() => holidayMap(holidays, settings.holidays?.observances), [holidays, settings.holidays?.observances]);
  const [weekH, setWeekH] = useState(0);
  const [gridW, setGridW] = useState(0);
  const todayKey = ymd(Date.now());

  // 좌우로 밀어서 달 이동
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 60) setView((v) => addMonths(v, g.dx < 0 ? 1 : -1)); },
  })).current;

  const numH = t.fs(22);
  const laneH = t.fs(17);
  const lineH = t.fs(16);
  const evColor = (e) => e.color || (e.readOnly ? settings.google?.color : '') || t.c.event;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 8 }}>
        <Pressable onPress={() => { setView(monthStart(Date.now())); onSelectDay(sod(Date.now())); }} accessibilityRole="button" accessibilityLabel="오늘로 이동"
          style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ color: t.c.text, fontSize: t.fs(compactHeader ? 30 : 38), fontWeight: '200', fontFamily: t.font, fontVariant: ['tabular-nums'] }}>{month.month + 1}</Text>
          <Text style={{ color: t.c.text, fontSize: t.fs(16), fontWeight: '300', marginLeft: 2, fontFamily: t.font }}>월</Text>
          <Text style={{ color: t.c.muted, fontSize: t.fs(13), marginLeft: 8, fontFamily: t.font }}>{month.year}</Text>
          <View accessibilityLabel={`동기화 ${syncPhase || ''}`} style={{ width: 11, height: 11, borderRadius: 6, marginLeft: 8, alignSelf: 'center', backgroundColor: syncPhase === 'online' ? t.c.ok : syncPhase === 'error' ? t.c.danger : syncPhase === 'connecting' || syncPhase === 'offline' ? t.c.warn : t.c.faint }} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {[['‹', '이전 달', () => setView((v) => addMonths(v, -1))], ['오늘', '오늘', () => { setView(monthStart(Date.now())); onSelectDay(sod(Date.now())); }], ['›', '다음 달', () => setView((v) => addMonths(v, 1))]].map(([l, a, fn]) => (
            <Pressable key={a} onPress={fn} accessibilityRole="button" accessibilityLabel={a} hitSlop={6}
              style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: pressed ? t.c.panel2 : 'transparent' })}>
              <Text style={{ color: t.c.text, fontSize: t.fs(l.length > 1 ? 14 : 20), fontFamily: t.font }}>{l}</Text>
            </Pressable>
          ))}
          {onHeaderAction}
        </View>
      </View>

      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: t.c.line, paddingBottom: 4 }}>
        {DOW.map((d, i) => (
          <Text key={d} style={{ flex: 1, paddingLeft: 6, fontSize: t.fs(12), fontFamily: t.font, color: i === 0 ? t.c.sun : i === 6 ? t.c.sat : t.c.muted }}>{d}</Text>
        ))}
      </View>

      <View style={{ flex: 1 }} {...pan.panHandlers} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
        {month.weeks.map((wk, wi) => {
          const cap = weekH ? Math.max(0, Math.floor((weekH - numH - wk.lanes * laneH - 2) / lineH)) : 2;
          return (
            <View key={wi} style={{ flex: 1, flexDirection: 'row', borderBottomWidth: wi < month.weeks.length - 1 ? 1 : 0, borderColor: t.c.line }}
              onLayout={wi === 0 ? (e) => setWeekH(e.nativeEvent.layout.height) : undefined}>
              {wk.days.map((d, i) => {
                const key = ymd(d);
                const other = new Date(d).getMonth() !== month.month;
                const h = hol.get(key);
                const isHol = h?.some((x) => x.holiday);
                const singles = wk.singles[i];
                const hiddenLanes = wk.hidden[i];
                const total = singles.length + hiddenLanes;
                const show = total > cap ? singles.slice(0, Math.max(0, cap - 1)) : singles;
                const more = total - show.length;
                return (
                  <Pressable key={i} onPress={() => onSelectDay(d)} onLongPress={() => onAddDay(d)} delayLongPress={350}
                    accessibilityLabel={`${new Date(d).getMonth() + 1}월 ${new Date(d).getDate()}일${h ? ' ' + h.map((x) => x.name).join(', ') : ''}, 일정 ${total}개`}
                    style={{ flex: 1, margin: 1, borderRadius: 7, overflow: 'hidden', backgroundColor: key === todayKey ? t.c.today : 'transparent', borderWidth: d === selected ? 1 : 0, borderColor: 'rgba(255,255,255,0.45)' }}>
                    <View style={{ height: numH, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, gap: 4, opacity: other ? 0.35 : 1 }}>
                      <Text style={{ fontSize: t.fs(13), fontWeight: '600', fontFamily: t.font, fontVariant: ['tabular-nums'], color: i === 0 || isHol ? t.c.sun : i === 6 ? t.c.sat : t.c.text }}>{new Date(d).getDate()}</Text>
                      {h ? <Text numberOfLines={1} style={{ flex: 1, fontSize: t.fs(10), fontFamily: t.font, color: isHol ? t.c.sun : t.c.faint }}>{h.map((x) => x.name).join(', ')}</Text> : null}
                    </View>
                    <View style={{ height: wk.lanes * laneH }} />
                    <View style={{ paddingHorizontal: 4, opacity: other ? 0.45 : 1 }}>
                      {show.map((e) => (
                        <Text key={e.id} numberOfLines={1} onPress={() => onOpenItem(e)} style={{ height: lineH, fontSize: t.fs(11), lineHeight: lineH, fontFamily: t.font, color: evColor(e) }}>
                          {'· '}{e.title}
                        </Text>
                      ))}
                      {more > 0 ? <Text numberOfLines={1} style={{ fontSize: t.fs(10.5), lineHeight: lineH, color: t.c.muted, fontFamily: t.font }}>+{more}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
              {wk.segs.map(({ e, a, b, lane }) => (
                <Pressable key={`${e.id}-${wi}`} onPress={() => onOpenItem(e)} accessibilityLabel={`${e.title}, 여러 날 일정`}
                  style={{ position: 'absolute', top: numH + lane * laneH, height: laneH, left: `${(a / 7) * 100}%`, width: `${((b - a + 1) / 7) * 100}%`, paddingHorizontal: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Arrow color={evColor(e)} dir="l" />
                  <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: t.fs(11), fontFamily: t.font, color: evColor(e) }}>{e.title}</Text>
                  <Arrow color={evColor(e)} dir="r" />
                </Pressable>
              ))}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** ←──  또는  ──→  (선 + 삼각형 머리) */
function Arrow({ color, dir }) {
  const head = { width: 0, height: 0, borderTopWidth: 4, borderBottomWidth: 4, borderTopColor: 'transparent', borderBottomColor: 'transparent' };
  return (
    <View style={{ flex: 1, minWidth: 8, flexDirection: 'row', alignItems: 'center' }}>
      {dir === 'l' && <View style={{ ...head, borderRightWidth: 6, borderRightColor: color }} />}
      <View style={{ flex: 1, height: 1, backgroundColor: color, opacity: 0.8 }} />
      {dir === 'r' && <View style={{ ...head, borderLeftWidth: 6, borderLeftColor: color }} />}
    </View>
  );
}
