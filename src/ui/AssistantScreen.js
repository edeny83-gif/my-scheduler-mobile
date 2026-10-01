// AI 비서: 문서·사진·촬영·녹음 → 일정 후보 → 확인·수정 → 추가 / 되돌리기
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { Btn, Input } from './common';
import { analyzeFile, kindOf } from '../core/ai';
import { itemToEvent, findDuplicate } from '../core/convert';
import { sod } from '../core/dates';
import { pickDocuments, pickPhotos, takePhoto, fromRecording } from '../services/files';
import { getKeys } from '../storage/keys';
import { store } from '../storage/store';
import { notifyNow } from '../services/notifications';

const ICON = { pdf: '📄', text: '📝', image: '🖼', audio: '🎙', unknown: '❔' };
const mmss = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

export default function AssistantScreen({ t, settings, onGoSettings, onShowDay, initialAction }) {
  const [files, setFiles] = useState([]);           // [{ file, state, stage }]
  const [instruction, setInstruction] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState({ gemini: '', claude: '' });
  const [lastAdded, setLastAdded] = useState([]);
  const [msg, setMsg] = useState('');
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: false });
  const rec = useAudioRecorderState(recorder, 500);

  useEffect(() => { getKeys().then(setKeys); }, [settings]);
  const hasKey = !!(keys.gemini || keys.claude);
  const addFiles = (list) => setFiles((cur) => [...cur, ...list.filter((f) => !cur.some((c) => c.file.uri === f.uri)).map((file) => ({ file, state: 'wait', stage: '' }))]);
  const guard = (fn) => async () => { try { addFiles(await fn()); } catch (e) { setMsg(e.message); } };

  const startRec = async () => {
    try {
      const p = await requestRecordingPermissionsAsync();
      if (!p.granted) throw new Error('마이크 권한이 필요합니다');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setMsg('');
    } catch (e) { setMsg(`녹음을 시작하지 못했습니다: ${e.message}`); }
  };
  const stopRec = async () => {
    const dur = rec.durationMillis;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, allowsBackgroundRecording: false });
    if (recorder.uri) addFiles([fromRecording(recorder.uri, dur)]);
  };
  useEffect(() => {
    if (initialAction === 'record') startRec();
    if (initialAction === 'camera') guard(takePhoto)();
  }, [initialAction]);

  const run = async () => {
    const k = await getKeys();
    setKeys(k);
    setBusy(true); setResults([]); setLastAdded([]); setMsg('');
    const out = [];
    for (let i = 0; i < files.length; i++) {
      const upd = (patch) => setFiles((cur) => cur.map((x, j) => (j === i ? { ...x, ...patch } : x)));
      const { file } = files[i];
      upd({ state: 'busy', stage: '준비 중' });
      try {
        const r = await analyzeFile(file, {
          fetch, keys: k, provider: settings.ai.provider, geminiModel: settings.ai.geminiModel, claudeModel: settings.ai.claudeModel,
          about: settings.ai.about, instruction, onStage: (stage) => upd({ stage }),
        });
        out.push(r); upd({ state: 'ok', stage: `${r.items.length}개 찾음` });
      } catch (e) {
        out.push({ fileName: file.name, error: e.message, items: [], undated: [] }); upd({ state: 'bad', stage: e.message });
      }
    }
    const existing = store.list();
    const today = sod(Date.now());
    for (const r of out) {
      r.items = r.items.map((it) => {
        try {
          const ev = itemToEvent(it, { fileName: r.fileName });
          const dup = findDuplicate(ev, existing);
          const x = { ...it, fileName: r.fileName, past: (ev.end ?? ev.start) < today, duplicate: dup ? dup.title : '' };
          x.checked = !x.past && !x.duplicate && (x.confidence ?? 1) >= settings.ai.minConfidence;
          return x;
        } catch (e) { return { ...it, invalid: e.message, checked: false }; }
      });
    }
    setResults(out);
    setBusy(false);
    if (settings.ai.autoAdd) addSelected(out, true);
  };

  const addSelected = async (rs = results, auto = false) => {
    const sel = rs.flatMap((r) => r.items.filter((it) => it.checked && !it.added));
    if (!sel.length) return;
    try {
      const added = await store.addMany(sel.map((it) => itemToEvent(it, { color: settings.ai.color, source: 'ai', fileName: it.fileName })));
      sel.forEach((it) => { it.added = true; it.checked = false; });
      setResults([...rs]);
      setLastAdded((x) => [...x, ...added.map((a) => a.id)]);
      setMsg(`${auto ? '자동으로 ' : ''}${added.length}개를 캘린더에 추가했습니다.`);
      notifyNow(`AI 비서가 일정 ${added.length}개를 추가했습니다`, sel.slice(0, 3).map((it) => `${it.date.slice(5).replace('-', '/')} ${it.title}`).join('\n'));
    } catch (e) { setMsg(`추가하지 못했습니다: ${e.message}`); }
  };
  const undo = async () => {
    await store.remove(lastAdded);
    results.forEach((r) => r.items.forEach((it) => { if (it.added) { it.added = false; it.checked = true; } }));
    setResults([...results]); setLastAdded([]); setMsg('되돌렸습니다.');
  };

  const total = results.reduce((a, r) => a + r.items.length, 0);
  const selCount = results.reduce((a, r) => a + r.items.filter((it) => it.checked && !it.added).length, 0);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={{ color: t.c.text, fontSize: t.fs(22), fontWeight: '300', fontFamily: t.font }}><Text style={{ color: t.c.warn }}>✦</Text> AI 비서</Text>
          <Text style={{ color: hasKey ? t.c.ok : t.c.danger, fontSize: t.fs(12) }} onPress={hasKey ? undefined : onGoSettings}>
            {hasKey ? `${settings.ai.provider === 'claude' && keys.claude ? 'Claude' : keys.gemini ? 'Gemini' : 'Claude'}로 분석${settings.ai.autoAdd ? ' · 자동 추가' : ''}` : 'API 키 필요 → 설정'}
          </Text>
        </View>
        <Text style={{ color: t.c.muted, fontSize: t.fs(13), lineHeight: t.fs(19), fontFamily: t.font }}>
          공문·가정통신문·회의 녹음·알림장 사진에서 일정·할 일·마감을 찾아 캘린더에 넣어 드립니다.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Btn t={t} label="📄 문서 (HWP·PDF)" onPress={guard(pickDocuments)} style={{ flexGrow: 1 }} />
          <Btn t={t} label="🖼 사진 선택" onPress={guard(pickPhotos)} style={{ flexGrow: 1 }} />
          {Platform.OS !== 'web' && <Btn t={t} label="📷 사진 찍기" onPress={guard(takePhoto)} style={{ flexGrow: 1 }} />}
          {Platform.OS !== 'web' && (rec.isRecording
            ? <Btn t={t} kind="danger" label={`■ 녹음 끝내기 ${mmss(rec.durationMillis)}`} onPress={stopRec} style={{ flexGrow: 1, backgroundColor: 'rgba(255,120,120,0.18)' }} />
            : <Btn t={t} label="🎙 회의 녹음" onPress={startRec} style={{ flexGrow: 1 }} />)}
        </View>
        {rec.isRecording && <Text style={{ color: t.c.warn, fontSize: t.fs(12.5) }}>녹음 중입니다. 화면이 꺼져도 계속 녹음됩니다. 끝나면 "녹음 끝내기"를 누르세요.</Text>}

        {files.map((x, i) => (
          <View key={x.file.uri} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: t.c.panel }}>
            <Text>{ICON[kindOf(x.file.ext).kind]}</Text>
            <Text numberOfLines={1} style={{ flex: 1, color: t.c.text, fontSize: t.fs(14), fontFamily: t.font }}>{x.file.name}</Text>
            {x.state === 'busy' && <ActivityIndicator size="small" color={t.c.accent} />}
            <Text numberOfLines={2} style={{ maxWidth: '45%', fontSize: t.fs(12), color: x.state === 'bad' ? t.c.danger : x.state === 'ok' ? t.c.ok : t.c.muted }}>
              {kindOf(x.file.ext).kind === 'unknown' ? '지원하지 않는 형식' : x.stage || '대기'}
            </Text>
            {!busy && <Pressable onPress={() => setFiles((c) => c.filter((_, j) => j !== i))} hitSlop={10} accessibilityLabel="목록에서 빼기"><Text style={{ color: t.c.muted, fontSize: t.fs(16) }}>✕</Text></Pressable>}
          </View>
        ))}

        <Input t={t} value={instruction} onChangeText={setInstruction} placeholder="추가 요청 (선택) — 예: 3학년 관련 일정만" />
        <Btn t={t} kind="primary" label={busy ? '분석 중…' : '분석하기'} disabled={busy || !files.length || !hasKey || rec.isRecording} onPress={run} />
        {!hasKey && <Btn t={t} kind="ghost" label="설정에서 API 키 입력하기 ›" onPress={onGoSettings} />}

        {results.map((r, ri) => <ResultCard key={ri} t={t} r={r} settings={settings} onChange={() => setResults([...results])} onAddUndated={async (u, date) => {
          const [a] = await store.addMany([itemToEvent({ title: u.title, date, kind: '할 일', memo: u.note || '' }, { color: settings.ai.color, source: 'ai', fileName: r.fileName })]);
          setLastAdded((x) => [...x, a.id]); setMsg(`"${u.title}"을(를) 추가했습니다.`);
        }} />)}
      </ScrollView>

      {(total > 0 || msg) && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, gap: 8, backgroundColor: t.c.bg, borderTopWidth: 1, borderColor: t.c.line }}>
          {msg ? <Text style={{ color: /못|실패/.test(msg) ? t.c.danger : t.c.ok, fontSize: t.fs(13) }} onPress={() => lastAdded.length && onShowDay?.()}>{msg}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {lastAdded.length > 0 && <Btn t={t} label="되돌리기" onPress={undo} />}
            {total > 0 && <Btn t={t} kind="primary" style={{ flex: 1 }} label={selCount ? `선택한 ${selCount}개 캘린더에 추가` : '추가할 항목을 선택하세요'} disabled={!selCount} onPress={() => addSelected()} />}
          </View>
        </View>
      )}
    </View>
  );
}

