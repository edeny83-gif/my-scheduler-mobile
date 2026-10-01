// 무선 업데이트(EAS Update): 앱을 켜거나 다시 앞으로 올 때 새 버전을 확인해 받아 두고,
// 받은 뒤에는 "지금 적용" 안내를 띄운다. 그냥 두면 다음에 앱을 켤 때 새 버전으로 시작한다.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

const MIN_GAP = 30 * 60_000; // 확인 간격 (30분)

export function useAppUpdate() {
  const { isUpdatePending } = Updates.useUpdates();
  const last = useRef(0);
  useEffect(() => {
    if (!Updates.isEnabled) return undefined; // 개발 중이거나 업데이트 주소가 없는 설치본
    const check = async () => {
      if (Date.now() - last.current < MIN_GAP) return;
      last.current = Date.now();
      try {
        const r = await Updates.checkForUpdateAsync();
        if (r.isAvailable) await Updates.fetchUpdateAsync();
      } catch (e) { console.log('[update] 확인 실패', e && e.message); }
    };
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, []);
  return { pending: !!isUpdatePending, apply: () => { Updates.reloadAsync().catch(() => {}); } };
}
