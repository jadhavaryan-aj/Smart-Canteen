import { Link } from 'react-router';

import { brand } from '@/config/brand';
import { useSettings } from '@/hooks/use-settings';
import { formatClock } from '@/lib/dates';
import { DAY_KEYS } from '@/types/domain';

import { BrandMark } from './brand-mark';
import { Container } from './container';

function HoursSummary() {
  const settings = useSettings();
  const hours = settings.data?.openingHours;
  if (!hours) return <p className="text-sm text-muted-foreground">Opening hours appear here once connected.</p>;
  const weekday = hours.mon;
  const saturday = hours.sat;
  const sunday = hours.sun;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      <dt className="text-muted-foreground">Mon – Fri</dt>
      <dd className="tabular">{weekday.closed ? 'Closed' : `${formatClock(weekday.open)} – ${formatClock(weekday.close)}`}</dd>
      <dt className="text-muted-foreground">Saturday</dt>
      <dd className="tabular">{saturday.closed ? 'Closed' : `${formatClock(saturday.open)} – ${formatClock(saturday.close)}`}</dd>
      <dt className="text-muted-foreground">Sunday</dt>
      <dd className="tabular">{sunday.closed ? 'Closed' : `${formatClock(sunday.open)} – ${formatClock(sunday.close)}`}</dd>
    </dl>
  );
}

export function SiteFooter() {
  const settings = useSettings();
  const weekdaysDiffer = settings.data
    ? DAY_KEYS.slice(0, 5).some(
        (day) => JSON.stringify(settings.data.openingHours[day]) !== JSON.stringify(settings.data.openingHours.mon),
      )
    : false;

  return (
    <footer className="no-print mt-24 border-t border-border bg-card/60">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm">
          <BrandMark name={settings.data?.canteenName ?? brand.name} />
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{brand.description}</p>
          <p className="mt-3 text-sm text-muted-foreground">{brand.location}</p>
        </div>
        <div>
          <h2 className="mb-4 text-xs font-bold tracking-[0.16em] text-sage uppercase">Explore</h2>
          <ul className="space-y-2.5 text-sm font-medium">
            <li>
              <Link className="hover:text-primary" to="/menu">
                Menu
              </Link>
            </li>
            <li>
              <Link className="hover:text-primary" to="/orders">
                My orders
              </Link>
            </li>
            <li>
              <Link className="hover:text-primary" to="/about">
                About & FAQ
              </Link>
            </li>
            <li>
              <Link className="hover:text-primary" to="/terms">
                Ordering terms
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="mb-4 text-xs font-bold tracking-[0.16em] text-sage uppercase">Opening hours</h2>
          <HoursSummary />
          {weekdaysDiffer ? (
            <p className="mt-2 text-xs text-muted-foreground">Weekday hours vary — see the About page.</p>
          ) : null}
        </div>
      </Container>
      <Container className="flex flex-col gap-2 border-t border-border py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
        <p>
          © {new Date().getFullYear()} {settings.data?.canteenName ?? brand.name}. {brand.footerNote}
        </p>
        <Link to="/admin" className="hover:text-foreground">
          Staff sign-in
        </Link>
      </Container>
    </footer>
  );
}
