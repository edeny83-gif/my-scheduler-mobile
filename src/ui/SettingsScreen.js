import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, Switch, Text, View } from 'react-native';
import { Btn, Chip, Field, Input, Section, Stepper, Swatches } from './common';
import { FONT_CHOICES, PALETTE } from './theme';
import { settings as settingsStore, DEFAULTS } from '../storage/settings';
import { getKeys, setKey } from '../storage/keys';
import { testKey } from '../core/ai';
import { store } from '../storage/store';
import { feeds } from '../services/feeds';

const BG_CHOICES = ['#16202c', '#1f2430', '#101418', '#2b2f3a', '#243b37', '#3a2d3f'];
const Row = ({ t, label, children, hint }) => (
  <View style={{ gap: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }}>
      <Text style={{ color: t.c.text, fontSize: t.fs(15), flexShrink: 1, fontFamily: t.font }}>{label}</Text>
      {children}
    </View>
    {hint ? <Text style={{ color: t.c.faint, fontSize: t.fs(12), lineHeight: t.fs(17) }}>{hint}</Text> : null}
  </View>
);

export default function SettingsScreen({ t, s, feedStatus }) {
  const save = (patch) => settingsStore.update(patch);
  const setColor = (k, v) => save({ colors: { ...s.colors, [k]: v } });
  const [keys, setKeys] = useState({ gemini: '', claude: '' });
  const [keyInput, setKeyInput] = useState({ gemini: '', claude: '' });
  const [keyMsg, setKeyMsg] = useState({});
  const [dataMsg, setDataMsg] = useState('');
  useEffect(() => { getKeys().then(setKeys); }, []);

  const saveKey = async (p) => {
    await setKey(p, keyInput[p]);
    setKeys(await getKeys());
    setKeyInput((x) => ({ ...x, [p]: '' }));
    setKeyMsg((m) => ({ ...m, [p]: [true, keyInput[p] ? '저장됨 · "연결 확인"으로 시험해 보세요' : '삭제됨'] }));
  };
  const test = async (p) => {
    setKeyMsg((m) => ({ ...m, [p]: [true, '확인 중…'] }));
    try {
      const k = await getKeys();
      if (!k[p]) throw new Error('저장된 키가 없습니다');
      await testKey(p, { fetch, key: k[p], geminiModel: s.ai.geminiModel, claudeModel: s.ai.claudeModel });
      setKeyMsg((m) => ({ ...m, [p]: [true, '연결 성공 · 분석할 준비가 됐습니다'] }));
    } catch (e) { setKeyMsg((m) => ({ ...m, [p]: [false, `연결 실패: ${e.message}`] })); }
  };

  const importFile = async () => {
    try {
      const DocumentPicker = require('expo-document-picker');
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
      if (r.canceled) return;
      const text = Platform.OS === 'web' ? await (await fetch(r.assets[0].uri)).text() : await new (require('expo-file-system').File)(r.assets[0].uri).text();
      const { added, updated } = await store.importData(JSON.parse(text));
      setDataMsg(`가져왔습니다: 새 일정 ${added}개, 갱신 ${updated}개`);
    } catch (e) { setDataMsg(`가져오지 못했습니다: ${e.message}`); }
  };
  const exportFile = async () => {
    try {
      const json = JSON.stringify(store.exportData(), null, 2);
      if (Platform.OS === 'web') { setDataMsg(`${store.list().length}개 일정 (웹 미리보기에서는 공유 불가)`); return; }
      const { File, Paths } = require('expo-file-system');
      const f = new File(Paths.cache, 'events.json');
      if (f.exists) f.delete();
      f.create();
      f.write(json);
      await require('expo-sharing').shareAsync(f.uri, { mimeType: 'application/json', dialogTitle: '일정 내보내기' });
    } catch (e) { setDataMsg(`내보내지 못했습니다: ${e.message}`); }
  };

  const status = (id) => {
    const st = feedStatus?.[id];
    if (!st) return null;
    return <Text style={{ fontSize: t.fs(12), color: st.ok ? t.c.ok : t.c.danger }}>{st.ok ? `불러옴 · ${new Date(st.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : `불러오지 못함: ${st.error}`}</Text>;
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <Section t={t} title="모양">
        <Field t={t} label="글꼴">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {FONT_CHOICES.map(([k, l]) => <Chip key={k} t={t} label={l} on={s.fontFamily === k} onPress={() => save({ fontFamily: k })} />)}
          </View>
        </Field>
        <Row t={t} label="글자 크기"><Stepper t={t} value={s.textScale} min={0.8} max={1.5} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => save({ textScale: v })} /></Row>
        <Field t={t} label="배경색"><Swatches t={t} allowDefault={false} value={s.colors.bg} colors={BG_CHOICES} onChange={(v) => setColor('bg', v)} /></Field>
        <Field t={t} label="일정 기본 글자색"><Swatches t={t} allowDefault={false} value={s.colors.event} colors={PALETTE} onChange={(v) => setColor('event', v)} /></Field>
        <Field t={t} label="강조색 (버튼·선택)"><Swatches t={t} allowDefault={false} value={s.colors.accent} colors={PALETTE} onChange={(v) => setColor('accent', v)} /></Field>
        <Field t={t} label="일요일·공휴일 / 토요일">
          <View style={{ gap: 8 }}>
            <Swatches t={t} allowDefault={false} value={s.colors.sunday} colors={['#ff8f8f', '#ff6b6b', '#ffb3b3', '#f4f7fb']} onChange={(v) => setColor('sunday', v)} />
            <Swatches t={t} allowDefault={false} value={s.colors.saturday} colors={['#90b8ff', '#6b9bff', '#b3ccff', '#f4f7fb']} onChange={(v) => setColor('saturday', v)} />
          </View>
        </Field>
        <Row t={t} label="오늘 칸 진하기"><Stepper t={t} value={Math.round(s.todayOpacity * 100)} min={0} max={50} step={2} format={(v) => `${v}%`} onChange={(v) => save({ todayOpacity: v / 100 })} /></Row>
        <Row t={t} label="장기 일정 최대 줄 수"><Stepper t={t} value={s.maxLanes} min={0} max={5} format={(v) => `${v}줄`} onChange={(v) => save({ maxLanes: v })} /></Row>
        <Btn t={t} kind="ghost" small label="모양 기본값으로" onPress={() => save({ colors: DEFAULTS.colors, textScale: 1, fontFamily: 'default', todayOpacity: DEFAULTS.todayOpacity, maxLanes: 3 })} style={{ alignSelf: 'flex-start' }} />
      </Section>

      {Platform.OS !== 'ios' && (
        <Section t={t} title="홈 화면 위젯">
          <Text style={{ color: t.c.faint, fontSize: t.fs(12.5), lineHeight: t.fs(18) }}>홈 화면을 길게 누름 → 위젯 → "내 캘린더"를 추가하세요. 여기서 바꾼 설정은 바로 반영됩니다.</Text>
          <Field t={t} label="표시 방식">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip t={t} label="달력 + 목록" on={s.widget.mode === 'month'} onPress={() => save({ widget: { ...s.widget, mode: 'month' } })} />
              <Chip t={t} label="목록만" on={s.widget.mode === 'list'} onPress={() => save({ widget: { ...s.widget, mode: 'list' } })} />
            </View>
          </Field>
          <Field t={t} label="배경색"><Swatches t={t} allowDefault={false} value={s.widget.bgColor} colors={[...BG_CHOICES, '#000000', '#ffffff']} onChange={(v) => save({ widget: { ...s.widget, bgColor: v } })} /></Field>
          <Row t={t} label="배경 불투명도" hint="0%면 배경 없이 글자만 떠 있습니다"><Stepper t={t} value={Math.round(s.widget.bgOpacity * 100)} min={0} max={100} step={5} format={(v) => `${v}%`} onChange={(v) => save({ widget: { ...s.widget, bgOpacity: v / 100 } })} /></Row>
          <Field t={t} label="글자색"><Swatches t={t} allowDefault={false} value={s.widget.textColor} colors={['#f4f7fb', '#ffffff', '#1a1a1a', '#ffd28a', '#a8e0ff']} onChange={(v) => save({ widget: { ...s.widget, textColor: v } })} /></Field>
        </Section>
      )}

      <Section t={t} title="캘린더 연동" right={<Btn t={t} small label="새로고침" onPress={() => feeds.refresh()} />}>
        <Row t={t} label="대한민국 공휴일 (대체공휴일 포함)"><Switch value={s.holidays.enabled} onValueChange={(v) => save({ holidays: { ...s.holidays, enabled: v } })} /></Row>
        <Row t={t} label="기념일도 표시"><Switch value={s.holidays.observances} onValueChange={(v) => save({ holidays: { ...s.holidays, observances: v } })} /></Row>
        {status('holidays')}
        <Row t={t} label="구글 캘린더 불러오기"><Switch value={s.google.enabled} onValueChange={(v) => save({ google: { ...s.google, enabled: v } })} /></Row>
        {s.google.enabled && (
          <View style={{ gap: 10 }}>
            <Input t={t} defaultValue={s.google.email} placeholder="구글 아이디 (example@gmail.com)" keyboardType="email-address" autoCapitalize="none" onEndEditing={(e) => save({ google: { ...s.google, email: e.nativeEvent.text.trim() } })} />
            <Input t={t} defaultValue={s.google.privateUrl} placeholder="비공개 iCal 주소 (공개 캘린더가 아니면 필요)" autoCapitalize="none" onEndEditing={(e) => save({ google: { ...s.google, privateUrl: e.nativeEvent.text.trim() } })} />
            <Text style={{ color: t.c.faint, fontSize: t.fs(12), lineHeight: t.fs(17) }}>PC에서 구글 캘린더 → 캘린더 이름 옆 ⋮ → 설정 및 공유 → "iCal 형식의 비공개 주소"를 복사해 넣으세요. 지금은 불러와 보여주기만 합니다.</Text>
            <Swatches t={t} allowDefault={false} value={s.google.color} colors={PALETTE} onChange={(v) => save({ google: { ...s.google, color: v } })} />
            {status('google')}
          </View>
        )}
        <Field t={t} label="외부 캘린더 (iCal 주소)">
          <View style={{ gap: 10 }}>
            {s.calendars.map((c, i) => (
              <View key={c.id} style={{ gap: 8, padding: 10, borderRadius: 10, backgroundColor: t.c.panel }}>
                <Input t={t} defaultValue={c.name} placeholder="이름 (예: 학교 행사)" onEndEditing={(e) => save({ calendars: s.calendars.map((x, j) => (j === i ? { ...x, name: e.nativeEvent.text.trim() } : x)) })} />
                <Input t={t} defaultValue={c.url} placeholder="https://… .ics 또는 webcal://…" autoCapitalize="none" onEndEditing={(e) => save({ calendars: s.calendars.map((x, j) => (j === i ? { ...x, url: e.nativeEvent.text.trim() } : x)) })} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Swatches t={t} allowDefault={false} value={c.color} colors={['#c9a8ff', '#a8f0b8', '#ffb877', '#ff9e9e', '#ffd28a']} onChange={(v) => save({ calendars: s.calendars.map((x, j) => (j === i ? { ...x, color: v } : x)) })} />
                  <Btn t={t} kind="danger" small label="삭제" onPress={() => save({ calendars: s.calendars.filter((_, j) => j !== i) })} />
                </View>
                {status(`cal-${c.id}`)}
              </View>
            ))}
            <Btn t={t} small label="＋ 캘린더 주소 추가" style={{ alignSelf: 'flex-start' }} onPress={() => save({ calendars: [...s.calendars, { id: Math.random().toString(36).slice(2, 10), name: '', url: '', color: '#c9a8ff', enabled: true }] })} />
          </View>
        </Field>
      </Section>

      <Section t={t} title="AI 비서">
        <Text style={{ color: t.c.faint, fontSize: t.fs(12.5), lineHeight: t.fs(18) }}>본인의 API 키가 필요합니다. 키는 폰의 보안 저장소에 암호화되어 저장됩니다. 학교 문서를 보낼 때는 학생 개인정보가 담겼는지 확인하세요.</Text>
        {[['gemini', 'Gemini', '문서·사진·녹음 모두 가능 (녹음은 Gemini만) · aistudio.google.com에서 발급', 'AIza…'], ['claude', 'Claude', '문서·사진·PDF · console.anthropic.com에서 발급', 'sk-ant-…']].map(([p, name, hint, ph]) => (
          <Field key={p} t={t} label={`${name} API 키 ${keys[p] ? '· 저장됨' : '· 없음'}`} hint={hint}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Input t={t} value={keyInput[p]} onChangeText={(v) => setKeyInput((x) => ({ ...x, [p]: v }))} placeholder={keys[p] ? '새 키로 바꾸려면 입력' : ph} secureTextEntry autoCapitalize="none" style={{ flex: 1 }} />
              <Btn t={t} small label="저장" onPress={() => saveKey(p)} />
              <Btn t={t} small label="확인" onPress={() => test(p)} disabled={!keys[p]} />
            </View>
            {keyMsg[p] ? <Text style={{ color: keyMsg[p][0] ? t.c.ok : t.c.danger, fontSize: t.fs(12) }}>{keyMsg[p][1]}</Text> : null}
          </Field>
        ))}
        <Field t={t} label="기본으로 쓸 AI">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip t={t} label="Gemini" on={s.ai.provider === 'gemini'} onPress={() => save({ ai: { ...s.ai, provider: 'gemini' } })} />
            <Chip t={t} label="Claude" on={s.ai.provider === 'claude'} onPress={() => save({ ai: { ...s.ai, provider: 'claude' } })} />
          </View>
        </Field>
        <Field t={t} label="나에 대한 설명 (분석할 때 참고)">
          <Input t={t} defaultValue={s.ai.about} placeholder="예: 초등학교 3학년 담임" onEndEditing={(e) => save({ ai: { ...s.ai, about: e.nativeEvent.text.trim() } })} />
        </Field>
        <Row t={t} label="확인 없이 바로 추가" hint="분석이 끝나면 확실한 일정(지난 날짜·중복·확신 낮음 제외)을 바로 넣고, 되돌릴 수 있습니다"><Switch value={s.ai.autoAdd} onValueChange={(v) => save({ ai: { ...s.ai, autoAdd: v } })} /></Row>
        <Row t={t} label="자동 선택 기준 (AI 확신도)"><Stepper t={t} value={Math.round(s.ai.minConfidence * 100)} min={30} max={95} step={5} format={(v) => `${v}%`} onChange={(v) => save({ ai: { ...s.ai, minConfidence: v / 100 } })} /></Row>
        <Field t={t} label="AI가 넣은 일정 글자색"><Swatches t={t} value={s.ai.color} colors={PALETTE} onChange={(v) => save({ ai: { ...s.ai, color: v } })} /></Field>
        <Field t={t} label="모델 이름 (고급)" hint="'모델을 찾을 수 없습니다' 오류가 나면 각 회사 문서에서 현재 모델 이름으로 바꾸세요">
          <Input t={t} defaultValue={s.ai.geminiModel} autoCapitalize="none" onEndEditing={(e) => save({ ai: { ...s.ai, geminiModel: e.nativeEvent.text.trim() || DEFAULTS.ai.geminiModel } })} />
          <Input t={t} defaultValue={s.ai.claudeModel} autoCapitalize="none" onEndEditing={(e) => save({ ai: { ...s.ai, claudeModel: e.nativeEvent.text.trim() || DEFAULTS.ai.claudeModel } })} />
        </Field>
      </Section>

      <Section t={t} title="데이터">
        <Text style={{ color: t.c.faint, fontSize: t.fs(12.5), lineHeight: t.fs(18) }}>PC와 실시간 연동 전까지는 파일로 옮길 수 있습니다. PC 캘린더의 데이터 폴더에 있는 events.json을 폰으로 보내 "가져오기" 하세요. 같은 일정은 더 최근에 고친 쪽으로 합쳐집니다.</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn t={t} label="가져오기 (events.json)" onPress={importFile} style={{ flex: 1 }} />
          <Btn t={t} label="내보내기" onPress={exportFile} style={{ flex: 1 }} />
        </View>
        {dataMsg ? <Text style={{ color: /못/.test(dataMsg) ? t.c.danger : t.c.ok, fontSize: t.fs(13) }}>{dataMsg}</Text> : null}
      </Section>
    </ScrollView>
  );
}
