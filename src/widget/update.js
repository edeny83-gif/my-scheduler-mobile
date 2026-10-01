// 앱에서 일정·설정이 바뀌면 홈 화면 위젯을 다시 그린다 (안드로이드만)
import React from 'react';
import { Platform } from 'react-native';

let timer = null;
export function updateWidget() {
  if (Platform.OS !== 'android') return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      const { requestWidgetUpdate } = require('react-native-android-widget');
      const { CalendarWidget } = require('./CalendarWidget');
      const { loadWidgetData } = require('./load');
      const { selectedDay } = require('./state');
      const data = await loadWidgetData();
      await requestWidgetUpdate({
        widgetName: 'Calendar',
        renderWidget: async (info) => <CalendarWidget {...data} day={await selectedDay(info.widgetId)} width={info.width} height={info.height} />,
      });
    } catch (e) { console.warn('위젯 갱신 실패', e); }
  }, 400);
}
