import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CloudUpload, RefreshCw, Unplug, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { keys, useSyncStatus, useSettings, invalidateCollection } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { formatAgo } from '@/lib/formatters'
import { Button } from '../ui/Button'
import { Input, Field } from '../ui/Field'
import { Confirm } from '../ui/Overlay'
import { ConnectionCard } from './Connections'

/** Optional two-way sync with a Postgres database the user owns. */
export function SyncCard() {
  const qc = useQueryClient()
  const { data: status } = useSyncStatus()
  const { data: settings } = useSettings()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<'test' | 'connect' | 'sync' | null>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmOff, setConfirmOff] = useState(false)
  const enabled = !!status?.enabled

  const test = async () => {
    setBusy('test'); setResult(null)
    try { const r = await api.settings.test('sync', url); setResult({ ok: true, text: r.detail }) } catch (err) { setResult({ ok: false, text: err instanceof Error ? err.message : String(err) }) } finally { setBusy(null) }
  }
  const connect = async () => {
    setBusy('connect'); setResult(null)
    try {
      const s = await api.sync.connect(url)
      qc.setQueryData(keys.sync, s)
      qc.setQueryData(keys.settings, await api.settings.get())
      await invalidateCollection()
      setUrl('')
      toast.success('Syncing with your database', { body: `${s.pushed} changes sent, ${s.pulled} received.` })
    } catch (err) { setResult({ ok: false, text: err instanceof Error ? err.message : String(err) }) } finally { setBusy(null) }
  }
  const syncNow = async () => {
    setBusy('sync')
    try { qc.setQueryData(keys.sync, await api.sync.now()) } catch (err) { toast.error(err, 'Sync failed') } finally { setBusy(null) }
  }
  const disconnect = async () => {
    try { qc.setQueryData(keys.sync, await api.sync.disconnect()); qc.setQueryData(keys.settings, await api.settings.get()); toast.success('Sync turned off', { body: 'Your data stays on this PC and in your database.' }) } catch (err) { toast.error(err) }
  }

  return (
    <ConnectionCard title="Sync to your own database" status={enabled ? 'set' : 'unset'} optional
      blurb={<>Keep two PCs in step, or keep an off-site copy. BrickForge keeps working from its local file and syncs changes both ways with a PostgreSQL database you own: Supabase, Neon, or your own server. When two PCs change the same item, the newest change wins.</>}>
      {enabled ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[12px] border border-line bg-panel-2/60 px-4 py-3 text-[12.5px]">
            <span className="flex items-center gap-2 font-medium">
              {status?.state === 'error' ? <AlertTriangle className="size-4 text-warn" /> : status?.state === 'syncing' ? <RefreshCw className="size-4 animate-spin text-accent-text" /> : <CloudUpload className="size-4 text-up" />}
              {status?.state === 'error' ? 'Sync problem' : status?.state === 'syncing' ? 'Syncing…' : 'In sync'}
            </span>
            <span className="text-fg-3">Database: <span className="font-mono text-fg-2">{settings?.keys.sync.hint ?? 'saved'}</span></span>
            <span className="text-fg-3">Last sync: {formatAgo(status?.lastSyncAt)}</span>
            {!!status?.pending && <span className="text-fg-3">{status.pending} waiting to send</span>}
          </div>
          {status?.lastError && <p className="text-[12.5px] text-down">{status.lastError}</p>}
          <div className="flex gap-2">
            <Button size="sm" icon={<RefreshCw className="size-3.5" />} loading={busy === 'sync'} onClick={syncNow}>Sync now</Button>
            <Button size="sm" variant="ghost" icon={<Unplug className="size-3.5" />} onClick={() => setConfirmOff(true)}>Turn off sync</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="Connection string" hint="Find it in your database provider's dashboard. It's stored encrypted on this PC and never shown again.">
            {(id) => <Input id={id} value={url} onChange={(e) => { setUrl(e.target.value); setResult(null) }} placeholder="postgresql://user:password@host:5432/postgres" className="font-mono" autoComplete="off" spellCheck={false} />}
          </Field>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={!url.trim()} loading={busy === 'test'} onClick={test}>Test</Button>
            <Button size="sm" variant="primary" disabled={!url.trim()} loading={busy === 'connect'} onClick={connect}>Connect and sync</Button>
            {result && <span className={`text-[12.5px] ${result.ok ? 'text-up' : 'text-down'}`}>{result.text}</span>}
          </div>
        </div>
      )}
      <Confirm open={confirmOff} onOpenChange={setConfirmOff} title="Turn off sync?" confirmLabel="Turn off"
        body="This PC stops syncing and forgets the connection string. Nothing is deleted, here or in your database. You can reconnect any time."
        onConfirm={() => void disconnect()} />
    </ConnectionCard>
  )
}
