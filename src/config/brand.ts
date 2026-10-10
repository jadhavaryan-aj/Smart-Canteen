/**
 * Static brand configuration.
 *
 * "Campus Table" is a placeholder name. Rename the canteen here (for static
 * marketing copy) and in Admin → Settings (for the name shown on receipts and
 * in the ordering flow). Nothing in this project claims affiliation with any
 * real institution.
 */
export const brand = {
  name: 'Campus Table',
  monogram: 'ct',
  tagline: 'Good food. Less waiting.',
  description:
    'Order and pay online, then collect your food from the counter when it is ready — no queue at the till.',
  /** Shown in the footer. Keep it honest: this is not official college branding. */
  footerNote: 'Campus Table is a placeholder name for this canteen ordering system.',
  location: 'Ground floor, Student Centre',
  /** Hero and About imagery. Replace with photography of your own canteen. */
  images: {
    hero: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1400&q=80',
    about: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1400&q=80',
  },
} as const;
