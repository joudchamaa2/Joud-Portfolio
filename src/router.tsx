import { createBrowserRouter, isRouteErrorResponse, Link, useRouteError, type RouteObject } from 'react-router'
import { RequireAdmin } from './auth/RequireAdmin'
import { SiteDataProvider } from './components/site/SiteData'
import { Button } from './components/ui/button'
import { PublicLayout } from './layouts/PublicLayout'
import AboutPage from './pages/public/AboutPage'
import ContactPage from './pages/public/ContactPage'
import ExperiencePage from './pages/public/ExperiencePage'
import HomePage from './pages/public/HomePage'
import NotFoundPage from './pages/public/NotFoundPage'
import ProjectDetailPage from './pages/public/ProjectDetailPage'
import ProjectsPage from './pages/public/ProjectsPage'
import SkillsPage from './pages/public/SkillsPage'

function RouteError() {
  const error = useRouteError()
  // A new deployment can invalidate lazily-loaded chunk URLs; a reload fixes it.
  const chunkError = error instanceof Error && /dynamically imported module|Importing a module script failed/i.test(error.message)
  const notFound = isRouteErrorResponse(error) && error.status === 404
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-md">
        <p className="eyebrow text-gold">{notFound ? '404' : 'Error'}</p>
        <h1 className="display mt-4 text-4xl text-fg">{notFound ? 'Page not found' : 'Something went wrong'}</h1>
        <p className="mt-3 text-fg-muted">
          {chunkError ? 'A newer version of the site is available.' : 'An unexpected error occurred while displaying this page.'}
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={() => window.location.reload()}>Reload</Button>
          <Button asChild variant="secondary">
            <Link to="/">Home</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}

const lazyPage = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default })

export const routes: RouteObject[] = [
  {
    element: (
      <SiteDataProvider>
        <PublicLayout />
      </SiteDataProvider>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:slug', element: <ProjectDetailPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'skills', element: <SkillsPage /> },
      { path: 'experience', element: <ExperiencePage /> },
      { path: 'contact', element: <ContactPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: 'admin/login',
    errorElement: <RouteError />,
    lazy: lazyPage(() => import('./pages/admin/LoginPage')),
  },
  {
    path: 'admin',
    errorElement: <RouteError />,
    lazy: async () => {
      const { AdminLayout } = await import('./layouts/AdminLayout')
      return {
        element: (
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        ),
      }
    },
    children: [
      { index: true, lazy: lazyPage(() => import('./pages/admin/DashboardPage')) },
      { path: 'projects', lazy: lazyPage(() => import('./pages/admin/ProjectsAdminPage')) },
      { path: 'projects/new', lazy: lazyPage(() => import('./pages/admin/ProjectEditorPage')) },
      { path: 'projects/:id', lazy: lazyPage(() => import('./pages/admin/ProjectEditorPage')) },
      { path: 'projects/:id/preview', lazy: lazyPage(() => import('./pages/admin/ProjectPreviewPage')) },
      { path: 'skills', lazy: lazyPage(() => import('./pages/admin/SkillsAdminPage')) },
      { path: 'timeline', lazy: lazyPage(() => import('./pages/admin/TimelineAdminPage')) },
      { path: 'messages', lazy: lazyPage(() => import('./pages/admin/MessagesPage')) },
      { path: 'profile', lazy: lazyPage(() => import('./pages/admin/ProfilePage')) },
      { path: 'settings', lazy: lazyPage(() => import('./pages/admin/SettingsPage')) },
      { path: '*', lazy: lazyPage(() => import('./pages/admin/AdminNotFound')) },
    ],
  },
]

export const createRouter = () => createBrowserRouter(routes)
