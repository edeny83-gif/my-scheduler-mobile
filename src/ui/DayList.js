import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { itemsOnDay, holidayMap } from '../core/monthLayout';
import { dayLabel, hm, ymd, dayDiff } from '../core/dates';

export default function DayList({ t, day, items, holidays, settings, onOpenItem, onAdd, style }) {
  const list = itemsOnDay(day, items);
  const h = holidayMap(holidays, settings.holidays?.observances).get(ymd(day));
  const evColor = (e) => e.color || (e.readOnly ? settings.google?.color : '') || t.c.event;
  return (
    <View style={[{ gap: 6 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: t.c.text, fontSize: t.fs(15), fontWeight: '600', fontFamily: t.font }}>
          {dayLabel(day)}{h ? <Text style={{ color: h.some((x) => x.holiday) ? t.c.sun : t.c.muted, fontWeight: '400' }}>  {h.map((x) => x.name).join(', ')}</Text> : null}
        </Text>
        <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel="이 날에 일정 추가" hitSlop={8}
          style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: pressed ? t.c.panel2 : t.c.panel })}>
          <Text style={{ color: t.c.text, fontSize: t.fs(16) }}>＋</Text>
        </Pressable>
      </View>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 2 }}>
        {list.length === 0 && (
          <Text style={{ color: t.c.faint, fontSize: t.fs(13), paddingVertical: 8, fontFamily: t.font }}>일정이 없습니다. 날짜를 길게 누르거나 ＋로 추가하세요.</Text>
        )}
        {list.map((e) => (
          <Pressable key={e.id} onPress={() => onOpenItem(e)} accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, backgroundColor: pressed ? t.c.panel2 : 'transparent', minHeight: 44, alignItems: 'center' })}>
            <Text style={{ width: t.fs(92), color: evColor(e), fontSize: t.fs(13), fontVariant: ['tabular-nums'], fontFamily: t.font }}>
              {e.allDay ? (e.multi ? `종일 ${dayDiff(e.first, day) + 1}/${dayDiff(e.first, e.last) + 1}일` : '종일') : `${hm(e.start)}${e.end ? `–${hm(e.end)}` : ''}`}
            </Text>
            <Text numberOfLines={2} style={{ flex: 1, color: t.c.text, fontSize: t.fs(14), fontFamily: t.font }}>
              {e.title}
              {e.location ? <Text style={{ color: t.c.muted }}> · {e.location}</Text> : null}
              {e.source ? <Text style={{ color: t.c.warn, fontSize: t.fs(11.5) }}>  ✦ {e.source === 'ai' ? 'AI' : 'Claude Code'}</Text> : null}
              {e.calendar ? <Text style={{ color: t.c.faint, fontSize: t.fs(11.5) }}>  {e.calendar}</Text> : null}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
