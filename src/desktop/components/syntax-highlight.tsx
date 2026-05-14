import type { ReactNode } from 'react';

const KEY_CLS = 'text-syntax-key';
const STRING_CLS = 'text-syntax-string';
const NUMBER_CLS = 'text-syntax-number';
const BOOL_CLS = 'text-syntax-bool';
const NULL_CLS = 'text-muted-foreground italic';
const PUNCT_CLS = 'text-muted-foreground/60';

function span(cls: string, text: string, key: string | number): ReactNode {
  return <span key={key} className={cls}>{text}</span>;
}

const JSON_TOKEN = /("(?:\\.|[^"\\])*"\s*:?)|(\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}[\],:])|(\s+)/g;

export function highlightJson(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let idx = 0;
  let match: RegExpExecArray | null;
  while ((match = JSON_TOKEN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }
    const [token, strTok, numTok, boolTok, nullTok, punctTok, wsTok] = match;
    if (strTok) {
      const isKey = strTok.trimEnd().endsWith(':');
      if (isKey) {
        const colonIdx = strTok.lastIndexOf(':');
        const keyPart = strTok.slice(0, colonIdx);
        const tail = strTok.slice(colonIdx);
        out.push(span(KEY_CLS, keyPart, idx++));
        out.push(span(PUNCT_CLS, tail, idx++));
      } else {
        out.push(span(STRING_CLS, strTok, idx++));
      }
    } else if (numTok) {
      out.push(span(NUMBER_CLS, numTok, idx++));
    } else if (boolTok) {
      out.push(span(BOOL_CLS, boolTok, idx++));
    } else if (nullTok) {
      out.push(span(NULL_CLS, nullTok, idx++));
    } else if (punctTok) {
      out.push(span(PUNCT_CLS, punctTok, idx++));
    } else if (wsTok) {
      out.push(wsTok);
    } else {
      out.push(token);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

function tintValue(raw: string, key: string | number): ReactNode {
  const trimmed = raw.trim();
  if (trimmed === '') return raw;
  if (trimmed === 'null' || trimmed === 'undefined') return span(NULL_CLS, raw, key);
  if (trimmed === 'true' || trimmed === 'false') return span(BOOL_CLS, raw, key);
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return span(NUMBER_CLS, raw, key);
  return span(STRING_CLS, raw, key);
}

export function highlightPretty(text: string): ReactNode[] {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let idx = 0;
  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li] ?? '';
    const leadMatch = /^(\s*)/.exec(line);
    const lead = leadMatch?.[1] ?? '';
    const body = line.slice(lead.length);
    if (lead) out.push(lead);
    if (body.startsWith('- ')) {
      out.push(span(PUNCT_CLS, '- ', idx++));
      const rest = body.slice(2);
      const colon = rest.indexOf(': ');
      if (colon >= 0) {
        out.push(span(KEY_CLS, rest.slice(0, colon), idx++));
        out.push(span(PUNCT_CLS, ': ', idx++));
        out.push(tintValue(rest.slice(colon + 2), idx++));
      } else {
        out.push(tintValue(rest, idx++));
      }
    } else if (body === '-') {
      out.push(span(PUNCT_CLS, '-', idx++));
    } else {
      const colon = body.indexOf(': ');
      if (colon >= 0) {
        out.push(span(KEY_CLS, body.slice(0, colon), idx++));
        out.push(span(PUNCT_CLS, ': ', idx++));
        out.push(tintValue(body.slice(colon + 2), idx++));
      } else if (body.endsWith(':')) {
        out.push(span(KEY_CLS, body.slice(0, -1), idx++));
        out.push(span(PUNCT_CLS, ':', idx++));
      } else if (body === '{}' || body === '[]') {
        out.push(span(PUNCT_CLS, body, idx++));
      } else {
        out.push(tintValue(body, idx++));
      }
    }
    if (li < lines.length - 1) out.push('\n');
  }
  return out;
}
