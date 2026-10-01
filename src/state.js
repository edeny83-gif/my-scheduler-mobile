// 앱 전체 상태: 일정·외부 캘린더·설정을 구독하고, 바뀌면 알림 예약과 위젯을 갱신한다
import { useEffect, useState } from 'react';
import { store } from './storage/store';
import { settings } from './storage/settings';
import { feeds } from './services/feeds';
import { rescheduleAll } from './services/notifications';
import { updateWidget } from './widget/update';
import { sync as syncService } from './services/sync';
import { Platform } from 'react-native';

let started = false;
export async function startApp() {
  if (started) return;
  started = true;
  await Promise.all([store.load(), settings.load()]);
  await feeds.configure(settings.value);
  syncService.start(); // 로그인되어 있으면 PC와 실시간 동기화
  store.subscribe((list) => { rescheduleAll(list); updateWidget(); });
  feeds.subscribe(() => updateWidget());
  let prev = JSON.stringify([settings.value.holidays, settings.value.google, settings.value.calendars]);
  settings.subscribe((s) => {
    const next = JSON.stringify([s.holidays, s.google, s.calendars]);
    if (next !== prev) { prev = next; feeds.configure(s); }
    updateWidget();
  });
  rescheduleAll(store.list());
  updateWidget();
  if (Platform.OS !== 'web') require('./services/backgroundSync').registerBackgroundSync(); // 앱이 꺼져 있어도 주기적으로 확인
}

export function useAppState() {
  const [state, setState] = useState(() => ({
    ready: store.loaded, events: store.list(), external: feeds.external, holidays: feeds.holidays,
    feedStatus: feeds.status, settings: settings.value, sync: syncService.state,
  }));
  useEffect(() => {
    const sync = () => setState({
      ready: store.loaded, events: store.list(), external: feeds.external, holidays: feeds.holidays,
      feedStatus: { ...feeds.status }, settings: settings.value, sync: syncService.state,
    });
    const offs = [store.subscribe(sync), settings.subscribe(sync), feeds.subscribe(sync), syncService.subscribe(sync)];
    startApp().then(sync);
    return () => offs.forEach((f) => f());
  }, []);
  return state;
}
