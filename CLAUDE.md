# MyScheduler 모바일 — Claude Code 작업 지침

PC 바탕화면 캘린더(my-scheduler-desktop)와 같은 기능의 안드로이드 앱. **한 코드로 일반 폰과 갤럭시 폴드7(접음/펼침)을 모두 지원**하고, 나중에 같은 코드로 아이폰 앱을 만든다.
Expo SDK 57 / React Native 0.86. 데이터의 원본은 폰 안(AsyncStorage)이고, 로그인하면 Firebase(Firestore)로 PC 캘린더와 실시간 동기화한다.
사용자는 교사이며 요청·답변·커밋 메시지는 한국어.

## 폴더 구조
| 위치 | 역할 |
|---|---|
| `App.js` | 화면 폭으로 레이아웃 결정. `EXPANDED_MIN_WIDTH`(600dp) 이상 = 폴드 펼침(기본은 달력 전체, 오른쪽 위 ✦« 로 비서·일정·설정 칸을 사이드바처럼 열고 닫음), 미만 = 아래 탭(폰·폴드 커버) |
| `index.js` | 앱 등록 + 안드로이드 위젯 작업 처리기 등록 |
| `src/core/` | **플랫폼 공통 순수 로직** (React·Node 기능 없음). PC 버전과 규칙이 같아야 한다 |
| ├ `dates.js` `convert.js` | 날짜 도우미, AI 항목↔일정 변환, 알림 기본값, 중복 판별, 저장 전 검사 |
| ├ `monthLayout.js` | 월간 배치(주·장기 일정 줄·넘침), 날짜별 목록, 다가오는 일정 |
| ├ `ical.js` | 공휴일·구글·외부 iCal 해석(반복 펼침) |
| ├ `extract.js` | HWP 5.x·HWPX·DOCX 글자 추출 (Uint8Array만 사용) |
| └ `ai.js` | Gemini/Claude 분석. 파일은 `{name, ext, size, bytes(), base64(), upload()}` 객체로 추상화 |
| `src/storage/` | `store.js`(일정 — 저장만 담당, 로직은 `core/sync-core.js`), `settings.js`(설정·기본값), `keys.js`(API 키, SecureStore) |
| `src/core/sync-core.js` | **PC·폰 공통(PC 프로젝트의 `sync-core.js`와 내용이 같아야 함)**: 최신 우선 합치기, SyncEngine, Firestore 구독/올리기 |
| `src/services/sync.js` | 로그인 상태 + 실시간 구독 + 올리기. `firebase.native.js`(폰: AsyncStorage 로그인 유지, long polling) / `firebase.js`(웹 미리보기) |
| `src/services/backgroundSync.js` | 앱이 꺼져 있을 때 약 15분마다 서버 확인 → 알림·위젯 갱신 (expo-background-task) |
| `src/services/` | `feeds.js`(iCal 받기·캐시), `notifications.js`(알림 예약), `files.js`(문서·사진·촬영·녹음 → 파일 객체) |
| `src/ui/` | `MonthView` `DayList` `EventEditor` `QuickPrompt`(달력 아래 글·말 빠른 입력) `AssistantScreen` `SettingsScreen` `common`(버튼·입력·날짜 선택) `theme` |
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
- 서버 경로 `users/{uid}/events/{id}`, **updatedAt이 큰 쪽이 이김**, 삭제는 `deleted:true` 표시, 못 올린 변경은 `dirty`에 기록(서버 첫 응답 후 전송). 자세한 규칙은 PC 프로젝트 CLAUDE.md의 "클라우드 동기화".
- 일정 필드를 바꾸면 `sync-core.js`를 PC 프로젝트와 똑같이 고치고 `npm test`(sync.test.js)로 확인한다.

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

