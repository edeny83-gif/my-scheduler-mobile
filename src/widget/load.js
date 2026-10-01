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
  try { events = JSON.parse(ev || '{}').events || []; } catch {}
  try { saved = JSON.parse(st || '{}'); } catch {}
  const settings = { ...DEFAULTS, ...saved, colors: { ...DEFAULTS.colors, ...(saved.colors || {}) }, widget: { ...DEFAULTS.widget, ...(saved.widget || {}) }, holidays: { ...DEFAULTS.holidays, ...(saved.holidays || {}) } };
  return { events, external: ext.external || [], holidays: ext.holidays || [], settings };
}
