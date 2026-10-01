// 폰 ↔ 서버 동기화 서비스. 로그인하면 users/{uid}/events를 실시간으로 구독한다.
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db, firestore } from './firebase';
import { SyncEngine, listen, pushDocs, friendlyError } from '../core/sync-core';
import { store } from '../storage/store';

class SyncService {
  state = { phase: 'starting', email: '', uid: '', error: '' };
  listeners = new Set();
  started = false;
  unsub = null;
  handlers = null;

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  set(phase, extra = {}) {
    const u = auth.currentUser;
    this.state = { phase, email: u ? u.email || '' : '', uid: u ? u.uid : '', error: extra.error || '' };
    this.listeners.forEach((fn) => fn(this.state));
  }

  start() {
    if (this.started) return;
    this.started = true;
    const remote = {
      start: (h) => { this.handlers = h; },
      push: async (docs) => {
        const u = auth.currentUser;
        if (!u) throw new Error('로그인이 필요합니다');
        await pushDocs(firestore, db, u.uid, docs);
      },
    };
    this.engine = new SyncEngine({ store, remote, log: (...a) => console.log('[sync]', ...a) });
    this.engine.start();

    onAuthStateChanged(auth, (user) => {
      if (this.unsub) { this.unsub(); this.unsub = null; }
      if (!user) { this.engine.reset(); this.set('signed-out'); return; }
      this.set('connecting');
      this.unsub = listen(firestore, db, user.uid, {
        onSnapshot: (docs, meta) => {
          if (store.claimOwner(user.uid)) console.log('[sync] 다른 계정으로 로그인해 이 폰의 일정을 새 계정 데이터로 바꿉니다');
          this.handlers.onSnapshot(docs, meta);
          this.set(meta.fromCache ? 'connecting' : 'online');
        },
        onError: (err) => this.set('error', { error: friendlyError(err) }),
      });
    });
  }

  async login(email, password) {
    try {
      await signInWithEmailAndPassword(auth, String(email || '').trim(), String(password || ''));
      return { ok: true };
    } catch (e) { return { ok: false, error: friendlyError(e) }; }
  }
  async logout() {
    try { await signOut(auth); return { ok: true }; } catch (e) { return { ok: false, error: friendlyError(e) }; }
  }
}

export const sync = new SyncService();
