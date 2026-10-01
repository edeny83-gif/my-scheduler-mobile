// 일정 추가·수정·보기 (폰: 전체 화면 / 폴드 펼침: 오른쪽 칸 안에)
import React, { useState } from 'react';
import { Alert, Platform, ScrollView, Switch, Text, View } from 'react-native';
import { Btn, Chip, Field, Input, DateField, TimeField, Swatches } from './common';
import { PALETTE } from './theme';
import { sod, addDays } from '../core/dates';
import { store } from '../storage/store';

const REMIND = [[0, '정시'], [5, '5분'], [10, '10분'], [30, '30분'], [60, '1시간'], [1440, '하루']];
const REMIND_ALLDAY = [[-480, '당일 오전 8시'], [900, '전날 오전 9시'], [2340, '이틀 전 오전 9시']];

function initial(item, day) {
  if (item) {
    return { title: item.title, allDay: !!item.allDay, start: item.start, end: item.end ?? item.start, location: item.location || '', memo: item.memo || '', color: item.color || '', remind: new Set(item.remind || []) };
  }
  const base = sod(day ?? Date.now());
  const now = new Date();
  const h = base === sod(Date.now()) ? Math.min(23, now.getHours() + 1) : 9;
  const start = base + h * 3_600_000;
  return { title: '', allDay: false, start, end: start + 3_600_000, location: '', memo: '', color: '', remind: new Set([10]) };
}

export default function EventEditor({ t, item, day, onClose, embedded }) {
  const ro = !!item?.readOnly;
  const [f, setF] = useState(() => initial(item, day));
  const [err, setErr] = useState('');
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  const save = async () => {
    setErr('');
    if (!f.title.trim()) return setErr('제목을 입력하세요.');
    const start = f.allDay ? sod(f.start) : f.start;
    const end = f.allDay ? sod(f.end) : f.end;
    if (end < start) return setErr(f.allDay ? '종료일이 시작일보다 빠릅니다.' : '종료가 시작보다 빠릅니다.');
    const data = { title: f.title.trim(), start, end, allDay: f.allDay, location: f.location.trim(), memo: f.memo.trim(), color: f.color, remind: [...f.remind], source: item?.source || '' };
    try {
      if (item) await store.update(item.id, data); else await store.add(data);
      onClose(sod(start));
    } catch (e) { setErr(e.message); }
  };
  const del = () => {
    const go = async () => { await store.remove(item.id); onClose(); };
    if (Platform.OS === 'web') { if (confirm(`"${item.title}" 일정을 삭제할까요?`)) go(); return; }
    Alert.alert('일정 삭제', `"${item.title}" 일정을 삭제할까요?`, [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: go }]);
  };
  const toggleRemind = (m) => set({ remind: new Set(f.remind.has(m) ? [...f.remind].filter((x) => x !== m) : [...f.remind, m]) });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: t.c.line }}>
        <Btn t={t} kind="ghost" small label={embedded ? '닫기' : '‹ 뒤로'} onPress={() => onClose()} />
        <Text style={{ color: t.c.text, fontSize: t.fs(16), fontWeight: '600', fontFamily: t.font }}>{ro ? '일정 보기' : item ? '일정 수정' : '일정 추가'}</Text>
        {ro ? <View style={{ width: 60 }} /> : <Btn t={t} kind="primary" small label="저장" onPress={save} />}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        {ro && <Text style={{ color: t.c.muted, fontSize: t.fs(13) }}>{item.calendar} · 보기 전용</Text>}
        <Input t={t} value={f.title} onChangeText={(v) => set({ title: v })} placeholder="일정 제목" editable={!ro} autoFocus={!item}
          style={{ fontSize: t.fs(18), color: f.color || t.c.event }} returnKeyType="done" onSubmitEditing={save} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: t.c.text, fontSize: t.fs(15), fontFamily: t.font }}>하루 종일</Text>
          <Switch value={f.allDay} disabled={ro} onValueChange={(v) => set({ allDay: v, remind: new Set(v ? [-480] : [10]) })} />
        </View>
        <Field t={t} label="시작">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <DateField t={t} value={f.start} style={{ flex: 1 }} onChange={(v) => { const shift = v - f.start; set({ start: v, end: Math.max(v, f.end + shift) }); }} />
            {!f.allDay && <TimeField t={t} value={f.start} style={{ width: 110 }} onChange={(v) => set({ start: v, end: Math.max(v, f.end + (v - f.start)) })} />}
          </View>
        </Field>
        <Field t={t} label="종료">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <DateField t={t} value={f.end} style={{ flex: 1 }} onChange={(v) => set({ end: v })} />
            {!f.allDay && <TimeField t={t} value={f.end} style={{ width: 110 }} onChange={(v) => set({ end: v })} />}
          </View>
        </Field>
        {!ro && f.allDay && (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {[1, 2, 3, 5].map((n) => <Chip key={n} t={t} label={n === 1 ? '하루' : `${n}일간`} on={sod(f.end) === addDays(sod(f.start), n - 1)} onPress={() => set({ end: addDays(sod(f.start), n - 1) })} />)}
          </View>
        )}
        <Input t={t} value={f.location} onChangeText={(v) => set({ location: v })} placeholder="장소" editable={!ro} />
        <Input t={t} value={f.memo} onChangeText={(v) => set({ memo: v })} placeholder="메모" editable={!ro} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
        {!ro && (
          <>
            <Field t={t} label="글자색">
              <Swatches t={t} value={f.color} colors={PALETTE} onChange={(c) => set({ color: c })} />
            </Field>
            <Field t={t} label={f.allDay ? '알림' : '알림 (시작 전)'}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(f.allDay ? REMIND_ALLDAY : REMIND).map(([m, l]) => <Chip key={m} t={t} label={l} on={f.remind.has(m)} onPress={() => toggleRemind(m)} />)}
              </View>
            </Field>
          </>
        )}
        {err ? <Text style={{ color: t.c.danger, fontSize: t.fs(14) }} accessibilityRole="alert">{err}</Text> : null}
        {item && !ro && <Btn t={t} kind="danger" label="이 일정 삭제" onPress={del} style={{ alignSelf: 'flex-start' }} />}
      </ScrollView>
    </View>
  );
}
