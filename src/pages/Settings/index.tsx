import { useState, useEffect } from 'react'
import { Save, RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { IPC } from '@/lib/ipc-types'
import { useUiStore } from '@/store/ui.store'
import toast from 'react-hot-toast'

interface Settings {
  sidecarPort?: number
  aiProvider?: 'openai' | 'anthropic'
  aiModel?: string
  rebrickableApiKey?: string
  bricklinkConsumerKey?: string
  bricklinkConsumerSecret?: string
  bricklinkToken?: string
  bricklinkTokenSecret?: string
  openaiApiKey?: string
  anthropicApiKey?: string
}

const MODELS: Record<'openai' | 'anthropic', { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-4o-mini',    label: 'GPT-4o Mini  (fast · cheap)'        },
    { id: 'gpt-4o',         label: 'GPT-4o  (best quality)'              },
  ],
  anthropic: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5  (fast · cheap)' },
    { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6  (balanced)'    },
    { id: 'claude-opus-4-6',           label: 'Claude Opus 4.6  (best quality)'  },
  ],
}

const DEFAULT_MODELS: Record<'openai' | 'anthropic', string> = {
  openai:    'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
}

export default function SettingsPage() {
  const { sidecarReady } = useUiStore()
  const { flags } = useFeatureFlags()
  const [settings, setSettings] = useState<Settings>({ aiProvider: 'openai', aiModel: 'gpt-4o-mini' })

  useEffect(() => {
    window.ipc.invoke(IPC.SETTINGS_GET).then((s) => {
      const loaded = s as Settings
      if (!loaded.aiProvider) loaded.aiProvider = 'openai'
      if (!loaded.aiModel)    loaded.aiModel    = DEFAULT_MODELS[loaded.aiProvider]
      setSettings(loaded)
    })
  }, [])

  const setProvider = (p: 'openai' | 'anthropic') => {
    setSettings((s) => ({ ...s, aiProvider: p, aiModel: DEFAULT_MODELS[p] }))
  }

  const save = async () => {
    await window.ipc.invoke(IPC.SETTINGS_SET, settings)
    toast.success('Settings saved')
  }

  const restartSidecar = async () => {
    await window.ipc.invoke(IPC.SIDECAR_RESTART)
    toast.success('Sidecar restarting…')
  }

  const toggleFlag = async (key: string, current: 0 | 1) => {
    await window.ipc.invoke(IPC.FLAGS_SET, key, current === 1 ? 0 : 1)
    toast.success(`${key} ${current === 1 ? 'disabled' : 'enabled'}`)
  }

  const provider = settings.aiProvider ?? 'openai'
  const models   = MODELS[provider]

  return (
    <PageShell title="Settings" subtitle="Configure API keys and app preferences">
      <div className="p-6 max-w-2xl mx-auto space-y-6">

        {/* AI Provider */}
        <Card>
          <CardHeader stud><h2 className="text-sm font-bold font-display text-black">AI Provider</h2></CardHeader>
          <CardContent className="py-5 space-y-4">
            {/* Provider toggle */}
            <div className="flex gap-2">
              {(['openai', 'anthropic'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={[
                    'flex-1 py-2 px-4 rounded-lg text-sm font-semibold font-display border transition-all',
                    provider === p
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)] border-[var(--color-accent)]'
                      : 'border-[var(--color-surface-border)] hover:bg-[var(--color-surface-overlay)]',
                  ].join(' ')}
                >
                  {p === 'openai' ? 'OpenAI' : 'Anthropic'}
                </button>
              ))}
            </div>

            {/* Model selector */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 text-[var(--color-surface-muted)] uppercase tracking-wide">
                Model
              </label>
              <select
                value={settings.aiModel ?? DEFAULT_MODELS[provider]}
                onChange={(e) => setSettings((s) => ({ ...s, aiModel: e.target.value }))}
                className="w-full rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-overlay)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* OpenAI API key — shown when OpenAI is active */}
            {provider === 'openai' && (
              <Input
                label="OpenAI API Key"
                type="password"
                placeholder="sk-..."
                value={settings.openaiApiKey ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, openaiApiKey: e.target.value }))}
              />
            )}

            {/* Anthropic API key — shown when Anthropic is active */}
            {provider === 'anthropic' && (
              <Input
                label="Anthropic API Key"
                type="password"
                placeholder="sk-ant-..."
                value={settings.anthropicApiKey ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, anthropicApiKey: e.target.value }))}
              />
            )}

            <p className="text-xs text-[var(--color-surface-muted)]">
              {provider === 'openai'
                ? 'Used for eBay Listing Generator (vision + text). Get a key at platform.openai.com.'
                : 'Used for eBay Listing Generator (vision + text). Get a key at console.anthropic.com.'}
            </p>
          </CardContent>
        </Card>

        {/* AI Sidecar */}
        <Card>
          <CardHeader stud><h2 className="text-sm font-bold font-display text-black">AI Sidecar</h2></CardHeader>
          <CardContent className="py-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {sidecarReady
                  ? <><CheckCircle className="h-4 w-4 text-green-400" /><span className="text-sm text-green-400">Running</span></>
                  : <><XCircle className="h-4 w-4 text-red-400" /><span className="text-sm text-red-400">Offline</span></>
                }
              </div>
              <Button variant="secondary" size="sm" onClick={restartSidecar}>
                <RefreshCw className="h-3.5 w-3.5" />Restart
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Rebrickable */}
        <Card>
          <CardHeader stud><h2 className="text-sm font-bold font-display text-black">Rebrickable API</h2></CardHeader>
          <CardContent className="py-5">
            <Input
              label="API Key"
              type="password"
              placeholder="Enter Rebrickable API key"
              value={settings.rebrickableApiKey ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, rebrickableApiKey: e.target.value }))}
            />
            <p className="text-xs text-[var(--color-surface-muted)] mt-2">
              Free key at rebrickable.com/api — required for set lookup &amp; image confirmation.
            </p>
          </CardContent>
        </Card>

        {/* BrickLink */}
        <Card>
          <CardHeader stud><h2 className="text-sm font-bold font-display text-black">BrickLink API (OAuth)</h2></CardHeader>
          <CardContent className="py-5 space-y-3">
            {[
              { key: 'bricklinkConsumerKey',    label: 'Consumer Key'    },
              { key: 'bricklinkConsumerSecret', label: 'Consumer Secret' },
              { key: 'bricklinkToken',          label: 'Token'           },
              { key: 'bricklinkTokenSecret',    label: 'Token Secret'    },
            ].map(({ key, label }) => (
              <Input
                key={key}
                label={label}
                type="password"
                placeholder={label}
                value={(settings as Record<string, string>)[key] ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
              />
            ))}
          </CardContent>
        </Card>

        {/* Feature Flags */}
        <Card>
          <CardHeader stud><h2 className="text-sm font-bold font-display text-black">Feature Flags</h2></CardHeader>
          <CardContent className="py-5 space-y-3">
            {flags.map((flag) => (
              <div key={flag.key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold font-display">{flag.key}</p>
                  {flag.description && <p className="text-xs text-[var(--color-surface-muted)]">{flag.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={flag.tier === 'premium' ? 'premium' : flag.tier === 'alpha' ? 'alpha' : 'outline'}>
                    {flag.tier}
                  </Badge>
                  <button
                    onClick={() => toggleFlag(flag.key, flag.enabled)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${
                      flag.enabled ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-surface-muted)]'
                    }`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      flag.enabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Button onClick={save} className="w-full"><Save className="h-4 w-4" />Save All Settings</Button>
      </div>
    </PageShell>
  )
}
