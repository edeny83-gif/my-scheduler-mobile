import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'myscheduler.settings.v1';

export const DEFAULTS = {
  fontFamily: 'default',          // default | light | condensed | serif | mono
  textScale: 1,                   // 글자 크기 배율
  colors: { accent: '#a8e0ff', event: '#a8e0ff', sunday: '#ff8f8f', saturday: '#90b8ff', text: '#f4f7fb', bg: '#16202c' },
  todayOpacity: 0.16,
  maxLanes: 3,
  widget: { bgColor: '#16202c', bgOpacity: 0.55, textColor: '#f4f7fb', mode: 'month' }, // mode: month | list
  holidays: { enabled: true, observances: false },
  google: { enabled: false, email: '', privateUrl: '', color: '#ffd28a' },
  calendars: [],
  ai: { provider: 'gemini', geminiModel: 'gemini-2.5-flash', claudeModel: 'claude-sonnet-5-5', about: '학교 교사', autoAdd: false, minConfidence: 0.6, color: '#ffd28a' },
};

const merge = (saved) => ({
  ...DEFAULTS, ...saved,
  colors: { ...DEFAULTS.colors, ...(saved.colors || {}) },
  widget: { ...DEFAULTS.widget, ...(saved.widget || {}) },
  holidays: { ...DEFAULTS.holidays, ...(saved.holidays || {}) },
  google: { ...DEFAULTS.google, ...(saved.google || {}) },
  ai: { ...DEFAULTS.ai, ...(saved.ai || {}) },
});

class Settings {
  value = merge({});
  listeners = new Set();
  async load() {
    try { this.value = merge(JSON.parse((await AsyncStorage.getItem(KEY)) || '{}')); } catch { this.value = merge({}); }
    this.emit();
    return this.value;
  }
  async update(patch) {
    this.value = merge({ ...this.value, ...patch });
    await AsyncStorage.setItem(KEY, JSON.stringify(this.value));
    this.emit();
    return this.value;
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn(this.value)); }
}

export const settings = new Settings();
