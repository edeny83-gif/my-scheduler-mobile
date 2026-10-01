// AI 비서 (폰·PC 공통): 파일 → 일정 후보. 파일 읽기는 호출하는 쪽이 넘겨주는 file 객체로 추상화.
// file = { name, ext, size, base64(): Promise<string>, bytes(): Promise<Uint8Array>,
//          upload(url, headers): Promise<{status, body, headers}> }   // upload는 큰 녹음(Gemini 파일 API)용
const { extractText, canExtract } = require('./extract');
const { DOW, ymd, pad } = require('./dates');

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
- time은 시각이 명시된 경우에만 HH:mm(24시간). 없으면 빈 문자열. endTime·endDate도 명시된 경우만.
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
    }, required: ['title', 'kind', 'date'] } },
    undated: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, note: { type: 'STRING' } }, required: ['title'] } },
  },
  required: ['summary', 'items'],
};

function parseJson(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('AI 응답에서 결과(JSON)를 찾지 못했습니다');
  const obj = JSON.parse(t.slice(a, b + 1));
  return { summary: String(obj.summary || ''), items: Array.isArray(obj.items) ? obj.items : [], undated: Array.isArray(obj.undated) ? obj.undated : [] };
}

function errorMessage(status, body) {
  let msg = body || '';
  try { const j = JSON.parse(body); msg = j.error?.message || j.error?.type || body; } catch {}
  if (status === 400 && /API key|API_KEY/i.test(msg)) return 'API 키가 올바르지 않습니다';
  if (status === 401 || status === 403) return `API 키 인증 실패 (${status})`;
  if (status === 404) return '모델을 찾을 수 없습니다. 설정에서 모델 이름을 확인하세요';
  if (status === 429) return '사용 한도를 넘었습니다. 잠시 후 다시 시도하세요';
  return `HTTP ${status}: ${String(msg).slice(0, 300)}`;
}
async function ensureOk(res) {
  if (res.ok) return res;
  let body = '';
  try { body = await res.text(); } catch {}
  throw new Error(errorMessage(res.status, body));
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

async function geminiGenerate(fetchFn, key, model, parts, json = true) {
  const res = await ensureOk(await fetchFn(`${GEMINI}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: json ? { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 } : { temperature: 0.2 },
    }),
  }));
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

async function claudeGenerate(fetchFn, key, model, content) {
  const res = await ensureOk(await fetchFn(ANTHROPIC, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 8000, system: '당신은 일정 추출 비서입니다. 요청한 JSON 형식만 출력하세요.', messages: [{ role: 'user', content }] }),
  }));
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
    raw = await geminiGenerate(fetchFn, keys.gemini, opts.geminiModel, parts);
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
    raw = await claudeGenerate(fetchFn, keys.claude, opts.claudeModel, content);
  }
  return { fileName: file.name, kind, provider, note, ...parseJson(raw) };
}

async function testKey(provider, { fetch: fetchFn, key, geminiModel, claudeModel }) {
  if (provider === 'gemini') await geminiGenerate(fetchFn, key, geminiModel, [{ text: '"ok"라고만 답하세요.' }], false);
  else await claudeGenerate(fetchFn, key, claudeModel, [{ type: 'text', text: '"ok"라고만 답하세요.' }]);
  return true;
}

module.exports = { analyzeFile, testKey, kindOf, parseJson, buildPrompt };
