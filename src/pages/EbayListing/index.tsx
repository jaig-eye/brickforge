import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, CheckCircle, XCircle, Search, Wand2,
  Copy, Check, RefreshCw, Tag, AlertCircle, ChevronDown, X,
  History, Trash2, ChevronRight,
} from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Dialog } from '@/components/ui/Dialog'
import { IPC } from '@/lib/ipc-types'
import { cn } from '@/lib/cn'
import toast from 'react-hot-toast'

// ── Types ────────────────────────────────────────────────────────────────────

type Completeness = 'complete' | 'partial' | 'incomplete'

interface IdentifyResult {
  set_number: string
  set_name: string
  confidence: number
  notes: string
  error?: string
}

interface RebrickableSet {
  set_num: string
  name: string
  year: number
  num_parts: number
  set_img_url: string
}

interface ListingPrefs {
  smokeFreehome: boolean
  cleanSet: boolean
  includesInstructions: boolean
  includesFigures: boolean
  completeness: Completeness
}

interface GeneratedListing {
  title: string
  description: string
  subtitle?: string
  error?: string
}

interface HistoryEntry {
  id: number
  set_number: string
  set_name: string
  year: number | null
  title: string
  description: string
  provider: string | null
  created_at: string
}

type Step = 'upload' | 'confirm' | 'configure' | 'result'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<{ b64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const [header, b64] = result.split(',')
      const mediaType = header.split(':')[1].split(';')[0]
      resolve({ b64, mediaType })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const LEGO_THEMES = [
  'Architecture', 'Art', 'Botanical Collection', 'City', 'Classic',
  'Creator 3-in-1', 'DC', 'Disney', 'Dreamzzz', 'DREAMZzz',
  'Fortnite', 'Friends', 'Harry Potter', 'Icons', 'Ideas',
  'Indiana Jones', 'Jurassic World', 'Marvel', 'Minecraft', 'Minions',
  'Ninjago', 'Racers', 'Speed Champions', 'Star Wars', 'Technic',
  'The Lord of the Rings', 'Toy Story', 'Trains', 'Vidiyo',
  'Vintage / Classic Space', 'Warhammer 40,000',
]

const COMPLETENESS_OPTIONS: { label: string; sublabel: string; value: Completeness }[] = [
  { label: 'Complete',       sublabel: '100% — all pieces verified',          value: 'complete'   },
  { label: '99% Complete',   sublabel: 'Missing only a few minor pieces',      value: 'partial'    },
  { label: 'Incomplete',     sublabel: 'Missing pieces — listed as-is',        value: 'incomplete' },
]

// ── Theme combobox ────────────────────────────────────────────────────────────

function ThemeCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = query.trim()
    ? LEGO_THEMES.filter((t) => t.toLowerCase().includes(query.toLowerCase()))
    : LEGO_THEMES

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => { if (!value) setQuery('') }, [value])

  const select = (theme: string) => { onChange(theme); setQuery(theme); setOpen(false) }
  const clear  = () => { onChange(''); setQuery(''); setOpen(false) }

  return (
    <div ref={ref} className="relative">
      <div className={cn(
        'flex items-center gap-1 rounded-lg border bg-[var(--color-surface-overlay)] px-2.5 py-1.5 transition-colors',
        open ? 'border-[var(--color-accent)]' : 'border-[var(--color-surface-border)]',
      )}>
        <Search className="h-3.5 w-3.5 shrink-0 text-[var(--color-surface-muted)]" />
        <input
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-surface-muted)] min-w-0"
          placeholder="Search theme…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
        {value
          ? <button onClick={clear} className="shrink-0 text-[var(--color-surface-muted)] hover:text-current"><X className="h-3.5 w-3.5" /></button>
          : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-surface-muted)]" />
        }
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-raised)] shadow-xl">
          {filtered.map((t) => (
            <li
              key={t}
              onMouseDown={() => select(t)}
              className={cn(
                'cursor-pointer px-3 py-1.5 text-sm transition-colors hover:bg-[var(--color-surface-overlay)]',
                value === t && 'bg-[var(--color-accent)]/20 font-semibold',
              )}
            >
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ToggleRow({
  label, sublabel, checked, onChange,
}: { label: string; sublabel?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors',
        checked
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
          : 'border-[var(--color-surface-border)] hover:border-[var(--color-surface-muted)]',
      )}
      onClick={() => onChange(!checked)}
    >
      <div>
        <p className="text-sm font-medium">{label}</p>
        {sublabel && <p className="text-xs text-[var(--color-surface-muted)]">{sublabel}</p>}
      </div>
      <div className={cn(
        'w-10 h-6 rounded-full relative transition-colors',
        checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-surface-border)]',
      )}>
        <div className={cn(
          'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all',
          checked ? 'left-5' : 'left-1',
        )} />
      </div>
    </div>
  )
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Copied!')
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Button variant="secondary" size="sm" onClick={copy}>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied!' : label}
    </Button>
  )
}

