import { ArrowRight, MapPin } from 'lucide-react';
import { Link } from 'react-router';

import { OpeningHoursTable } from '@/components/common/opening-hours';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { brand } from '@/config/brand';
import { useSettings } from '@/hooks/use-settings';

export function HoursSection() {
  const settings = useSettings();
  if (settings.isError) return null;

  return (
    <section aria-labelledby="hours-heading" className="py-16 sm:py-20">
      <Container className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft sm:p-8">
          <h2 id="hours-heading" className="font-display text-2xl font-medium sm:text-3xl">
            Opening hours
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Online orders are accepted during these hours.</p>
          {settings.data ? (
            <OpeningHoursTable hours={settings.data.openingHours} timeZone={settings.data.timezone} className="mt-5" />
          ) : (
            <div className="mt-5 space-y-3">
              {Array.from({ length: 7 }, (_, index) => (
                <Skeleton key={index} className="h-6" />
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-secondary p-6 sm:p-8">
          <div>
            <h2 className="font-display text-2xl font-medium sm:text-3xl">Picking up your order</h2>
            <p className="mt-3 leading-relaxed text-secondary-foreground/80">
              {settings.data?.pickupInstructions ??
                'Show your order number at the pickup counter when your order is marked Ready.'}
            </p>
            <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-secondary-foreground">
              <MapPin className="size-4" aria-hidden="true" /> {brand.location}
            </p>
          </div>
          <Button asChild size="lg" className="mt-8 self-start">
            <Link to="/menu">
              Start an order <ArrowRight />
            </Link>
          </Button>
        </div>
      </Container>
    </section>
  );
}
