import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Camera, Upload, X, Loader2 } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
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

export default function PictureLookup() {
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setResult(null)
    setLoading(true)
    try {
      const b64 = await toBase64(file)
      const res = await window.ipc.invoke(IPC.AI_PICTURE_LOOKUP, b64) as Record<string, unknown>
      if (res.error) throw new Error(res.error as string)
      setResult(res)
    } catch (err) {
      toast.error(`Lookup failed: ${err}`)
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
    <FeatureGate flag="picture_lookup">
      <PageShell
        title="Picture Lookup"
        subtitle="Upload a photo to identify a LEGO set or minifigure"
      >
        <div className="p-6 max-w-2xl mx-auto">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5'
                : 'border-[var(--color-surface-border)] hover:border-[var(--color-accent)]'
            }`}
          >
            <input {...getInputProps()} />
            {preview ? (
              <div className="relative">
                <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded-lg object-contain" />
                <button
                  className="absolute top-0 right-0 bg-red-500 rounded-full p-1"
                  onClick={(e) => { e.stopPropagation(); setPreview(null); setResult(null) }}
                >
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="h-10 w-10 text-[var(--color-surface-muted)]" />
                <p className="text-sm font-medium">Drop an image here or click to browse</p>
                <p className="text-xs text-[var(--color-surface-muted)]">JPG, PNG, WebP supported</p>
              </div>
            )}
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--color-accent)]" />
              <p className="text-sm">Identifying with AI…</p>
            </div>
          )}

          {result && !loading && (
            <Card className="mt-6">
              <CardContent className="pt-4">
                <Badge variant="success" className="mb-3">Match Found</Badge>
                <pre className="text-xs font-mono bg-[var(--color-surface-overlay)] rounded-lg p-3 overflow-auto max-h-48">
                  {JSON.stringify(result, null, 2)}
                </pre>
                {result.bricklink_url && (
                  <Button
                    variant="outline"
                    className="mt-3"
                    onClick={() => window.ipc.invoke(IPC.APP_OPEN_EXTERNAL, result.bricklink_url as string)}
                  >
                    View on BrickLink
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </PageShell>
    </FeatureGate>
  )
}
