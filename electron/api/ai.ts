/**
 * AI providers behind one interface: Anthropic (official SDK), OpenAI (REST),
 * and the local Claude Code CLI. Callers build a list of text and image parts;
 * this module turns it into each provider's request shape and returns the
 * model's text. Every provider is optional — identification starts with the
 * free Brickognize recognizer and only asks an AI to judge uncertain cases.
 */
import Anthropic from '@anthropic-ai/sdk'
import { readSettings } from '../main/settings-store'
import { AppError, missingKey } from '../../src/lib/errors'
import { resolveModel, type AiProviderId } from '../../src/lib/ai-models'
import { callClaudeCode } from './claude-code'
import { request, serviceUrl, statusError } from './http'

export interface Provider {
  id: AiProviderId
  model: string
  apiKey: string
}

export type VisionPart =
  | { type: 'text'; text: string }
  | { type: 'image'; b64: string; mediaType: string; detail?: 'low' | 'high' }

/** The configured provider, or an AppError explaining what to set up. */
export function resolveProvider(): Provider | AppError {
  const s = readSettings()
  const id: AiProviderId = s.aiProvider ?? 'anthropic'
  if (id === 'claude-code') return { id, model: 'default', apiKey: '' }
  const apiKey = (id === 'anthropic' ? s.anthropicApiKey : s.openaiApiKey) ?? ''
  if (!apiKey) return missingKey(id, `an ${id === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key`)
  return { id, model: resolveModel(id, s.aiModel), apiKey }
}

export function hasAiProvider(): boolean {
  return !(resolveProvider() instanceof AppError)
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

// Models that accept server-side refusal fallbacks ("default" routing): a
// false-positive policy decline is retried on Anthropic's recommended model
// instead of failing the scan.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1'])

function anthropicClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    baseURL: process.env.BRICKFORGE_ANTHROPIC_URL || undefined,
    maxRetries: 2,
    timeout: 300_000,
  })
}

function anthropicError(err: unknown): AppError {
  if (err instanceof AppError) return err
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AppError({ code: 'auth', service: 'anthropic', message: 'Anthropic rejected the API key. Check it in Settings.' })
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AppError({ code: 'rate_limited', service: 'anthropic', message: 'Anthropic is rate-limiting requests. Try again in a minute.' })
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AppError({ code: 'network', service: 'anthropic', message: "Couldn't reach Anthropic. Check your connection." })
  }
  if (err instanceof Anthropic.APIError) {
    return new AppError({ code: 'service', service: 'anthropic', message: `Anthropic returned an error ${err.status ?? ''}: ${err.message}`.trim() })
  }
  return new AppError({ code: 'internal', service: 'anthropic', message: String(err instanceof Error ? err.message : err) })
}

async function callAnthropic(p: Provider, parts: VisionPart[], maxTokens: number): Promise<string> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = parts.map((pt) => pt.type === 'text'
    ? { type: 'text', text: pt.text }
    : { type: 'image', source: { type: 'base64', media_type: pt.mediaType as 'image/jpeg', data: pt.b64 } })
  let res: Anthropic.Beta.BetaMessage
  try {
    res = await anthropicClient(p.apiKey).beta.messages.create({
      model: p.model,
      // Thinking is always on for current Claude models and counts against
      // this cap, so it must leave room for reasoning plus the JSON answer.
      max_tokens: maxTokens,
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content }],
      ...(FALLBACK_MODELS.has(p.model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    })
  } catch (err) {
    throw anthropicError(err)
  }
  if (res.stop_reason === 'refusal') {
    throw new AppError({ code: 'service', service: 'anthropic', message: 'Claude declined this request. Try another photo or provider.' })
  }
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  if (res.stop_reason === 'max_tokens' && !text) {
    throw new AppError({ code: 'service', service: 'anthropic', message: 'Claude ran out of room before answering. Try again.' })
  }
  return text
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

const openaiBase = () => serviceUrl('openai', 'https://api.openai.com')

async function callOpenAI(p: Provider, parts: VisionPart[], maxTokens: number): Promise<string> {
  const content = parts.map((pt) => pt.type === 'text'
    ? { type: 'text', text: pt.text }
    : { type: 'image_url', image_url: { url: `data:${pt.mediaType};base64,${pt.b64}`, detail: pt.detail ?? 'low' } })
  const res = await request('openai', `${openaiBase()}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: p.model, max_completion_tokens: maxTokens, messages: [{ role: 'user', content }] }),
    timeoutMs: 120_000,
    retries: 2,
  })
  if (res.status !== 200) {
    let detail = ''
    try { detail = res.json<{ error?: { message?: string } }>().error?.message ?? '' } catch { /* plain-text body */ }
    throw statusError('openai', res.status, detail)
  }
  const data = res.json<{ choices?: { message?: { content?: string | null }; finish_reason?: string }[] }>()
  const choice = data.choices?.[0]
  if (!choice?.message?.content) {
    throw new AppError({ code: 'service', service: 'openai', message: `OpenAI returned no answer${choice?.finish_reason ? ` (${choice.finish_reason})` : ''}.` })
  }
  return choice.message.content
}

// ── Public calls ──────────────────────────────────────────────────────────────

/**
 * One call with interleaved text and images, provider-agnostic. This is what
 * makes judging VISUAL: the model compares the user's photo with official
 * candidate images, not just names.
 */
export async function callVision(p: Provider, parts: VisionPart[], maxTokens = 16_000): Promise<string> {
  if (p.id === 'claude-code') {
    // Text keeps its position; each image becomes a numbered file reference
    const images: { b64: string; mediaType: string }[] = []
    const text = parts.map((pt) => {
      if (pt.type === 'text') return pt.text
      images.push({ b64: pt.b64, mediaType: pt.mediaType })
      return `[See IMAGE ${images.length}]`
    }).join('\n')
    return callClaudeCode(text, images)
  }
  if (p.id === 'anthropic') return callAnthropic(p, parts, maxTokens)
  return callOpenAI(p, parts, Math.min(maxTokens, 4_000))
}

export function callText(p: Provider, prompt: string, maxTokens = 16_000): Promise<string> {
  return callVision(p, [{ type: 'text', text: prompt }], maxTokens)
}

/** Parse a JSON answer, tolerating markdown fences and leading prose. */
export function parseAiJson<T = unknown>(text: string): T {
  const stripped = text.trim()
  const fenced = stripped.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  const body = fenced ? fenced[1].trim() : stripped
  try {
    return JSON.parse(body) as T
  } catch {
    // Last resort: the outermost {...} or [...] span
    const start = body.search(/[[{]/)
    const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'))
    if (start !== -1 && end > start) return JSON.parse(body.slice(start, end + 1)) as T
    throw new AppError({ code: 'service', message: "The AI's answer wasn't in the expected format. Try again." })
  }
}

/** Settings → Test connection: a cheap authenticated call, no tokens spent. */
export async function testAiKey(id: 'anthropic' | 'openai', apiKey: string): Promise<void> {
  if (!apiKey) throw missingKey(id)
  if (id === 'anthropic') {
    try { await anthropicClient(apiKey).models.list({ limit: 1 }) }
    catch (err) { throw anthropicError(err) }
    return
  }
  const res = await request('openai', `${openaiBase()}/v1/models`, { headers: { Authorization: `Bearer ${apiKey}` }, timeoutMs: 15_000 })
  if (res.status !== 200) throw statusError('openai', res.status)
}
