// 빠른 입력: 달력 아래 칸에 글로 적거나 말하면 AI가 알아듣고 바로 일정에 넣는다 (되돌리기 가능)
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { analyzeCommand } from '../core/ai';
import { itemToEvent, findDuplicate } from '../core/convert';
import { parseYmd, parseHm, DOW } from '../core/dates';
import { fromRecording } from '../services/files';
import { getKeys } from '../storage/keys';
import { store } from '../storage/store';

const label = (it) => {
  const d = new Date(parseYmd(it.date));
  const tm = parseHm(it.time) ? ` ${it.time}` : '';
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})${tm} ${it.title}`;
};

export default function QuickPrompt({ t, settings, onShowDay, onGoSettings }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');                // 진행 중 문구
  const [res, setRes] = useState(null);                // { added:[{id,item}], skipped:[], undated:[], summary, error }
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: false });
  const rec = useAudioRecorderState(recorder, 500);

  const run = async (input) => {
    setBusy('분석 중'); setRes(null);
    try {
      const keys = await getKeys();
      const r = await analyzeCommand(input, {
        fetch, keys, provider: settings.ai.provider, geminiModel: settings.ai.geminiModel, claudeModel: settings.ai.claudeModel,
        about: settings.ai.about, onStage: setBusy,
      });
      const existing = store.list();
      const ok = [], skipped = [];
      for (const it of r.items) {
        try {
          const ev = itemToEvent(it, { color: settings.ai.color, source: 'ai' });
          const dup = findDuplicate(ev, existing);
          if (dup) skipped.push(`${label(it)} — 이미 있음`); else ok.push({ it, ev });
        } catch (e) { skipped.push(`${it.title || '?'} — ${e.message}`); }
      }
      const added = ok.length ? await store.addMany(ok.map((x) => x.ev)) : [];
      setRes({ added: added.map((a, i) => ({ id: a.id, item: ok[i].it })), skipped, undated: r.undated || [], summary: r.summary, voice: !!input.audio });
      if (input.text) setText('');
    } catch (e) {
      setRes({ error: e.message, noKey: /API 키/.test(e.message) });
    }
    setBusy('');
  };

  const send = () => { if (text.trim() && !busy) run({ text }); };
  const startRec = async () => {
    try {
      const p = await requestRecordingPermissionsAsync();
      if (!p.granted) throw new Error('마이크 권한이 필요합니다');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRes(null);
    } catch (e) { setRes({ error: `녹음을 시작하지 못했습니다: ${e.message}` }); }
  };
  const stopRec = async () => {
    const dur = rec.durationMillis;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (!recorder.uri) return;
    if (dur < 700) { setRes({ error: '너무 짧습니다. 버튼을 누르고 말한 뒤 다시 누르세요' }); return; }
    run({ audio: fromRecording(recorder.uri, dur) });
  };
  const undo = async () => {
    await store.remove(res.added.map((a) => a.id));
    setRes({ ...res, added: [], undone: res.added.length });
  };

  const recording = rec.isRecording;
  const sec = Math.floor((rec.durationMillis || 0) / 1000);
  const small = { color: t.c.muted, fontSize: t.fs(12.5), lineHeight: t.fs(18), fontFamily: t.font };

  return (
    <View style={{ gap: 6, paddingTop: 8, paddingBottom: 8 }}>
      {res && (
        <View style={{ backgroundColor: t.c.panel, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, gap: 3 }}>
          {res.error ? (
            <Text style={{ ...small, color: t.c.danger }} onPress={res.noKey ? onGoSettings : undefined}>{res.error}{res.noKey ? ' ›' : ''}</Text>
          ) : (
            <>
              {res.voice && res.summary ? <Text style={small} numberOfLines={2}>🎙 “{res.summary}”</Text> : null}
              {res.added.map((a) => (
                <Text key={a.id} style={{ ...small, color: t.c.ok }} onPress={() => onShowDay?.(parseYmd(a.item.date))} accessibilityRole="link">✓ {label(a.item)}</Text>
              ))}
              {res.skipped.map((s, i) => <Text key={`s${i}`} style={small}>– {s}</Text>)}
              {res.undated.map((u, i) => <Text key={`u${i}`} style={{ ...small, color: t.c.warn }}>? 날짜를 몰라 넣지 못함: {u.title}</Text>)}
              {res.undone ? <Text style={small}>{res.undone}개를 되돌렸습니다.</Text> : null}
              {!res.added.length && !res.skipped.length && !res.undated.length && !res.undone
                ? <Text style={small}>넣을 일정을 찾지 못했습니다.{res.summary && !res.voice ? ` (${res.summary})` : ''}</Text> : null}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
                {res.added.length ? <Text style={{ ...small, color: t.c.accent, paddingVertical: 4 }} onPress={undo} accessibilityRole="button">되돌리기</Text> : null}
                <Text style={{ ...small, paddingVertical: 4 }} onPress={() => setRes(null)} accessibilityRole="button">닫기</Text>
              </View>
            </>
          )}
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
        <TextInput
          value={recording ? '' : text} onChangeText={setText} editable={!recording && !busy}
          placeholder={recording ? `듣는 중… ${sec}초 (다시 누르면 끝)` : busy ? `${busy}…` : '✦ 예: 다음 주 화요일 3시 학부모 상담'}
          placeholderTextColor={recording ? t.c.danger : t.c.faint}
          multiline returnKeyType="send" submitBehavior="submit" onSubmitEditing={send}
          accessibilityLabel="일정 빠른 입력"
          style={{ flex: 1, maxHeight: 96, color: t.c.text, backgroundColor: t.c.panel2, borderRadius: 12, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 11, fontSize: t.fs(14.5), fontFamily: t.font, minHeight: 44 }}
        />
        {Platform.OS !== 'web' && (
          <Pressable onPress={recording ? stopRec : startRec} disabled={!!busy} accessibilityRole="button" accessibilityLabel={recording ? '말하기 끝' : '말로 입력'}
            style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: recording ? 'rgba(255,120,120,0.25)' : t.c.panel2, opacity: busy ? 0.4 : pressed ? 0.7 : 1 })}>
            <Text style={{ fontSize: t.fs(recording ? 16 : 18), color: recording ? t.c.danger : t.c.text }}>{recording ? '■' : '🎙'}</Text>
          </Pressable>
        )}
        <Pressable onPress={send} disabled={!text.trim() || !!busy || recording} accessibilityRole="button" accessibilityLabel="일정 넣기"
          style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.c.accent, opacity: !text.trim() || recording ? 0.35 : pressed ? 0.7 : 1 })}>
          {busy ? <ActivityIndicator color={t.c.onAccent} /> : <Text style={{ fontSize: t.fs(18), color: t.c.onAccent, fontWeight: '700' }}>↑</Text>}
        </Pressable>
      </View>
    </View>
  );
}
