import React from 'react';
import { Platform, Pressable, Text, TextInput, View, StyleSheet } from 'react-native';
import { ymd, hm, parseYmd, parseHm } from '../core/dates';

export function Btn({ t, label, onPress, kind = 'normal', disabled, style, small, accessibilityLabel }) {
  const bg = kind === 'primary' ? t.c.accent : kind === 'ghost' ? 'transparent' : t.c.panel2;
  const fg = kind === 'primary' ? t.c.onAccent : kind === 'danger' ? t.c.danger : t.c.text;
  return (
    <Pressable
      onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel || label}
      style={({ pressed }) => [{ backgroundColor: bg, borderRadius: 10, paddingVertical: small ? 6 : 10, paddingHorizontal: small ? 10 : 16, minHeight: small ? 34 : 44, justifyContent: 'center', alignItems: 'center', opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }, style]}
    >
      <Text style={{ color: fg, fontSize: t.fs(small ? 13 : 15), fontWeight: kind === 'primary' ? '700' : '500', fontFamily: t.font }}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ t, label, on, onPress, color }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }}
      style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: on ? (color || t.c.accent) : t.c.line, backgroundColor: on ? (color || t.c.accent) : t.c.panel, minHeight: 34, justifyContent: 'center' }}>
      <Text style={{ color: on ? t.c.onAccent : t.c.text, fontSize: t.fs(13), fontWeight: on ? '700' : '400', fontFamily: t.font }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ t, label, children, hint }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: t.c.muted, fontSize: t.fs(12.5), fontFamily: t.font }}>{label}</Text> : null}
      {children}
      {hint ? <Text style={{ color: t.c.faint, fontSize: t.fs(12), fontFamily: t.font }}>{hint}</Text> : null}
    </View>
  );
}

export function Input({ t, style, ...props }) {
  return (
    <TextInput placeholderTextColor={t.c.faint} {...props}
      style={[{ color: t.c.text, backgroundColor: t.c.panel2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: t.fs(15), fontFamily: t.font, minHeight: 44 }, style]} />
  );
}

/** 날짜·시간 선택: 안드로이드는 시스템 달력/시계, 웹 미리보기는 글자 입력 */
function openPicker(mode, value, onChange) {
  const { DateTimePickerAndroid } = require('@react-native-community/datetimepicker');
  DateTimePickerAndroid.open({ value: new Date(value), mode, is24Hour: true, onChange: (e, d) => { if (e.type === 'set' && d) onChange(d.getTime()); } });
}
export function DateField({ t, value, onChange, style }) {
  if (Platform.OS === 'web') {
    return <Input t={t} style={style} defaultValue={ymd(value)} onEndEditing={(e) => { const v = parseYmd(e.nativeEvent.text); if (v != null) { const d = new Date(value); const n = new Date(v); n.setHours(d.getHours(), d.getMinutes()); onChange(n.getTime()); } }} />;
  }
  return <Btn t={t} style={style} label={ymd(value).replace(/-/g, '. ')} onPress={() => openPicker('date', value, (ms) => { const d = new Date(value); const n = new Date(ms); n.setHours(d.getHours(), d.getMinutes(), 0, 0); onChange(n.getTime()); })} />;
}
export function TimeField({ t, value, onChange, style }) {
  if (Platform.OS === 'web') {
    return <Input t={t} style={style} defaultValue={hm(value)} onEndEditing={(e) => { const v = parseHm(e.nativeEvent.text); if (v) { const n = new Date(value); n.setHours(v[0], v[1], 0, 0); onChange(n.getTime()); } }} />;
  }
  return <Btn t={t} style={style} label={hm(value)} onPress={() => openPicker('time', value, (ms) => { const n = new Date(value); const d = new Date(ms); n.setHours(d.getHours(), d.getMinutes(), 0, 0); onChange(n.getTime()); })} />;
}

export function Stepper({ t, value, min, max, step = 1, format = (v) => String(v), onChange }) {
  const set = (v) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Btn t={t} small label="−" accessibilityLabel="줄이기" onPress={() => set(value - step)} disabled={value <= min} />
      <Text style={{ color: t.c.text, minWidth: 64, textAlign: 'center', fontSize: t.fs(15), fontVariant: ['tabular-nums'], fontFamily: t.font }}>{format(value)}</Text>
      <Btn t={t} small label="+" accessibilityLabel="늘리기" onPress={() => set(value + step)} disabled={value >= max} />
    </View>
  );
}

export function Swatches({ t, value, onChange, colors, allowDefault = true }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      {allowDefault && (
        <Pressable onPress={() => onChange('')} accessibilityLabel="기본색"
          style={{ paddingHorizontal: 10, height: 30, borderRadius: 15, borderWidth: value ? 1 : 2, borderStyle: value ? 'dashed' : 'solid', borderColor: value ? t.c.faint : '#fff', justifyContent: 'center' }}>
          <Text style={{ color: t.c.text, fontSize: t.fs(12) }}>기본</Text>
        </Pressable>
      )}
      {colors.map((col) => (
        <Pressable key={col} onPress={() => onChange(col)} accessibilityLabel={`색 ${col}`}
          style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: col, borderWidth: 2, borderColor: value?.toLowerCase() === col ? '#fff' : 'transparent' }} />
      ))}
    </View>
  );
}

export function Section({ t, title, children, right }) {
  return (
    <View style={{ gap: 12, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.c.line }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: t.c.text, fontSize: t.fs(18), fontWeight: '300', fontFamily: t.font }}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}
