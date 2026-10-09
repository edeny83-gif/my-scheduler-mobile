// 폰 캘린더 복사본 규칙 시험 (node test/mirror.test.js)
process.env.TZ = 'Asia/Seoul';
const assert = require('node:assert');
const { toDeviceEvent, planMirror, signature, PAST_WINDOW, PLACEHOLDER } = require('../src/core/mirror');
const ok = (m) => console.log('  ✓', m);
const ms = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const utc = (y, m, d) => Date.UTC(y, m - 1, d);

console.log('폰 캘린더에 적을 모양');
// 시간 일정: 그대로, 제목은 켠 경우만
const timed = { id: 'a', title: '협의회', start: ms(2026, 10, 5, 15), end: ms(2026, 10, 5, 16), allDay: false };
assert.deepStrictEqual(toDeviceEvent(timed), { title: PLACEHOLDER, allDay: false, startDate: timed.start, endDate: timed.end, timeZone: null });
assert.strictEqual(toDeviceEvent(timed, { withTitles: true }).title, '협의회');
// 끝이 없거나 시작보다 빠르면 길이 0
assert.strictEqual(toDeviceEvent({ ...timed, end: null }).endDate, timed.start);
// 종일 하루: 이 기기 날짜의 UTC 자정 ~ 다음날 UTC 자정 (한국 시각 자정을 그대로 쓰면 하루 밀린다)
const day = toDeviceEvent({ id: 'b', title: '한글날', start: ms(2026, 10, 9), end: null, allDay: true });
assert.deepStrictEqual([day.startDate, day.endDate, day.timeZone], [utc(2026, 10, 9), utc(2026, 10, 10), 'UTC']);
// 종일 여러 날: end = 마지막 날 00:00(포함) → 다음날 UTC 자정(제외)
const multi = toDeviceEvent({ id: 'c', title: '상담 주간', start: ms(2026, 10, 13), end: ms(2026, 10, 17), allDay: true });
assert.deepStrictEqual([multi.startDate, multi.endDate], [utc(2026, 10, 13), utc(2026, 10, 18)]);
// 달 넘김
const eom = toDeviceEvent({ id: 'd', title: '말일', start: ms(2026, 10, 31), end: ms(2026, 10, 31), allDay: true });
assert.deepStrictEqual([eom.startDate, eom.endDate], [utc(2026, 10, 31), utc(2026, 11, 1)]);
ok('시간·종일·여러 날·달 넘김·제목 숨김');

console.log('무엇을 만들고·고치고·지울지');
const now = ms(2026, 10, 9, 12);
const e1 = { id: 'e1', title: 'A', start: ms(2026, 10, 10, 9), end: ms(2026, 10, 10, 10), allDay: false };
const e2 = { id: 'e2', title: 'B', start: ms(2026, 10, 11, 9), end: ms(2026, 10, 11, 10), allDay: false };
const old = { id: 'old', title: '아주 옛날', start: now - PAST_WINDOW - 86_400_000, end: null, allDay: false };
const gone = { id: 'gone', title: '지움', start: ms(2026, 10, 12), end: null, allDay: true, deleted: true };

// 처음: 전부 새로 만든다(오래된 일정·지운 일정은 빼고)
let p = planMirror({}, [e1, e2, old, gone], { now });
assert.deepStrictEqual(p.create.map((x) => x.id), ['e1', 'e2']);
assert.strictEqual(p.update.length + p.remove.length, 0);

// 두 번째: 바뀐 것만 고치고, 없어진 것은 지우고, 그대로인 것은 둔다
const prev = {
  e1: { deviceId: '101', sig: signature(toDeviceEvent(e1)) },
  e2: { deviceId: '102', sig: signature(toDeviceEvent(e2)) },
  x: { deviceId: '103', sig: 'whatever' },
};
const e2moved = { ...e2, start: e2.start + 3_600_000, end: e2.end + 3_600_000 };
p = planMirror(prev, [e1, e2moved], { now });
assert.deepStrictEqual(Object.keys(p.keep), ['e1']);
assert.deepStrictEqual(p.update.map((x) => [x.id, x.deviceId]), [['e2', '102']]);
assert.deepStrictEqual(p.remove, [{ id: 'x', deviceId: '103' }]);
assert.strictEqual(p.create.length, 0);

// 제목만 바뀐 경우: 제목을 숨기면 고칠 것이 없고, 제목을 보이면 고친다
const e1renamed = { ...e1, title: 'A2' };
assert.strictEqual(planMirror(prev, [e1renamed, e2], { now }).update.length, 0);
const prevTitled = { e1: { deviceId: '101', sig: signature(toDeviceEvent(e1, { withTitles: true })) } };
assert.strictEqual(planMirror(prevTitled, [e1renamed], { now, withTitles: true }).update.length, 1);
// "제목도 함께 저장"을 켜면 모두 다시 적는다
assert.strictEqual(planMirror(prev, [e1, e2], { now, withTitles: true }).update.length, 2);
ok('처음 만들기·바뀐 것만 고치기·지우기·제목 설정에 따른 다시 적기');

console.log('모두 통과');