function ResultCard({ t, r, settings, onChange, onAddUndated }) {
  const [open, setOpen] = useState(null);
  const kindColor = { 마감: '#ffb3b3', '할 일': '#b8f0c4', 일정: t.c.muted };
  return (
    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: t.c.line, overflow: 'hidden' }}>
      <View style={{ padding: 12, backgroundColor: t.c.panel, flexDirection: 'row', gap: 6, alignItems: 'baseline' }}>
        <Text numberOfLines={1} style={{ flex: 1, color: t.c.text, fontWeight: '600', fontSize: t.fs(14) }}>{r.fileName}</Text>
        {r.provider ? <Text style={{ color: t.c.faint, fontSize: t.fs(11) }}>{r.provider === 'claude' ? 'Claude' : 'Gemini'}</Text> : null}
      </View>
      {r.error ? <Text style={{ color: t.c.danger, padding: 12 }}>{r.error}</Text> : null}
      {r.summary ? <Text style={{ color: t.c.muted, padding: 12, lineHeight: t.fs(20), fontSize: t.fs(13.5) }}>{r.summary}</Text> : null}
      {r.note ? <Text style={{ color: t.c.warn, paddingHorizontal: 12, fontSize: t.fs(12.5) }}>{r.note}</Text> : null}
      {!r.error && !r.items.length && <Text style={{ color: t.c.faint, padding: 12 }}>날짜가 있는 일정을 찾지 못했습니다.</Text>}
      {r.items.map((it, i) => {
        const flags = [];
        if (it.added) flags.push([t.c.ok, '캘린더에 추가됨']);
        if (it.invalid) flags.push([t.c.danger, it.invalid]);
        if (it.past) flags.push([t.c.warn, '지난 날짜']);
        if (it.duplicate) flags.push([t.c.warn, `비슷한 일정 있음: ${it.duplicate}`]);
        if ((it.confidence ?? 1) < settings.ai.minConfidence) flags.push([t.c.warn, '확인 필요']);
        if (it.endDate && it.endDate !== it.date) flags.push([t.c.muted, `~ ${it.endDate}`]);
        const toggle = () => { if (it.added) return; it.checked = !it.checked; onChange(); };
        return (
          <View key={i} style={{ padding: 12, gap: 8, borderTopWidth: 1, borderColor: t.c.line, opacity: it.checked || it.added ? 1 : 0.55 }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Pressable onPress={toggle} accessibilityRole="checkbox" accessibilityState={{ checked: !!it.checked }} hitSlop={8}
                style={{ width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: it.checked ? t.c.accent : t.c.faint, backgroundColor: it.checked ? t.c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {it.checked ? <Text style={{ color: t.c.onAccent, fontWeight: '800' }}>✓</Text> : null}
              </Pressable>
              <Text style={{ fontSize: t.fs(11.5), color: kindColor[it.kind] || t.c.muted }}>{it.kind || '일정'}</Text>
              <Input t={t} value={it.title} onChangeText={(v) => { it.title = v; onChange(); }} style={{ flex: 1, minHeight: 38, paddingVertical: 6 }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 36 }}>
              <Input t={t} value={it.date} onChangeText={(v) => { it.date = v; onChange(); }} placeholder="YYYY-MM-DD" style={{ flex: 1.3, minHeight: 38, paddingVertical: 6 }} />
              <Input t={t} value={it.time || ''} onChangeText={(v) => { it.time = v; onChange(); }} placeholder="시각(없으면 종일)" style={{ flex: 1, minHeight: 38, paddingVertical: 6 }} />
              <Pressable onPress={() => setOpen(open === i ? null : i)} hitSlop={8} style={{ justifyContent: 'center', paddingHorizontal: 6 }} accessibilityLabel="자세히">
                <Text style={{ color: t.c.muted }}>{open === i ? '▴' : '▾'}</Text>
              </Pressable>
            </View>
            {flags.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 36 }}>
                {flags.map(([c, l], k) => <Text key={k} style={{ color: c, fontSize: t.fs(11.5), backgroundColor: t.c.panel, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>{l}</Text>)}
              </View>
            )}
            {open === i && (
              <View style={{ gap: 8, paddingLeft: 36 }}>
                <Input t={t} value={it.location || ''} onChangeText={(v) => { it.location = v; onChange(); }} placeholder="장소" />
                <Input t={t} value={it.memo || ''} onChangeText={(v) => { it.memo = v; onChange(); }} placeholder="메모" multiline />
                {it.evidence ? <Text style={{ color: t.c.faint, fontSize: t.fs(12) }}>근거: “{it.evidence}”</Text> : null}
              </View>
            )}
          </View>
        );
      })}
      {r.undated?.length > 0 && (
        <View style={{ padding: 12, gap: 8, borderTopWidth: 1, borderColor: t.c.line, borderStyle: 'dashed' }}>
          <Text style={{ color: t.c.muted, fontSize: t.fs(12.5), fontWeight: '600' }}>날짜가 없는 할 일 — 날짜를 적으면 추가할 수 있어요</Text>
          {r.undated.map((u, i) => <UndatedRow key={i} t={t} u={u} onAdd={onAddUndated} />)}
        </View>
      )}
    </View>
  );
}

function UndatedRow({ t, u, onAdd }) {
  const [date, setDate] = useState('');
  const [done, setDone] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.c.text, fontSize: t.fs(14) }}>{u.title}{u.note ? <Text style={{ color: t.c.faint }}>  {u.note}</Text> : null}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Input t={t} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" style={{ flex: 1, minHeight: 38, paddingVertical: 6 }} editable={!done} />
        <Btn t={t} small label={done ? '추가됨' : '추가'} disabled={done || !/^\d{4}-\d{2}-\d{2}$/.test(date)} onPress={async () => { await onAdd(u, date); setDone(true); }} />
      </View>
    </View>
  );
}