## 배포 (자동)
- `main`에 병합(push)되면:
  - 화면·기능·버그 수정(JS 변경) → `mobile-update.yml`이 테스트 후 **무선 업데이트(EAS Update, 채널 production)** 를 게시한다. 폰 앱은 켜거나 다시 앞으로 올 때 확인해 받고 "새 버전을 받았습니다 — 눌러서 지금 적용" 배너를 띄운다. APK를 다시 설치할 필요가 없다.
  - `app.json`·`package.json`·`package-lock.json`이 바뀌면 `android-apk.yml`이 APK를 새로 빌드해 Releases의 `mobile-latest`에 올린다(새 폰 설치용).
- **무선 업데이트는 JS 코드만 바꿀 수 있다.** 새 권한·새 네이티브 패키지(expo-*, react-native-* 등)·app.json 플러그인을 바꾸면 반드시 `app.json`의 `expo.version`을 올린다(예: 0.3.0 → 0.4.0). `scripts/native-guard.js`가 병합 뒤 검사해서, 바뀌었는데 version이 그대로면 배포를 막는다. version을 올리면 새 APK를 폰에 한 번 설치해야 이후 업데이트를 받는다(runtimeVersion 정책이 appVersion이라 버전이 같은 설치본에만 업데이트가 간다).
- 필요한 것: GitHub Secret `EXPO_TOKEN`, app.json의 `extra.eas.projectId`·`updates.url`(`eas update:configure`가 만든다). 없으면 업데이트 단계가 경고/실패로 알려 준다.

## 클라우드(폰) 세션에서 수정을 요청받았을 때
사용자는 교사이며, 폰의 Claude 앱 → Code 탭으로 "불편한 점"을 말로 요청한다. 다음을 지킨다.
1. 이 CLAUDE.md와 관련 파일을 읽고, 이해한 요청을 한두 줄로 다시 말한다. 정말 애매할 때만 한 번 질문한다.
2. 수정 후 `npm test`와 `npx expo export --platform android --output-dir /tmp/b`(코드 묶음이 만들어지는지)를 돌린다. 화면 변경은 웹 빌드 + Playwright 캡처로 확인한다. 이 환경에서는 실제 폰·홈 화면 위젯·알림·녹음을 확인할 수 없으니 **확인하지 못한 것은 솔직히 적는다.**
3. `main`에 직접 push하지 않는다. 작업 브랜치로 PR을 만든다. PR 설명에 ① 무엇이 바뀌는지 ② 병합하면 폰에 언제 반영되는지(JS 변경: 앱을 켤 때 자동 / 네이티브 변경: version을 올렸고 APK 재설치 필요) ③ 확인하지 못한 위험 을 쉬운 말로 적는다. 병합은 사용자가 직접 한다.
4. 새 권한이나 새 네이티브 패키지가 꼭 필요한 요청이면, 그 이유와 "APK를 새로 설치해야 한다"는 점을 먼저 알리고 `expo.version`을 올린다.
5. 일정 저장·동기화 형식을 바꿀 때: 기존 필드는 이름·의미를 바꾸지 말고 **새 필드만 추가**한다(기기마다 버전이 다른 동안에도 일정이 깨지면 안 된다). `src/core/sync-core.js`를 고치면 PC 저장소(my-scheduler)의 `sync-core.js`도 똑같이 고쳐 PR을 만든다. 두 저장소가 함께 열린 세션이 아니면 사용자에게 알린다.
6. 비밀값(API 키·비밀번호·토큰)을 코드·PR·커밋 메시지에 쓰지 않는다.
7. 병합 뒤 문제가 생겨 "되돌려줘"라고 하면, 해당 PR을 되돌리는(revert) PR을 만든다.

## 다음 단계 후보
- (완료) Firebase 동기화·로그인. 남은 것: 즉시 반영이 필요하면 Blaze 요금제 + Cloud Functions/FCM 푸시.
- 아이폰: 같은 코드 + EAS Build(Apple 개발자 계정 필요). 홈 화면 위젯은 Swift(WidgetKit) 타깃을 따로 추가해야 한다.
- 폴드 플렉스 모드(반쯤 접음): Jetpack WindowManager 연동 네이티브 모듈 필요.
- 다른 앱(메신저 등)에서 "공유"로 파일 받기: share intent 플러그인.
