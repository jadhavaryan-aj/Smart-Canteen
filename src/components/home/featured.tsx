import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';

import { ErrorState, SetupRequired } from '@/components/common/states';
import { Container } from '@/components/layout/container';
import { MenuItemCard } from '@/components/menu/menu-item-card';
import { MenuCardSkeleton } from '@/components/menu/menu-skeleton';
import { Button } from '@/components/ui/button';
import { useMenu } from '@/hooks/use-menu';
import { supabaseConfig } from '@/lib/supabase/env';

export function FeaturedItems() {
  const menu = useMenu();

  const featured = (() => {
    if (!menu.data) return [];
    const available = menu.data.items.filter((item) => item.isAvailable);
    const picks = available.filter((item) => item.isFeatured);
    return (picks.length >= 3 ? picks : [...picks, ...available.filter((item) => !item.isFeatured)]).slice(0, 4);
  })();
  const categoryName = (id: string) => menu.data?.categories.find((category) => category.id === id)?.name;

  return (
    <section aria-labelledby="featured-heading" className="py-16 sm:py-20">
      <Container>
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold tracking-[0.16em] text-sage uppercase">Popular right now</p>
            <h2 id="featured-heading" className="font-display text-3xl font-medium sm:text-4xl">
              Today’s favourites
            </h2>
          </div>
          <Button asChild variant="link" className="hidden px-0 sm:inline-flex">
            <Link to="/menu">
              See the full menu <ArrowRight />
            </Link>
          </Button>
        </div>

        {!supabaseConfig.isConfigured ? (
          <SetupRequired />
        ) : menu.isPending ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <MenuCardSkeleton key={index} />
            ))}
          </div>
        ) : menu.isError ? (
          <ErrorState error={menu.error} title="We couldn’t load the menu" onRetry={() => void menu.refetch()} />
        ) : featured.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            The menu is being updated. Please check back shortly.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((item, index) => (
              <MenuItemCard key={item.id} item={item} categoryName={categoryName(item.categoryId)} index={index} />
            ))}
          </div>
        )}

        <Button asChild variant="outline" className="mt-8 w-full sm:hidden">
          <Link to="/menu">See the full menu</Link>
        </Button>
      </Container>
    </section>
  );
}
