import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { router } from './routes'
import { IPC } from '@/lib/ipc-types'
import toast from 'react-hot-toast'
import '@/styles/globals.css'
import '@/styles/themes.css'
import '@/styles/stud-texture.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

function UpdateListener() {
  useEffect(() => {
    const offAvailable = window.ipc.on(IPC.PUSH_UPDATE_AVAILABLE, (...args: unknown[]) => {
      const { version } = args[1] as { version: string }
      toast(`Update ${version} available — go to Settings to install.`, { id: 'update-avail', duration: 8000 })
    })
    const offProgress = window.ipc.on(IPC.PUSH_UPDATE_PROGRESS, (...args: unknown[]) => {
      const { percent } = args[1] as { percent: number }
      toast.loading(`Downloading update... ${percent}%`, { id: 'update-dl' })
    })
    const offDownloaded = window.ipc.on(IPC.PUSH_UPDATE_DOWNLOADED, (...args: unknown[]) => {
      const { version } = args[1] as { version: string }
      toast.dismiss('update-dl')
      toast(
        (t) => (
          <span>
            Update {version} ready.{' '}
            <button
              onClick={() => {
                toast.dismiss(t.id)
                window.ipc.invoke(IPC.UPDATE_INSTALL)
              }}
              style={{ fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: 'inherit' }}
            >
              Restart &amp; Install
            </button>
          </span>
        ),
        { duration: Infinity, icon: '✅' },
      )
    })
    const offError = window.ipc.on(IPC.PUSH_UPDATE_ERROR, (...args: unknown[]) => {
      const { message } = args[1] as { message: string }
      toast.dismiss('update-dl')
      toast.error(`Update failed: ${message}`, { duration: 8000 })
    })
    return () => { offAvailable(); offProgress(); offDownloaded(); offError() }
  }, [])
  return null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UpdateListener />
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
