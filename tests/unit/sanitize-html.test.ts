/**
 * The sanitizer guards AI-written HTML that people paste into eBay, so these
 * tests try to get script, remote content, or event handlers through it.
 */
import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from '../../src/lib/sanitize-html'

/** Every tag left in the output, with its attributes. */
const tagsIn = (html: string) => [...html.matchAll(/<\/?([a-z0-9]+)([^>]*)>/gi)].map((m) => ({ name: m[1].toLowerCase(), attrs: m[2] }))

/** Nothing executable or remote survives: only allowlisted tags with vetted attributes. */
function expectInert(html: string): void {
  for (const t of tagsIn(html)) {
    expect(['div', 'span', 'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 'small',
      'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'blockquote', 'center']).toContain(t.name)
    // Attributes are re-serialized as name="value"; nothing outside that shape
    expect(t.attrs).toMatch(/^(\s(style|colspan|rowspan|align|width|valign)="[^"<>]*")*$/)
    expect(t.attrs).not.toMatch(/url\s*\(|expression\s*\(|javascript:|image-set/i)
  }
  // Leftover text is escaped; only the tags above are real markup
  expect(html).not.toMatch(/<(script|style|iframe|object|embed|svg|math|img|a|link|meta|base|form|input)\b/i)
}

describe('dangerous containers', () => {
  it('removes scripts along with their content', () => {
    expect(sanitizeHtml('<p>Hi</p><script>alert(1)</script><p>Bye</p>')).toBe('<p>Hi</p><p>Bye</p>')
    expect(sanitizeHtml('<SCRIPT SRC=//evil.example/x.js></SCRIPT>ok')).toBe('ok')
    expect(sanitizeHtml('<script/xss src="//evil.example"></script >ok')).toBe('ok')
  })

  it('removes everything after an unclosed script tag', () => {
    expect(sanitizeHtml('<p>a</p><script>alert(1)<p>b</p>')).toBe('<p>a</p>')
    expect(sanitizeHtml('<p>a</p><script>alert(1)</script')).toBe('<p>a</p>')
  })

  it('removes style blocks, iframes, objects, and embeds with their content', () => {
    expect(sanitizeHtml('<style>body{background:url(javascript:alert(1))}</style><p>x</p>')).toBe('<p>x</p>')
    expect(sanitizeHtml('<iframe src="javascript:alert(1)">fallback</iframe><p>x</p>')).toBe('<p>x</p>')
    expect(sanitizeHtml('<object data="evil.swf"><embed src="evil.swf"></object>x')).toBe('x')
  })

  it('removes SVG and MathML (event handlers and mXSS tricks live there)', () => {
    expect(sanitizeHtml('<svg onload=alert(1)><circle r="5"/></svg><p>x</p>')).toBe('<p>x</p>')
    expect(sanitizeHtml('<svg/onload=alert(1)><p>x</p>')).toBe('')
    expect(sanitizeHtml('<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>')).toBe('')
  })

  it('removes template, noscript, textarea, and title content that could hide markup', () => {
    const out = sanitizeHtml('<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>')
    expectInert(out)
    expect(out).not.toContain('onerror')
    expect(sanitizeHtml('<template><img src=x onerror=alert(1)></template>ok')).toBe('ok')
    expect(sanitizeHtml('<textarea><script>alert(1)</script></textarea>ok')).toBe('ok')
  })
})

describe('tags and attributes', () => {
  it('drops images, links, and forms but keeps their text', () => {
    expect(sanitizeHtml('<img src=x onerror=alert(1)>')).toBe('')
    expect(sanitizeHtml('<img src="x" onerror="alert(1)"/>Falcon')).toBe('Falcon')
    expect(sanitizeHtml('<a href="javascript:alert(1)">click</a>')).toBe('click')
    expect(sanitizeHtml('<a href="https://evil.example">Buy here</a>')).toBe('Buy here')
    expect(sanitizeHtml('<form action="https://evil.example"><input name="card"></form>ok')).toBe('ok')
  })

  it('strips every event handler attribute from allowed tags', () => {
    expect(sanitizeHtml('<p onclick="x()" onmouseover=\'y()\' ONFOCUS=z() style="color:red">t</p>')).toBe('<p style="color:red">t</p>')
    expect(sanitizeHtml('<div style="color:red"onclick="alert(1)">t</div>')).toBe('<div style="color:red">t</div>')
  })

  it('keeps attribute values that contain ">" inside the tag they belong to', () => {
    expect(sanitizeHtml('<p title="a>b" onclick=alert(1)>x</p>')).toBe('<p>x</p>')
  })

  it('cannot be tricked into closing the style attribute early', () => {
    // A quote smuggled in (literally or as an entity) stays inside the value
    expect(sanitizeHtml(`<div style='color:red" onclick="alert(1)'>t</div>`)).toBe('<div style="color:red&quot; onclick=&quot;alert(1)">t</div>')
    expect(sanitizeHtml('<div style="color:red&quot; onclick=&quot;alert(1)">t</div>')).toBe('<div style="color:red&quot; onclick=&quot;alert(1)">t</div>')
    expectInert(sanitizeHtml('<div style=`color:red` onclick=alert(1)>t</div>'))
  })

  it('treats a tag with an unbalanced quote as text', () => {
    const out = sanitizeHtml('<div data=foo"onclick=alert(1)>x')
    expect(out).toBe('&lt;div data=foo"onclick=alert(1)&gt;x')
  })

  it('lowercases tags and normalizes void tags', () => {
    expect(sanitizeHtml('<P STYLE="color:red">a<BR/>b<hr />c</br></P>')).toBe('<p style="color:red">a<br>b<hr>c</p>')
  })

  it('escapes stray angle brackets in text', () => {
    expect(sanitizeHtml('<p>5 < 6 and 7 > 3</p>')).toBe('<p>5 &lt; 6 and 7 &gt; 3</p>')
    expect(sanitizeHtml('<img src=x onerror=alert(1)')).toBe('&lt;img src=x onerror=alert(1)')
  })

  it('does not rebuild a script tag from fragments split around a removed one', () => {
    for (const html of [
      '<scr<script>x</script>ipt>alert(1)</script>',
      '<<script>script>alert(1)<</script>/script>',
      '<sty<style></style>le>body{background:url(//evil.example/x.png)}</style>',
    ]) {
      const out = sanitizeHtml(html)
      expect(out).not.toMatch(/<\s*(script|style)/i)
      expectInert(out)
    }
  })

  it('handles nested and unclosed allowed tags without inventing markup', () => {
    expect(sanitizeHtml('<div><p><strong>Bold <em>both</strong> tail')).toBe('<div><p><strong>Bold <em>both</strong> tail')
    expect(sanitizeHtml('<div><unknown-tag foo="bar"><p>x</p></unknown-tag></div>')).toBe('<div><p>x</p></div>')
  })
})

describe('inline styles', () => {
  it('drops a style that loads anything or runs script', () => {
    for (const style of [
      'background:url(https://evil.example/track.png)',
      'background:URL (x)',
      'width:expression(alert(1))',
      'background:javascript:alert(1)',
      'x:vbscript:msgbox(1)',
      'behavior:url(x.htc)',
      '-moz-binding:url(x.xml#xss)',
      '@import "evil.css"',
      'color:red\\;background:u\\72l(x)',
      'background-image:image-set("https://evil.example/track.png" 1x)',
      'background-image:-webkit-image-set("https://evil.example/track.png" 1x)',
    ]) {
      expect(sanitizeHtml(`<div style='${style}'>t</div>`), style).toBe('<div>t</div>')
    }
  })

  it('decodes entities before vetting, so encoded payloads are caught', () => {
    for (const style of [
      'x:&#106;avascript:alert(1)',
      'x:&#106avascript:alert(1)',
      'x:&#0000106;avascript:alert(1)',
      'x:&#x6A;avascript:alert(1)',
      'x:javascript&colon;alert(1)',
      'background:&#117;rl(x)',
      'background:url&lpar;x&rpar;',
      'width:expr&#101;ssion(alert(1))',
      'color:red&bsol;0;',
    ]) {
      expect(sanitizeHtml(`<div style="${style}">t</div>`), style).toBe('<div>t</div>')
    }
  })

  it('keeps one vetted style and drops a second, poisoned one', () => {
    expect(sanitizeHtml('<p style="color:red" style="background:url(x)">t</p>')).toBe('<p style="color:red">t</p>')
  })

  it('vets table layout attributes too', () => {
    expect(sanitizeHtml('<td colspan="2" width="40%" align="left" valign="top">x</td>')).toBe('<td colspan="2" width="40%" align="left" valign="top">x</td>')
    expect(sanitizeHtml('<td width="javascript:alert(1)" align="x&quot; onclick=&quot;y">x</td>')).toBe('<td>x</td>')
  })
})

describe('comments', () => {
  it('removes comments, including ones hiding markup or left unclosed', () => {
    expect(sanitizeHtml('a<!-- <script>alert(1)</script> -->b')).toBe('ab')
    expect(sanitizeHtml('<!--[if IE]><script>alert(1)</script><![endif]-->ok')).toBe('ok')
    expect(sanitizeHtml('ok<!-- <img src=x onerror=alert(1)>')).toBe('ok')
  })
})

describe('legitimate listing HTML', () => {
  it('keeps the dark-theme eBay layout the prompt asks for', () => {
    const html = [
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;background:#111;border-radius:10px;overflow:hidden;border:1px solid #2a2a2a;">',
      '<div style="background:#1a1a1a;border-left:4px solid #FFC929;padding:20px 24px;">',
      '<h2 style="color:#fff;font-size:22px;margin:0;">Millennium Falcon</h2>',
      '<span style="color:#888;font-size:12px;">#75192 · 2017</span></div>',
      '<p style="color:#ccc;font-size:14px;line-height:1.6;">The <strong>ultimate</strong> <em>collector</em> ship.<br>Built once.</p>',
      '<table style="width:100%;border-collapse:collapse;"><tbody>',
      '<tr style="background:#1a1a1a;"><td style="color:#777;font-size:13px;" width="40%">Set Number</td><td style="color:#eee;font-weight:bold;">75192</td></tr>',
      '<tr><td colspan="2" align="center">Pieces: 7,541</td></tr>',
      '</tbody></table>',
      '<ul style="list-style:none;padding:0;"><li style="padding:8px 0;border-bottom:1px solid #1e1e1e;">&#10003; The set itself</li></ul>',
      "<div style=\"text-align:center;color:#555;font-family:'Helvetica Neue';\">Authentic LEGO® product · Personally inspected</div>",
      '</div>',
    ].join('')
    expect(sanitizeHtml(html)).toBe(html)
  })

  it('keeps quotes in a style value, escaped', () => {
    expect(sanitizeHtml('<p style="font-family:&quot;Arial&quot;">t</p>')).toBe('<p style="font-family:&quot;Arial&quot;">t</p>')
  })

  it('returns an empty string for non-string input', () => {
    expect(sanitizeHtml(undefined as unknown as string)).toBe('')
    expect(sanitizeHtml(null as unknown as string)).toBe('')
  })
})
