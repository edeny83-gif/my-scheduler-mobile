// 문서 글자 추출 (HWP 5.x / HWPX / DOCX / 텍스트) — Node 없이 Uint8Array만으로 동작 (폰·PC 공통)
const CFB = require('cfb');
const { unzipSync, strFromU8, inflateSync, unzlibSync } = require('fflate');

const MAX_CHARS = 200_000;
const TEXT_EXT = ['txt', 'md', 'csv', 'tsv', 'json', 'html', 'htm', 'ics', 'log'];
const HWPTAG_PARA_TEXT = 67;
const CHAR_CTRL = new Set([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31]);

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

function paraText(b) {
  let out = '';
  for (let i = 0; i + 1 < b.length; ) {
    const c = u16(b, i);
    if (c < 32) {
      if (CHAR_CTRL.has(c)) {
        if (c === 10 || c === 13) out += '\n';
        else if (c === 30 || c === 31) out += ' ';
        else if (c === 24) out += '-';
        i += 2;
      } else { if (c === 9) out += '\t'; i += 16; }
    } else { out += String.fromCharCode(c); i += 2; }
  }
  return out;
}

function recordsText(b) {
  const parts = [];
  let p = 0;
  while (p + 4 <= b.length) {
    const h = u32(b, p); p += 4;
    const tag = h & 0x3ff;
    let size = (h >>> 20) & 0xfff;
    if (size === 0xfff) { if (p + 4 > b.length) break; size = u32(b, p); p += 4; }
    if (p + size > b.length) break;
    if (tag === HWPTAG_PARA_TEXT) parts.push(paraText(b.subarray(p, p + size)));
    p += size;
  }
  return parts.join('\n');
}

const utf16le = (b) => { let s = ''; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(u16(b, i)); return s; };

function extractHwp(bytes) {
  const doc = CFB.read(bytes, { type: 'array' });
  const get = (re) => doc.FullPaths.map((fp, i) => ({ fp, e: doc.FileIndex[i] })).filter((x) => re.test(x.fp) && x.e.content);
  const header = get(/\/FileHeader$/)[0];
  if (!header) throw new Error('HWP 파일 형식이 아닙니다');
  const hb = Uint8Array.from(header.e.content);
  if (String.fromCharCode(...hb.subarray(0, 17)) !== 'HWP Document File') throw new Error('HWP 5.0 이상 파일만 읽을 수 있습니다');
  const flags = u32(hb, 36);
  if (flags & 2) throw new Error('암호가 걸린 HWP 파일은 읽을 수 없습니다');
  const compressed = !!(flags & 1), distribution = !!(flags & 4);
  let text = '';
  if (!distribution) {
    const sections = get(/\/BodyText\/Section\d+$/).sort((a, b) => Number(a.fp.match(/(\d+)$/)[1]) - Number(b.fp.match(/(\d+)$/)[1]));
    for (const s of sections) {
      let data = Uint8Array.from(s.e.content);
      if (compressed) { try { data = inflateSync(data); } catch { data = unzlibSync(data); } }
      text += recordsText(data) + '\n';
    }
  }
  if (!text.trim()) {
    const prv = get(/\/PrvText$/)[0];
    if (prv) text = utf16le(Uint8Array.from(prv.e.content));
    if (distribution) text = '[배포용 문서라 앞부분 미리보기만 읽었습니다]\n' + text;
  }
  return text;
}

const decodeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

function extractHwpx(bytes) {
  const files = unzipSync(bytes);
  const secs = Object.keys(files).filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/i)[1]) - Number(b.match(/(\d+)\.xml$/i)[1]));
  if (!secs.length) throw new Error('HWPX 본문을 찾지 못했습니다');
  return secs.map((n) => {
    const xml = strFromU8(files[n]).replace(/<hp:t(?:\s[^>]*)?\/>/g, '').replace(/<\/hp:p>/g, '\n')
      .replace(/<hp:tab[^>]*\/>/g, '\t').replace(/<hp:lineBreak[^>]*\/>/g, '\n');
    let out = '';
    for (const m of xml.matchAll(/<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>|\n|\t/g)) out += m[1] !== undefined ? decodeXml(m[1].replace(/<[^>]+>/g, '')) : m[0];
    return out;
  }).join('\n');
}

function extractDocx(bytes) {
  const files = unzipSync(bytes);
  const doc = files['word/document.xml'];
  if (!doc) throw new Error('DOCX 본문을 찾지 못했습니다');
  const xml = strFromU8(doc).replace(/<w:tab\/>/g, '<w:t>\t</w:t>').replace(/<w:br\/>/g, '<w:t>\n</w:t>');
  const out = [];
  for (const para of xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || []) {
    let line = '';
    for (const m of para.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) line += decodeXml(m[1]);
    out.push(line);
  }
  return out.join('\n');
}

const tidy = (t) => t.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/** 확장자로 추출 가능 여부 */
const canExtract = (ext) => ['hwp', 'hwpx', 'docx', ...TEXT_EXT].includes(ext);

/** @param {Uint8Array} bytes  @param {string} ext 확장자(소문자, 점 없이) */
function extractText(bytes, ext) {
  let text;
  if (ext === 'hwp') text = bytes[0] === 0x50 && bytes[1] === 0x4b ? extractHwpx(bytes) : extractHwp(bytes);
  else if (ext === 'hwpx') text = extractHwpx(bytes);
  else if (ext === 'docx') text = extractDocx(bytes);
  else if (TEXT_EXT.includes(ext)) text = strFromU8(bytes).replace(/^\uFEFF/, '');
  else return null;
  text = tidy(text);
  const truncated = text.length > MAX_CHARS;
  return { text: truncated ? text.slice(0, MAX_CHARS) : text, truncated };
}

module.exports = { extractText, canExtract, TEXT_EXT };
