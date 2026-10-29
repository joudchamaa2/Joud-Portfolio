import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/misc'

export default function AdminNotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="This admin page does not exist."
      action={
        <Button asChild variant="secondary">
          <Link to="/admin">Back to dashboard</Link>
        </Button>
      }
    />
  )
}
