import { useEffect } from 'react';

import { brand } from '@/config/brand';

/** Sets document.title; pass null for the plain brand title. */
export function usePageTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · ${brand.name}` : `${brand.name} — ${brand.tagline}`;
  }, [title]);
}
