// 공휴일·구글·외부 캘린더(iCal) 받아오기. 원본은 캐시해 오프라인에서도 보이고, 위젯도 캐시를 읽는다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { expandICS, parseHolidays, sourcesFrom } from '../core/ical';

const CACHE = 'myscheduler.feeds.v1';        // { [sourceId]: { url, text, at } }
const PARSED = 'myscheduler.external.v1';     // { external: [...], holidays: [...] } — 위젯용

class Feeds {
  external = [];
  holidays = [];
  status = {};
  listeners = new Set();
  sources = [];

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }

  async configure(settings, { refresh = true } = {}) {
    this.sources = sourcesFrom(settings);
    await this.build();
    if (refresh) this.refresh();
  }

  async build() {
    let cache = {};
    try { cache = JSON.parse((await AsyncStorage.getItem(CACHE)) || '{}'); } catch {}
    const external = [];
    let holidays = [];
    for (const src of this.sources) {
      const c = cache[src.id];
      if (!c || c.url !== src.url) continue;
      try {
        if (src.kind === 'holidays') holidays = parseHolidays(c.text);
        else for (const o of expandICS(c.text)) external.push({ ...o, id: `${src.id}:${o.uid}:${o.start}`, color: src.color || '', readOnly: true, calendar: src.name });
      } catch (e) { this.status[src.id] = { name: src.name, ok: false, error: `해석 실패: ${e.message}` }; }
    }
    this.external = external.sort((a, b) => a.start - b.start);
    this.holidays = holidays;
    await AsyncStorage.setItem(PARSED, JSON.stringify({ external: this.external, holidays: this.holidays }));
    this.emit();
  }

  async refresh() {
    let cache = {};
    try { cache = JSON.parse((await AsyncStorage.getItem(CACHE)) || '{}'); } catch {}
    await Promise.all(this.sources.map(async (src) => {
      try {
        const res = await fetch(src.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!text.includes('BEGIN:VCALENDAR')) throw new Error('iCal 형식이 아닙니다. 주소를 확인하세요');
        cache[src.id] = { url: src.url, text, at: Date.now() };
        this.status[src.id] = { name: src.name, ok: true, at: Date.now() };
      } catch (e) {
        let msg = e.message;
        if (src.id === 'google' && /404|403/.test(msg)) msg = '캘린더가 공개되어 있지 않습니다. "비공개 iCal 주소"를 입력하세요';
        this.status[src.id] = { name: src.name, ok: false, error: msg };
      }
    }));
    for (const id of Object.keys(cache)) if (!this.sources.some((s) => s.id === id)) delete cache[id];
    await AsyncStorage.setItem(CACHE, JSON.stringify(cache));
    await this.build();
  }
}

export const feeds = new Feeds();
export async function loadParsedExternal() {
  try { return JSON.parse((await AsyncStorage.getItem(PARSED)) || '{}'); } catch { return {}; }
}
