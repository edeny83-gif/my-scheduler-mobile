// 브리핑: PC의 Claude가 만들어 마이스케쥴에 저장한 "오늘 처리할 일" 글. (PC 프로젝트의 briefing.js와 같은 규칙)
// 일정 모델은 그대로 — 브리핑은 그 날짜의 종일 일정 "📋 브리핑 M/D"이고 글은 메모(memo)에 들어 있다.
const PREFIX = '📋 브리핑';

const isBriefing = (e) => !!e && !e.readOnly && !!e.allDay && typeof e.title === 'string' && e.title.startsWith(PREFIX);

/** 브리핑 일정들, 최근 날짜 순 */
const briefings = (events) => (events || []).filter(isBriefing).sort((a, b) => b.start - a.start);

/** **굵게**와 [처리함]·[미처리] 같은 꼬리표를 나눈다 → [{ k: 'text'|'bold'|'tag', v, tone?: 'todo'|'done'|'' }] */
function parseInline(text) {
  const out = [];
  for (const part of String(text ?? '').split(/(\*\*[^*]+\*\*|\[[^\]\n]{1,10}\])/)) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) out.push({ k: 'bold', v: part.slice(2, -2) });
    else if (/^\[[^\]]+\]$/.test(part)) {
      const w = part.slice(1, -1);
      out.push({ k: 'tag', v: w, tone: /미처리|안 ?함|확인 ?필요|필요/.test(w) ? 'todo' : /처리함|완료|함$/.test(w) ? 'done' : '' });
    } else out.push({ k: 'text', v: part });
  }
  return out;
}

/** 마크다운 조금(# 제목, - 목록, 문단)을 화면용 덩어리로 → [{ type: 'h1'|'h2'|'h3'|'li'|'p', parts }] */
function parseBriefing(text) {
  const blocks = [];
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const li = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (li) { blocks.push({ type: 'li', parts: parseInline(li[1]) }); continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    blocks.push(h ? { type: `h${h[1].length}`, parts: parseInline(h[2]) } : { type: 'p', parts: parseInline(line) });
  }
  return blocks;
}

module.exports = { PREFIX, isBriefing, briefings, parseInline, parseBriefing };
