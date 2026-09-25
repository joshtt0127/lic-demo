import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router } from './router'
import { ToastProvider } from './components/Toast'
import { FullPageLoader } from './components/ui'
import { AuthProvider } from './features/auth/AuthProvider'
import { I18nProvider } from './lib/i18n'
import { registerServiceWorker } from './lib/pwa'
import { installErrorReporting } from './lib/report-error'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Casting data changes on human timescales — a short stale window keeps
      // navigation instant without serving yesterday's submissions.
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// La coquille hors ligne. Sans effet en dev, où le HMR doit rester maître.
registerServiceWorker()

// Les deux filets globaux, avant le premier rendu.
installErrorReporting()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <AuthProvider>
            <ToastProvider>
              {/* Routes are code-split: this covers the first chunk's arrival. */}
              <RouterProvider
                router={router}
                fallbackElement={<FullPageLoader />}
                future={{ v7_startTransition: true }}
              />
            </ToastProvider>
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
