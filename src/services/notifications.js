// 일정 알림: 바뀔 때마다 앞으로 30일 치 알림을 다시 예약한다 (안드로이드 예약 개수 제한 대비 최대 300개)
import { Platform } from 'react-native';

let N = null;
if (Platform.OS !== 'web') N = require('expo-notifications');

const HORIZON = 30 * 86_400_000;
const pad = (n) => String(n).padStart(2, '0');

export async function setupNotifications() {
  if (!N) return false;
  N.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('reminders', { name: '일정 알림', importance: N.AndroidImportance.HIGH, vibrationPattern: [0, 250, 150, 250] });
  }
  const cur = await N.getPermissionsAsync();
  if (cur.granted) return true;
  const req = await N.requestPermissionsAsync();
  return req.granted;
}

function bodyOf(ev, m) {
  if (ev.allDay) {
    const when = m <= 0 ? '오늘' : Math.ceil(m / 1440) === 1 ? '내일' : `${Math.ceil(m / 1440)}일 후`;
    return `${when} 종일 일정${ev.location ? ` · ${ev.location}` : ''}`;
  }
  const d = new Date(ev.start);
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const when = m === 0 ? '지금 시작' : m < 60 ? `${m}분 후 시작` : m < 1440 ? `${m / 60}시간 후 시작` : `${Math.round(m / 1440)}일 후`;
  return `${t} · ${when}${ev.location ? ` · ${ev.location}` : ''}`;
}

let running = Promise.resolve();
export function rescheduleAll(events) {
  if (!N) return Promise.resolve();
  running = running.then(async () => {
    await N.cancelAllScheduledNotificationsAsync();
    const now = Date.now();
    const list = [];
    for (const ev of events) for (const m of ev.remind || []) {
      const at = ev.start - m * 60_000;
      if (at > now && at < now + HORIZON) list.push({ ev, m, at });
    }
    list.sort((a, b) => a.at - b.at);
    for (const { ev, m, at } of list.slice(0, 300)) {
      await N.scheduleNotificationAsync({
        content: { title: ev.title, body: bodyOf(ev, m), data: { date: ev.start } },
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'reminders' },
      });
    }
  }).catch((e) => console.warn('알림 예약 실패', e));
  return running;
}

/** 알림을 눌렀을 때 그 날짜로 이동 */
export function onNotificationOpen(cb) {
  if (!N) return () => {};
  const sub = N.addNotificationResponseReceivedListener((r) => {
    const date = r.notification.request.content.data?.date;
    if (date) cb(Number(date));
  });
  return () => sub.remove();
}

export async function notifyNow(title, body) {
  if (!N) return;
  await N.scheduleNotificationAsync({ content: { title, body }, trigger: null });
}
