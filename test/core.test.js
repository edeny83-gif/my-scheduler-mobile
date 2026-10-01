// 핵심 로직 시험 (node test/core.test.js) — 폰·PC가 같은 규칙으로 동작하는지 확인
process.env.TZ = 'Asia/Seoul';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { itemToEvent, eventToItem, findDuplicate, cleanEvent } = require('../src/core/convert');
const { buildMonth, itemsOnDay, upcoming } = require('../src/core/monthLayout');
const { expandICS, parseHolidays, sourcesFrom } = require('../src/core/ical');
const { extractText } = require('../src/core/extract');
const ai = require('../src/core/ai');
const ok = (m) => console.log('  ✓', m);
const ms = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();

(async () => {
  console.log('일정 변환 (PC와 같은 규칙)');
  const e1 = itemToEvent({ title: '협의회', date: '2026-10-05', time: '15:00' });
  assert.strictEqual(new Date(e1.start).getHours(), 15); assert.deepStrictEqual(e1.remind, [30]);
  const e2 = itemToEvent({ title: '상담 주간', date: '2026-10-13', endDate: '2026-10-17' });
  assert.ok(e2.allDay && new Date(e2.end).getDate() === 17); assert.deepStrictEqual(e2.remind, [-480]);
  assert.deepStrictEqual(itemToEvent({ title: '제출', date: '2026-10-08', kind: '마감' }).remind, [900]);
  assert.throws(() => itemToEvent({ title: 'x', date: '2026-02-30' }), /날짜 형식/);
  assert.strictEqual(eventToItem({ id: 'a', ...e2 }).endDate, '2026-10-17');
  assert.ok(findDuplicate(itemToEvent({ title: '3학년 협의회', date: '2026-10-05', time: '16:00' }), [e1]));
  assert.deepStrictEqual(cleanEvent({ title: 'a', start: 1, remind: [30, -480, -5000, 30] }).remind, [-480, 30]);
  ok('시간·종일·여러 날·마감 알림 기본값·중복·잘못된 날짜');

  console.log('월간 배치');
  const items = [
    { id: 'm', title: '수학여행', start: ms(2026, 10, 1), end: ms(2026, 10, 2), allDay: true },
    { id: 'w', title: '상담 주간', start: ms(2026, 10, 9), end: ms(2026, 10, 13), allDay: true },   // 주를 넘김
    { id: 's', title: '협의회', start: ms(2026, 10, 5, 15), end: ms(2026, 10, 5, 16), allDay: false },
    { id: 'n', title: '밤샘', start: ms(2026, 10, 6, 23), end: ms(2026, 10, 7, 0), allDay: false }, // 자정까지는 하루짜리
  ];
  const m = buildMonth(ms(2026, 10, 15), items);
  assert.strictEqual(m.weeks.length, 5);
  assert.strictEqual(m.weeks[0].days[0], ms(2026, 9, 27));
  const s0 = m.weeks[0].segs.find((x) => x.e.id === 'm');
  assert.deepStrictEqual([s0.a, s0.b], [4, 5]);
  const w1 = m.weeks[1].segs.find((x) => x.e.id === 'w'), w2 = m.weeks[2].segs.find((x) => x.e.id === 'w');
  assert.ok(w1.contR && w2.contL && w1.a === 5 && w1.b === 6 && w2.a === 0 && w2.b === 2, '주 경계를 넘는 일정');
  assert.ok(m.weeks[1].singles[2].some((e) => e.id === 'n'), '23:00~00:00은 하루짜리');
  assert.deepStrictEqual(itemsOnDay(ms(2026, 10, 11), items).map((e) => e.id), ['w']);
  const many = [...Array(6)].map((_, i) => ({ id: 'l' + i, title: 'L' + i, start: ms(2026, 10, 12), end: ms(2026, 10, 14), allDay: true }));
  const mm = buildMonth(ms(2026, 10, 1), many, { maxLanes: 3 });
  assert.deepStrictEqual(mm.weeks[2].hidden.slice(1, 4), [3, 3, 3], '넘치는 장기 일정은 +n으로');
  assert.strictEqual(upcoming(items, ms(2026, 10, 3), 2)[0].id, 's');
  ok('주 수·장기 일정 줄 배정·주 경계·넘침 개수·날짜별 목록·다가오는 일정');

  console.log('iCal·공휴일');
  const y = new Date().getFullYear();
  const ics = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:w\nDTSTART:${y}1005T060000Z\nDTEND:${y}1005T070000Z\nRRULE:FREQ=WEEKLY;COUNT=3\nSUMMARY:주간회의\nEND:VEVENT\nBEGIN:VEVENT\nUID:h\nDTSTART;VALUE=DATE:${y}1003\nDTEND;VALUE=DATE:${y}1004\nSUMMARY:개천절\nDESCRIPTION:공휴일\nEND:VEVENT\nEND:VCALENDAR`;
  assert.strictEqual(expandICS(ics).filter((o) => o.title === '주간회의').length, 3);
  assert.deepStrictEqual(parseHolidays(ics).find((h) => h.name === '개천절'), { date: `${y}-10-03`, name: '개천절', holiday: true });
  assert.strictEqual(sourcesFrom({ holidays: { enabled: true }, google: { enabled: true, email: 'a@b.c' }, calendars: [{ id: 'x', url: 'webcal://e/a.ics' }] })[2].url, 'https://e/a.ics');
  ok('반복 일정·공휴일·webcal 주소');

  console.log('문서 추출 (폰용, Node 기능 없이)');
  const fx = (f) => new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', f)));
  assert.ok(extractText(fx('sample.hwp'), 'hwp').text.includes('학과/전공'));
  assert.ok(extractText(fx('sample.hwpx'), 'hwpx').text.includes('기안자'));
  assert.ok(extractText(fx('sample.docx'), 'docx').text.includes('10월 13일 ~ 10월 17일'));
  ok('HWP(표 포함)·HWPX·DOCX');

  console.log('AI 요청 형태 (가짜 응답)');
  const file = (name, bytes, size) => ({ name, ext: name.split('.').pop(), size: size ?? bytes.length, bytes: async () => bytes, base64: async () => Buffer.from(bytes).toString('base64'), upload: null });
  let cap;
  const gem = async (url, init) => { cap = { url, body: JSON.parse(init.body), headers: init.headers }; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"summary":"s","items":[{"title":"제출 마감","kind":"마감","date":"2026-10-08"}]}' }] } }] }) }; };
  const r = await ai.analyzeFile(file('안내.docx', fx('sample.docx')), { fetch: gem, keys: { gemini: 'g' }, provider: 'gemini', geminiModel: 'gm', about: '3학년 담임' });
  assert.ok(cap.url.endsWith('/models/gm:generateContent') && cap.headers['x-goog-api-key'] === 'g');
  assert.ok(cap.body.contents[0].parts[0].text.includes('10월 13일') && cap.body.contents[0].parts[1].text.includes('3학년 담임'));
  assert.strictEqual(r.items[0].title, '제출 마감');
  await ai.analyzeFile(file('rec.m4a', new Uint8Array([1, 2, 3])), { fetch: gem, keys: { claude: 'c', gemini: 'g' }, provider: 'claude', geminiModel: 'gm' });
  assert.strictEqual(cap.body.contents[0].parts[0].inline_data.mime_type, 'audio/mp4');
  await assert.rejects(ai.analyzeFile(file('rec.m4a', new Uint8Array([1])), { fetch: gem, keys: { claude: 'c' }, provider: 'claude' }), /Gemini API 키/);
  // 큰 녹음: 파일째 업로드
  const calls = [];
  const big = { ...file('회의.m4a', new Uint8Array(1), 40 * 1024 * 1024), upload: async (url, headers) => { calls.push(['upload', url, headers['X-Goog-Upload-Command']]); return { status: 200, body: JSON.stringify({ file: { name: 'files/9', state: 'ACTIVE', uri: 'https://f/9', mimeType: 'audio/mp4' } }), headers: {} }; } };
  const upFetch = async (url, init) => {
    calls.push(['fetch', url]);
    if (url.includes('/upload/v1beta/files')) return { ok: true, headers: { get: () => 'https://up/1' } };
    cap = { body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"summary":"","items":[]}' }] } }] }) };
  };
  await ai.analyzeFile(big, { fetch: upFetch, keys: { gemini: 'g' }, provider: 'gemini', geminiModel: 'gm' });
  assert.deepStrictEqual(calls[1], ['upload', 'https://up/1', 'upload, finalize']);
  assert.strictEqual(cap.body.contents[0].parts[0].file_data.file_uri, 'https://f/9');
  ok('문서→Gemini, 녹음은 Gemini로 전환·키 없으면 안내, 40MB 녹음은 파일째 업로드');

  console.log('빠른 입력 (글·말)');
  await ai.analyzeCommand({ text: '다음 주 화요일 3시 학부모 상담' }, { fetch: gem, keys: { gemini: 'g' }, provider: 'gemini', geminiModel: 'gm', about: '3학년 담임' });
  assert.strictEqual(cap.body.contents[0].parts.length, 1);
  assert.ok(cap.body.contents[0].parts[0].text.includes('학부모 상담') && cap.body.contents[0].parts[0].text.includes('3학년 담임'));
  let cc;
  const cla = async (url, init) => { cc = { url, body: JSON.parse(init.body) }; return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{"summary":"s","items":[{"title":"상담","kind":"일정","date":"2026-10-06","time":"15:00"}]}' }] }) }; };
  const rc = await ai.analyzeCommand({ text: '상담' }, { fetch: cla, keys: { claude: 'c' }, provider: 'claude', claudeModel: 'cm' });
  assert.ok(cc.url.includes('anthropic') && rc.items[0].time === '15:00' && rc.kind === 'prompt');
  const rv = await ai.analyzeCommand({ audio: file('말.m4a', new Uint8Array([1, 2])) }, { fetch: gem, keys: { gemini: 'g', claude: 'c' }, provider: 'claude', geminiModel: 'gm' });
  assert.strictEqual(cap.body.contents[0].parts[0].inline_data.mime_type, 'audio/mp4');
  assert.ok(cap.body.contents[0].parts[1].text.includes('직접 말한') && rv.kind === 'voice');
  await assert.rejects(ai.analyzeCommand({ audio: file('말.m4a', new Uint8Array([1])) }, { fetch: gem, keys: { claude: 'c' } }), /Gemini API 키/);
  await assert.rejects(ai.analyzeCommand({ text: '  ' }, { fetch: gem, keys: { gemini: 'g' } }), /내용을 입력/);
  ok('글→Gemini/Claude, 말→Gemini(키 없으면 안내), 빈 입력 거부');
  ai.RETRY.ms = [0, 0];
  let n = 0;
  const busy = (times) => async (url, init) => {
    if (url.includes('generativelanguage') && n++ < times) return { ok: false, status: 503, text: async () => '{"error":{"message":"This model is currently experiencing high demand."}}' };
    return url.includes('anthropic') ? cla(url, init) : gem(url, init);
  };
  n = 0; const rb = await ai.analyzeCommand({ text: '상담' }, { fetch: busy(2), keys: { gemini: 'g' }, provider: 'gemini', geminiModel: 'gm' });
  assert.ok(rb.items.length === 1 && n === 3);
  n = 0; await assert.rejects(ai.analyzeCommand({ text: '상담' }, { fetch: busy(9), keys: { gemini: 'g' }, provider: 'gemini', geminiModel: 'gm' }), /붐빕니다/);
  n = 0; const rf = await ai.analyzeCommand({ text: '상담' }, { fetch: busy(9), keys: { gemini: 'g', claude: 'c' }, provider: 'gemini', geminiModel: 'gm', claudeModel: 'cm' });
  assert.strictEqual(rf.provider, 'claude');
  ok('AI 서버가 붐비면(503) 두 번 다시 시도 → 그래도 안 되면 Claude로 대신, 없으면 쉬운 안내');

  console.log('\n모든 핵심 시험 통과');
})().catch((e) => { console.error('\n실패:', e); process.exit(1); });
