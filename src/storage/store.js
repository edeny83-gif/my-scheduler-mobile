// 일정 저장소 — 폰 안(AsyncStorage)이 원본이고, 로그인하면 services/sync.js가 서버(Firestore)와 맞춘다.
// 로직은 PC와 같은 core/sync-core.js(LocalDocStore)이고, 여기서는 저장만 맡는다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocalDocStore } from '../core/sync-core';

const KEY = 'myscheduler.events.v1';

class MobileStore extends LocalDocStore {
  loaded = false;
  constructor() {
    super({ persist: (json) => AsyncStorage.setItem(KEY, JSON.stringify(json)) });
  }
  async load() {
    let data = null;
    try { const raw = await AsyncStorage.getItem(KEY); data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    this.hydrate(data);
    this.loaded = true;
    return this.list();
  }
  subscribe(fn) { return this.on('change', fn); }
}

export const store = new MobileStore();
