import { useState } from 'react'
import { Save, User } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { useProfileStore } from '@/store/profile.store'
import { THEMES, type ThemeId } from '@/lib/constants'
import toast from 'react-hot-toast'

export default function Profile() {
  const { profile, update } = useProfileStore()
  const [name, setName] = useState(profile?.display_name ?? '')

  const save = async () => {
    await update({ display_name: name })
    toast.success('Profile saved')
  }

  return (
    <PageShell title="Profile" subtitle="Customize your BrickForge identity">
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {/* Identity */}
        <Card>
          <CardHeader stud><h2 className="text-sm font-bold font-display text-black">Identity</h2></CardHeader>
          <CardContent className="py-5 space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-[var(--color-accent)] flex items-center justify-center">
                <User className="h-7 w-7 text-[var(--color-accent-text)]" />
              </div>
              <div>
                <p className="font-bold font-display">{profile?.display_name}</p>
                <Badge variant="alpha" className="text-xs mt-1">Alpha Tester</Badge>
              </div>
            </div>
            <Input
              label="Display Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
            />
            <Button onClick={save}><Save className="h-4 w-4" />Save Changes</Button>
          </CardContent>
        </Card>

        {/* Theme */}
        <Card>
          <CardHeader stud><h2 className="text-sm font-bold font-display text-black">App Theme</h2></CardHeader>
          <CardContent className="py-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => update({ theme_name: t.id as ThemeId })}
                  className={`relative rounded-xl border-2 p-3 text-left transition-all ${
                    profile?.theme_name === t.id
                      ? 'border-[var(--color-accent)] scale-[1.02]'
                      : 'border-[var(--color-surface-border)] hover:border-[var(--color-accent)]/60'
                  }`}
                  style={{ backgroundColor: t.preview }}
                >
                  <div
                    className="h-4 w-8 rounded-full mb-2"
                    style={{ backgroundColor: t.accent }}
                  />
                  <p className="text-xs font-semibold font-display" style={{ color: t.id === 'light-studio' ? '#1A1A1A' : '#F5F5F5' }}>
                    {t.name}
                  </p>
                  {profile?.theme_name === t.id && (
                    <span className="absolute top-1.5 right-1.5 text-xs">✓</span>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
