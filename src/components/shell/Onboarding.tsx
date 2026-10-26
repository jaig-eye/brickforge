/**
 * First run, told like a build booklet: numbered steps, and a tower that
 * gains a brick with each step you finish. Every step but the first key is
 * optional, and the demo collection is one click away for the curious.
 */
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Camera, FileUp, FlaskConical, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { keys, useSettings } from '@/lib/queries'
import { useUi } from '@/lib/ui-store'
import { SOFT } from '@/lib/motion'
import { Button } from '../ui/Button'
import { Input } from '../ui/Field'
import { IsoBrick, isoOffset } from '../brick/IsoBrick'
import { BrickLogo } from '../brick/BrickLogo'
import { RebrickableCard, BricklinkCard, AiCard } from '../settings/Connections'

const COLORS = ['#E5373C', '#FFC929', '#2F7FEA', '#22B36B', '#FF8A3D']

function Tower({ count }: { count: number }) {
  const s = 18
  return (
    <svg viewBox="0 0 220 240" className="w-[220px]" aria-hidden="true">
      <IsoBrick w={4} d={4} h={0.4} color="#2b3247" x={110} y={170} s={s} studs={false} />
      {Array.from({ length: count }).map((_, i) => {
        const [ox, oy] = isoOffset(i % 2 ? 2 : 0, i % 2 ? 0 : 2, 0.4 + i * 1.2, s)
        return <IsoBrick key={i} w={2} d={2} color={COLORS[i % COLORS.length]} x={110 + ox} y={170 + oy} s={s} drop delay={0.05} />
      })}
    </svg>
  )
}

const STEPS = ['Welcome', 'Catalog', 'Prices', 'AI', 'Ready'] as const

export function Onboarding() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const openAdd = useUi((s) => s.openAdd)
  const { data: s } = useSettings()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(s?.displayName ?? '')

  const finish = async (then?: () => void) => {
    const next = await api.settings.setPrefs({ onboardingDone: true, displayName: name.trim() })
    qc.setQueryData(keys.settings, next)
    then?.()
  }
  const next = () => setStep((n) => Math.min(STEPS.length - 1, n + 1))
  const back = () => setStep((n) => Math.max(0, n - 1))

  return (
    <motion.div role="dialog" aria-modal="true" aria-label="Set up BrickForge" className="fixed inset-x-0 bottom-0 top-[44px] z-[60] flex overflow-hidden bg-bg/95 backdrop-blur-xl"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <aside className="flex w-[340px] shrink-0 flex-col justify-between border-r border-line px-10 py-10">
        <div>
          <BrickLogo size={44} />
          <ol className="mt-10 flex flex-col gap-1">
            {STEPS.map((label, i) => (
              <li key={label} className={`flex items-center gap-3 rounded-[10px] px-2 py-1.5 text-[13.5px] ${i === step ? 'text-fg' : i < step ? 'text-fg-3' : 'text-fg-4'}`}>
                <span className={`grid size-7 place-items-center rounded-[8px] font-display text-[13px] font-extrabold ${i === step ? 'bg-accent text-accent-ink' : i < step ? 'bg-panel-3 text-fg-2' : 'border border-line'}`}>{i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        </div>
        <div className="grid place-items-center"><Tower count={step + 1} /></div>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-[760px] flex-col justify-center px-12 py-12">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={SOFT}>
              <div className="eyebrow mb-3">Step {step + 1} of {STEPS.length}</div>

              {step === 0 && (
                <>
                  <h1 className="font-display text-[44px] font-extrabold leading-[1.02] tracking-[-0.04em]">Every brick you own,<br /><span className="text-accent-text">and what it's worth.</span></h1>
                  <p className="mt-4 max-w-[520px] text-[15px] leading-relaxed text-fg-3">
                    BrickForge keeps your LEGO® sets and minifigures in one place, tracks their market value, identifies them from photos, and writes your eBay listings. Everything stays on this computer.
                  </p>
                  <div className="mt-8 max-w-[360px]">
                    <label htmlFor="ob-name" className="text-[12.5px] font-medium text-fg-2">What should we call you? <span className="text-fg-4">(optional)</span></label>
                    <Input id="ob-name" className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" />
                  </div>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Button variant="primary" size="lg" onClick={next} icon={<ArrowRight className="size-4" />}>Set up BrickForge</Button>
                    <Button size="lg" variant="ghost" icon={<FlaskConical className="size-4" />} onClick={() => void api.app.enterDemo()}>Explore a sample collection first</Button>
                  </div>
                  <p className="mt-3 text-[12px] text-fg-4">The sample opens in its own space. Your collection stays separate.</p>
                </>
              )}

              {step === 1 && (
                <>
                  <h2 className="font-display text-[32px] font-extrabold tracking-[-0.03em]">Connect the catalog</h2>
                  <p className="mb-6 mt-2 text-[14px] text-fg-3">One free key unlocks search, pictures, and details for every set and minifigure.</p>
                  <RebrickableCard />
                </>
              )}
              {step === 2 && (
                <>
                  <h2 className="font-display text-[32px] font-extrabold tracking-[-0.03em]">See what it's worth</h2>
                  <p className="mb-6 mt-2 text-[14px] text-fg-3">Optional. With BrickLink keys, prices update once a day and your alerts can fire.</p>
                  <BricklinkCard />
                </>
              )}
              {step === 3 && (
                <>
                  <h2 className="font-display text-[32px] font-extrabold tracking-[-0.03em]">Add an AI, if you like</h2>
                  <p className="mb-6 mt-2 text-[14px] text-fg-3">Optional. Scanning already works without one.</p>
                  <AiCard />
                </>
              )}
              {step === 4 && (
                <>
                  <h2 className="font-display text-[40px] font-extrabold tracking-[-0.035em]">{name.trim() ? `Your vault is ready, ${name.trim()}.` : 'Your vault is ready.'}</h2>
                  <p className="mb-8 mt-3 text-[15px] text-fg-3">How would you like to start?</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { icon: <Plus />, title: 'Add a set', body: 'Search by name or number', run: () => finish(() => openAdd()) },
                      { icon: <Camera />, title: 'Scan photos', body: 'Drop pictures of your shelf', run: () => finish(() => navigate('/scan')) },
                      { icon: <FileUp />, title: 'Import a file', body: 'Brickset, Rebrickable, BrickLink', run: () => finish(() => navigate('/collection?import=1')) },
                    ].map((c) => (
                      <button key={c.title} type="button" onClick={() => void c.run()}
                        className="panel flex flex-col items-start gap-3 p-5 text-left transition-transform duration-200 hover:-translate-y-1 hover:border-line-strong">
                        <span className="grid size-10 place-items-center rounded-[12px] bg-accent-soft text-accent-text [&>svg]:size-5">{c.icon}</span>
                        <span className="font-display text-[16px] font-bold">{c.title}</span>
                        <span className="text-[12.5px] text-fg-3">{c.body}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {step > 0 && step < 4 && (
                <div className="mt-8 flex items-center justify-between">
                  <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={back}>Back</Button>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={next}>{step === 1 && !s?.keys.rebrickable.set ? 'Skip for now' : 'Skip'}</Button>
                    <Button variant="primary" icon={<ArrowRight className="size-4" />} onClick={next}>Continue</Button>
                  </div>
                </div>
              )}
              {step === 4 && (
                <div className="mt-8"><Button variant="ghost" onClick={() => void finish()}>Just take me in</Button></div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
