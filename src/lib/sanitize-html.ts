/**
 * Allowlist HTML sanitizer for AI-written listing descriptions. The output is
 * pasted into eBay and previewed in a script-less sandboxed frame, so this is
 * defense in depth: only plain formatting tags survive, the only attribute
 * kept is a vetted inline style (plus a few table layout attributes), and
 * dangerous containers are removed along with everything inside them.
 */
const ALLOWED_TAGS = new Set([
  'div', 'span', 'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 'small',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'blockquote', 'center',
])
const VOID_TAGS = new Set(['br', 'hr'])
const ALLOWED_ATTRS = new Set(['style', 'colspan', 'rowspan', 'align', 'width', 'valign'])
const DROP_WITH_CONTENT = ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript', 'textarea', 'select', 'head', 'title']
// image-set() (and -webkit-image-set()) takes a bare string as an image URL,
// so it loads remote content exactly like url() does
const BAD_STYLE = /url\s*\(|image-set|expression|javascript:|vbscript:|@import|behavior\s*:|-moz-binding|\\|<|>/i

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Math.min(Number(d), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
    .replace(/&(quot|apos|lt|gt|amp|colon|lpar|rpar|bsol|sol|semi);/gi, (_, n: string) => (
      { quot: '"', apos: "'", lt: '<', gt: '>', amp: '&', colon: ':', lpar: '(', rpar: ')', bsol: '\\', sol: '/', semi: ';' } as Record<string, string>
    )[n.toLowerCase()])
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeText = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')

function cleanAttrs(raw: string): string {
  const out: string[] = []
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    const name = m[1].toLowerCase()
    if (!ALLOWED_ATTRS.has(name)) continue
    const value = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')
    if (name === 'style') {
      if (BAD_STYLE.test(value)) continue
    } else if (!/^[\w%.\s-]{0,20}$/.test(value)) {
      continue
    }
    out.push(`${name}="${escapeAttr(value)}"`)
  }
  return out.length ? ` ${out.join(' ')}` : ''
}

export function sanitizeHtml(input: string): string {
  let html = String(input ?? '')
  html = html.replace(/<!--[\s\S]*?(-->|$)/g, '')
  for (const tag of DROP_WITH_CONTENT) {
    html = html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?(<\\/${tag}\\s*>|$)`, 'gi'), '')
  }
  const out: string[] = []
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g
  let last = 0
  for (let m = tagRe.exec(html); m; m = tagRe.exec(html)) {
    out.push(escapeText(html.slice(last, m.index)))
    last = m.index + m[0].length
    const closing = m[1] === '/'
    const name = m[2].toLowerCase()
    if (!ALLOWED_TAGS.has(name)) continue
    if (closing) { if (!VOID_TAGS.has(name)) out.push(`</${name}>`) }
    else out.push(`<${name}${cleanAttrs(m[3])}>`)
  }
  out.push(escapeText(html.slice(last)))
  return out.join('')
}
