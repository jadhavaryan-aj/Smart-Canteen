import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { CategoryManager } from '@/components/admin/category-manager';
import { MenuItemDialog } from '@/components/admin/menu-item-dialog';
import { useStaff } from '@/components/admin/staff-context';
import { FoodImage } from '@/components/common/food-image';
import { ErrorState } from '@/components/common/states';
import { VegIndicator } from '@/components/common/veg-indicator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTitle } from '@/hooks/use-page-title';
import { messageFor } from '@/lib/errors';
import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  deleteMenuItem,
  fetchAdminMenu,
  setMenuItemAvailability,
  updateMenuItemFlags,
} from '@/services/admin/menu';
import type { MenuItem } from '@/types/domain';

export default function AdminMenuPage() {
  usePageTitle('Menu management');
  const { isAdmin } = useStaff();
  const queryClient = useQueryClient();
  const menu = useQuery({ queryKey: ['admin', 'menu'], queryFn: fetchAdminMenu });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'menu'] });
    void queryClient.invalidateQueries({ queryKey: ['menu'] });
  };
  const availability = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) => setMenuItemAvailability(id, value),
    onSuccess: (_result, { value }) => {
      toast.success(value ? 'Back in stock' : 'Marked sold out');
      invalidate();
    },
    onError: (error) => toast.error(messageFor(error)),
  });
  const flags = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { is_active?: boolean; is_featured?: boolean } }) =>
      updateMenuItemFlags(id, patch),
    onSuccess: invalidate,
    onError: (error) => toast.error(messageFor(error)),
  });
  const remove = useMutation({
    mutationFn: deleteMenuItem,
    onSuccess: () => {
      toast.success('Item deleted. Past receipts keep their original details.');
      invalidate();
    },
    onError: (error) => toast.error(messageFor(error)),
  });

  const groups = useMemo(() => {
    if (!menu.data) return [];
    const term = search.trim().toLowerCase();
    return menu.data.categories
      .filter((c) => category === 'all' || c.id === category)
      .map((c) => ({
        category: c,
        items: menu.data.items.filter(
          (item) =>
            item.categoryId === c.id &&
            (showArchived || item.isActive) &&
            (!term || item.name.toLowerCase().includes(term)),
        ),
      }))
      .filter((group) => group.items.length > 0 || (!term && category !== 'all'));
  }, [menu.data, search, category, showArchived]);

  return (
    <div className="mx-auto max-w-6xl">
      <AdminPageHeader
        title="Menu"
        description={
          isAdmin
            ? 'Add dishes, change prices, upload photos and organise categories.'
            : 'Mark dishes sold out or back in stock. Ask an administrator for other changes.'
        }
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/menu" target="_blank" rel="noreferrer">
                <ExternalLink /> Preview student menu
              </a>
            </Button>
            {isAdmin ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
                disabled={!menu.data || menu.data.categories.length === 0}
              >
                <Plus /> Add item
              </Button>
            ) : null}
          </>
        }
      />

      {menu.isError ? (
        <ErrorState error={menu.error} onRetry={() => void menu.refetch()} />
      ) : !menu.data ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <Tabs defaultValue="items">
          {isAdmin ? (
            <TabsList className="mb-5">
              <TabsTrigger value="items">Items</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
            </TabsList>
          ) : null}

          <TabsContent value="items">
            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft sm:flex-row sm:items-center">
              <div className="relative sm:w-72">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  aria-label="Search items"
                  placeholder="Search items"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-10 pl-9"
                />
              </div>
              <NativeSelect
                aria-label="Filter by category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="sm:w-56"
              >
                <option value="all">All categories</option>
                {menu.data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
              <label className="flex items-center gap-2 text-sm font-semibold sm:ml-auto">
                <Switch checked={showArchived} onCheckedChange={setShowArchived} /> Show archived
              </label>
            </div>

            {groups.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
                {menu.data.categories.length === 0 ? 'Create a category first.' : 'No items match.'}
              </p>
            ) : (
              <div className="space-y-6">
                {groups.map(({ category: group, items }) => (
                  <section
                    key={group.id}
                    aria-labelledby={`admin-cat-${group.id}`}
                    className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
                  >
                    <h2
                      id={`admin-cat-${group.id}`}
                      className="flex items-center gap-2 border-b border-border bg-muted/40 px-5 py-3 font-semibold"
                    >
                      {group.name}
                      {!group.isActive ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          Hidden
                        </span>
                      ) : null}
                    </h2>
                    {items.length === 0 ? (
                      <p className="p-5 text-sm text-muted-foreground">No items in this category.</p>
                    ) : null}
                    <ul className="divide-y divide-border">
                      {items.map((item) => (
                        <li
                          key={item.id}
                          className={cn(
                            'flex flex-wrap items-center gap-4 px-5 py-3',
                            !item.isActive && 'opacity-60',
                          )}
                        >
                          <FoodImage src={item.imageUrl} alt={item.name} className="size-14 rounded-xl" />
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-2 font-semibold">
                              <VegIndicator vegetarian={item.isVegetarian} className="size-3.5" />
                              {item.name}
                              {item.isFeatured ? (
                                <Star className="size-3.5 fill-honey text-honey" aria-label="Featured" />
                              ) : null}
                              {!item.isActive ? (
                                <span className="text-xs font-medium text-muted-foreground">(archived)</span>
                              ) : null}
                            </p>
                            <p className="tabular text-sm text-muted-foreground">
                              {formatPaise(item.pricePaise)}
                              {item.options.length > 0
                                ? ` · ${item.options.length} option${item.options.length === 1 ? '' : 's'}`
                                : ''}
                            </p>
                          </div>
                          <label className="flex items-center gap-2 text-sm font-semibold">
                            <Switch
                              checked={item.isAvailable}
                              disabled={availability.isPending}
                              onCheckedChange={(value) => availability.mutate({ id: item.id, value })}
                              aria-label={`${item.name} in stock`}
                            />
                            <span
                              className={item.isAvailable ? 'text-status-ready' : 'text-status-cancelled'}
                            >
                              {item.isAvailable ? 'In stock' : 'Sold out'}
                            </span>
                          </label>
                          {isAdmin ? (
                            <div className="flex items-center gap-1">
                              <label className="mr-2 flex items-center gap-2 text-sm">
                                <Switch
                                  checked={item.isActive}
                                  onCheckedChange={(value) =>
                                    flags.mutate({ id: item.id, patch: { is_active: value } })
                                  }
                                  aria-label={`${item.name} listed on menu`}
                                />
                                Listed
                              </label>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={
                                  item.isFeatured ? `Unfeature ${item.name}` : `Feature ${item.name}`
                                }
                                onClick={() =>
                                  flags.mutate({ id: item.id, patch: { is_featured: !item.isFeatured } })
                                }
                              >
                                <Star className={cn('size-4', item.isFeatured && 'fill-honey text-honey')} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Edit ${item.name}`}
                                onClick={() => {
                                  setEditing(item);
                                  setDialogOpen(true);
                                }}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Delete ${item.name}`}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Delete “${item.name}”? Consider switching off “Listed” instead to keep it for later.`,
                                    )
                                  ) {
                                    remove.mutate(item.id);
                                  }
                                }}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </TabsContent>

          {isAdmin ? (
            <TabsContent value="categories">
              <CategoryManager categories={menu.data.categories} items={menu.data.items} />
            </TabsContent>
          ) : null}
        </Tabs>
      )}

      {isAdmin && menu.data ? (
        <MenuItemDialog
          item={editing}
          categories={menu.data.categories}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      ) : null}
    </div>
  );
}
