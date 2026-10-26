/**
 * Connection cards for each outside service: what it's for, how to get a key
 * (with a link), and a test that proves the key works before you rely on it.
 * Shared by first-run setup and Settings.
 */
import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, CircleDashed, Eye, EyeOff, ExternalLink, AlertTriangle, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { keys, useSettings } from '@/lib/queries'
import { AI_PROVIDERS, modelsFor, resolveModel, type AiProviderId } from '@/lib/ai-models'
import type { PublicSettings, SecretName, TestableService } from '@/lib/types'
import { cn } from '@/lib/cn'
import { Button } from '../ui/Button'
import { Input, Select, Field } from '../ui/Field'
import { Segmented } from '../ui/Segmented'
import { Chip } from '../ui/Bits'

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'ok'; detail: string } | { status: 'fail'; message: string }

function useTest() {
  const [state, setState] = useState<TestState>({ status: 'idle' })
  const run = async (service: TestableService, candidate?: string | Record<string, string>) => {
    setState({ status: 'testing' })
    try {
      const r = await api.settings.test(service, candidate)
      setState({ status: 'ok', detail: r.detail })
      return true
    } catch (err) {
      setState({ status: 'fail', message: err instanceof Error ? err.message : String(err) })
      return false
    }
  }
  return { state, run, reset: () => setState({ status: 'idle' }) }
}

function TestResult({ state }: { state: TestState }) {
  if (state.status === 'idle') return null
  if (state.status === 'testing') return <p className="flex items-center gap-2 text-[12.5px] text-fg-3"><Loader2 className="size-3.5 animate-spin" />Checking…</p>
  if (state.status === 'ok') return <p className="flex items-center gap-2 text-[12.5px] text-up"><CheckCircle2 className="size-3.5" />{state.detail}</p>
  return <p className="flex items-start gap-2 text-[12.5px] text-down"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{state.message}</p>
}

