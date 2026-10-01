// 웹 미리보기용: 업데이트 기능 없음. 실제 폰 앱은 appUpdate.native.js가 쓰인다.
export function useAppUpdate() {
  return { pending: false, apply: () => {} };
}
