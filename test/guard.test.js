const assert = require('node:assert');
const { needsNewBinary } = require('../scripts/native-guard');
const base = { pkg: { dependencies: { expo: '~57', react: '19' } }, app: { expo: { version: '0.3.0', plugins: ['expo-secure-store'], android: { package: 'x', versionCode: 1, permissions: ['A'] } } } };
const clone = (o) => JSON.parse(JSON.stringify(o));
const ok = (m) => console.log('  ✓', m);

console.log('네이티브 변경 검사');
assert.deepStrictEqual(needsNewBinary(base, clone(base)).reasons, []);
const jsOnly = clone(base); jsOnly.app.expo.android.versionCode = 99; jsOnly.app.expo.extra = { eas: { projectId: 'p' } }; jsOnly.app.expo.updates = { url: 'https://u.expo.dev/p' }; jsOnly.app.expo.runtimeVersion = { policy: 'appVersion' };
assert.deepStrictEqual(needsNewBinary(base, jsOnly).reasons, []); ok('JS만 바뀜(versionCode·업데이트 주소·extra는 무시) → 통과');
const dep = clone(base); dep.pkg.dependencies['expo-updates'] = '~57'; let r = needsNewBinary(base, dep);
assert.ok(r.reasons.length === 1 && !r.versionBumped); ok('패키지 추가 + version 그대로 → 막힘');
dep.app.expo.version = '0.4.0'; r = needsNewBinary(base, dep); assert.ok(r.reasons.length && r.versionBumped); ok('패키지 추가 + version 올림 → 통과');
const perm = clone(base); perm.app.expo.android.permissions.push('B'); assert.ok(needsNewBinary(base, perm).reasons.length); ok('권한 추가 감지');
const plug = clone(base); plug.app.expo.plugins.push('expo-camera'); assert.ok(needsNewBinary(base, plug).reasons.length); ok('플러그인 추가 감지');
const order = clone(base); order.pkg.dependencies = { react: '19', expo: '~57' }; assert.deepStrictEqual(needsNewBinary(base, order).reasons, []); ok('같은 내용의 순서 변경은 무시');
console.log('\n모든 안전장치 시험 통과');
