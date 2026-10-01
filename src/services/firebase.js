// Firebase 연결 (웹 미리보기용). 실제 폰 앱은 firebase.native.js가 쓰인다.
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import * as firestore from 'firebase/firestore';
import { firebaseConfig } from '../firebase-config';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
let database;
try { database = firestore.initializeFirestore(app, { localCache: firestore.memoryLocalCache() }); }
catch { database = firestore.getFirestore(app); }
export const db = database;
export { firestore };
