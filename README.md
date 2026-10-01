# 내 캘린더 (안드로이드 · 갤럭시 폴드7 대응)

PC 바탕화면 캘린더와 같은 기능의 스마트폰 앱입니다. 폴드7은 접으면 폰 화면, 펼치면 달력과 일정·AI 비서를 나란히 보는 두 칸 화면으로 자동 전환됩니다.

## 설치 파일(APK) 만들기 — GitHub Actions (추천)
1. 이 폴더를 GitHub 저장소(예: `my-scheduler-mobile`)에 올립니다.
2. 저장소의 **Actions** 탭 → **Android APK** → **Run workflow**를 누릅니다 (약 15~20분).
   또는 `git tag mobile-v0.1.0 && git push --tags` 하면 Releases에도 올라갑니다.
3. 실행 결과의 **Artifacts**(또는 Releases)에서 APK를 폰으로 받아 엽니다.
   처음에는 "출처를 알 수 없는 앱 설치"를 허용해야 합니다(설정 → 애플리케이션 → 특별한 접근 → 알 수 없는 앱 설치).

다른 방법: Expo 계정이 있으면 `npx eas-cli build -p android --profile preview`로도 APK를 받을 수 있습니다.

## 처음 설정
- **알림:** 처음 실행할 때 알림 권한을 허용하세요.
- **홈 화면 위젯:** 홈 화면을 길게 누름 → 위젯 → "내 캘린더". 모양은 앱 → 설정 → 홈 화면 위젯에서 바꿉니다.
- **AI 비서:** 설정 → AI 비서에 Gemini API 키(aistudio.google.com)를 넣고 "확인"을 누르세요. 녹음 분석은 Gemini만 됩니다.
- **PC 일정 옮기기:** PC 캘린더 트레이 → 데이터 폴더 열기 → `events.json`을 폰으로 보낸 뒤, 앱 설정 → 데이터 → 가져오기.

## 사용법
- 날짜 누르기: 그날 일정 보기 / 길게 누르기: 일정 추가 / 좌우로 밀기: 달 이동
- ✦ AI 비서: 문서(HWP·PDF)·사진 선택·사진 찍기·회의 녹음 → 분석 → 확인 후 추가(되돌리기 가능)

## 개발
```
npm install
npm test            # 핵심 로직 시험
npx expo start      # 개발 서버 (위젯·녹음은 개발용 빌드에서 확인)
```
Claude Code로 수정할 때는 `CLAUDE.md`를 먼저 읽게 하세요.
