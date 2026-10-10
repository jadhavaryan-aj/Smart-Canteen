import { AppError, fromPostgrestError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/client';
import { mapCategory, mapMenuItem } from '@/services/mappers';
import type { Category, MenuItem } from '@/types/domain';

export const MENU_IMAGE_BUCKET = 'menu-images';
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Everything, including hidden categories and archived items (staff RLS). */
export async function fetchAdminMenu(): Promise<{ categories: Category[]; items: MenuItem[] }> {
  const client = getAdminSupabase();
  const [categories, items] = await Promise.all([
    client.from('categories').select('*').order('sort_order').order('name'),
    client.from('menu_items').select('*, options:menu_item_options(*)').order('sort_order').order('name'),
  ]);
  if (categories.error) throw fromPostgrestError(categories.error);
  if (items.error) throw fromPostgrestError(items.error);
  return { categories: categories.data.map(mapCategory), items: items.data.map((item) => mapMenuItem(item)) };
}

export interface CategoryInput {
  id?: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

export async function saveCategory(input: CategoryInput): Promise<void> {
  const client = getAdminSupabase();
  const values = {
    name: input.name.trim(),
    slug: input.slug,
    description: input.description?.trim() || null,
    is_active: input.isActive,
    sort_order: input.sortOrder,
  };
  const { error } = input.id
    ? await client.from('categories').update(values).eq('id', input.id)
    : await client.from('categories').insert(values);
  if (error) {
    if (error.code === '23505')
      throw new AppError('DUPLICATE_SLUG', 'Another category already uses this URL name.');
    throw fromPostgrestError(error);
  }
}

export async function setCategoryActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await getAdminSupabase().from('categories').update({ is_active: isActive }).eq('id', id);
  if (error) throw fromPostgrestError(error);
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await getAdminSupabase().from('categories').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') {
      throw new AppError(
        'CATEGORY_IN_USE',
        'Move or delete the items in this category first, or hide it instead.',
      );
    }
    throw fromPostgrestError(error);
  }
}

/** Persists a new category order (10, 20, 30, …). */
export async function reorderCategories(orderedIds: string[]): Promise<void> {
  const client = getAdminSupabase();
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      client
        .from('categories')
        .update({ sort_order: (index + 1) * 10 })
        .eq('id', id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw fromPostgrestError(failed.error);
}

export interface MenuItemInput {
  id?: string;
  categoryId: string;
  name: string;
  description: string;
  pricePaise: number;
  imageUrl: string | null;
  isVegetarian: boolean;
  isAvailable: boolean;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  options: { id?: string; name: string; priceDeltaPaise: number; isAvailable: boolean }[];
}

export async function saveMenuItem(input: MenuItemInput, existingOptionIds: string[] = []): Promise<string> {
  const client = getAdminSupabase();
  const values = {
    category_id: input.categoryId,
    name: input.name.trim(),
    description: input.description.trim(),
    price_paise: input.pricePaise,
    image_url: input.imageUrl,
    is_vegetarian: input.isVegetarian,
    is_available: input.isAvailable,
    is_active: input.isActive,
    is_featured: input.isFeatured,
    sort_order: input.sortOrder,
  };

  let itemId = input.id;
  if (itemId) {
    const { error } = await client.from('menu_items').update(values).eq('id', itemId);
    if (error) throw fromPostgrestError(error);
  } else {
    const { data, error } = await client.from('menu_items').insert(values).select('id').single();
    if (error) throw fromPostgrestError(error);
    itemId = data.id;
  }

  const keptIds = input.options.flatMap((option) => (option.id ? [option.id] : []));
  const removed = existingOptionIds.filter((id) => !keptIds.includes(id));
  if (removed.length > 0) {
    const { error } = await client.from('menu_item_options').delete().in('id', removed);
    if (error) throw fromPostgrestError(error);
  }
  for (const [index, option] of input.options.entries()) {
    const optionValues = {
      name: option.name.trim(),
      price_delta_paise: option.priceDeltaPaise,
      is_available: option.isAvailable,
      sort_order: (index + 1) * 10,
    };
    const { error } = option.id
      ? await client.from('menu_item_options').update(optionValues).eq('id', option.id)
      : await client.from('menu_item_options').insert({ ...optionValues, menu_item_id: itemId });
    if (error) {
      if (error.code === '23505')
        throw new AppError('DUPLICATE_OPTION', `Option “${option.name}” is listed twice.`);
      throw fromPostgrestError(error);
    }
  }
  return itemId;
}

export async function updateMenuItemFlags(
  id: string,
  flags: Partial<{ is_active: boolean; is_featured: boolean }>,
): Promise<void> {
  const { error } = await getAdminSupabase().from('menu_items').update(flags).eq('id', id);
  if (error) throw fromPostgrestError(error);
}

/** Staff and admins can mark items sold out (a narrowly scoped database function). */
export async function setMenuItemAvailability(id: string, isAvailable: boolean): Promise<void> {
  const { error } = await getAdminSupabase().rpc('set_menu_item_availability', {
    p_item_id: id,
    p_is_available: isAvailable,
  });
  if (error) throw fromPostgrestError(error);
}

export async function deleteMenuItem(id: string): Promise<void> {
  const { error } = await getAdminSupabase().from('menu_items').delete().eq('id', id);
  if (error) throw fromPostgrestError(error);
}

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES[file.type]) return 'Please choose a JPEG, PNG or WebP image.';
  if (file.size > MAX_IMAGE_BYTES) return 'Images must be 2 MB or smaller.';
  return null;
}

export async function uploadMenuImage(file: File): Promise<string> {
  const problem = validateImageFile(file);
  if (problem) throw new AppError('INVALID_IMAGE', problem);
  const client = getAdminSupabase();
  const path = `items/${crypto.randomUUID()}.${ALLOWED_IMAGE_TYPES[file.type]}`;
  const { error } = await client.storage.from(MENU_IMAGE_BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) {
    throw new AppError(
      'UPLOAD_FAILED',
      /bucket/i.test(error.message)
        ? 'Image storage is not configured. Run the storage migration, or paste an image URL instead.'
        : 'The image could not be uploaded. Please try again.',
      { cause: error },
    );
  }
  return client.storage.from(MENU_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
