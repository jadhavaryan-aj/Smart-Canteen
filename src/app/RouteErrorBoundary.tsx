import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

import { Button } from '@/components/ui/button';

/** Last-resort error screen for unexpected rendering errors. */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (!notFound) console.error(error);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-4xl font-medium">{notFound ? 'Page not found' : 'Something went wrong'}</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        {notFound
          ? 'The page you were looking for does not exist.'
          : 'An unexpected error occurred. Please reload the page — your cart is saved on this device.'}
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={() => window.location.reload()}>Reload</Button>
        <Button asChild variant="outline">
          <Link to="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
