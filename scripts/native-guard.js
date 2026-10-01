// 무선 업데이트(OTA)는 JS 코드 변경만 담을 수 있다.
// 새 권한·네이티브 패키지·플러그인이 바뀌었는데 app.json의 version이 그대로면 배포를 막는다
// (예전 앱에 없는 네이티브 기능을 쓰는 코드가 전달되어 앱이 멈추는 일을 막기 위해).
const { execSync } = require('node:child_process');
const fs = require('node:fs');

function stable(o) {
  if (Array.isArray(o)) return o.map(stable);
  if (o && typeof o === 'object') return Object.fromEntries(Object.keys(o).sort().map((k) => [k, stable(o[k])]));
  return o;
}
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

function nativePart(app) {
  const e = (app && app.expo) || {};
  const android = { ...(e.android || {}) };
  delete android.versionCode; // CI가 매번 바꾸는 값
  return { plugins: e.plugins || [], android, ios: e.ios || {}, scheme: e.scheme || null };
}

/** prev/next = { pkg, app } → { reasons: string[], versionBumped: boolean } */
function needsNewBinary(prev, next) {
  const reasons = [];
  if (!same(prev.pkg.dependencies || {}, next.pkg.dependencies || {})) reasons.push('package.json의 dependencies(사용하는 패키지)가 바뀌었습니다');
  const a = nativePart(prev.app), b = nativePart(next.app);
  if (!same(a.plugins, b.plugins)) reasons.push('app.json의 plugins가 바뀌었습니다');
  if (!same(a.android, b.android) || !same(a.ios, b.ios)) reasons.push('app.json의 android/ios 설정(권한 등)이 바뀌었습니다');
  if (a.scheme !== b.scheme) reasons.push('app.json의 scheme이 바뀌었습니다');
  const versionBumped = (prev.app.expo || {}).version !== (next.app.expo || {}).version;
  return { reasons, versionBumped };
}

function readAt(sha, file) {
  try { return JSON.parse(execSync(`git show ${sha}:${file}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch { return null; }
}

if (require.main === module) {
  let base = process.env.BASE_SHA;
  if (!base || /^0+$/.test(base)) base = 'HEAD~1';
  const prevPkg = readAt(base, 'package.json'), prevApp = readAt(base, 'app.json');
  if (!prevPkg || !prevApp) { console.log('비교할 이전 기록이 없어 검사를 건너뜁니다.'); process.exit(0); }
  const r = needsNewBinary({ pkg: prevPkg, app: prevApp }, { pkg: JSON.parse(fs.readFileSync('package.json', 'utf8')), app: JSON.parse(fs.readFileSync('app.json', 'utf8')) });
  if (r.reasons.length && !r.versionBumped) {
    console.error('✋ 앱 설치 파일(네이티브) 구성이 바뀐 것 같은데 app.json의 expo.version이 그대로입니다:');
    r.reasons.forEach((x) => console.error(' - ' + x));
    console.error('→ expo.version을 올리면(예: 0.3.0 → 0.4.0) 안전하게 배포됩니다. 올린 뒤에는 APK를 폰에 한 번 새로 설치해야 이후 업데이트를 받습니다.');
    process.exit(1);
  }
  console.log(r.reasons.length ? `네이티브 변경 있음 + version 올림 → 통과 (APK를 새로 설치해야 합니다)` : '네이티브 변경 없음 → 무선 업데이트로 배포 가능');
}
module.exports = { needsNewBinary };
