# MyScheduler 모바일 — Claude Code 작업 지침

PC 바탕화면 캘린더(my-scheduler-desktop)와 같은 기능의 안드로이드 앱. **한 코드로 일반 폰과 갤럭시 폴드7(접음/펼침)을 모두 지원**하고, 나중에 같은 코드로 아이폰 앱을 만든다.
Expo SDK 57 / React Native 0.86. 지금은 **폰 단독**(데이터는 폰 안). Firebase 실시간 연동은 다음 단계.
사용자는 교사이며 요청·답변·커밋 메시지는 한국어.

## 폴더 구조
| 위치 | 역할 |
|---|---|
| `App.js` | 화면 폭으로 레이아웃 결정. `EXPANDED_MIN_WIDTH`(600dp) 이상 = 두 칸(폴드 펼침), 미만 = 아래 탭(폰·폴드 커버) |
| `index.js` | 앱 등록 + 안드로이드 위젯 작업 처리기 등록 |
| `src/core/` | **플랫폼 공통 순수 로직** (React·Node 기능 없음). PC 버전과 규칙이 같아야 한다 |
| ├ `dates.js` `convert.js` | 날짜 도우미, AI 항목↔일정 변환, 알림 기본값, 중복 판별, 저장 전 검사 |
| ├ `monthLayout.js` | 월간 배치(주·장기 일정 줄·넘침), 날짜별 목록, 다가오는 일정 |
| ├ `ical.js` | 공휴일·구글·외부 iCal 해석(반복 펼침) |
| ├ `extract.js` | HWP 5.x·HWPX·DOCX 글자 추출 (Uint8Array만 사용) |
| └ `ai.js` | Gemini/Claude 분석. 파일은 `{name, ext, size, bytes(), base64(), upload()}` 객체로 추상화 |
| `src/storage/` | `store.js`(일정, AsyncStorage), `settings.js`(설정·기본값), `keys.js`(API 키, SecureStore) |
| `src/services/` | `feeds.js`(iCal 받기·캐시), `notifications.js`(알림 예약), `files.js`(문서·사진·촬영·녹음 → 파일 객체) |
| `src/ui/` | `MonthView` `DayList` `EventEditor` `AssistantScreen` `SettingsScreen` `common`(버튼·입력·날짜 선택) `theme` |
| `src/widget/` | 홈 화면 위젯(react-native-android-widget). 앱이 꺼져 있어도 AsyncStorage에서 직접 읽어 그린다 |
| `test/` | `npm test`(핵심 로직), `fixtures/`(샘플 HWP·HWPX·DOCX) |

## 데이터 모델 (PC와 동일)
AsyncStorage `myscheduler.events.v1` = `{ version: 1, events: [...] }` — PC의 `events.json`과 같은 형식.
```
{ id, title, start(ms), end(ms|null), allDay, location, memo, color("#rrggbb"|""), remind(number[]),
  source(""|"ai"|"claude-code"), createdAt, updatedAt }
```
- 종일 일정 end = 마지막 날 00:00(포함). 알림 remind: 시간 일정은 시작 전 분, 종일은 00:00 기준(-480 = 당일 오전 8시, 900 = 전날 오전 9시).
- 필드를 바꾸면 `src/core/convert.js`(cleanEvent·itemToEvent·eventToItem)와 PC 쪽 `store.js`·`convert.js`를 함께 고친다.
- Firebase 연동 시 `src/storage/store.js`를 같은 인터페이스(load/list/add/addMany/update/remove/subscribe)로 교체한다.

## 화면 규칙 (사용자 요구사항)
- 오늘: 칸 전체 연한 흰 바탕만(동그라미·노란색 금지). 일정: 배경 없이 **글자색만**. 여러 날 일정: ←── 제목 ──→.
- 칸 폭이 88dp 미만이면 달력 칸에서 시간을 빼고 제목만(시간은 아래 목록에).
- 폴드7 수치(대략): 커버 411×960dp, 펼침 약 750×832dp(가로 832×750). 폭이 바뀌어도 앱이 재시작되지 않는다(configChanges에 screenSize 포함).
- 터치 영역은 최소 44dp.

## 확인 방법
1. `npm test` — 핵심 로직.
2. `npx expo export --platform android --output-dir /tmp/b` — 안드로이드용 코드 묶음이 만들어지는지.
3. 화면: `npx expo export --platform web` 후 `dist/`를 띄워 Playwright로 412×915(폰), 411×960(커버), 750×832·832×750(펼침) 캡처.
   웹에서는 카메라·녹음·위젯·알림이 빠지는 것이 정상.
4. `npx expo prebuild --platform android --no-install`로 매니페스트(권한·위젯·딥링크) 확인. 생성된 `android/`는 커밋하지 않는다.
5. SDK 57 API는 설치된 `node_modules/*/build/*.d.ts`로 확인하고 쓴다(예: expo-file-system의 `File`, expo-audio의 `useAudioRecorder`, 알림 트리거 `SchedulableTriggerInputTypes.DATE`).

## 배포
`git tag mobile-vX.Y.Z && git push --tags` → Actions(`android-apk.yml`)가 APK를 만들어 Releases에 올림. Actions 탭에서 직접 실행해도 된다.
서명은 Expo 기본 키(항상 같음)라 새 APK를 기존 앱 위에 설치할 수 있다. Play 스토어에 올릴 때는 별도 서명 키가 필요.

## 다음 단계 후보
- Firebase 실시간 연동(PC와 공유), 로그인.
- 아이폰: 같은 코드 + EAS Build(Apple 개발자 계정 필요). 홈 화면 위젯은 Swift(WidgetKit) 타깃을 따로 추가해야 한다.
- 폴드 플렉스 모드(반쯤 접음): Jetpack WindowManager 연동 네이티브 모듈 필요.
- 다른 앱(메신저 등)에서 "공유"로 파일 받기: share intent 플러그인.
