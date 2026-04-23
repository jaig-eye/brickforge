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
  rebrickableApiKey?: string
  bricklinkConsumerKey?: string
  bricklinkConsumerSecret?: string
  bricklinkToken?: string
  bricklinkTokenSecret?: string
  openaiApiKey?: string
}

export default function Settings() {
  const { sidecarReady } = useUiStore()
  const { flags, isEnabled } = useFeatureFlags()
  const [settings, setSettings] = useState<Settings>({})

  useEffect(() => {
    window.ipc.invoke(IPC.SETTINGS_GET).then((s) => setSettings(s as Settings))
  }, [])

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

  return (
    <PageShell title="Settings" subtitle="Configure API keys and app preferences">
      <div className="p-6 max-w-2xl mx-auto space-y-6">
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
            <Input
              label="OpenAI API Key (for AI features)"
              type="password"
              placeholder="sk-..."
              value={settings.openaiApiKey ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, openaiApiKey: e.target.value }))}
            />
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
            <p className="text-xs text-[var(--color-surface-muted)] mt-2">Get a free key at rebrickable.com/api</p>
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