function Secret({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="pr-9 font-mono" autoComplete="off" spellCheck={false} />
      <button type="button" aria-label={show ? 'Hide' : 'Show'} onClick={() => setShow((s) => !s)}
        className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-[7px] text-fg-4 hover:bg-hover hover:text-fg">
        {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </div>
  )
}

export function ConnectionCard({ title, status, children, blurb, optional }: { title: string; status: 'set' | 'unset' | 'partial'; blurb: ReactNode; children: ReactNode; optional?: boolean }) {
  return (
    <section className="panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-[16px] font-bold">{title}</h3>
          <p className="mt-1 max-w-[560px] text-[13px] leading-relaxed text-fg-3">{blurb}</p>
        </div>
        {status === 'set'
          ? <Chip tone="up" icon={<CheckCircle2 />}>Connected</Chip>
          : status === 'partial' ? <Chip tone="warn" icon={<AlertTriangle />}>Incomplete</Chip>
          : <Chip icon={<CircleDashed />}>{optional ? 'Optional' : 'Not set up'}</Chip>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function useSaveSecret() {
  const qc = useQueryClient()
  return async (name: SecretName, value: string | Record<string, string>) => {
    const s = await api.settings.setSecret(name, value)
    qc.setQueryData<PublicSettings>(keys.settings, s)
    return s
  }
}

const Link = ({ href, children }: { href: string; children: ReactNode }) => (
  <button type="button" onClick={() => api.app.openExternal(href)} className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
    {children}<ExternalLink className="size-3" />
  </button>
)

export function RebrickableCard() {
  const { data: s } = useSettings()
  const [key, setKey] = useState('')
  const test = useTest()
  const save = useSaveSecret()
  const status = s?.keys.rebrickable.set ? 'set' : 'unset'
  const onSave = async () => {
    if (await test.run('rebrickable', key)) { await save('rebrickable', key); setKey('') }
  }
  return (
    <ConnectionCard title="Rebrickable" status={status}
      blurb={<>The LEGO catalog: set and minifigure names, pictures, themes, and piece counts. Needed to search and add things. Free: <Link href="https://rebrickable.com/api/">create a Rebrickable account and generate an API key</Link>.</>}>
      <Field label="API key" hint={s?.keys.rebrickable.set ? `Saved key ending ${s.keys.rebrickable.hint}. Paste a new one to replace it.` : undefined}>
        {(id) => <Secret id={id} value={key} onChange={(v) => { setKey(v); test.reset() }} placeholder={s?.keys.rebrickable.set ? '••••••••••••••••' : 'Paste your key'} />}
      </Field>
      <div className="mt-3 flex items-center gap-3">
        <Button variant="primary" size="sm" disabled={!key.trim()} loading={test.state.status === 'testing'} onClick={onSave}>Test and save</Button>
        {s?.keys.rebrickable.set && !key && <Button size="sm" variant="ghost" onClick={() => test.run('rebrickable')}>Test saved key</Button>}
        <TestResult state={test.state} />
      </div>
    </ConnectionCard>
  )
}

const BL_FIELDS = [
  ['bricklinkConsumerKey', 'Consumer key'],
  ['bricklinkConsumerSecret', 'Consumer secret'],
  ['bricklinkToken', 'Token value'],
  ['bricklinkTokenSecret', 'Token secret'],
] as const

export function BricklinkCard() {
  const { data: s } = useSettings()
  const [vals, setVals] = useState<Record<string, string>>({})
  const test = useTest()
  const save = useSaveSecret()
  const st = s?.keys.bricklink
  const status = st?.set ? 'set' : st?.partial ? 'partial' : 'unset'
  const complete = BL_FIELDS.every(([k]) => vals[k]?.trim())
  const onSave = async () => {
    if (await test.run('bricklink', vals)) { await save('bricklink', vals); setVals({}) }
  }
  return (
    <ConnectionCard title="BrickLink" status={status} optional
      blurb={<>Market prices: what your sets and minifigures sell for, price history, and alerts. Free with a BrickLink account. <Link href="https://www.bricklink.com/v2/api/register_consumer.page">Register as an API consumer</Link>, then create an access token. Use 0.0.0.0 as the allowed IP so it works from any network.</>}>
      <div className="grid grid-cols-2 gap-3">
        {BL_FIELDS.map(([k, label]) => (
          <Field key={k} label={label}>
            {(id) => <Secret id={id} value={vals[k] ?? ''} onChange={(v) => { setVals((p) => ({ ...p, [k]: v })); test.reset() }} placeholder={st?.set ? '••••••••' : 'Paste'} />}
          </Field>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button variant="primary" size="sm" disabled={!complete} loading={test.state.status === 'testing'} onClick={onSave}>Test and save</Button>
        {st?.set && !Object.keys(vals).length && <Button size="sm" variant="ghost" onClick={() => test.run('bricklink')}>Test saved keys</Button>}
        <TestResult state={test.state} />
      </div>
    </ConnectionCard>
  )
}

export function AiCard() {
  const qc = useQueryClient()
  const { data: s } = useSettings()
  const [key, setKey] = useState('')
  const test = useTest()
  const save = useSaveSecret()
  if (!s) return null
  const provider = s.aiProvider
  const model = resolveModel(provider, s.aiModel)
  const keyName: SecretName | null = provider === 'anthropic' ? 'anthropic' : provider === 'openai' ? 'openai' : null
  const configured = keyName ? s.keys[keyName].set : true
  const setProvider = async (p: AiProviderId) => {
    test.reset(); setKey('')
    qc.setQueryData(keys.settings, await api.settings.setAi(p, null))
  }
  const setModel = async (m: string) => qc.setQueryData(keys.settings, await api.settings.setAi(provider, m))
  const onSave = async () => {
    if (!keyName) return
    if (await test.run(keyName, key)) { await save(keyName, key); setKey('') }
  }
  const keyHelp = provider === 'anthropic'
    ? <Link href="https://platform.claude.com/">Get an Anthropic API key</Link>
    : provider === 'openai' ? <Link href="https://platform.openai.com/api-keys">Get an OpenAI API key</Link> : null

  return (
    <ConnectionCard title="AI for identification and listings" status={configured ? 'set' : 'unset'} optional
      blurb={<>Scan works without AI: the free Brickognize recognizer handles clear photos on its own. An AI double-checks uncertain matches, reads photographed lists, and writes eBay listings. Pick one provider.</>}>
      <div className="flex flex-col gap-4">
        <Segmented label="AI provider" value={provider} onChange={setProvider} options={AI_PROVIDERS.map((p) => ({ value: p.id, label: p.label }))} />
        <p className="-mt-1 text-[12.5px] text-fg-3">{AI_PROVIDERS.find((p) => p.id === provider)?.blurb}</p>
        {provider !== 'claude-code' ? (
          <div className="grid grid-cols-[1fr_220px] gap-3">
            <Field label="API key" hint={keyName && s.keys[keyName].set ? `Saved key ending ${s.keys[keyName].hint}.` : keyHelp}>
              {(id) => <Secret id={id} value={key} onChange={(v) => { setKey(v); test.reset() }} placeholder={keyName && s.keys[keyName].set ? '••••••••••••••••' : 'Paste your key'} />}
            </Field>
            <Field label="Model">
              {(id) => (
                <Select id={id} value={model} onChange={(e) => void setModel(e.target.value)}>
                  {modelsFor(provider).map((m) => <option key={m.id} value={m.id}>{m.label}{m.note ? ` (${m.note})` : ''}</option>)}
                </Select>
              )}
            </Field>
          </div>
        ) : (
          <p className="rounded-[12px] border border-line bg-panel-2/60 px-3 py-2.5 text-[12.5px] leading-relaxed text-fg-3">
            Uses the Claude Code app installed on this computer and its sign-in. Each call takes a little longer than an API key would. <Link href="https://code.claude.com/docs">Install Claude Code</Link>
          </p>
        )}
        <div className="flex items-center gap-3">
          {provider !== 'claude-code'
            ? <Button variant="primary" size="sm" disabled={!key.trim()} loading={test.state.status === 'testing'} onClick={onSave}>Test and save</Button>
            : <Button variant="primary" size="sm" loading={test.state.status === 'testing'} onClick={() => test.run('claude-code')}>Check for Claude Code</Button>}
          {keyName && s.keys[keyName].set && !key && <Button size="sm" variant="ghost" onClick={() => test.run(keyName)}>Test saved key</Button>}
          <TestResult state={test.state} />
        </div>
      </div>
    </ConnectionCard>
  )
}

export function BrickognizeCard() {
  const test = useTest()
  return (
    <ConnectionCard title="Brickognize" status="set"
      blurb={<>The free community recognizer behind Scan. No key needed. Photos you scan are sent to it for matching. <Link href="https://brickognize.com/">About Brickognize</Link></>}>
      <div className={cn('flex items-center gap-3')}>
        <Button size="sm" onClick={() => test.run('brickognize')} loading={test.state.status === 'testing'}>Check connection</Button>
        <TestResult state={test.state} />
      </div>
    </ConnectionCard>
  )
}
