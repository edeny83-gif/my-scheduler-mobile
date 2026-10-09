// AI 비서 (폰·PC 공통): 파일 → 일정 후보. 파일 읽기는 호출하는 쪽이 넘겨주는 file 객체로 추상화.
// file = { name, ext, size, base64(): Promise<string>, bytes(): Promise<Uint8Array>,
//          upload(url, headers): Promise<{status, body, headers}> }   // upload는 큰 녹음(Gemini 파일 API)용
const { extractText, canExtract } = require('./extract');
const { DOW, ymd, pad } = require('./dates');
const { fixItemTimes } = require('./timeText');

const GEMINI = 'https://generativelanguage.googleapis.com';
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const INLINE_LIMIT = 15 * 1024 * 1024;

const IMAGE = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif' };
const AUDIO = { mp3: 'audio/mp3', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm', aiff: 'audio/aiff', amr: 'audio/amr', '3gp': 'audio/3gpp', mp4: 'audio/mp4' };

function kindOf(ext) {
  ext = String(ext || '').toLowerCase();
  if (ext === 'pdf') return { kind: 'pdf', mime: 'application/pdf' };
  if (canExtract(ext)) return { kind: 'text' };
  if (IMAGE[ext]) return { kind: 'image', mime: IMAGE[ext] };
  if (AUDIO[ext]) return { kind: 'audio', mime: AUDIO[ext] };
  return { kind: 'unknown' };
}

function buildPrompt({ about, instruction, fileName, kind, now = new Date() }) {
  const src = kind === 'audio' ? '회의·통화 녹음' : kind === 'image' ? '사진(공문·알림장·칠판·안내문 등)' : '문서(공문·가정통신문·계획서·회의록 등)';
  return `당신은 사용자의 일정 관리 비서입니다. 사용자: ${about || '학교 교사'}.
첨부한 ${src} "${fileName}"에서 사용자가 캘린더에 넣어야 할 일정·할 일·마감을 찾아 주세요.

오늘은 ${ymd(now.getTime())} (${DOW[now.getDay()]}요일), 한국 시간 ${pad(now.getHours())}:${pad(now.getMinutes())}입니다.

규칙
- date는 반드시 YYYY-MM-DD 절대 날짜. "다음 주 화요일", "이번 달 말" 같은 표현은 오늘을 기준으로 계산하고 요일이 맞는지 검산하세요.
- 연도가 없으면 오늘 이후 가장 가까운 해당 날짜로 봅니다.
- 날짜를 알 수 없는 항목은 items에 넣지 말고 undated에 넣으세요. 날짜를 지어내지 마세요.
- time은 시각이 명시된 경우에만 HH:mm(24시간). 없으면 빈 문자열. 시간대(예: 14:00~15:30)면 끝 시각을 endTime에. endDate도 명시된 경우만.
- title에는 날짜·시각을 넣지 마세요(시각은 time·endTime에만).
- 여러 날 이어지는 일정은 date(시작)와 endDate(끝)를 모두 채우세요.
- kind: 참석·행사 등은 "일정", 해야 할 업무는 "할 일", 제출·신청·납부 기한은 "마감".
- title은 20자 이내로 구체적으로. memo에는 준비물·대상·담당자·제출처 등 필요한 내용만 짧게.
- evidence에는 근거가 된 원문 문장(또는 녹음 속 발언)을 40자 이내로.
- confidence는 0~1. 분명하면 0.9 이상, 해석이 필요하면 낮게.
- summary는 3문장 이내 요약. 녹음이면 결정 사항과 할 일 위주.
- 사용자와 관계없어 보이는 일정은 제외하되, 애매하면 포함하고 confidence를 낮추세요.
${instruction ? `\n사용자의 추가 요청: ${instruction}\n` : ''}
출력은 아래 JSON 형식만:
{"summary": "...", "items": [{"title": "", "kind": "일정|할 일|마감", "date": "YYYY-MM-DD", "endDate": "", "time": "", "endTime": "", "location": "", "memo": "", "evidence": "", "confidence": 0.9}], "undated": [{"title": "", "note": ""}]}`;
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    items: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      title: { type: 'STRING' }, kind: { type: 'STRING', enum: ['일정', '할 일', '마감'] }, date: { type: 'STRING' },
      endDate: { type: 'STRING' }, time: { type: 'STRING' }, endTime: { type: 'STRING' }, location: { type: 'STRING' },
      memo: { type: 'STRING' }, evidence: { type: 'STRING' }, confidence: { type: 'NUMBER' },
    }, required: ['title', 'kind', 'date', 'time', 'endTime', 'endDate'] } }, // 시각 칸을 빠뜨리지 않게(없으면 빈 문자열)
    undated: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, note: { type: 'STRING' } }, required: ['title'] } },
    deletes: { type: 'ARRAY', items: { type: 'STRING' } }, // 빠른 입력에서 "지워 줘" → 지울 일정 id
  },
  required: ['summary', 'items'],
};

