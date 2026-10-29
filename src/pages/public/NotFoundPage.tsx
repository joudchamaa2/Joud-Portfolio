import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { Seo } from '@/components/site/Seo'
import { Button } from '@/components/ui/button'

export default function NotFoundPage({ what = 'page' }: { what?: 'page' | 'project' }) {
  return (
    <div className="container-page grid min-h-[60dvh] place-items-center py-24 text-center">
      <Seo title="Not found" path="/404" noindex />
      <div>
        <p className="eyebrow text-gold">404</p>
        <h1 className="display mt-4 text-5xl text-fg">
          {what === 'project' ? 'Project not found' : 'Page not found'}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-fg-muted">
          {what === 'project'
            ? 'This project does not exist or is not published.'
            : 'The page you are looking for does not exist or has moved.'}
        </p>
        <Button asChild variant="secondary" className="mt-8">
          <Link to={what === 'project' ? '/projects' : '/'}>
            <ArrowLeft aria-hidden /> {what === 'project' ? 'All projects' : 'Back home'}
          </Link>
        </Button>
      </div>
    </div>
  )
}
