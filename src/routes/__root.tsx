import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import appCss from '../styles.css?url'

const queryClient = new QueryClient()

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-[var(--muted)]">Page not found</p>
      <Link to="/" className="btn btn-primary">
        Go home
      </Link>
    </div>
  )
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Inkpipe' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        {children}
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen">
        <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] backdrop-blur-md">
          <div className="page-wrap flex items-center justify-between py-3">
            <Link to="/" className="text-lg font-bold text-[var(--sea-ink)] no-underline">
              Inkpipe
            </Link>
            <nav className="flex gap-6 text-sm font-medium">
              <Link to="/" className="nav-link" activeProps={{ className: 'nav-link is-active' }}>
                Search
              </Link>
              <Link to="/latest" className="nav-link" activeProps={{ className: 'nav-link is-active' }}>
                Latest
              </Link>
              <Link to="/convert" className="nav-link" activeProps={{ className: 'nav-link is-active' }}>
                Convert
              </Link>
              <Link to="/komga" className="nav-link" activeProps={{ className: 'nav-link is-active' }}>
                Komga
              </Link>
              <Link to="/jobs" className="nav-link" activeProps={{ className: 'nav-link is-active' }}>
                Jobs
              </Link>
              <Link to="/settings" className="nav-link" activeProps={{ className: 'nav-link is-active' }}>
                Settings
              </Link>
            </nav>
          </div>
        </header>
        <Outlet />
      </div>
    </QueryClientProvider>
  )
}
