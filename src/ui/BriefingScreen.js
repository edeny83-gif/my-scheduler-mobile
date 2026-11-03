// 📋 브리핑: PC의 Claude가 이음톡 쪽지 등을 정리해 저장한 "오늘 처리할 일" 글을 날짜별로 읽는다
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { briefings, parseBriefing } from '../core/briefing';
import { Btn, Chip } from './common';
import { DOW, sod } from '../core/dates';

const dayText = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()}`; };

function Parts({ t, parts, base }) {
  return parts.map((p, i) => {
    if (p.k === 'bold') return <Text key={i} style={{ fontWeight: '700' }}>{p.v}</Text>;
    if (p.k === 'tag') {
      const bg = p.tone === 'todo' ? '#ff9e9e' : p.tone === 'done' ? '#a8f0b8' : t.c.panel2;
      const fg = p.tone ? '#152030' : t.c.text;
      return <Text key={i} style={{ backgroundColor: bg, color: fg, fontSize: base * 0.82, fontWeight: '700' }}>{` ${p.v} `}</Text>;
    }
    return <Text key={i}>{p.v}</Text>;
  });
}

export default function BriefingScreen({ t, items, initialId, onShowDay, onEdit }) {
  const list = briefings(items);
  const [id, setId] = useState(initialId || null);
  useEffect(() => { if (initialId) setId(initialId); }, [initialId]);
  const cur = list.find((e) => e.id === id) || list[0] || null;
  const base = t.fs(14.5);
  const color = { h1: t.c.text, h2: '#d4b8ff', h3: '#d4b8ff' };

  if (!cur) {
    return (
      <View style={{ flex: 1, padding: 20, gap: 8 }}>
        <Text style={{ color: t.c.text, fontSize: t.fs(18), fontWeight: '300', fontFamily: t.font }}>📋 브리핑</Text>
        <Text style={{ color: t.c.muted, fontSize: t.fs(14), lineHeight: t.fs(22), fontFamily: t.font }}>
          아직 브리핑이 없어요.{'\n'}PC의 Claude에게 <Text style={{ fontWeight: '700', color: t.c.text }}>/이음톡정리</Text>라고 하면 이음톡 쪽지를 정리해서 여기에 브리핑을 만들어 줘요.
        </Text>
      </View>
    );
  }
  const d = new Date(cur.start);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 6, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={{ color: t.c.text, fontSize: t.fs(18), fontWeight: '300', fontFamily: t.font }}>📋 브리핑</Text>
          <Text style={{ color: t.c.muted, fontSize: t.fs(13), fontFamily: t.font }}>{`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} (${DOW[d.getDay()]})`}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ flexGrow: 0 }}>
          {list.slice(0, 14).map((e) => <Chip key={e.id} t={t} label={dayText(e.start)} on={e.id === cur.id} onPress={() => setId(e.id)} />)}
        </ScrollView>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 6 }}>
        {parseBriefing(cur.memo).map((b, i) => {
          if (b.type === 'li') {
            return (
              <View key={i} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
                <Text style={{ color: t.c.muted, fontSize: base }}>•</Text>
                <Text style={{ flex: 1, color: t.c.text, fontSize: base, lineHeight: base * 1.5, fontFamily: t.font }}><Parts t={t} parts={b.parts} base={base} /></Text>
              </View>
            );
          }
          const head = b.type !== 'p';
          return (
            <Text key={i} style={{ color: head ? color[b.type] : t.c.text, fontSize: head ? (b.type === 'h1' ? t.fs(17) : base) : base, fontWeight: head ? '700' : '400', lineHeight: base * 1.5, marginTop: head && b.type !== 'h1' ? 12 : 0, fontFamily: t.font }}>
              <Parts t={t} parts={b.parts} base={base} />
            </Text>
          );
        })}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderColor: t.c.line }}>
        <Btn t={t} small label="이 날 일정 보기" onPress={() => onShowDay(sod(cur.start))} />
        <Btn t={t} small kind="ghost" label="일정으로 열기·지우기" onPress={() => onEdit(cur)} />
      </View>
    </View>
  );
}
