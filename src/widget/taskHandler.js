import React from 'react';
import { CalendarWidget } from './CalendarWidget';
import { loadWidgetData } from './load';

export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }) {
  if (widgetAction === 'WIDGET_DELETED') return;
  const data = await loadWidgetData();
  renderWidget(<CalendarWidget {...data} width={widgetInfo.width} height={widgetInfo.height} />);
}
