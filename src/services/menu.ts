import { fromPostgrestError } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase/client';
import type { MenuData } from '@/types/domain';

import { mapCategory, mapMenuItem } from './mappers';

/** Public menu: RLS returns only active categories and listed items (sold-out included). */
export async function fetchMenu(): Promise<MenuData> {
  const client = getSupabase();
  const [categories, items] = await Promise.all([
    client.from('categories').select('*').order('sort_order').order('name'),
    client
      .from('menu_items')
      .select('*, options:menu_item_options(*)')
      .order('sort_order')
      .order('name'),
  ]);
  if (categories.error) throw fromPostgrestError(categories.error);
  if (items.error) throw fromPostgrestError(items.error);

  const activeCategories = categories.data.filter((category) => category.is_active).map(mapCategory);
  const activeIds = new Set(activeCategories.map((category) => category.id));
  return {
    categories: activeCategories,
    items: items.data
      .filter((item) => item.is_active && activeIds.has(item.category_id))
      .map((item) => mapMenuItem(item)),
  };
}
