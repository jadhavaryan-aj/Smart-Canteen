import { ChefHat, Coffee, CookingPot, Croissant, Sandwich, UtensilsCrossed, type LucideIcon } from 'lucide-react';

const BY_SLUG: Record<string, LucideIcon> = {
  breakfast: Croissant,
  meals: CookingPot,
  snacks: Sandwich,
  beverages: Coffee,
  drinks: Coffee,
  specials: ChefHat,
};

export function categoryIcon(slug: string): LucideIcon {
  return BY_SLUG[slug] ?? UtensilsCrossed;
}
