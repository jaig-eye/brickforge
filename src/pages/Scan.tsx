import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { AnimatePresence, motion } from 'framer-motion'
import { ImagePlus, ExternalLink, Trash2, Info } from 'lucide-react'
import { api, fileToBase64 } from '@/lib/api'
import { useScanJobs, useSettings } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/cn'
import { dealCard } from '@/lib/motion'
import { AI_PROVIDERS } from '@/lib/ai-models'
import type { PieceIdentifyResult } from '@/lib/types'
import { Page, Rise } from '@/components/shell/Page'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { Switch, Tip } from '@/components/ui/Menu'
import { Confidence, ItemImage, Spinner } from '@/components/ui/Bits'
import { Kbd } from '@/components/ui/Field'
import { ScanCard } from '@/components/scan/ScanCard'
import { SceneScan } from '@/components/brick/Scenes'
import { shortcut } from '@/lib/platform'

type Mode = 'minifig' | 'set' | 'piece'

export default function Scan() {
  const [mode, setMode] = useState<Mode>('minifig')
  const [split, setSplit] = useState(false)
  const { data: settings } = useSettings()
  const { data: jobs } = useScanJobs()
  const hasAi = !!settings && (settings.aiProvider === 'claude-code' || settings.keys[settings.aiProvider === 'anthropic' ? 'anthropic' : 'openai'].set)
  const providerLabel = AI_PROVIDERS.find((p) => p.id === settings?.aiProvider)?.label ?? 'your AI'
  const visible = (jobs ?? []).filter((j) => j.status !== 'dismissed')
  const finished = visible.filter((j) => j.status === 'added' || j.status === 'error' || j.status === 'done').length

  const enqueue = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (!images.length) return
    try {
      const b64 = await Promise.all(images.map(fileToBase64))
      const r = await api.scan.enqueue(b64, mode === 'set' ? 'set' : 'minifig', mode === 'minifig' && split && hasAi)
      toast.info(`${r.enqueued} photo${r.enqueued === 1 ? '' : 's'} added to the scan queue`)
    } catch (err) { toast.error(err, "Couldn't queue those photos") }
  }, [mode, split, hasAi])

  // Paste a screenshot or copied photo straight in
  useEffect(() => {
    if (mode === 'piece') return
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])]
      if (files.length) { e.preventDefault(); void enqueue(files) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [enqueue, mode])

  const drop = useDropzone({ accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.gif'] }, onDrop: (f) => void enqueue(f), noClick: true, disabled: mode === 'piece' })

  return (
    <Page title="Scan" sub="Drop photos of sets or minifigures. BrickForge finds them in the catalog."
      actions={finished > 0 && mode !== 'piece' ? <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={async () => { await api.scan.clear() }}>Clear finished</Button> : undefined}>
      <Rise className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented label="What you're scanning" value={mode} onChange={setMode}
          options={[{ value: 'minifig', label: 'Minifigures' }, { value: 'set', label: 'Sets' }, { value: 'piece', label: 'Pieces' }]} />
        {mode === 'minifig' && (
          <Tip label={hasAi ? 'Several minifigures in one photo get identified one by one' : `Needs an AI provider (Settings)`}>
            <label className={cn('flex items-center gap-2 text-[13px]', hasAi ? 'text-fg-2' : 'text-fg-4')}>
              <Switch label="Split group photos" checked={split && hasAi} onCheckedChange={setSplit} disabled={!hasAi} />Split group photos
            </label>
          </Tip>
        )}
      </Rise>

      {mode === 'piece' ? <Pieces /> : (
        <>
          <Rise>
            <div {...drop.getRootProps()}
              className={cn('relative overflow-hidden rounded-[24px] border-2 border-dashed px-8 py-8 transition-colors duration-200',
                drop.isDragActive ? 'border-accent bg-accent-soft' : 'border-line-strong bg-panel/60 hover:border-fg-4')}>
              <input {...drop.getInputProps()} />
              <div className="flex flex-wrap items-center justify-center gap-10">
                <SceneScan className="w-[220px]" />
                <div className="max-w-[420px]">
                  <h2 className="font-display text-[24px] font-extrabold tracking-[-0.03em]">{drop.isDragActive ? 'Let go to scan' : `Drop ${mode === 'set' ? 'set' : 'minifigure'} photos here`}</h2>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-fg-3">
                    As many as you like. They're identified one by one in the background, even if you close BrickForge. Or paste a photo with <Kbd>{shortcut('V')}</Kbd>.
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <Button variant="primary" icon={<ImagePlus className="size-4" />} onClick={drop.open}>Choose photos</Button>
                  </div>
                  <p className="mt-4 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-fg-4">
                    <Info className="mt-px size-3.5 shrink-0" />
                    Photos are sent to Brickognize, a free LEGO recognizer{hasAi ? `, and uncertain ones to ${providerLabel} for a second look` : ''}.
                  </p>
                </div>
              </div>
            </div>
          </Rise>
          {visible.length === 0 && (
            <Rise className="mt-6 grid grid-cols-3 gap-4">
              {[
                ['1', 'Drop photos', 'One minifigure or set per photo works best. With an AI set up, a group photo can be split into one scan per figure.'],
                ['2', 'BrickForge finds them', `Brickognize matches each photo against the catalog.${hasAi ? ` When it isn't sure, ${providerLabel} compares your photo with the official images.` : ' Add an AI in Settings for a second opinion on hard ones.'}`],
                ['3', 'Pick and add', 'The best match comes first, with alternatives beside it. One click adds it to your collection or wishlist.'],
              ].map(([n, title, body]) => (
                <div key={n} className="panel p-5">
                  <span className="grid size-8 place-items-center rounded-[10px] bg-panel-3 font-display text-[15px] font-extrabold text-accent-text">{n}</span>
                  <h3 className="mt-3 font-display text-[15px] font-bold">{title}</h3>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-fg-3">{body}</p>
                </div>
              ))}
            </Rise>
          )}
          <ul className="mt-6 flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {visible.map((j) => <ScanCard key={j.id} job={j} />)}
            </AnimatePresence>
          </ul>
        </>
      )}
    </Page>
  )
}

/** One piece at a time: center it on a plain background for the best match. */
function Pieces() {
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<PieceIdentifyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (file: File) => {
    setBusy(true); setResult(null)
    setPreview(URL.createObjectURL(file))
    try { setResult(await api.scan.piece(await fileToBase64(file))) } catch (err) { toast.error(err, "Couldn't identify that piece") } finally { setBusy(false) }
  }
  const drop = useDropzone({ accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }, multiple: false, onDrop: (f) => f[0] && void run(f[0]) })
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => { const f = e.clipboardData?.files?.[0]; if (f) { e.preventDefault(); void run(f) } }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  return (
    <div className="grid grid-cols-[360px_1fr] gap-6">
      <div {...drop.getRootProps()} className={cn('relative grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-[24px] border-2 border-dashed transition-colors',
        drop.isDragActive ? 'border-accent bg-accent-soft' : 'border-line-strong bg-panel/60 hover:border-fg-4')}>
        <input {...drop.getInputProps()} />
        {preview ? <img src={preview} alt="Your piece" className="size-full object-cover" /> : (
          <div className="px-8 text-center">
            <SceneScan className="mx-auto w-[180px]" />
            <h3 className="mt-2 font-display text-[18px] font-bold">Drop one piece</h3>
            <p className="mt-1 text-[12.5px] text-fg-3">Centered on a plain background works best.</p>
          </div>
        )}
        {busy && <div className="absolute inset-0 grid place-items-center bg-black/30"><Spinner className="size-8" /></div>}
      </div>
      <div>
        {!result && !busy && <p className="pt-2 text-[13px] text-fg-4">Results appear here, with part numbers you can look up on BrickLink.</p>}
        {result && (
          <>
            {result.error && <p className="mb-3 text-[12.5px] text-fg-3">{result.error}</p>}
            <div className="flex flex-wrap gap-3">
              {result.pieces.map((p, i) => (
                <motion.div key={`${p.part_number}-${i}`} custom={i} variants={dealCard} initial="initial" animate="enter" className="flex w-[210px] flex-col rounded-[16px] border border-line bg-panel p-2">
                  <div className="relative">
                    <ItemImage src={p.img_url} alt={p.name} className="aspect-square w-full rounded-[11px]" pad="p-4" />
                    <div className="absolute right-1.5 top-1.5 rounded-full bg-panel/90"><Confidence value={p.confidence} size={34} /></div>
                  </div>
                  <span className="mt-2 px-1 font-mono text-[12px] text-accent-text">{p.part_number ?? 'No part number'}</span>
                  <span className="px-1 text-[12.5px] font-semibold leading-snug">{p.name}</span>
                  {p.color && <span className="px-1 text-[11.5px] text-fg-3">{p.color}</span>}
                  {p.bricklink_url && (
                    <Button size="sm" variant="ghost" className="mt-2" icon={<ExternalLink className="size-3.5" />} onClick={() => api.app.openExternal(p.bricklink_url!)}>BrickLink</Button>
                  )}
                </motion.div>
              ))}
            </div>
            <p className="mt-4 text-[11.5px] text-fg-4">Matched by {result.model_used === 'brickognize' ? 'Brickognize' : result.model_used}.</p>
          </>
        )}
      </div>
    </div>
  )
}

