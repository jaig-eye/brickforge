/**
 * Steer the fake Anthropic API for one step of a pipeline: answer requests
 * whose prompt matches with your own text, and let the deterministic stand-in
 * (fakeAiAnswer) answer the rest.
 */
import type { FakeRequest, Override } from './fake-apis'

interface Block { type: string; text?: string; source?: { data?: string } }

function blocks(req: FakeRequest): Block[] {
  if (req.service !== 'anthropic' || req.path !== '/v1/messages') return []
  const body = JSON.parse(req.body.toString() || '{}') as { messages?: { content?: Block[] | string }[] }
  return (body.messages ?? []).flatMap((m) => (Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content ?? '') }]))
}

/** All text a request sent to Anthropic, in order. */
export const promptOf = (req: FakeRequest): string => blocks(req).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n')

/** The base64 images a request sent to Anthropic, in order. */
export const imagesOf = (req: FakeRequest): string[] => blocks(req).filter((b) => b.type === 'image').map((b) => b.source?.data ?? '')

export const isAnthropicCall = (req: FakeRequest) => req.service === 'anthropic' && req.path === '/v1/messages'

/** An override that answers matching Anthropic calls with `text`. */
export function answerWhen(match: (prompt: string) => boolean, text: string | ((prompt: string) => string)): Override {
  return (req) => {
    if (!isAnthropicCall(req)) return undefined
    const prompt = promptOf(req)
    if (!match(prompt)) return undefined
    return {
      json: {
        id: 'msg_override', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
        content: [{ type: 'text', text: typeof text === 'function' ? text(prompt) : text }],
        stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
      },
    }
  }
}
