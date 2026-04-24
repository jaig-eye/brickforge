import { useState, useEffect } from 'react'
import { Save, RefreshCw, CheckCircle, AlertCircle, Download } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { IPC } from '@/lib/ipc-types'
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
    { id: 'gpt-4o-mini',    label: 'GPT-4o Mini  (fast \u00b7 cheap)'        },
    { id: 'gpt-4o',         label: 'GPT-4o  (best quality)'              },
  ],
  anthropic: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5  (fast \u00b7 cheap)' },
    { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6  (balanced)'    },
    { id: 'claude-opus-4-6',           label: 'Claude Opus 4.6  (best quality)'  },
  ],
}

const DEFAULT_MODELS: Record<'openai' | 'anthropic', string> = {
  openai:    'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
}

export default function SettingsPage() {
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

  type UpdateStatus =
    | { type: 'idle' }
    | { type: 'checking' }
    | { type: 'upToDate' }
    | { type: 'downloading'; version: string; percent: number }
    | { type: 'ready'; version: string }
    | { type: 'error'; message: string }

  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ type: 'idle' })

  useEffect(() => {
    const offProgress = window.ipc.on(IPC.PUSH_UPDATE_PROGRESS, (...args: unknown[]) => {
      const { percent } = args[1] as { percent: number }
      setUpdateStatus((s) => s.type === 'downloading' ? { ...s, percent } : s)
    })
    const offDownloaded = window.ipc.on(IPC.PUSH_UPDATE_DOWNLOADED, (...args: unknown[]) => {
      const { version } = args[1] as { version: string }
      setUpdateStatus({ type: 'ready', version })
    })
    return () => { offProgress(); offDownloaded() }
  }, [])

  // Sync with any download already in progress from the startup auto-check
  useEffect(() => {
    window.ipc.invoke(IPC.UPDATE_GET_STATE).then((s) => {
      const st = s as { status: string; version?: string; percent?: number }
      if (st.status === 'downloading') {
        setUpdateStatus({ type: 'downloading', version: st.version!, percent: st.percent ?? 0 })
      } else if (st.status === 'ready') {
        setUpdateStatus({ type: 'ready', version: st.version! })
      }
    }).catch(() => {})
  }, [])

  const checkForUpdates = async () => {
    setUpdateStatus({ type: 'checking' })
    try {
      const res = await window.ipc.invoke(IPC.UPDATE_CHECK) as {
        upToDate?: boolean; version?: string; error?: string
        downloading?: boolean; percent?: number; ready?: boolean
      }
      if (res.error) {
        setUpdateStatus({ type: 'error', message: res.error })
      } else if (res.upToDate) {
        setUpdateStatus({ type: 'upToDate' })
      } else if (res.ready) {
        setUpdateStatus({ type: 'ready', version: res.version! })
      } else if (res.downloading) {
        setUpdateStatus({ type: 'downloading', version: res.version!, percent: res.percent ?? 0 })
      } else {
        setUpdateStatus({ type: 'downloading', version: res.version!, percent: 0 })
      }
    } catch (err) {
      setUpdateStatus({ type: 'error', message: String(err) })
    }
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
            {provider === 'openai' && (
              <Input
                label="OpenAI API Key"
                type="password"
                placeholder="sk-..."
                value={settings.openaiApiKey ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, openaiApiKey: e.target.value }))}
              />
            )}
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
              Free key at rebrickable.com/api &#8212; required for set lookup &amp; image confirmation.
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
                    style={{
                      position: 'relative', display: 'inline-block',
                      width: 36, height: 20, borderRadius: 10,
                      background: flag.enabled ? 'var(--color-accent)' : 'var(--color-surface-muted)',
                      transition: 'background 0.2s', flexShrink: 0, border: 'none', cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 2, left: 2,
                      width: 16, height: 16, borderRadius: '50%',
                      background: '#fff',
                      transform: flag.enabled ? 'translateX(16px)' : 'translateX(0)',
                      transition: 'transform 0.2s',
                      display: 'block',
                    }} />
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Updates */}
        <Card>
          <CardHeader stud><h2 className="text-sm font-bold font-display text-black">Updates</h2></CardHeader>
          <CardContent className="py-5 space-y-3">
            {updateStatus.type === 'idle' && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--color-surface-muted)]">Check for a newer version of BrickForge.</p>
                <Button variant="outline" onClick={checkForUpdates} className="shrink-0">
                  <RefreshCw className="h-4 w-4" />
                  Check for Updates
                </Button>
              </div>
            )}
            {updateStatus.type === 'checking' && (
              <div className="flex items-center gap-3">
                <RefreshCw className="h-4 w-4 animate-spin text-[var(--color-surface-muted)] shrink-0" />
                <p className="text-sm text-[var(--color-surface-muted)]">Checking for updates...</p>
              </div>
            )}
            {updateStatus.type === 'upToDate' && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  <p className="text-sm font-semibold">You&#39;re on the latest version.</p>
                </div>
                <Button variant="outline" onClick={checkForUpdates} className="shrink-0 text-xs">
                  <RefreshCw className="h-3 w-3" />
                  Re-check
                </Button>
              </div>
            )}
            {updateStatus.type === 'downloading' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-[var(--color-accent)] shrink-0 animate-pulse" />
                  <p className="text-sm font-semibold">
                    Downloading v{updateStatus.version}... {updateStatus.percent}%
                  </p>
                </div>
                <div className="w-full h-2 rounded-full bg-[var(--color-surface-border)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300"
                    style={{ width: `${updateStatus.percent}%` }}
                  />
                </div>
              </div>
            )}
            {updateStatus.type === 'ready' && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  <p className="text-sm font-semibold">Update v{updateStatus.version} ready to install.</p>
                </div>
                <Button
                  onClick={() => window.ipc.invoke(IPC.UPDATE_INSTALL)}
                  className="shrink-0"
                >
                  Restart &amp; Install
                </Button>
              </div>
            )}
            {updateStatus.type === 'error' && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-500 truncate">{updateStatus.message}</p>
                </div>
                <Button variant="outline" onClick={checkForUpdates} className="shrink-0 text-xs">
                  Retry
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Button onClick={save} className="w-full"><Save className="h-4 w-4" />Save All Settings</Button>
      </div>
    </PageShell>
  )
}
