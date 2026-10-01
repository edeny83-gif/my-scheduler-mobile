// 앱이 꺼져 있어도 약 15분마다 서버의 변경을 받아 알림 예약과 홈 화면 위젯을 갱신한다 (무료 요금제라 푸시 대신 주기 확인).
// 안드로이드/아이폰의 절전 정책에 따라 더 늦어질 수 있다.
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { store } from '../storage/store';
import { settings } from '../storage/settings';

export const TASK = 'myscheduler-background-sync';

async function oneShotSync() {
  const { auth, db, firestore } = require('./firebase');
  const { fromRemote, pushDocs } = require('../core/sync-core');
  await Promise.all([store.load(), settings.load()]);
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return false;
  const snap = await firestore.getDocsFromServer(firestore.collection(db, 'users', user.uid, 'events')); // 인터넷이 없으면 오류로 끝남
  const docs = [];
  snap.forEach((d) => { const x = fromRemote(d.id, d.data()); if (x) docs.push(x); });
  store.claimOwner(user.uid);
  const toPush = store.applyRemote(docs, { full: true });
  const dirty = store.getDirtyDocs();
  if (dirty.length) {
    await pushDocs(firestore, db, user.uid, dirty);
    store.markClean(dirty.map(({ id, updatedAt }) => ({ id, updatedAt })));
  }
  await require('./notifications').rescheduleAll(store.list());
  require('../widget/update').updateWidget();
  return toPush.length >= 0;
}

TaskManager.defineTask(TASK, async () => {
  try {
    await oneShotSync();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.warn('백그라운드 동기화 실패', e && e.message);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync() {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
    if (!(await TaskManager.isTaskRegisteredAsync(TASK))) await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
    return true;
  } catch (e) { console.warn('백그라운드 동기화 등록 실패', e && e.message); return false; }
}
