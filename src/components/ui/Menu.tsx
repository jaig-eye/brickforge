import * as DM from '@radix-ui/react-dropdown-menu'
import * as TT from '@radix-ui/react-tooltip'
import * as SW from '@radix-ui/react-switch'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const surface = 'z-50 min-w-[200px] overflow-hidden rounded-[14px] border border-line bg-panel p-1 shadow-[var(--shadow-3)] data-[state=open]:animate-[menu-in_140ms_var(--ease-out)]'

export function Menu({ trigger, children, align = 'end' }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'end' | 'center' }) {
  return (
    <DM.Root>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content align={align} sideOffset={6} className={surface}>
          {children}
          <style>{'@keyframes menu-in { from { opacity: 0; transform: translateY(-4px) scale(.98) } to { opacity: 1; transform: none } }'}</style>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}

export function MenuItem({ children, onSelect, icon, danger, disabled }: { children: ReactNode; onSelect: () => void; icon?: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <DM.Item disabled={disabled} onSelect={onSelect}
      className={cn('flex h-8 cursor-default select-none items-center gap-2.5 rounded-[9px] px-2.5 text-[13px] outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-hover',
        danger ? 'text-down' : 'text-fg-2 data-[highlighted]:text-fg')}>
      <span className="grid size-4 place-items-center [&>svg]:size-4">{icon}</span>
      {children}
    </DM.Item>
  )
}

export function MenuCheck({ children, checked, onSelect }: { children: ReactNode; checked: boolean; onSelect: () => void }) {
  return (
    <DM.CheckboxItem checked={checked} onSelect={(e) => { e.preventDefault(); onSelect() }}
      className="flex h-8 cursor-default select-none items-center gap-2.5 rounded-[9px] px-2.5 text-[13px] text-fg-2 outline-none data-[highlighted]:bg-hover data-[highlighted]:text-fg">
      <span className="grid size-4 place-items-center">{checked && <Check className="size-4 text-accent-text" />}</span>
      {children}
    </DM.CheckboxItem>
  )
}

export const MenuSeparator = () => <DM.Separator className="my-1 h-px bg-line" />
export const MenuLabel = ({ children }: { children: ReactNode }) => <DM.Label className="eyebrow px-2.5 pb-1 pt-2">{children}</DM.Label>

export function Tip({ label, children, side = 'top' }: { label: ReactNode; children: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <TT.Root delayDuration={350}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content side={side} sideOffset={8}
          className="z-[60] rounded-[9px] border border-line bg-panel-3 px-2.5 py-1.5 text-[12px] font-medium text-fg shadow-[var(--shadow-2)]">
          {label}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  )
}

export function Switch({ checked, onCheckedChange, label, disabled, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return (
    <SW.Root id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label}
      className="no-drag relative h-[22px] w-[38px] shrink-0 rounded-full border border-line-strong bg-panel-3 transition-colors duration-200 data-[state=checked]:border-transparent data-[state=checked]:bg-accent disabled:opacity-40">
      <SW.Thumb className="block size-[16px] translate-x-[2px] rounded-full bg-fg-2 shadow transition-transform duration-200 ease-[var(--ease-snap)] data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-accent-ink" />
    </SW.Root>
  )
}
