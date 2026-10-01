import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';
import App from './App';

// 백그라운드 동기화 작업은 앱 시작 때 가장 먼저 정의되어야 한다 (안드로이드·아이폰)
if (Platform.OS !== 'web') require('./src/services/backgroundSync');

// 홈 화면 위젯은 앱이 꺼져 있어도 이 처리기로 그려진다 (안드로이드)
if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widget/taskHandler');
  registerWidgetTaskHandler(widgetTaskHandler);
}

registerRootComponent(App);
