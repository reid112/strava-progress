/**
 * Minimal tag scanner for GPX/TCX. Web Workers have no DOMParser, and a
 * full XML parser is overkill for two fixed schemas. Namespace prefixes are
 * ignored, so `<gpxtpx:hr>` and `<ns3:hr>` both match `hr`.
 */
const cache = new Map<string, RegExp>();

function blockRe(tag: string): RegExp {
  let re = cache.get('b:' + tag);
  if (!re) {
    re = new RegExp(`<(?:[\\w.-]+:)?${tag}\\b([^>]*)>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}\\s*>`, 'g');
    cache.set('b:' + tag, re);
  }
  re.lastIndex = 0;
  return re;
}
function textRe(tag: string): RegExp {
  let re = cache.get('t:' + tag);
  if (!re) {
    re = new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([^<]*)<\\/`);
    cache.set('t:' + tag, re);
  }
  return re;
}

/** Iterate over every `<tag ...>inner</tag>` block: yields [attributes string, inner xml]. */
export function* blocks(xml: string, tag: string): Generator<[string, string]> {
  const re = blockRe(tag);
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) yield [m[1], m[2]];
}

/** First `<tag>text</tag>` inside `inner`, or null. */
export function text(inner: string, tag: string): string | null {
  const m = textRe(tag).exec(inner);
  return m ? m[1].trim() : null;
}

export function num(inner: string, tag: string): number | null {
  const s = text(inner, tag);
  if (s === null || s === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

export function attr(attrs: string, name: string): number | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`).exec(attrs);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

export function parseTime(s: string | null): number | null {
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}
