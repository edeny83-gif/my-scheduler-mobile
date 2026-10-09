// 폰 캘린더에도 함께 저장 (안드로이드)
// 폰의 공용 캘린더(삼성·구글 캘린더가 함께 쓰는 곳)에 "내 캘린더 앱"이라는 캘린더를 만들고, 이 앱의 일정 복사본을 맞춰 둔다.
// 라이프 인사이트처럼 다른 앱이 일정 개수·시간을 읽을 수 있게 하려는 것. 원본은 여전히 이 앱의 저장소(store.js)다.
// 끄면 복사본 캘린더를 통째로 지운다. 어떤 일정을 어떻게 적을지는 core/mirror.js가 정한다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { planMirror } from '../core/mirror';

let C = null;
if (Platform.OS === 'android') C = require('expo-calendar');

/** 이 기기에서 쓸 수 있는지(지금은 안드로이드만) */
export const deviceCalendarSupported = !!C;

const KEY = 'myscheduler.deviceCalendar.v1'; // { calendarId, map: { 일정 id: { deviceId, sig } } } — 이 기기에만 저장
const CAL_TITLE = '내 캘린더 앱';
const CAL_NAME = 'myscheduler';
const SAVE_EVERY = 25;

// ── 상태(설정 화면 표시용) ──
const status = { state: 'off', count: 0, at: 0, error: '' };
const listeners = new Set();
function setStatus(patch) {
  Object.assign(status, patch);
  const snap = { ...status };
  listeners.forEach((fn) => fn(snap));
}
export const getMirrorStatus = () => ({ ...status });
export function subscribeMirror(fn) { listeners.add(fn); return () => listeners.delete(fn); }

async function loadState() {
  try {
    const s = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null');
    if (s && typeof s === 'object') return { calendarId: s.calendarId || null, map: s.map && typeof s.map === 'object' ? s.map : {} };
  } catch { /* 처음부터 */ }
  return { calendarId: null, map: {} };
}
const saveState = (s) => AsyncStorage.setItem(KEY, JSON.stringify(s));

/** 설정에서 켤 때 캘린더 권한을 묻는다. 허용되면 true */
export async function requestDeviceCalendarPermission() {
  if (!C) return false;
  if ((await C.getCalendarPermissions()).granted) return true;
  const r = await C.requestCalendarPermissions();
  if (!r.granted) setStatus({ state: 'no-permission', error: '' });
  return r.granted;
}

async function findCalendar(id) {
  if (!id) return null;
  try { return await C.ExpoCalendar.get(id); } catch { return null; }
}

/** 예전에 만든 복사본 캘린더(기록을 잃은 경우 포함)를 모두 지운다 */
async function deleteOurCalendars(knownId) {
  const known = await findCalendar(knownId);
  if (known) await known.delete();
  const all = await C.getCalendars();
  for (const cal of all) if (cal.name === CAL_NAME && cal.ownerAccount === CAL_NAME) await cal.delete();
}

async function ensureCalendar(state) {
  const cal = await findCalendar(state.calendarId);
  if (cal) return { cal, state };
  // 기록이 없거나 캘린더가 사라졌다: 남은 것을 정리하고 새로 만든다(어떤 일정이 들어 있는지 알 수 없으므로)
  await deleteOurCalendars(null);
  const created = await C.createCalendar({
    title: CAL_TITLE,
    name: CAL_NAME,
    color: '#a8e0ff',
    source: { isLocalAccount: true, name: CAL_TITLE },
    ownerAccount: CAL_NAME,
    accessLevel: C.CalendarAccessLevel.OWNER,
    isVisible: true,
    isSynced: true,
  });
  return { cal: created, state: { calendarId: created.id, map: {} } };
}

/** 이 앱의 일정 모양 → expo-calendar에 넘길 값 */
function toDetails(d) {
  const out = { title: d.title, allDay: d.allDay, startDate: new Date(d.startDate), endDate: new Date(d.endDate) };
  if (d.timeZone) { out.timeZone = d.timeZone; out.endTimeZone = d.timeZone; }
  return out;
}

async function removeDeviceEvent(deviceId) {
  try { await (await C.ExpoCalendarEvent.get(deviceId)).delete(); } catch { /* 이미 없음 */ }
}

async function run(events, { enabled, withTitles }) {
  const perm = await C.getCalendarPermissions();
  if (!enabled) {
    const saved = await loadState();
    if (saved.calendarId && perm.granted) await deleteOurCalendars(saved.calendarId);
    if (saved.calendarId) await AsyncStorage.removeItem(KEY);
    setStatus({ state: 'off', count: 0, error: '' });
    return;
  }
  if (!perm.granted) { setStatus({ state: 'no-permission', error: '' }); return; }
  setStatus({ state: 'working', error: '' });

  const { cal, state } = await ensureCalendar(await loadState());
  const map = { ...state.map };
  const persist = () => saveState({ calendarId: cal.id, map });
  await persist();

  const plan = planMirror(map, events, { now: Date.now(), withTitles: !!withTitles });
  let done = 0;
  const tick = async () => { done += 1; if (done % SAVE_EVERY === 0) await persist(); };

  for (const r of plan.remove) {
    await removeDeviceEvent(r.deviceId);
    delete map[r.id];
    await tick();
  }
  for (const u of plan.update) {
    try {
      await (await C.ExpoCalendarEvent.get(u.deviceId)).update(toDetails(u.details));
      map[u.id] = { deviceId: u.deviceId, sig: u.sig };
    } catch {
      // 다른 앱에서 지웠으면 새로 만든다
      const ev = await cal.createEvent(toDetails(u.details));
      map[u.id] = { deviceId: ev.id, sig: u.sig };
    }
    await tick();
  }
  for (const c of plan.create) {
    const ev = await cal.createEvent(toDetails(c.details));
    map[c.id] = { deviceId: ev.id, sig: c.sig };
    await tick();
  }
  await persist();
  setStatus({ state: 'ok', count: Object.keys(map).length, at: Date.now(), error: '' });
}

let running = Promise.resolve();
function enqueue(job) {
  if (!C) return Promise.resolve();
  running = running.then(job).catch((e) => {
    console.warn('폰 캘린더 맞추기 실패', e);
    setStatus({ state: 'error', error: (e && e.message) || String(e) });
  });
  return running;
}

let timer = null;

/** 지금 바로 맞춘다(설정을 바꿨을 때·백그라운드 동기화 뒤). 실행이 겹치지 않게 줄을 세운다. */
export function mirrorNow(events, opts = {}) {
  if (!opts.enabled) clearTimeout(timer); // 끈 뒤에 예약돼 있던 맞추기가 캘린더를 다시 만들지 않게
  return enqueue(() => run(events, opts));
}

/** 일정이 바뀔 때마다 부른다(켜 둔 경우만). 연달아 바뀌는 경우를 모아 2초 뒤 한 번 맞춘다. */
export function scheduleMirror(events, opts = {}) {
  if (!C || !opts.enabled) return;
  clearTimeout(timer);
  timer = setTimeout(() => mirrorNow(events, opts), 2000);
}

/** 복사본 캘린더를 지우고 처음부터 다시 맞춘다(설정 화면의 "다시 맞추기") */
export function rebuildMirror(events, opts = {}) {
  return enqueue(async () => {
    const saved = await loadState();
    if ((await C.getCalendarPermissions()).granted) await deleteOurCalendars(saved.calendarId);
    await AsyncStorage.removeItem(KEY);
    await run(events, opts);
  });
}
