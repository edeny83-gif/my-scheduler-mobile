// 화면 폭에 따라 자동으로 바뀐다
//  - 좁은 화면(일반 폰, 폴드 커버 화면): 달력+목록 / 비서 / 설정 을 아래 탭으로
//  - 넓은 화면(폴드7 펼침, 태블릿, 가로 모드 600dp 이상): 왼쪽 달력 + 오른쪽 칸(일정·비서·설정·입력)
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAppState } from './src/state';
import { makeTheme } from './src/ui/theme';
import MonthView from './src/ui/MonthView';
import DayList from './src/ui/DayList';
import EventEditor from './src/ui/EventEditor';
import AssistantScreen from './src/ui/AssistantScreen';
import SettingsScreen from './src/ui/SettingsScreen';
import { setupNotifications, onNotificationOpen } from './src/services/notifications';
import { sod, monthStart } from './src/core/dates';

export const EXPANDED_MIN_WIDTH = 600;

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const app = useAppState();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const expanded = width >= EXPANDED_MIN_WIDTH;
  const t = useMemo(() => makeTheme({ ...app.settings, textScale: (app.settings.textScale || 1) * (expanded ? 1.06 : 1) }), [app.settings, expanded]);

  const [view, setView] = useState(() => monthStart(Date.now()));
  const [selected, setSelected] = useState(() => sod(Date.now()));
  const [tab, setTab] = useState('calendar');          // 좁은 화면: calendar | assistant | settings
  const [pane, setPane] = useState('day');             // 넓은 화면 오른쪽 칸: day | assistant | settings
  const [editor, setEditor] = useState(null);          // { item?, day? }
  const [assistAction, setAssistAction] = useState(null);

  const items = useMemo(() => [...app.events, ...app.external], [app.events, app.external]);
  const goDay = (ms) => { setSelected(sod(ms)); setView(monthStart(ms)); setTab('calendar'); setPane('day'); };
  const openAssistant = (action = null) => { setAssistAction(action); setTab('assistant'); setPane('assistant'); setEditor(null); };

  useEffect(() => {
    setupNotifications();
    const off = onNotificationOpen(goDay);
    // 위젯의 ＋ / ✦ 버튼 (myscheduler://add, myscheduler://assistant)
    const handle = (url) => {
      if (!url) return;
      if (url.includes('://add')) setEditor({ day: sod(Date.now()) });
      else if (url.includes('://assistant')) openAssistant();
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => { off(); sub.remove(); };
  }, []);

  if (!app.ready) {
    return <View style={{ flex: 1, backgroundColor: app.settings.colors.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#a8e0ff" /></View>;
  }

  const closeEditor = (dayMs) => { setEditor(null); if (dayMs != null) { setSelected(dayMs); setView(monthStart(dayMs)); } };
  const month = (
    <MonthView
      t={t} view={view} setView={setView} selected={selected} items={items} holidays={app.holidays} settings={app.settings}
      compactHeader={!expanded && height < 700}
      onSelectDay={(d) => { setSelected(d); if (expanded) { setPane('day'); setEditor(null); } }}
      onAddDay={(d) => { setSelected(d); setEditor({ day: d }); }}
      onOpenItem={(e) => setEditor({ item: e })}
      onHeaderAction={expanded ? null : (
        <Pressable onPress={() => openAssistant()} accessibilityLabel="AI 비서" hitSlop={6} style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
          <Text style={{ color: t.c.warn, fontSize: t.fs(18) }}>✦</Text>
        </Pressable>
      )}
    />
  );
  const dayList = (
    <DayList t={t} day={selected} items={items} holidays={app.holidays} settings={app.settings}
      onOpenItem={(e) => setEditor({ item: e })} onAdd={() => setEditor({ day: selected })} style={{ flex: 1 }} />
  );
  const assistant = <AssistantScreen t={t} settings={app.settings} initialAction={assistAction} onGoSettings={() => { setTab('settings'); setPane('settings'); }} onShowDay={() => goDay(selected)} />;
  const settingsView = <SettingsScreen t={t} s={app.settings} feedStatus={app.feedStatus} />;

  // ---------------- 넓은 화면 (폴드7 펼침) ----------------
  if (expanded) {
    const tabs = [['day', '일정'], ['assistant', '✦ 비서'], ['settings', '설정']];
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.c.bg, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}>
        <StatusBar style="light" />
        <View style={{ flex: width < 900 ? 1.65 : 1.4, paddingTop: 10, paddingHorizontal: 8, paddingBottom: 8 }}>{month}</View>
        <View style={{ width: 1, backgroundColor: t.c.line }} />
        <View style={{ flex: 1 }}>
          {editor ? (
            <EventEditor key={editor.item?.id || `new-${editor.day}`} t={t} item={editor.item} day={editor.day} onClose={closeEditor} embedded />
          ) : (
            <>
              <View style={{ flexDirection: 'row', margin: 12, padding: 4, borderRadius: 12, backgroundColor: t.c.panel }} accessibilityRole="tablist">
                {tabs.map(([k, l]) => (
                  <Pressable key={k} onPress={() => setPane(k)} accessibilityRole="tab" accessibilityState={{ selected: pane === k }}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center', backgroundColor: pane === k ? t.c.panel2 : 'transparent' }}>
                    <Text style={{ color: pane === k ? t.c.text : t.c.muted, fontSize: t.fs(14), fontWeight: pane === k ? '600' : '400', fontFamily: t.font }}>{l}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flex: 1, paddingHorizontal: pane === 'day' ? 14 : 0 }}>
                {pane === 'day' && dayList}
                {pane === 'assistant' && assistant}
                {pane === 'settings' && settingsView}
              </View>
            </>
          )}
        </View>
      </View>
    );
  }

  // ---------------- 좁은 화면 (일반 폰, 폴드 커버 화면) ----------------
  const tabs = [['calendar', '캘린더', '▦'], ['assistant', 'AI 비서', '✦'], ['settings', '설정', '⚙']];
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg, paddingTop: insets.top }}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        {tab === 'calendar' && (
          <View style={{ flex: 1, paddingTop: 8 }}>
            <View style={{ flex: 1.45, paddingHorizontal: 4 }}>{month}</View>
            <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 10, borderTopWidth: 1, borderColor: t.c.line }}>{dayList}</View>
          </View>
        )}
        {tab === 'assistant' && assistant}
        {tab === 'settings' && (
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.c.text, fontSize: t.fs(22), fontWeight: '300', paddingHorizontal: 16, paddingTop: 12, fontFamily: t.font }}>설정</Text>
            {settingsView}
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: t.c.line, paddingBottom: insets.bottom, backgroundColor: t.c.bg }} accessibilityRole="tablist">
        {tabs.map(([k, l, icon]) => (
          <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 8, minHeight: 56, justifyContent: 'center' }}>
            <Text style={{ color: tab === k ? (k === 'assistant' ? t.c.warn : t.c.accent) : t.c.muted, fontSize: t.fs(18) }}>{icon}</Text>
            <Text style={{ color: tab === k ? t.c.text : t.c.muted, fontSize: t.fs(11.5), marginTop: 2, fontFamily: t.font }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {editor && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.c.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <EventEditor key={editor.item?.id || `new-${editor.day}`} t={t} item={editor.item} day={editor.day} onClose={closeEditor} />
        </View>
      )}
    </View>
  );
}
