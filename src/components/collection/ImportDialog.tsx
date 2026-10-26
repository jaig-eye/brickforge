/**
 * Import: from a file (Brickset, Rebrickable, BrickLink XML, BrickForge CSV)
 * or a photo of a written list. Nothing changes until you've reviewed every
 * row; re-importing updates instead of duplicating.
 */
import { useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileSpreadsheet, ImageUp, CheckCircle2, AlertTriangle } from 'lucide-react'
import { api, fileToBase64 } from '@/lib/api'
import { IPC } from '@/lib/ipc-types'
import { invalidateCollection } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/cn'
import type { ImportItem, ImportProgress, ImportResult } from '@/lib/types'
import { Dialog } from '../ui/Overlay'
import { Button } from '../ui/Button'
import { Input, Select } from '../ui/Field'
import { Segmented } from '../ui/Segmented'
import { Ring, Spinner } from '../ui/Bits'

type Row = ImportItem & { include: boolean; confidence?: number; raw?: string }
type Stage = { name: 'choose' } | { name: 'reading' } | { name: 'review'; source: string; skipped: number } | { name: 'running' } | { name: 'done'; result: ImportResult }

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [stage, setStage] = useState<Stage>({ name: 'choose' })
  const [rows, setRows] = useState<Row[]>([])
  const [as, setAs] = useState<'owned' | 'wanted'>('owned')
  const [progress, setProgress] = useState<ImportProgress | null>(null)

  useEffect(() => { if (open) { setStage({ name: 'choose' }); setRows([]); setProgress(null) } }, [open])
  useEffect(() => api.on<ImportProgress>(IPC.PUSH_IMPORT, setProgress), [])

  const pickFile = async () => {
    try {
      const p = await api.data.pickImport()
      if (p.canceled) return
      if (!p.items?.length) { toast.error(new Error(p.format ?? 'No items found in that file.'), 'Nothing to import'); return }
      setRows(p.items.map((i) => ({ ...i, include: true })))
      setStage({ name: 'review', source: `${p.fileName} · ${p.format}`, skipped: p.skipped ?? 0 })
    } catch (err) { toast.error(err, "Couldn't read that file") }
  }

  const photo = useDropzone({
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    multiple: false,
    noClick: false,
    onDrop: async (files) => {
      if (!files[0]) return
      setStage({ name: 'reading' })
      try {
        const r = await api.data.readListPhoto(await fileToBase64(files[0]))
        if (!r.rows.length) { toast.info("No set numbers could be read in that photo."); setStage({ name: 'choose' }); return }
        setRows(r.rows.map((x) => ({ ...x, include: true })))
        setStage({ name: 'review', source: `Photo of a list · ${r.rows.length} rows read`, skipped: 0 })
      } catch (err) { toast.error(err, "Couldn't read the photo"); setStage({ name: 'choose' }) }
    },
  })

  const run = async () => {
    setStage({ name: 'running' })
    try {
      const result = await api.data.runImport(rows.filter((r) => r.include).map(({ include: _i, confidence: _c, raw: _r, ...item }) => item), as)
      await invalidateCollection()
      setStage({ name: 'done', result })
    } catch (err) { toast.error(err, 'The import stopped'); setStage({ name: 'review', source: '', skipped: 0 }) }
  }

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const included = rows.filter((r) => r.include).length

  return (
    <Dialog open={open} onOpenChange={(o) => stage.name !== 'running' && onOpenChange(o)} width={stage.name === 'review' ? 880 : 620}
      title={stage.name === 'done' ? 'Import finished' : 'Import your collection'}
      description={stage.name === 'choose' ? 'Bring in a list you already keep somewhere else. You review everything before it is added.' : stage.name === 'review' ? stage.source : undefined}
      footer={stage.name === 'review' ? (
        <>
          <span className="mr-auto flex items-center gap-2 text-[12.5px] text-fg-3">
            Rows without a wishlist mark are added as
            <Segmented size="sm" label="Import as" value={as} onChange={setAs} options={[{ value: 'owned', label: 'Owned' }, { value: 'wanted', label: 'Wishlist' }]} />
          </span>
          <Button variant="ghost" onClick={() => setStage({ name: 'choose' })}>Back</Button>
          <Button variant="primary" disabled={!included} onClick={run}>Import {included} item{included === 1 ? '' : 's'}</Button>
        </>
      ) : stage.name === 'done' ? <Button variant="primary" onClick={() => onOpenChange(false)}>Done</Button> : undefined}
    >
      {stage.name === 'choose' && (
        <div className="grid grid-cols-2 gap-3 pb-2">
          <button type="button" onClick={pickFile} className="panel flex flex-col items-start gap-3 p-5 text-left transition-transform hover:-translate-y-0.5 hover:border-line-strong">
            <span className="grid size-10 place-items-center rounded-[12px] bg-accent-soft text-accent-text"><FileSpreadsheet className="size-5" /></span>
            <span className="font-display text-[16px] font-bold">A collection file</span>
            <span className="text-[12.5px] leading-relaxed text-fg-3">CSV exports from Brickset, Rebrickable, or BrickForge, or a BrickLink wanted list (XML).</span>
          </button>
          <div {...photo.getRootProps()} className={cn('panel flex cursor-pointer flex-col items-start gap-3 border-dashed p-5 text-left transition-transform hover:-translate-y-0.5 hover:border-line-strong', photo.isDragActive && 'border-accent bg-accent-soft')}>
            <input {...photo.getInputProps()} />
            <span className="grid size-10 place-items-center rounded-[12px] bg-accent-soft text-accent-text"><ImageUp className="size-5" /></span>
            <span className="font-display text-[16px] font-bold">A photo of a list</span>
            <span className="text-[12.5px] leading-relaxed text-fg-3">Handwritten or printed set numbers. Drop or pick a photo. Needs an AI provider in Settings.</span>
          </div>
        </div>
      )}

      {stage.name === 'reading' && <div className="grid h-48 place-items-center"><div className="flex items-center gap-3 text-fg-3"><Spinner className="size-5" />Reading the list…</div></div>}

      {stage.name === 'review' && (
        <div className="overflow-hidden rounded-[14px] border border-line">
          <table className="w-full text-[12.5px]">
            <thead className="bg-panel-2 text-left">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium [&>th]:text-fg-3">
                <th className="w-8"><input type="checkbox" aria-label="Include all" checked={included === rows.length} onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, include: e.target.checked })))} /></th>
                <th className="w-[110px]">Type</th><th>Number</th><th className="w-[80px]">Qty</th><th className="w-[90px]">Wishlist</th><th className="w-[150px]">Condition</th><th className="w-[100px]">Paid</th>
              </tr>
            </thead>
            <tbody className="[&>tr:not(:last-child)]:border-b [&>tr]:border-line">
              {rows.slice(0, 500).map((r, i) => (
                <tr key={i} className={cn('[&>td]:px-3 [&>td]:py-1.5', !r.include && 'opacity-45')}>
                  <td><input type="checkbox" aria-label={`Include ${r.number}`} checked={r.include} onChange={(e) => update(i, { include: e.target.checked })} /></td>
                  <td>
                    <Select value={r.kind} onChange={(e) => update(i, { kind: e.target.value as 'set' | 'minifig' })} aria-label="Type">
                      <option value="set">Set</option><option value="minifig">Minifig</option>
                    </Select>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Input value={r.number} onChange={(e) => update(i, { number: e.target.value })} className="font-mono" aria-label="Number" />
                      {r.confidence != null && r.confidence < 0.7 && <span title={`Read as “${r.raw ?? r.number}”. Check the digits.`}><AlertTriangle className="size-4 text-warn" /></span>}
                    </div>
                  </td>
                  <td><Input inputMode="numeric" value={String(r.quantity)} onChange={(e) => update(i, { quantity: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })} aria-label="Quantity" /></td>
                  <td className="text-center"><input type="checkbox" aria-label="Wishlist" checked={r.wanted} onChange={(e) => update(i, { wanted: e.target.checked })} /></td>
                  <td className="text-fg-3">{r.condition ?? <span className="text-fg-4">default</span>}</td>
                  <td className="tnum font-mono text-fg-3">{r.price != null ? `$${r.price.toFixed(2)}` : <span className="text-fg-4">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 500 && <p className="border-t border-line px-3 py-2 text-[12px] text-fg-3">Showing the first 500 of {rows.length} rows. All included rows will be imported.</p>}
          {stage.skipped > 0 && <p className="border-t border-line px-3 py-2 text-[12px] text-fg-3">{stage.skipped} row{stage.skipped === 1 ? ' was' : 's were'} skipped because they had no set or minifig number.</p>}
        </div>
      )}

      {stage.name === 'running' && (
        <div className="flex flex-col items-center gap-4 py-10">
          <Ring value={progress && progress.total ? progress.done / progress.total : 0} size={64} stroke={5} />
          <div className="text-center">
            <div className="tnum font-display text-[18px] font-bold">{progress ? `${progress.done} of ${progress.total}` : 'Starting…'}</div>
            <div className="mt-1 font-mono text-[12px] text-fg-3">{progress?.current ?? ''}</div>
          </div>
          <p className="max-w-[380px] text-center text-[12.5px] text-fg-4">Each new set is looked up in the catalog, so large lists take a minute.</p>
        </div>
      )}

      {stage.name === 'done' && (
        <div className="flex flex-col gap-4 py-2">
          <div className="flex items-center gap-3 rounded-[14px] bg-up-soft px-4 py-3 text-up">
            <CheckCircle2 className="size-5" />
            <span className="text-[13.5px] font-medium">{stage.result.imported} added, {stage.result.updated} updated</span>
          </div>
          {stage.result.failed.length > 0 && (
            <div>
              <h4 className="mb-2 text-[13px] font-semibold">{stage.result.failed.length} couldn't be imported</h4>
              <ul className="max-h-[220px] overflow-y-auto rounded-[12px] border border-line text-[12.5px]">
                {stage.result.failed.map((f) => (
                  <li key={f.number} className="flex justify-between gap-4 border-b border-line px-3 py-1.5 last:border-0">
                    <span className="font-mono">{f.number}</span><span className="text-fg-3">{f.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
