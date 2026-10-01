// 위젯마다 "선택한 날짜"를 기억한다. 30분 동안 손대지 않으면 다시 오늘로 돌아간다
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sod } from '../core/dates';

const KEY = 'myscheduler.widget.state.v1';
export const SELECT_TTL = 30 * 60_000;

async function readAll() {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || '{}'); } catch { return {}; }
}

/** 이 위젯에서 보여 줄 날짜 (선택한 날 또는 오늘) */
export async function selectedDay(widgetId, now = Date.now()) {
  const s = (await readAll())[widgetId];
  return s && now - s.at < SELECT_TTL ? s.day : sod(now);
}

export async function setSelectedDay(widgetId, day, now = Date.now()) {
  const all = await readAll();
  if (sod(day) === sod(now)) delete all[widgetId]; else all[widgetId] = { day: sod(day), at: now };
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
}

export async function forgetWidget(widgetId) {
  const all = await readAll();
  delete all[widgetId];
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
}
