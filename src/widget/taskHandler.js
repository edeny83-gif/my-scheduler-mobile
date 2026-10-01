import React from 'react';
import { CalendarWidget } from './CalendarWidget';
import { loadWidgetData } from './load';
import { selectedDay, setSelectedDay, forgetWidget } from './state';

// 위젯 터치
//  - 날짜를 한 번 누르면 그 날 일정이 아래 목록에 나온다(SELECT_DAY)
//  - 위젯 어디든 한 번 누르면 1.5초 동안 "한 번 더 누르면 앱이 열림" 상태가 된다(armed).
//    그 사이 한 번 더 누르면 앱이 그 날짜로 열린다(= 두 번 눌러 열기). 위젯은 두 번 누르기를 직접 알 수 없어 이렇게 흉내 낸다
export const ARM_MS = 1500;

export async function widgetTaskHandler({ widgetInfo, widgetAction, clickAction, clickActionData, renderWidget }) {
  const id = widgetInfo.widgetId;
  if (widgetAction === 'WIDGET_DELETED') { await forgetWidget(id); return; }
  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'SELECT_DAY' && clickActionData?.day != null) {
    await setSelectedDay(id, Number(clickActionData.day));
  }
  const data = await loadWidgetData();
  const day = await selectedDay(id);
  const draw = (armed) => renderWidget(<CalendarWidget {...data} day={day} armed={armed} width={widgetInfo.width} height={widgetInfo.height} />);
  if (widgetAction === 'WIDGET_CLICK') {
    draw(true);
    await new Promise((r) => setTimeout(r, ARM_MS));
  }
  draw(false);
}
