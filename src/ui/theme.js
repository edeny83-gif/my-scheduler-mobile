// 화면 색·글꼴 (설정에서 바뀜)
import { Platform } from 'react-native';

const FONTS = {
  default: undefined,
  light: Platform.OS === 'android' ? 'sans-serif-light' : undefined,
  condensed: Platform.OS === 'android' ? 'sans-serif-condensed' : undefined,
  serif: 'serif',
  mono: 'monospace',
};
export const FONT_CHOICES = [['default', '기본'], ['light', '가는 글꼴'], ['condensed', '좁은 글꼴'], ['serif', '명조'], ['mono', '고정폭']];

export function rgba(hex, a) {
  const n = parseInt(String(hex || '#000000').slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function makeTheme(s) {
  const c = s.colors;
  const scale = s.textScale || 1;
  return {
    c: {
      bg: c.bg, text: c.text, accent: c.accent, event: c.event, sun: c.sunday, sat: c.saturday,
      muted: rgba(c.text, 0.6), faint: rgba(c.text, 0.35), line: rgba(c.text, 0.1),
      panel: rgba('#ffffff', 0.05), panel2: rgba('#ffffff', 0.09), today: rgba('#ffffff', s.todayOpacity ?? 0.16),
      danger: '#ff9e9e', ok: '#9fe0b5', warn: '#ffd28a', onAccent: '#152030',
    },
    font: FONTS[s.fontFamily],
    fs: (n) => Math.round(n * scale),
  };
}

export const PALETTE = ['#ffffff', '#ffd28a', '#ff9e9e', '#a8e0ff', '#a8f0b8', '#d4b8ff', '#ffb877'];