function parseJson(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('AI 응답에서 결과(JSON)를 찾지 못했습니다');
  const obj = JSON.parse(t.slice(a, b + 1));
  return {
    summary: String(obj.summary || ''), items: Array.isArray(obj.items) ? obj.items : [], undated: Array.isArray(obj.undated) ? obj.undated : [],
    deletes: Array.isArray(obj.deletes) ? obj.deletes.map(String) : [],
  };
}

function errorMessage(status, body) {
  let msg = body || '';
  try { const j = JSON.parse(body); msg = j.error?.message || j.error?.type || body; } catch {}
  if (status === 400 && /API key|API_KEY/i.test(msg)) return 'API 키가 올바르지 않습니다';
  if (status === 401 || status === 403) return `API 키 인증 실패 (${status})`;
  if (status === 404) return '모델을 찾을 수 없습니다. 설정에서 모델 이름을 확인하세요';
  if (status === 429) return '사용 한도를 넘었습니다. 잠시 후 다시 시도하세요';
  if (BUSY.has(status)) return 'AI 서버가 지금 붐빕니다. 잠시 뒤 다시 눌러 주세요 (입력한 글은 그대로 남아 있습니다)';
  return `HTTP ${status}: ${String(msg).slice(0, 300)}`;
}
async function ensureOk(res) {
  if (res.ok) return res;
  let body = '';
  try { body = await res.text(); } catch {}
  const err = new Error(errorMessage(res.status, body));
  err.status = res.status;
  throw err;
}

// AI 서버가 붐빌 때(503 등) 잠깐 기다렸다 다시 시도. 시험에서는 RETRY.ms를 [0, 0]으로 바꾼다
const BUSY = new Set([500, 502, 503, 504, 529]);
const RETRY = { ms: [1500, 4000] };
async function withRetry(fn, onStage) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (!BUSY.has(e.status) || i >= RETRY.ms.length) throw e;
      onStage?.(`AI 서버가 붐벼 다시 시도 중 (${i + 1}/${RETRY.ms.length})`);
      await new Promise((r) => setTimeout(r, RETRY.ms[i]));
    }
  }
}

async function geminiUpload(fetchFn, key, file, mime) {
  const start = await ensureOk(await fetchFn(`${GEMINI}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': key, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(file.size), 'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: file.name } }),
  }));
  const url = start.headers.get('x-goog-upload-url');
  if (!url) throw new Error('파일 업로드 주소를 받지 못했습니다');
  const up = await file.upload(url, { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' });
  if (up.status < 200 || up.status >= 300) throw new Error(`파일 업로드 실패: ${errorMessage(up.status, up.body)}`);
  let f = JSON.parse(up.body).file;
  for (let i = 0; f.state === 'PROCESSING' && i < 120; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    f = await (await ensureOk(await fetchFn(`${GEMINI}/v1beta/${f.name}`, { headers: { 'x-goog-api-key': key } }))).json();
  }
  if (f.state !== 'ACTIVE') throw new Error(`파일 처리 실패 (상태: ${f.state})`);
  return f;
}

async function geminiGenerate(fetchFn, key, model, parts, json = true, onStage) {
  const res = await withRetry(async () => ensureOk(await fetchFn(`${GEMINI}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: json ? { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 } : { temperature: 0.2 },
    }),
  })), onStage);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) throw new Error(`AI가 빈 응답을 보냈습니다 (${data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || '이유 없음'})`);
  return text;
}

