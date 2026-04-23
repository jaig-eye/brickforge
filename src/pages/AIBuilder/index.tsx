import { Wand2 } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { FeatureGate } from '@/components/layout/FeatureGate'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

export default function AIBuilder() {
  return (
    <PageShell
      title="AI Builder"
      subtitle="Generate LEGO models from text, images, or 3D files"
      actions={<Badge variant="premium">Premium Feature</Badge>}
    >
      <FeatureGate flag="ai_builder">
        {/* This content only shows when flag is enabled */}
        <div className="p-6">
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: '💬', title: 'Text to Model',  desc: 'Describe your model and AI generates a BrickLink Studio file' },
              { icon: '🖼️', title: 'Image to Model', desc: 'Upload a photo and AI recreates it in LEGO pieces'           },
              { icon: '📦', title: 'OBJ to Model',   desc: 'Convert any 3D mesh file into a buildable LEGO structure'   },
            ].map(({ icon, title, desc }) => (
              <Card key={title} className="cursor-pointer hover:border-[var(--color-accent)] transition-colors">
                <CardContent className="py-6 text-center">
                  <div className="text-4xl mb-3">{icon}</div>
                  <p className="font-bold font-display">{title}</p>
                  <p className="text-xs text-[var(--color-surface-muted)] mt-1">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </FeatureGate>
    </PageShell>
  )
}
