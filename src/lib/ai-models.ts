/**
 * AI providers and the models offered for each. Shared by the main process
 * (request routing) and Settings (the picker). Scan works without any of
 * these — Brickognize is free — so every provider is optional.
 */
export type AiProviderId = 'anthropic' | 'openai' | 'claude-code'

export interface AiModelOption {
  id: string
  label: string
  note?: string
}

export const AI_PROVIDERS: { id: AiProviderId; label: string; blurb: string }[] = [
  { id: 'anthropic', label: 'Anthropic', blurb: 'Claude models through your Anthropic API key.' },
  { id: 'openai', label: 'OpenAI', blurb: 'GPT models through your OpenAI API key.' },
  { id: 'claude-code', label: 'Claude Code', blurb: 'Your Claude subscription through the Claude Code app on this PC. No API key.' },
]

export const ANTHROPIC_MODELS: AiModelOption[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Recommended' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Faster, lower cost' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Cheapest' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', note: 'Most capable, highest cost' },
]

export const OPENAI_MODELS: AiModelOption[] = [
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', note: 'Low cost' },
  { id: 'gpt-4o', label: 'GPT-4o' },
]

export const DEFAULT_MODEL: Record<AiProviderId, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-4o-mini',
  'claude-code': 'default',
}

export function modelsFor(provider: AiProviderId): AiModelOption[] {
  if (provider === 'anthropic') return ANTHROPIC_MODELS
  if (provider === 'openai') return OPENAI_MODELS
  return [{ id: 'default', label: 'Your Claude Code default model' }]
}

/** A stored model id, or the provider default when it isn't one we offer. */
export function resolveModel(provider: AiProviderId, stored: string | null | undefined): string {
  if (provider === 'claude-code') return 'default'
  // OpenAI ids are free-form (accounts differ); Claude ids must be current
  if (provider === 'openai') return stored?.trim() || DEFAULT_MODEL.openai
  return ANTHROPIC_MODELS.some((m) => m.id === stored) ? (stored as string) : DEFAULT_MODEL.anthropic
}