async function geminiFilePart(fetchFn, key, file, mime, onStage) {
  if (file.size <= INLINE_LIMIT || !file.upload) return { inline_data: { mime_type: mime, data: await file.base64() } };
  onStage?.('큰 파일 업로드 중');
  const f = await geminiUpload(fetchFn, key, file, mime);
  return { file_data: { mime_type: f.mimeType || mime, file_uri: f.uri } };
}

async function claudeGenerate(fetchFn, key, model, content, onStage) {
  const res = await withRetry(async () => ensureOk(await fetchFn(ANTHROPIC, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 8000, system: '당신은 일정 추출 비서입니다. 요청한 JSON 형식만 출력하세요.', messages: [{ role: 'user', content }] }),
  })), onStage);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

/** opts: { fetch, keys:{gemini,claude}, provider, geminiModel, claudeModel, about, instruction, onStage } */
async function analyzeFile(file, opts) {
  const { fetch: fetchFn, keys, onStage } = opts;
  const { kind, mime } = kindOf(file.ext);
  if (kind === 'unknown') throw new Error(`지원하지 않는 형식입니다 (.${file.ext || '?'})`);
  let provider = opts.provider === 'claude' ? 'claude' : 'gemini';
  if (kind === 'audio') {
    if (!keys.gemini) throw new Error('녹음 분석에는 Gemini API 키가 필요합니다 (설정 → AI 비서)');
    provider = 'gemini';
  }
  if (!keys[provider]) {
    const other = provider === 'gemini' ? 'claude' : 'gemini';
    if (keys[other]) provider = other; else throw new Error('API 키가 없습니다. 설정 → AI 비서에서 키를 입력하세요');
  }
  let note = '';
  let extracted = null;
  if (kind === 'text') {
    onStage?.('글자 추출 중');
    extracted = extractText(await file.bytes(), file.ext.toLowerCase());
    if (!extracted.text.trim()) throw new Error('문서에서 글자를 찾지 못했습니다 (그림 문서라면 사진·PDF로 올려 주세요)');
    if (extracted.truncated) note = '문서가 길어 앞부분만 분석했습니다';
  }
  const prompt = buildPrompt({ about: opts.about, instruction: opts.instruction, fileName: file.name, kind });
  onStage?.(kind === 'audio' ? '녹음 듣고 분석 중' : 'AI 분석 중');
  let raw;
  if (provider === 'gemini') {
    const parts = [extracted ? { text: `<문서 내용 "${file.name}">\n${extracted.text}\n</문서 내용>` } : await geminiFilePart(fetchFn, keys.gemini, file, mime, onStage), { text: prompt }];
    raw = await geminiGenerate(fetchFn, keys.gemini, opts.geminiModel, parts, true, onStage);
  } else {
    const content = [];
    if (extracted) content.push({ type: 'text', text: `<문서 내용 "${file.name}">\n${extracted.text}\n</문서 내용>` });
    else {
      if (file.size > 30 * 1024 * 1024) throw new Error('Claude로 보내기에는 파일이 너무 큽니다 (30MB 이하)');
      if (kind === 'image' && !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mime)) throw new Error('Claude는 JPG·PNG·GIF·WEBP 사진만 읽습니다');
      const data = await file.base64();
      content.push(kind === 'pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
        : { type: 'image', source: { type: 'base64', media_type: mime, data } });
    }
    content.push({ type: 'text', text: prompt });
    raw = await claudeGenerate(fetchFn, keys.claude, opts.claudeModel, content, onStage);
  }
  const out = parseJson(raw);
  out.items = out.items.map((it) => fixItemTimes(it)); // 시각이 제목에 섞이거나 "오후 3시"처럼 오면 바로잡기
  return { fileName: file.name, kind, provider, note, ...out };
}

