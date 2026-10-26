import { lazy, Suspense } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createHashRouter, Navigate, RouterProvider, useRouteError } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { queryClient } from '@/lib/queries'
import { AppShell } from '@/components/shell/AppShell'
import { Button } from '@/components/ui/Button'
import { Empty } from '@/components/ui/Bits'
import { SceneSearch } from '@/components/brick/Scenes'

const Home = lazy(() => import('@/pages/Home'))
const Collection = lazy(() => import('@/pages/Collection'))
const Catalog = lazy(() => import('@/pages/Catalog'))
const Scan = lazy(() => import('@/pages/Scan'))
const Value = lazy(() => import('@/pages/Value'))
const Sell = lazy(() => import('@/pages/Sell'))
const Settings = lazy(() => import('@/pages/Settings'))

/** One page failing never takes the app down; your data is never at risk here. */
function PageError() {
  const error = useRouteError()
  return (
    <Empty scene={<SceneSearch />} title="This screen hit a snag"
      actions={<Button variant="primary" icon={<RotateCcw className="size-4" />} onClick={() => window.location.reload()}>Reload</Button>}>
      Your collection is safe. This is only a display problem.
      <pre className="selectable mt-3 max-w-[560px] whitespace-pre-wrap rounded-[10px] bg-panel-2 px-3 py-2 text-left font-mono text-[11.5px] text-fg-3">
        {error instanceof Error ? error.message : String(error)}
      </pre>
    </Empty>
  )
}

const page = (C: React.ComponentType) => <Suspense fallback={null}><C /></Suspense>

const router = createHashRouter([
  {
    element: <AppShell />,
    errorElement: <PageError />,
    children: [
      { index: true, element: page(Home), errorElement: <PageError /> },
      { path: 'collection', element: page(Collection), errorElement: <PageError /> },
      { path: 'catalog', element: page(Catalog), errorElement: <PageError /> },
      { path: 'scan', element: page(Scan), errorElement: <PageError /> },
      { path: 'value', element: page(Value), errorElement: <PageError /> },
      { path: 'sell', element: page(Sell), errorElement: <PageError /> },
      { path: 'settings', element: page(Settings), errorElement: <PageError /> },
      // A stale or mistyped address lands on Home instead of an error
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
