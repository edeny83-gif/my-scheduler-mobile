// Firebase 연결 (안드로이드·아이폰). 로그인 상태는 AsyncStorage에 보관되어 앱을 껐다 켜도 유지된다(비밀번호는 저장하지 않음).
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import * as firestore from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseConfig } from '../firebase-config';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
let a;
try { a = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) }); }
catch { a = getAuth(app); }
export const auth = a;
let database;
try {
  // 폰은 일정을 AsyncStorage에 직접 보관하므로 Firestore 캐시는 메모리만. 긴 연결이 막히는 망을 위해 long polling 사용.
  database = firestore.initializeFirestore(app, { localCache: firestore.memoryLocalCache(), experimentalForceLongPolling: true });
} catch { database = firestore.getFirestore(app); }
export const db = database;
export { firestore };