// 빠른 입력(달력 아래 칸): 사용자가 직접 적거나 말한 요청 → 일정 후보
// 지우기 요청에 쓰도록 AI에게 보여 줄 내 일정 목록 (오늘 기준 앞뒤 기간, 너무 길면 자름)
function eventLines(events = [], now = new Date()) {
  const from = now.getTime() - 60 * 86_400_000, to = now.getTime() + 240 * 86_400_000;
  return events
    .filter((e) => !e.readOnly && !e.deleted && (e.end ?? e.start) >= from && e.start <= to)
    .sort((a, b) => a.start - b.start)
    .slice(0, 400)
    .map((e) => `${e.id} | ${ymd(e.start)} | ${e.allDay ? '종일' : `${pad(new Date(e.start).getHours())}:${pad(new Date(e.start).getMinutes())}`} | ${String(e.title).replace(/\s+/g, ' ')}`)
    .join('\n');
}

function buildCommandPrompt({ about, text, voice, events, now = new Date() }) {
  const mine = eventLines(events, now);
  return `당신은 사용자의 일정 관리 비서입니다. 사용자: ${about || '학교 교사'}.
${voice ? '첨부한 음성은 사용자가 캘린더에 일정을 넣어 달라고 직접 말한 것입니다. 먼저 말한 내용을 그대로 받아 적어 summary에 넣으세요.' : `아래는 사용자가 캘린더에 넣어 달라고 직접 입력한 요청입니다.\n<요청>\n${text}\n</요청>`}
요청에서 캘린더에 넣을 일정·할 일·마감을 찾아 주세요. 지워 달라는 요청이면 지울 일정을 찾아 주세요.

오늘은 ${ymd(now.getTime())} (${DOW[now.getDay()]}요일), 한국 시간 ${pad(now.getHours())}:${pad(now.getMinutes())}입니다.

규칙
- date는 반드시 YYYY-MM-DD 절대 날짜. "내일", "다음 주 화요일", "이번 달 말" 같은 표현은 오늘을 기준으로 계산하고 요일이 맞는지 검산하세요.
- 연도가 없으면 오늘 이후 가장 가까운 해당 날짜로 봅니다.
- 날짜를 알 수 없으면 items에 넣지 말고 undated에 넣으세요. 날짜를 지어내지 마세요.
- 시각·시간대: 시작 시각은 time, 끝 시각은 endTime에 HH:mm(24시간)으로 넣으세요. 시각이 전혀 없을 때만 둘 다 빈 문자열(종일 일정)입니다.
  예) "2시~3시 반" → time 14:00, endTime 15:30 / "오후 3시" → time 15:00, endTime "" / "14:00-15:00" → time 14:00, endTime 15:00
  "3시"처럼 오전·오후가 없으면 학교 일과 기준(1~6시는 오후)으로 판단하세요.
- title에는 날짜·요일·시각을 넣지 마세요. 예) "10월 15일 2시~3시 학부모 상담" → title "학부모 상담"
- 여러 날 이어지는 일정은 date(시작)와 endDate(끝)를 모두 채우세요. "매주" 같은 반복은 앞으로 4번까지만 각각 항목으로 만드세요.
- kind: 참석·행사 등은 "일정", 해야 할 업무는 "할 일", 제출·신청·납부 기한은 "마감".
- title은 20자 이내로 구체적으로(시각 빼고). 장소는 location, 준비물·대상 등은 memo에 짧게.
- evidence에는 근거가 된 요청 속 표현을 40자 이내로. confidence는 0~1.
- summary는 ${voice ? '받아 적은 말 그대로' : '한 문장 요약'}.
- 일정 추가와 관계없는 말(인사, 질문 등)만 있으면 items를 비우고 summary에 짧게 답하세요.
- 지우기: "삭제", "지워", "취소됐어", "빼 줘" 같은 요청이면 새 일정을 만들지 말고(items는 비움), 아래 <내 일정>에서 해당하는 일정의 id를 deletes에 넣으세요.
  확실히 가리키는 것만 넣고, 애매하면 넣지 말고 summary에 무엇이 애매한지 짧게 쓰세요. "중복 지워 줘"면 같은 날 같은 일정 중 하나만 남기고 나머지 id를 넣으세요.
  summary에는 무엇을 지우는지 한 문장으로 쓰세요.

<내 일정> (id | 날짜 | 시각 | 제목)
${mine || '(없음)'}
</내 일정>

출력은 아래 JSON 형식만:
{"summary": "...", "items": [{"title": "", "kind": "일정|할 일|마감", "date": "YYYY-MM-DD", "endDate": "", "time": "", "endTime": "", "location": "", "memo": "", "evidence": "", "confidence": 0.9}], "undated": [{"title": "", "note": ""}], "deletes": ["지울 일정 id"]}`;
}

