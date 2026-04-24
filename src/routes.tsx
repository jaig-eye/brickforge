import { lazy, Suspense } from 'react'
import { createHashRouter, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Spinner } from '@/components/ui/Spinner'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { Toaster } from 'react-hot-toast'
import { useEffect } from 'react'
import { useProfileStore } from '@/store/profile.store'

const Dashboard       = lazy(() => import('@/pages/Dashboard'))
const Collection      = lazy(() => import('@/pages/Collection'))
const Browse          = lazy(() => import('@/pages/Browse'))
const ValueTracker    = lazy(() => import('@/pages/ValueTracker'))
const PictureLookup   = lazy(() => import('@/pages/PictureLookup'))
const PieceIdentifier = lazy(() => import('@/pages/PieceIdentifier'))
const AIBuilder       = lazy(() => import('@/pages/AIBuilder'))
const EbayListing     = lazy(() => import('@/pages/EbayListing'))
const Profile         = lazy(() => import('@/pages/Profile'))
const Settings        = lazy(() => import('@/pages/Settings'))

function Loading() {
  return (
    <div className="flex items-center justify-center h-full py-24">
      <Spinner size="lg" />
    </div>
  )
}

function wrap(Component: React.ComponentType) {
  return (
    <Suspense fallback={<Loading />}>
      <Component />
    </Suspense>
  )
}

function AppLayout() {
  const { fetch: fetchProfile } = useProfileStore()

  useEffect(() => {
    fetchProfile()
  }, [])

  const location = useLocation()

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Topbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden bg-[var(--color-surface-base)]">
          <AnimatePresence mode="wait">
            <Outlet key={location.pathname} />
          </AnimatePresence>
        </main>
      </div>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-surface-border)',
            color: 'var(--color-lego-white)',
            fontFamily: 'var(--font-family-body)',
            fontSize: '13px',
          },
        }}
      />
    </div>
  )
}

export const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true,          element: wrap(Dashboard)       },
      { path: 'collection/*', element: wrap(Collection)      },
      { path: 'browse',       element: wrap(Browse)          },
      { path: 'value/*',      element: wrap(ValueTracker)    },
      { path: 'lookup/*',     element: wrap(PictureLookup)   },
      { path: 'piece-id/*',   element: wrap(PieceIdentifier) },
      { path: 'builder',      element: wrap(AIBuilder)       },
      { path: 'listing',      element: wrap(EbayListing)     },
      { path: 'profile',      element: wrap(Profile)         },
      { path: 'settings',     element: wrap(Settings)        },
    ],
  },
])
