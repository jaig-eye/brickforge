import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Heart, Plus, RotateCcw, Search, X, ShieldCheck, Scissors } from 'lucide-react'
import { api } from '@/lib/api'
import { useOwnership } from '@/lib/queries'
import { useUi } from '@/lib/ui-store'
import { useAddItem } from '@/hooks/useAddItem'
import { dealCard } from '@/lib/motion'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/formatters'
import type { ScanJob, FigIdentifyResult, SetIdentifyResult } from '@/lib/types'
import { Button, IconButton } from '../ui/Button'
import { Chip, Confidence, ItemImage } from '../ui/Bits'

/** The photo, with a light sweep and stud grid while it's being identified. */
function Photo({ job }: { job: ScanJob }) {
  const { data: src } = useQuery({ queryKey: ['scan-image', job.id], queryFn: () => api.scan.image(job.id), staleTime: Infinity })
  const working = job.status === 'queued' || job.status === 'running'
  return (
    <div className="relative aspect-square w-[168px] shrink-0 overflow-hidden rounded-[16px] bg-panel-3">
      {src && <img src={src} alt="Your photo" className={cn('size-full object-cover transition-[filter] duration-500', working && 'brightness-[0.8] saturate-[0.7]')} />}
      {working && (
        <>
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgb(255 255 255 / .35) 0 1.6px, transparent 2.2px)', backgroundSize: '14px 14px', opacity: job.status === 'running' ? 0.55 : 0.25 }} />
          {job.status === 'running' && (
            <motion.div className="absolute inset-x-0 h-[38%]"
              style={{ background: 'linear-gradient(to bottom, transparent, color-mix(in srgb, var(--accent) 45%, transparent) 55%, transparent)' }}
              initial={{ top: '-40%' }} animate={{ top: ['-40%', '100%'] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />
          )}
        </>
      )}
      {job.is_crop === 1 && <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] text-white"><Scissors className="size-3" />From a group photo</span>}
    </div>
  )
}

interface Candidate { number: string; name: string; image: string | null; confidence: number; sub?: string; bricklinkId?: string | null; best?: boolean }

function CandidateCard({ c, i, kind, job, onPicked }: { c: Candidate; i: number; kind: 'set' | 'minifig'; job: ScanJob; onPicked: () => void }) {
  const { data: owned } = useOwnership()
  const { addSet, addFig } = useAddItem()
  const plate = useRef<HTMLDivElement>(null)
  const has = owned?.owned.includes(c.number) || (!!c.bricklinkId && owned?.owned.includes(c.bricklinkId))
  const add = async (wanted: boolean, el: Element | null) => {
    const opts = { as: wanted ? 'wanted' as const : 'owned' as const, condition: kind === 'set' ? 'sealed' : 'used' }
    const r = kind === 'set'
      ? await addSet(c.number, opts, { el, image: c.image })
      : await addFig({ set_num: c.number, name: c.name, set_img_url: c.image, bricklink_id: c.bricklinkId ?? null }, opts, { el })
    if (r) { await api.scan.accept(job.id, c.number, false); onPicked() }
  }
  return (
    <motion.div custom={i} variants={dealCard} initial="initial" animate="enter"
      className={cn('flex w-[200px] shrink-0 flex-col rounded-[16px] border bg-panel p-2', c.best ? 'border-[color-mix(in_srgb,var(--accent)_55%,var(--line))] shadow-[0_14px_34px_-20px_var(--accent-glow)]' : 'border-line')}>
      <div ref={plate} className="relative">
        <ItemImage src={c.image} alt={c.name} className="aspect-[4/3] w-full rounded-[11px]" pad="p-2" />
        <div className="absolute right-1.5 top-1.5 rounded-full bg-panel/90 backdrop-blur"><Confidence value={c.confidence} size={34} /></div>
        {c.best && <span className="absolute left-1.5 top-1.5 rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-bold text-accent-ink">Best match</span>}
        {has && <Chip tone="up" icon={<Check />} className="absolute bottom-1.5 left-1.5 border-transparent bg-[#0e8f55] text-white">Owned</Chip>}
      </div>
      <div className="flex flex-1 flex-col px-1 pt-2">
        <span className="font-mono text-[11px] text-accent-text">{c.bricklinkId && c.bricklinkId !== c.number ? `${c.number} · ${c.bricklinkId}` : c.number}</span>
        <span className="mt-0.5 line-clamp-2 text-[12.5px] font-semibold leading-snug">{c.name}</span>
        {c.sub && <span className="mt-0.5 text-[11.5px] text-fg-3">{c.sub}</span>}
        <div className="mt-auto flex items-center gap-1 pt-2">
          <Button size="sm" variant={c.best && !has ? 'primary' : 'secondary'} className="flex-1" icon={<Plus className="size-3.5" />}
            onClick={() => void add(false, plate.current)}>{has ? 'Add another' : 'Add'}</Button>
          <IconButton label="Add to wishlist" size="sm" onClick={(e) => void add(true, e.currentTarget)}><Heart className="size-3.5" /></IconButton>
        </div>
      </div>
    </motion.div>
  )
}

export function ScanCard({ job }: { job: ScanJob }) {
  const openAdd = useUi((s) => s.openAdd)
  const dismiss = () => void api.scan.dismiss([job.id])
  const r = job.result
  let candidates: Candidate[] = []
  let headline = ''
  let note: string | null = null
  let verified = false
  if (job.status === 'done' && r) {
    if (job.scan_type === 'minifig') {
      const fr = r as FigIdentifyResult
      candidates = fr.matches.map((m, i) => ({ number: m.fig_number, name: m.name, image: m.image_url, confidence: m.confidence, bricklinkId: m.bricklink_id, best: i === 0 && m.confidence >= 0.5 }))
      headline = fr.matches.length ? (fr.matches[0].confidence >= 0.8 ? 'Found it' : 'Probably one of these') : 'No match'
      note = fr.error ?? (fr.model_used === 'brickognize' ? 'Matched by Brickognize' : fr.description ? `Judged by AI · looks like ${fr.description}` : null)
    } else {
      const sr = r as SetIdentifyResult
      verified = sr.verified
      const top = sr.rb ? [{ number: sr.rb.set_num, name: sr.rb.name, image: sr.rb.set_img_url, confidence: sr.confidence, sub: `${sr.rb.year} · ${formatNumber(sr.rb.num_parts)} pcs`, best: true }] : []
      const rest = sr.candidates.filter((c) => !top.length || c.set_num.replace(/-\d+$/, '') !== top[0].number.replace(/-\d+$/, ''))
        .map((c) => ({ number: c.set_num, name: c.name, image: c.set_img_url, confidence: c.source === 'visual' ? Math.min(c.score, 0.45) : 0.2, sub: [c.year, c.num_parts ? `${formatNumber(c.num_parts)} pcs` : null].filter(Boolean).join(' · ') }))
      candidates = [...top, ...rest].slice(0, 6)
      headline = sr.rb ? (sr.confidence >= 0.8 ? 'Found it' : 'Best guess') : candidates.length ? 'Pick the right set' : 'No match'
      note = sr.error ?? sr.notes
    }
  }

  return (
    <motion.li layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30, transition: { duration: 0.2 } }}
      className={cn('panel flex gap-5 p-4', job.status === 'added' && 'opacity-60')}>
      <Photo job={job} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">{job.scan_type === 'set' ? 'Set' : 'Minifigure'} · {new Date(job.created_at.replace(' ', 'T') + 'Z').toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
            <h3 className="mt-1 flex items-center gap-2 font-display text-[18px] font-bold">
              {job.status === 'queued' ? 'Waiting in line' : job.status === 'running' ? (job.split_pending ? 'Finding each minifigure…' : 'Looking…') : job.status === 'error' ? "Couldn't identify this" : job.status === 'added' ? 'Added to your vault' : headline}
              {verified && <span title="An AI compared your photo with the catalog images"><ShieldCheck className="size-4 text-up" /></span>}
            </h3>
            {job.status === 'error' && <p className="mt-1 max-w-[640px] text-[12.5px] text-down">{job.error}</p>}
            {job.status === 'done' && note && <p className="mt-1 line-clamp-2 max-w-[720px] text-[12.5px] text-fg-3">{note}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {job.status === 'error' && <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => void api.scan.retry(job.id)}>Retry</Button>}
            {job.status === 'done' && (
              <Button size="sm" variant="ghost" icon={<Search className="size-3.5" />} onClick={() => openAdd({ kind: job.scan_type === 'set' ? 'set' : 'minifig' })}>Search instead</Button>
            )}
            <IconButton label="Dismiss" size="sm" onClick={dismiss}><X className="size-4" /></IconButton>
          </div>
        </div>
        <AnimatePresence>
          {job.status === 'done' && candidates.length > 0 && (
            <div className="-mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-1">
              {candidates.map((c, i) => <CandidateCard key={c.number} c={c} i={i} kind={job.scan_type} job={job} onPicked={() => undefined} />)}
            </div>
          )}
        </AnimatePresence>
        {(job.status === 'queued' || job.status === 'running') && (
          <div className="mt-4 flex gap-3">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[200px] w-[200px] !rounded-[16px]" style={{ animationDelay: `${i * 0.15}s` }} />)}
          </div>
        )}
      </div>
    </motion.li>
  )
}
