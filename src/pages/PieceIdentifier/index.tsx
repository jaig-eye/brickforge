import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Puzzle, Upload, Loader2 } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FeatureGate } from '@/components/layout/FeatureGate'
import { IPC } from '@/lib/ipc-types'
import toast from 'react-hot-toast'

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

interface PieceResult {
  part_number?: string
  name?: string
  confidence?: number
  bricklink_url?: string
  color?: string
}

export default function PieceIdentifier() {
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<PieceResult[]>([])

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setResults([])
    setLoading(true)
    try {
      const b64 = await toBase64(file)
      const res = await window.ipc.invoke(IPC.AI_PIECE_IDENTIFY, b64) as { pieces?: PieceResult[]; error?: string }
      if (res.error) throw new Error(res.error)
      setResults(res.pieces ?? [])
    } catch (err) {
      toast.error(`Identification failed: ${err}`)
    } finally {
      setLoading(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 1,
  })

  return (
    <FeatureGate flag="piece_identifier">
      <PageShell
        title="Piece Identifier"
        subtitle="Upload a photo to identify individual LEGO pieces"
      >
        <div className="p-6 max-w-2xl mx-auto">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5'
                : 'border-[var(--color-surface-border)] hover:border-[var(--color-accent)]'
            }`}
          >
            <input {...getInputProps()} />
            {preview
              ? <img src={preview} alt="Preview" className="max-h-40 mx-auto rounded-lg object-contain" />
              : (
                <div className="flex flex-col items-center gap-3">
                  <Puzzle className="h-10 w-10 text-[var(--color-surface-muted)]" />
                  <p className="text-sm font-medium">Drop a LEGO piece photo here</p>
                  <p className="text-xs text-[var(--color-surface-muted)]">Works best with a plain background</p>
                </div>
              )
            }
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--color-accent)]" />
              <p className="text-sm">Detecting pieces…</p>
            </div>
          )}

          {results.length > 0 && !loading && (
            <div className="mt-6 space-y-3">
              <h3 className="font-semibold font-display text-sm">{results.length} piece{results.length !== 1 ? 's' : ''} identified</h3>
              {results.map((piece, i) => (
                <Card key={i}>
                  <CardContent className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-sm font-display">{piece.name ?? 'Unknown part'}</p>
                      {piece.part_number && <p className="text-xs font-mono text-[var(--color-accent)]">#{piece.part_number}</p>}
                      {piece.color && <p className="text-xs text-[var(--color-surface-muted)]">{piece.color}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {piece.confidence != null && (
                        <Badge variant={piece.confidence > 0.8 ? 'success' : piece.confidence > 0.5 ? 'warning' : 'danger'}>
                          {Math.round(piece.confidence * 100)}%
                        </Badge>
                      )}
                      {piece.bricklink_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.ipc.invoke(IPC.APP_OPEN_EXTERNAL, piece.bricklink_url!)}
                        >
                          BrickLink
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </PageShell>
    </FeatureGate>
  )
}