/** 빠른 입력. text(글) 또는 audio(녹음 file 객체) 중 하나. opts는 analyzeFile과 같다. 녹음은 Gemini 키가 필요하다. */
async function analyzeCommand({ text, audio, events }, opts) {
  const { fetch: fetchFn, keys, onStage } = opts;
  text = String(text || '').trim();
  if (!text && !audio) throw new Error('내용을 입력하세요');
  let provider = opts.provider === 'claude' ? 'claude' : 'gemini';
  if (audio) {
    if (!keys.gemini) throw new Error('말로 입력하려면 Gemini API 키가 필요합니다 (설정 → AI 비서). 키보드의 🎤 받아쓰기로 글자를 입력해도 됩니다');
    provider = 'gemini';
  }
  if (!keys[provider]) {
    const other = provider === 'gemini' ? 'claude' : 'gemini';
    if (keys[other]) provider = other; else throw new Error('API 키가 없습니다. 설정 → AI 비서에서 키를 입력하세요');
  }
  const prompt = buildCommandPrompt({ about: opts.about, text, voice: !!audio, events });
  onStage?.(audio ? '말을 듣고 분석 중' : '분석 중');
  let raw;
  if (provider === 'gemini') {
    const parts = audio ? [await geminiFilePart(fetchFn, keys.gemini, audio, kindOf(audio.ext).mime || 'audio/mp4', onStage), { text: prompt }] : [{ text: prompt }];
    try {
      raw = await geminiGenerate(fetchFn, keys.gemini, opts.geminiModel, parts, true, onStage);
    } catch (e) {
      // Gemini가 계속 붐비면 Claude 키가 있을 때 글 요청은 Claude로 대신 보낸다
      if (!BUSY.has(e.status) || audio || !keys.claude) throw e;
      onStage?.('Gemini가 붐벼 Claude로 분석 중');
      provider = 'claude';
      raw = await claudeGenerate(fetchFn, keys.claude, opts.claudeModel, [{ type: 'text', text: prompt }], onStage);
    }
  } else {
    raw = await claudeGenerate(fetchFn, keys.claude, opts.claudeModel, [{ type: 'text', text: prompt }], onStage);
  }
  const out = parseJson(raw);
  // 시각이 제목에 섞이거나 빠진 경우 바로잡기. 일정이 하나뿐이면 사용자가 쓴(말한) 글에서 시각을 다시 읽어 채운다
  const said = audio ? out.summary : text;
  out.items = out.items.map((it) => fixItemTimes(it, out.items.length === 1 ? said : ''));
  return { fileName: '', kind: audio ? 'voice' : 'prompt', provider, note: '', ...out };
}

async function testKey(provider, { fetch: fetchFn, key, geminiModel, claudeModel }) {
  if (provider === 'gemini') await geminiGenerate(fetchFn, key, geminiModel, [{ text: '"ok"라고만 답하세요.' }], false);
  else await claudeGenerate(fetchFn, key, claudeModel, [{ type: 'text', text: '"ok"라고만 답하세요.' }]);
  return true;
}

module.exports = { RETRY, analyzeFile, analyzeCommand, testKey, kindOf, parseJson, buildPrompt, buildCommandPrompt };
