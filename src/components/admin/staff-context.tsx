import { createContext, useContext } from 'react';

import type { StaffSession } from '@/services/admin/auth';

export const StaffContext = createContext<StaffSession | null>(null);

/** The signed-in staff member. Only available inside the guarded admin layout. */
export function useStaff(): StaffSession & { isAdmin: boolean } {
  const staff = useContext(StaffContext);
  if (!staff) throw new Error('useStaff must be used inside the admin layout');
  return { ...staff, isAdmin: staff.role === 'admin' };
}
