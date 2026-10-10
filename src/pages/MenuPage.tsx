import { Leaf, Search, SearchX, X } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';

import { OrderingStatusBanner } from '@/components/common/ordering-status-banner';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState, SetupRequired } from '@/components/common/states';
import { Container } from '@/components/layout/container';
import { MenuItemCard } from '@/components/menu/menu-item-card';
import { MenuGridSkeleton } from '@/components/menu/menu-skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useMenu } from '@/hooks/use-menu';
import { usePageTitle } from '@/hooks/use-page-title';
import { useSettings } from '@/hooks/use-settings';
import { supabaseConfig } from '@/lib/supabase/env';
import { cn } from '@/lib/utils';
import type { MenuItem } from '@/types/domain';

function normalise(text: string) {
  return text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

export default function MenuPage() {
  usePageTitle('Menu');
  const menu = useMenu();
  const settings = useSettings();
  const [params, setParams] = useSearchParams();

  const query = params.get('q') ?? '';
  const categorySlug = params.get('category');
  const vegOnly = params.get('veg') === '1';

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  const activeCategory = menu.data?.categories.find((category) => category.slug === categorySlug) ?? null;

  const filtered = useMemo(() => {
    if (!menu.data) return [];
    const q = normalise(query.trim());
    return menu.data.items.filter((item) => {
      if (activeCategory && item.categoryId !== activeCategory.id) return false;
      if (vegOnly && !item.isVegetarian) return false;
      if (q && !normalise(`${item.name} ${item.description}`).includes(q)) return false;
      return true;
    });
  }, [menu.data, query, activeCategory, vegOnly]);

  const grouped = useMemo(() => {
    if (!menu.data) return [];
    return menu.data.categories
      .map((category) => ({ category, items: filtered.filter((item) => item.categoryId === category.id) }))
      .filter((group) => group.items.length > 0);
  }, [menu.data, filtered]);

  const filtersActive = Boolean(query || activeCategory || vegOnly);
  const categoryName = (item: MenuItem) => menu.data?.categories.find((c) => c.id === item.categoryId)?.name;

  return (
    <Container className="py-10 sm:py-14">
      <PageHeader
        eyebrow="Fresh from the kitchen"
        title="Menu"
        description="Prices include taxes. Add what you fancy to your tray — you’ll see the final, server-confirmed total before paying."
      />

      {settings.data ? (
        <div className="mt-6">
          <OrderingStatusBanner status={settings.data.orderingStatus} timeZone={settings.data.timezone} />
        </div>
      ) : null}

      {!supabaseConfig.isConfigured ? (
        <SetupRequired className="mt-10" />
      ) : (
        <>
          <div className="sticky top-16 z-30 -mx-4 mt-8 border-b border-border bg-background/90 px-4 py-4 backdrop-blur-md sm:top-[4.5rem] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex items-center gap-3 md:contents">
                <div className="relative flex-1 md:w-80 md:flex-none">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    value={query}
                    onChange={(event) => update({ q: event.target.value || null })}
                    placeholder="Search dishes"
                    aria-label="Search the menu"
                    className="pr-10 pl-10"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => update({ q: null })}
                      aria-label="Clear search"
                      className="absolute top-1/2 right-2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </div>
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-sm font-semibold md:order-last md:ml-auto">
                  <Switch
                    checked={vegOnly}
                    onCheckedChange={(checked) => update({ veg: checked ? '1' : null })}
                  />
                  <Leaf className="size-4 text-veg" aria-hidden="true" /> Veg only
                </label>
              </div>
              <div
                role="group"
                aria-label="Filter by category"
                className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0"
              >
                <CategoryChip active={!activeCategory} onClick={() => update({ category: null })}>
                  All
                </CategoryChip>
                {(menu.data?.categories ?? []).map((category) => (
                  <CategoryChip
                    key={category.id}
                    active={activeCategory?.id === category.id}
                    onClick={() =>
                      update({ category: activeCategory?.id === category.id ? null : category.slug })
                    }
                  >
                    {category.name}
                  </CategoryChip>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8" aria-live="polite">
            {menu.isPending ? (
              <MenuGridSkeleton />
            ) : menu.isError ? (
              <ErrorState
                error={menu.error}
                title="We couldn’t load the menu"
                onRetry={() => void menu.refetch()}
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title={filtersActive ? 'No dishes match' : 'The menu is empty'}
                description={
                  filtersActive
                    ? 'Try a different search or clear the filters.'
                    : 'The kitchen hasn’t published today’s menu yet.'
                }
                action={
                  filtersActive ? (
                    <Button
                      variant="outline"
                      onClick={() => setParams(new URLSearchParams(), { replace: true })}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : query || activeCategory ? (
              <>
                <p className="mb-5 text-sm text-muted-foreground">
                  {filtered.length} dish{filtered.length === 1 ? '' : 'es'}
                  {activeCategory ? ` in ${activeCategory.name}` : ''}
                  {query ? ` matching “${query}”` : ''}
                </p>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((item, index) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      categoryName={categoryName(item)}
                      index={index}
                      priority={index < 3}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-14">
                {grouped.map(({ category, items }, groupIndex) => (
                  <section
                    key={category.id}
                    aria-labelledby={`cat-${category.slug}`}
                    id={category.slug}
                    className="scroll-mt-40"
                  >
                    <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-border pb-3">
                      <h2
                        id={`cat-${category.slug}`}
                        className="font-display text-2xl font-medium sm:text-3xl"
                      >
                        {category.name}
                      </h2>
                      {category.description ? (
                        <p className="hidden text-sm text-muted-foreground sm:block">
                          {category.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((item, index) => (
                        <MenuItemCard
                          key={item.id}
                          item={item}
                          categoryName={category.name}
                          index={index}
                          priority={groupIndex === 0 && index < 3}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Container>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-10 shrink-0 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:border-sage hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}
