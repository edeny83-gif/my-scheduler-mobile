// 위젯은 앱이 꺼져 있어도 그려져야 하므로 저장소에서 직접 읽는다
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULTS } from '../storage/settings';
import { loadParsedExternal } from '../services/feeds';

export async function loadWidgetData() {
  const [ev, st, ext] = await Promise.all([
    AsyncStorage.getItem('myscheduler.events.v1'),
    AsyncStorage.getItem('myscheduler.settings.v1'),
    loadParsedExternal(),
  ]);
  let events = []; let saved = {};
  // 저장소에는 동기화를 위해 지운 일정도 deleted:true(지움 표시)로 남아 있다 → 위젯에서는 빼야 한다
  try { events = (JSON.parse(ev || '{}').events || []).filter((e) => !e.deleted); } catch {}
  try { saved = JSON.parse(st || '{}'); } catch {}
  const settings = { ...DEFAULTS, ...saved, colors: { ...DEFAULTS.colors, ...(saved.colors || {}) }, widget: { ...DEFAULTS.widget, ...(saved.widget || {}) }, holidays: { ...DEFAULTS.holidays, ...(saved.holidays || {}) } };
  return { events, external: ext.external || [], holidays: ext.holidays || [], settings };
}
