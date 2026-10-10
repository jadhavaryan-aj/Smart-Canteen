import { Compass } from 'lucide-react';
import { Link } from 'react-router';

import { EmptyState } from '@/components/common/states';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { usePageTitle } from '@/hooks/use-page-title';

export default function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <Container className="py-20">
      <EmptyState
        icon={Compass}
        title="We couldn’t find that page"
        description="The link may be broken or the page may have moved."
        action={
          <Button asChild>
            <Link to="/">Back to home</Link>
          </Button>
        }
      />
    </Container>
  );
}
