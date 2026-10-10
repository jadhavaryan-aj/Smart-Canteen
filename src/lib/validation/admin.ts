import { z } from 'zod';

import { parseRupeesToPaise } from '@/lib/money';
import { DAY_KEYS } from '@/types/domain';

export const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(8, 'Passwords are at least 8 characters.').max(200),
});
export type LoginValues = z.infer<typeof loginSchema>;

const rupees = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((value) => parseRupeesToPaise(value) !== null, `${label}: enter an amount like 70 or 70.50.`)
    .refine(
      (value) => {
        const paise = parseRupeesToPaise(value);
        return paise !== null && paise >= min && paise <= max;
      },
      `${label} must be between ₹${min / 100} and ₹${max / 100}.`,
    );

export const menuItemFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters.')
    .max(80, 'Name must be at most 80 characters.'),
  description: z.string().trim().max(280, 'Description must be at most 280 characters.'),
  price: rupees('Price', 100, 500_000),
  categoryId: z.string().min(1, 'Choose a category.'),
  imageUrl: z
    .string()
    .trim()
    .max(1024)
    .refine(
      (value) => value === '' || /^https:\/\/[^\s"'<>]+$/.test(value) || /^\/[A-Za-z0-9._~/-]+$/.test(value),
      {
        message: 'Use an https:// image address.',
      },
    ),
  isVegetarian: z.boolean(),
  isAvailable: z.boolean(),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  sortOrder: z.coerce.number<string | number>().int().min(0).max(10_000),
  options: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1, 'Option name is required.').max(60),
        price: rupees('Option price', 0, 100_000),
        isAvailable: z.boolean(),
      }),
    )
    .max(10, 'At most 10 options per item.')
    .refine(
      (options) => new Set(options.map((option) => option.name.trim().toLowerCase())).size === options.length,
      'Option names must be unique.',
    ),
});
export type MenuItemFormValues = z.input<typeof menuItemFormSchema>;
export type MenuItemFormOutput = z.output<typeof menuItemFormSchema>;

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export const categoryFormSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(40),
  slug: z
    .string()
    .trim()
    .min(1, 'URL name is required.')
    .max(48)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens.'),
  description: z.string().trim().max(160),
  isActive: z.boolean(),
});
export type CategoryFormValues = z.infer<typeof categoryFormSchema>;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.');
const daySchema = z
  .object({ open: time, close: time, closed: z.boolean() })
  .refine((day) => day.closed || day.open < day.close, {
    message: 'Closing time must be after opening time.',
    path: ['close'],
  });

export const settingsFormSchema = z.object({
  canteenName: z.string().trim().min(2).max(60),
  tagline: z.string().trim().max(120),
  pickupInstructions: z.string().trim().max(500),
  orderingEnabled: z.boolean(),
  orderingPaused: z.boolean(),
  pauseMessage: z.string().trim().max(200),
  enforceOpeningHours: z.boolean(),
  openingHours: z.object(
    Object.fromEntries(DAY_KEYS.map((day) => [day, daySchema])) as Record<
      (typeof DAY_KEYS)[number],
      typeof daySchema
    >,
  ),
  timezone: z.string().trim().min(3).max(64),
  studentIdMode: z.enum(['hidden', 'optional', 'required']),
  studentIdLabel: z.string().trim().min(2).max(40),
  orderPrefix: z
    .string()
    .trim()
    .regex(/^[A-Z]{1,6}$/, 'Use 1–6 capital letters.'),
  maxItemsPerOrder: z.coerce.number<string | number>().int().min(1).max(100),
  pendingPaymentWindowMinutes: z.coerce.number<string | number>().int().min(5).max(240),
});
export type SettingsFormValues = z.input<typeof settingsFormSchema>;
export type SettingsFormOutput = z.output<typeof settingsFormSchema>;
