import { describe, it, expect } from 'vitest'
import { resolveModel, modelsFor, DEFAULT_MODEL, ANTHROPIC_MODELS } from '../../src/lib/ai-models'

describe('resolveModel', () => {
  it('keeps every Claude model the app offers', () => {
    for (const m of ANTHROPIC_MODELS) expect(resolveModel('anthropic', m.id)).toBe(m.id)
  })

  it('maps retired, unknown, and missing Claude ids to the default', () => {
    for (const id of ['claude-haiku-4-5-20251001', 'claude-3-opus-20240229', 'gpt-4o', 'claude-opus-5-5 ', '', null, undefined]) {
      expect(resolveModel('anthropic', id)).toBe(DEFAULT_MODEL.anthropic)
    }
  })

  it('takes OpenAI ids free-form (accounts differ) and trims them', () => {
    expect(resolveModel('openai', 'gpt-4.1-nano')).toBe('gpt-4.1-nano')
    expect(resolveModel('openai', '  o4-mini  ')).toBe('o4-mini')
    expect(resolveModel('openai', '   ')).toBe(DEFAULT_MODEL.openai)
    expect(resolveModel('openai', null)).toBe(DEFAULT_MODEL.openai)
  })

  it('always uses the CLI default for Claude Code', () => {
    expect(resolveModel('claude-code', 'claude-opus-5-5')).toBe('default')
    expect(modelsFor('claude-code').map((m) => m.id)).toEqual(['default'])
  })

  it('offers a default that is one of the listed models', () => {
    expect(modelsFor('anthropic').some((m) => m.id === DEFAULT_MODEL.anthropic)).toBe(true)
    expect(modelsFor('openai').some((m) => m.id === DEFAULT_MODEL.openai)).toBe(true)
  })
})