// ── History panel ─────────────────────────────────────────────────────────────

function HistoryPanel() {
  const [open, setOpen]       = useState(false)
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [selected, setSelected] = useState<HistoryEntry | null>(null)

  const load = useCallback(() => {
    window.ipc.invoke(IPC.LISTING_HISTORY_LIST).then((r) => setEntries(r as HistoryEntry[]))
  }, [])

  useEffect(() => { load() }, [load])

  const remove = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    await window.ipc.invoke(IPC.LISTING_HISTORY_DELETE, id)
    setEntries((prev) => prev.filter((h) => h.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  if (entries.length === 0) return null

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm font-semibold text-[var(--color-surface-muted)] hover:text-current transition-colors w-full"
      >
        <History className="h-4 w-4" />
        Past Generations ({entries.length})
        <ChevronRight className={cn('h-3.5 w-3.5 ml-auto transition-transform', open && 'rotate-90')} />
      </button>

      {open && (
        <div className="mt-3 space-y-1.5">
          {entries.map((h) => (
            <div
              key={h.id}
              onClick={() => setSelected(h)}
              className="flex items-start gap-3 p-3 rounded-lg border border-[var(--color-surface-border)] hover:border-[var(--color-accent)]/50 cursor-pointer transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-[var(--color-accent)] mb-0.5">#{h.set_number} · {h.set_name}</p>
                <p className="text-sm font-medium truncate">{h.title}</p>
                <p className="text-xs text-[var(--color-surface-muted)] mt-0.5">
                  {new Date(h.created_at).toLocaleDateString()} · {h.provider ?? 'ai'}
                </p>
              </div>
              <button
                onClick={(e) => remove(h.id, e)}
                className="shrink-0 mt-0.5 text-[var(--color-surface-muted)] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selected} onClose={() => setSelected(null)} title={selected ? `#${selected.set_number} ${selected.set_name}` : ''} wide>
        {selected && (
          <div className="space-y-4">
            {/* Title */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-surface-muted)]">eBay Title</p>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-xs font-mono',
                    selected.title.length > 80 ? 'text-red-400' : selected.title.length >= 70 ? 'text-green-400' : 'text-amber-400',
                  )}>{selected.title.length}/80</span>
                  <CopyButton text={selected.title} />
                </div>
              </div>
              <p className="font-semibold text-base leading-snug p-3 rounded-lg bg-[var(--color-surface-overlay)]">{selected.title}</p>
            </div>
            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-surface-muted)]">Description</p>
                <div className="flex gap-1">
                  <CopyButton text={selected.description} label="Copy HTML" />
                  <CopyButton text={selected.description.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()} label="Copy text" />
                </div>
              </div>
              <div
                className="prose prose-sm prose-invert max-w-none text-sm [&_h2]:text-[var(--color-accent)] [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1 [&_table]:w-full [&_table]:text-xs [&_td]:py-1 [&_td]:px-2 [&_tr]:border-b [&_tr]:border-[var(--color-surface-border)] max-h-72 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: selected.description }}
              />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EbayListing() {
  const [aiProvider, setAiProvider] = useState<'openai' | 'anthropic'>('openai')
  useEffect(() => {
    window.ipc.invoke(IPC.SETTINGS_GET).then((s: unknown) => {
      const settings = s as { aiProvider?: string }
      if (settings?.aiProvider === 'anthropic') setAiProvider('anthropic')
    })
  }, [])
  const aiLabel = aiProvider === 'anthropic' ? 'Claude AI' : 'OpenAI'

  const [step, setStep] = useState<Step>('upload')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [identifying, setIdentifying] = useState(false)
  const [identified, setIdentified] = useState<IdentifyResult | null>(null)
  const [confirmedSet, setConfirmedSet] = useState<RebrickableSet | null>(null)
  const [minifigCount, setMinifigCount] = useState<number>(0)
  const [manualEntry, setManualEntry] = useState(false)
  const [manualSetNum, setManualSetNum] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [listing, setListing] = useState<GeneratedListing | null>(null)
  const [themeHint, setThemeHint] = useState<string>('')
  const [contextHint, setContextHint] = useState<string>('')
  const [rawAiResponse, setRawAiResponse] = useState<string>('')
  const [prefs, setPrefs] = useState<ListingPrefs>({
    smokeFreehome: false,
    cleanSet: false,
    includesInstructions: true,
    includesFigures: true,
    completeness: 'complete',
  })

  // ── Upload ────────────────────────────────────────────────────────────────

  const onDrop = useCallback((files: File[]) => {
    const file = files[0]
    if (!file) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string ?? '')
    reader.readAsDataURL(file)
    setIdentified(null)
    setConfirmedSet(null)
    setMinifigCount(0)
    setManualEntry(false)
    setManualSetNum('')
    setRawAiResponse('')
    setListing(null)
    setThemeHint('')
    setContextHint('')
  }, [])

  const analyzeImage = useCallback(async () => {
    if (!imageFile) return
    setIdentifying(true)
    setStep('confirm')
    try {
      const { b64, mediaType } = await fileToBase64(imageFile)
      const result = await window.ipc.invoke(IPC.LISTING_IDENTIFY_SET, b64, mediaType, themeHint, contextHint) as IdentifyResult
      setRawAiResponse(JSON.stringify(result, null, 2))
      if (result.error) {
        toast.error(result.error)
        setManualEntry(true)
        setIdentified(null)
        return
      }
      setIdentified(result)
      if (result.set_number) {
        const [set, figs] = await Promise.all([
          window.ipc.invoke(IPC.SETS_LOOKUP_REBRICK, result.set_number) as Promise<RebrickableSet | null>,
          window.ipc.invoke(IPC.SETS_MINIFIG_COUNT_REBRICK, result.set_number) as Promise<number>,
        ])
        if (set) { setConfirmedSet(set); setMinifigCount(figs ?? 0) }
        else setManualEntry(true)
      } else {
        setManualEntry(true)
      }
    } catch (err) {
      toast.error(String(err))
      setManualEntry(true)
    } finally {
      setIdentifying(false)
    }
  }, [imageFile, themeHint, contextHint])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 1,
    disabled: step !== 'upload',
  })

  // ── Manual lookup ─────────────────────────────────────────────────────────

  const lookupManual = async () => {
    if (!manualSetNum.trim()) return
    setLookingUp(true)
    try {
      const num = manualSetNum.trim()
      const [set, figs] = await Promise.all([
        window.ipc.invoke(IPC.SETS_LOOKUP_REBRICK, num) as Promise<RebrickableSet | null>,
        window.ipc.invoke(IPC.SETS_MINIFIG_COUNT_REBRICK, num) as Promise<number>,
      ])
      if (!set) { toast.error(`Set "${manualSetNum}" not found on Rebrickable`); return }
      setConfirmedSet(set)
      setMinifigCount(figs ?? 0)
      setManualEntry(false)
    } catch {
      toast.error('Lookup failed')
    } finally {
      setLookingUp(false)
    }
  }

  const confirmSet = () => setStep('configure')

  // ── Generate ──────────────────────────────────────────────────────────────

  const generate = async () => {
    if (!confirmedSet) return
    setGenerating(true)
    setStep('result')
    try {
      const setData = {
        set_number: confirmedSet.set_num,
        name: confirmedSet.name,
        year: confirmedSet.year,
        piece_count: confirmedSet.num_parts,
        num_minifigures: minifigCount,
      }
      const prefsPayload = {
        smoke_free_home: prefs.smokeFreehome,
        clean_set: prefs.cleanSet,
        includes_instructions: prefs.includesInstructions,
        includes_figures: prefs.includesFigures,
        completeness: prefs.completeness,
      }
      const result = await window.ipc.invoke(IPC.LISTING_GENERATE, setData, prefsPayload) as GeneratedListing
      if (result.error) { toast.error(result.error); setStep('configure'); return }
      setListing(result)
    } catch (err) {
      toast.error('Generation failed — check your API key in Settings')
      setStep('configure')
    } finally {
      setGenerating(false)
    }
  }

  const reset = () => {
    setStep('upload')
    setImageFile(null)
    setImagePreview('')
    setIdentified(null)
    setConfirmedSet(null)
    setManualEntry(false)
    setManualSetNum('')
    setListing(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PageShell
      title="eBay Listing Generator"
      subtitle={`Upload a photo — ${aiLabel} identifies your set and writes the listing`}
    >
      <div className="p-6 max-w-2xl mx-auto space-y-5">

        {/* Progress steps */}
        <div className="flex items-center gap-2 text-xs font-medium">
          {(['upload', 'confirm', 'configure', 'result'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className={cn('h-px w-6 transition-colors', ['confirm','configure','result'].slice(0,i).every(x => step !== x || step === s) ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-surface-border)]')} />}
              <span className={cn(
                'px-2.5 py-0.5 rounded-full transition-colors capitalize',
                step === s
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]'
                  : 'text-[var(--color-surface-muted)]',
              )}>
                {s}
              </span>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ── Step 1: Upload ── */}
          {step === 'upload' && (
            <motion.div key="upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <div
                {...getRootProps()}
                className={cn(
                  'border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors',
                  imageFile
                    ? 'border-[var(--color-accent)]/60 bg-[var(--color-accent)]/5'
                    : isDragActive
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5'
                      : 'border-[var(--color-surface-border)] hover:border-[var(--color-accent)]/60',
                )}
              >
                <input {...getInputProps()} />
                <Upload className="h-8 w-8 mx-auto mb-3 text-[var(--color-surface-muted)]" />
                <p className="text-base font-semibold font-display">
                  {imageFile ? 'Photo selected — click to replace' : isDragActive ? 'Drop it here…' : 'Drop a photo of your LEGO set'}
                </p>
                {!imageFile && <p className="text-sm text-[var(--color-surface-muted)] mt-1">or click to browse — JPG, PNG, WebP</p>}
              </div>

              {imageFile && imagePreview && (
                <Card>
                  <CardContent className="py-4 space-y-4">
                    <div className="flex gap-4 items-start">
                      <img
                        src={imagePreview}
                        alt="preview"
                        className="w-40 h-40 object-contain rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-overlay)] shrink-0"
                      />
                      <div className="flex-1 space-y-2">
                        <p className="text-sm font-semibold font-display">{imageFile.name}</p>
                        <p className="text-xs text-[var(--color-surface-muted)]">
                          {(imageFile.size / 1024).toFixed(0)} KB · {imageFile.type}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-semibold mb-1 text-[var(--color-surface-muted)] uppercase tracking-wide">Theme</label>
                            <ThemeCombobox value={themeHint} onChange={setThemeHint} />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold mb-1 text-[var(--color-surface-muted)] uppercase tracking-wide">Extra context</label>
                            <input
                              className="w-full rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-overlay)] px-2.5 py-1.5 text-sm outline-none placeholder:text-[var(--color-surface-muted)] focus:border-[var(--color-accent)] transition-colors"
                              placeholder="e.g. sith ship, castle, fire truck…"
                              value={contextHint}
                              onChange={(e) => setContextHint(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && analyzeImage()}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <Button onClick={analyzeImage} className="w-full">
                      <Tag className="h-4 w-4" />Identify Set with {aiLabel}
                    </Button>
                  </CardContent>
                </Card>
              )}

              <HistoryPanel />
            </motion.div>
          )}

          {/* ── Step 2: Confirm ── */}
          {step === 'confirm' && (
            <motion.div key="confirm" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <Card>
                <CardHeader stud><h2 className="text-sm font-bold font-display text-black">Set Identification</h2></CardHeader>
                <CardContent className="py-5">
                  {identifying ? (
                    <div className="flex flex-col items-center gap-3 py-8">
                      <Spinner size="lg" />
                      <p className="text-sm text-[var(--color-surface-muted)]">{aiLabel} is analysing your photo…</p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {rawAiResponse && (
                        <div className="rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-overlay)] overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-surface-border)]">
                            <span className="text-xs font-semibold font-mono text-[var(--color-surface-muted)] uppercase tracking-wide">{aiLabel} raw response</span>
                            <CopyButton text={rawAiResponse} label="Copy" />
                          </div>
                          <pre className="text-xs font-mono p-3 overflow-auto max-h-36 text-green-400">{rawAiResponse}</pre>
                        </div>
                      )}
                      {confirmedSet && !manualEntry && (
                        <div className="flex gap-4 items-start">
                          <img
                            src={confirmedSet.set_img_url}
                            alt={confirmedSet.name}
                            className="w-32 h-32 object-contain rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-overlay)] shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                          <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="info">#{confirmedSet.set_num}</Badge>
                              {identified && (
                                <Badge variant={identified.confidence >= 0.7 ? 'success' : 'warning'}>
                                  {Math.round(identified.confidence * 100)}% confident
                                </Badge>
                              )}
                            </div>
                            <p className="font-semibold font-display text-base">{confirmedSet.name}</p>
                            <div className="flex gap-3 text-xs text-[var(--color-surface-muted)]">
                              <span>{confirmedSet.year}</span>
                              <span>·</span>
                              <span>{confirmedSet.num_parts} pieces</span>
                            </div>
                            {identified?.notes && (
                              <p className="text-xs text-[var(--color-surface-muted)] italic">{identified.notes}</p>
                            )}
                          </div>
                          {imagePreview && (
                            <img src={imagePreview} alt="your photo" className="w-20 h-20 object-cover rounded-lg border border-[var(--color-surface-border)] shrink-0" />
                          )}
                        </div>
                      )}

                      {(!confirmedSet || manualEntry) && !identifying && (
                        <div className="space-y-3">
                          {identified && !confirmedSet && (
                            <div className="flex items-start gap-2 text-sm text-amber-400 bg-amber-400/10 rounded-lg p-3">
                              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                              <span>
                                AI identified <strong>{identified.set_name || 'a set'}</strong>
                                {identified.set_number ? ` (#${identified.set_number})` : ''} but couldn't find it on Rebrickable. Enter the set number below.
                              </span>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Input
                              placeholder="Set number, e.g. 75192"
                              value={manualSetNum}
                              onChange={(e) => setManualSetNum(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && lookupManual()}
                              className="flex-1"
                            />
                            <Button onClick={lookupManual} disabled={lookingUp || !manualSetNum.trim()}>
                              {lookingUp ? <Spinner size="sm" /> : <Search className="h-4 w-4" />}
                              Look up
                            </Button>
                          </div>
                        </div>
                      )}

                      {confirmedSet && !manualEntry && (
                        <div className="flex gap-2 pt-1">
                          <Button onClick={confirmSet} className="flex-1">
                            <CheckCircle className="h-4 w-4" />
                            Yes, that's my set — continue
                          </Button>
                          <Button variant="secondary" onClick={() => { setManualEntry(true); setConfirmedSet(null) }}>
                            <XCircle className="h-4 w-4" />
                            Wrong set
                          </Button>
                        </div>
                      )}
                      {confirmedSet && manualEntry && (
                        <Button onClick={confirmSet} className="w-full">
                          <CheckCircle className="h-4 w-4" />
                          Confirm and continue
                        </Button>
                      )}

                      <Button variant="ghost" size="sm" onClick={reset} className="w-full text-[var(--color-surface-muted)]">
                        Start over
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ── Step 3: Configure ── */}
          {step === 'configure' && confirmedSet && (
            <motion.div key="configure" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

              <div className="flex items-center gap-3 p-3 rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface-raised)]">
                <img src={confirmedSet.set_img_url} alt="" className="w-12 h-12 object-contain rounded" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{confirmedSet.name}</p>
                  <p className="text-xs text-[var(--color-surface-muted)]">#{confirmedSet.set_num} · {confirmedSet.year} · {confirmedSet.num_parts} pcs</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStep('confirm')}>Change</Button>
              </div>

              <Card>
                <CardHeader stud><h2 className="text-sm font-bold font-display text-black">Listing Attributes</h2></CardHeader>
                <CardContent className="py-5 space-y-2.5">
                  <p className="text-xs text-[var(--color-surface-muted)] mb-3">
                    Toggle the options that apply — these will be included in the eBay title and description.
                  </p>
                  <ToggleRow
                    label="Smoke-Free Home"
                    sublabel="Will be mentioned in the listing"
                    checked={prefs.smokeFreehome}
                    onChange={(v) => setPrefs((p) => ({ ...p, smokeFreehome: v }))}
                  />
                  <ToggleRow
                    label="Clean Set"
                    sublabel="Well maintained, no dirt or sticker residue"
                    checked={prefs.cleanSet}
                    onChange={(v) => setPrefs((p) => ({ ...p, cleanSet: v }))}
                  />
                  <ToggleRow
                    label="Includes Instruction Manual"
                    checked={prefs.includesInstructions}
                    onChange={(v) => setPrefs((p) => ({ ...p, includesInstructions: v }))}
                  />
                  <ToggleRow
                    label="Includes All Minifigures"
                    checked={prefs.includesFigures}
                    onChange={(v) => setPrefs((p) => ({ ...p, includesFigures: v }))}
                  />

                  {/* Completeness — tri-state */}
                  <div className="pt-1">
                    <p className="text-sm font-medium mb-2">Completeness</p>
                    <div className="grid grid-cols-3 gap-2">
                      {COMPLETENESS_OPTIONS.map(({ label, sublabel, value }) => (
                        <button
                          key={value}
                          onClick={() => setPrefs((p) => ({ ...p, completeness: value }))}
                          className={cn(
                            'p-3 rounded-lg border text-sm font-medium transition-colors text-left',
                            prefs.completeness === value
                              ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                              : 'border-[var(--color-surface-border)] hover:border-[var(--color-surface-muted)]',
                          )}
                        >
                          <span className="block">{label}</span>
                          <span className="block text-xs font-normal text-[var(--color-surface-muted)] mt-0.5">{sublabel}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Button onClick={generate} className="w-full" size="lg">
                <Wand2 className="h-4 w-4" />
                Generate eBay Listing with {aiLabel}
              </Button>
              <Button variant="ghost" size="sm" onClick={reset} className="w-full text-[var(--color-surface-muted)]">
                Start over
              </Button>
            </motion.div>
          )}

          {/* ── Step 4: Result ── */}
          {step === 'result' && (
            <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {generating ? (
                <Card>
                  <CardContent className="py-16 flex flex-col items-center gap-4">
                    <Spinner size="lg" />
                    <p className="text-sm text-[var(--color-surface-muted)]">{aiLabel} is writing your listing…</p>
                  </CardContent>
                </Card>
              ) : listing && (
                <>
                  {/* Title */}
                  <Card>
                    <CardHeader stud><h2 className="text-sm font-bold font-display text-black flex items-center gap-2">
                      <Tag className="h-3.5 w-3.5" />eBay Title
                    </h2></CardHeader>
                    <CardContent className="py-4 space-y-3">
                      <p className="font-semibold text-base leading-snug">{listing.title}</p>
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          'text-xs font-mono',
                          listing.title.length > 80 ? 'text-red-400'
                          : listing.title.length >= 70 ? 'text-green-400'
                          : listing.title.length >= 55 ? 'text-amber-400'
                          : 'text-[var(--color-surface-muted)]',
                        )}>
                          {listing.title.length}/80 characters
                        </span>
                        <CopyButton text={listing.title} />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Description */}
                  <Card>
                    <CardHeader stud>
                      <div className="flex items-center justify-between w-full pr-1">
                        <h2 className="text-sm font-bold font-display text-black">Description</h2>
                        <div className="flex gap-1">
                          <CopyButton text={listing.description} label="Copy HTML" />
                          <CopyButton
                            text={listing.description.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}
                            label="Copy text"
                          />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="py-4">
                      <div
                        className="prose prose-sm prose-invert max-w-none text-sm [&_h2]:text-[var(--color-accent)] [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1 [&_table]:w-full [&_table]:text-xs [&_td]:py-1 [&_td]:px-2 [&_tr]:border-b [&_tr]:border-[var(--color-surface-border)]"
                        dangerouslySetInnerHTML={{ __html: listing.description }}
                      />
                    </CardContent>
                  </Card>

                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => { setStep('configure'); setListing(null) }} className="flex-1">
                      <RefreshCw className="h-4 w-4" />
                      Regenerate
                    </Button>
                    <Button variant="secondary" onClick={reset} className="flex-1">
                      New listing
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </PageShell>
  )
}
