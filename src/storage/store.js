// 일정 저장소 — 지금은 폰 안(AsyncStorage). PC의 store.js와 같은 인터페이스라 나중에 Firebase 구현으로 교체한다.
// 저장 형식도 PC의 events.json과 같다: { version: 1, events: [...] }
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cleanEvent } from '../core/convert';

const KEY = 'myscheduler.events.v1';
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

class EventStore {
  events = [];
  listeners = new Set();
  loaded = false;

  async load() {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const data = raw ? JSON.parse(raw) : null;
      this.events = Array.isArray(data?.events) ? data.events : [];
    } catch { this.events = []; }
    this.loaded = true;
    this.emit();
    return this.list();
  }
  async save() {
    await AsyncStorage.setItem(KEY, JSON.stringify({ version: 1, events: this.events }));
    this.emit();
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { const l = this.list(); this.listeners.forEach((fn) => fn(l)); }
  list() { return [...this.events].sort((a, b) => a.start - b.start); }

  async add(e) {
    const now = Date.now();
    const ev = { id: newId(), ...cleanEvent(e), createdAt: now, updatedAt: now };
    this.events.push(ev);
    await this.save();
    return ev.id;
  }
  async addMany(list) {
    const now = Date.now();
    const added = list.map((e) => ({ id: newId(), ...cleanEvent(e), createdAt: now, updatedAt: now }));
    this.events.push(...added);
    await this.save();
    return added;
  }
  async update(id, e) {
    const i = this.events.findIndex((x) => x.id === id);
    if (i < 0) throw new Error('일정을 찾을 수 없습니다');
    this.events[i] = { ...this.events[i], ...cleanEvent(e), updatedAt: Date.now() };
    await this.save();
  }
  async remove(ids) {
    const set = new Set([].concat(ids));
    this.events = this.events.filter((x) => !set.has(x.id));
    await this.save();
  }

  /** PC의 events.json(또는 내보낸 파일)을 합친다. 같은 id는 더 최근 수정본을 남긴다 */
  async importData(data) {
    const incoming = Array.isArray(data?.events) ? data.events : Array.isArray(data) ? data : null;
    if (!incoming) throw new Error('일정 파일 형식이 아닙니다 (events.json)');
    let added = 0, updated = 0;
    for (const raw of incoming) {
      let ev;
      try { ev = { id: raw.id || newId(), ...cleanEvent(raw), createdAt: raw.createdAt || Date.now(), updatedAt: raw.updatedAt || Date.now() }; }
      catch { continue; }
      const i = this.events.findIndex((x) => x.id === ev.id);
      if (i < 0) { this.events.push(ev); added++; }
      else if ((ev.updatedAt || 0) > (this.events[i].updatedAt || 0)) { this.events[i] = ev; updated++; }
    }
    await this.save();
    return { added, updated };
  }
  exportData() { return { version: 1, exportedAt: new Date().toISOString(), events: this.list() }; }
}

export const store = new EventStore();
