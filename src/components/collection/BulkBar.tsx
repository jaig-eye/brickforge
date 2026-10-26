import { AnimatePresence, motion } from 'framer-motion'
import { Heart, Package, Tag, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/lib/api'
import { invalidateCollection, useTags } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { SNAP } from '@/lib/motion'
import type { EntityKind } from '@/lib/types'
import { Button, IconButton } from '../ui/Button'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu'
import { Dialog } from '../ui/Overlay'
import { Input } from '../ui/Field'

/** Floating actions for a multi-selection. Deletes can be undone. */
export function BulkBar({ kind, ids, numbers, scope, onClear }: { kind: EntityKind; ids: number[]; numbers: string[]; scope: 'owned' | 'wanted'; onClear: () => void }) {
  const { data: tags } = useTags()
  const [tagOpen, setTagOpen] = useState(false)
  const [newTag, setNewTag] = useState('')
  const n = ids.length

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try { await fn(); await invalidateCollection(); toast.success(done); onClear() } catch (err) { toast.error(err) }
  }
  const remove = async () => {
    try {
      const rows = await api.collection.remove(kind, ids)
      await invalidateCollection()
      onClear()
      toast.success(`Removed ${n} item${n === 1 ? '' : 's'}`, { action: { label: 'Undo', run: async () => { await api.collection.restore(kind, rows); await invalidateCollection() } } })
    } catch (err) { toast.error(err) }
  }
  const tag = (name: string) => run(() => api.tags.apply(kind, numbers, [name]), `Tagged ${n} item${n === 1 ? '' : 's'} “${name}”`)

  return (
    <>
      <AnimatePresence>
        {n > 0 && (
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={SNAP} style={{ x: '-50%' }}
            className="fixed bottom-6 left-[calc(50%+38px)] z-30 flex items-center gap-1.5 rounded-[16px] border border-line-strong bg-panel-3 p-1.5 pl-4 shadow-[var(--shadow-3)]">
            <span className="tnum mr-2 text-[13px] font-semibold">{n} selected</span>
            {scope === 'owned'
              ? <Button size="sm" variant="ghost" icon={<Heart className="size-3.5" />} onClick={() => run(() => api.collection.bulkUpdate(kind, ids, { is_owned: 0, is_wanted: 1 }), 'Moved to your wishlist')}>Move to wishlist</Button>
              : <Button size="sm" variant="ghost" icon={<Package className="size-3.5" />} onClick={() => run(() => api.collection.bulkUpdate(kind, ids, { is_owned: 1, is_wanted: 0 }), 'Moved into your collection')}>I own these</Button>}
            <Menu trigger={<Button size="sm" variant="ghost">Condition</Button>} align="center">
              <MenuLabel>Set condition</MenuLabel>
              {(kind === 'set'
                ? [['sealed', 'Sealed'], ['open_complete', 'Opened, complete'], ['open_incomplete', 'Opened, incomplete']]
                : [['new', 'New'], ['used', 'Used'], ['cracked', 'Damaged']]).map(([v, l]) => (
                <MenuItem key={v} onSelect={() => run(() => api.collection.bulkUpdate(kind, ids, { condition: v }), `Marked ${l.toLowerCase()}`)}>{l}</MenuItem>
              ))}
            </Menu>
            <Menu trigger={<Button size="sm" variant="ghost" icon={<Tag className="size-3.5" />}>Tag</Button>} align="center">
              {(tags ?? []).slice(0, 10).map((t) => <MenuItem key={t.id} onSelect={() => void tag(t.name)}>{t.name}</MenuItem>)}
              {!!tags?.length && <MenuSeparator />}
              <MenuItem icon={<Tag />} onSelect={() => setTagOpen(true)}>New tag…</MenuItem>
            </Menu>
            <Button size="sm" variant="ghost" className="text-down hover:bg-down-soft hover:text-down" icon={<Trash2 className="size-3.5" />} onClick={remove}>Remove</Button>
            <IconButton label="Clear selection" size="sm" onClick={onClear}><X className="size-4" /></IconButton>
          </motion.div>
        )}
      </AnimatePresence>
      <Dialog open={tagOpen} onOpenChange={setTagOpen} title="New tag" width={400}
        footer={<Button variant="primary" disabled={!newTag.trim()} onClick={() => { void tag(newTag.trim()); setTagOpen(false); setNewTag('') }}>Tag {n} item{n === 1 ? '' : 's'}</Button>}>
        <Input autoFocus value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="e.g. Display shelf, For sale, Childhood"
          onKeyDown={(e) => { if (e.key === 'Enter' && newTag.trim()) { void tag(newTag.trim()); setTagOpen(false); setNewTag('') } }} />
      </Dialog>
    </>
  )
}
