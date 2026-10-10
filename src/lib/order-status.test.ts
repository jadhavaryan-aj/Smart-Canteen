import { describe, expect, it } from 'vitest';

import { ORDER_STATUSES } from '@/types/domain';

import { isValidStaffTransition, queueColumnFor, staffActionsFor, studentStepIndex } from './order-status';

describe('order status rules (mirrors public.is_valid_staff_transition)', () => {
  it('allows the kitchen workflow', () => {
    expect(isValidStaffTransition('confirmed', 'accepted')).toBe(true);
    expect(isValidStaffTransition('confirmed', 'preparing')).toBe(true);
    expect(isValidStaffTransition('accepted', 'preparing')).toBe(true);
    expect(isValidStaffTransition('preparing', 'ready')).toBe(true);
    expect(isValidStaffTransition('ready', 'completed')).toBe(true);
    expect(isValidStaffTransition('ready', 'preparing')).toBe(true);
  });

  it.each([
    ['payment_pending', 'confirmed'],
    ['payment_pending', 'preparing'],
    ['confirmed', 'ready'],
    ['confirmed', 'completed'],
    ['completed', 'ready'],
    ['cancelled', 'confirmed'],
    ['preparing', 'confirmed'],
  ] as const)('rejects %s → %s', (from, to) => {
    expect(isValidStaffTransition(from, to)).toBe(false);
  });

  it('never offers staff a way to confirm payment', () => {
    for (const status of ORDER_STATUSES) {
      expect(staffActionsFor(status).some((action) => action.to === 'confirmed')).toBe(false);
    }
  });

  it('only offers actions that are valid transitions', () => {
    for (const status of ORDER_STATUSES) {
      for (const action of staffActionsFor(status)) {
        expect(isValidStaffTransition(status, action.to)).toBe(true);
      }
    }
  });

  it('keeps unpaid and cancelled orders out of the kitchen queue', () => {
    expect(queueColumnFor('payment_pending')).toBeNull();
    expect(queueColumnFor('cancelled')).toBeNull();
    expect(queueColumnFor('accepted')).toBe('new');
  });

  it('maps statuses onto the student progress tracker', () => {
    expect(studentStepIndex('payment_pending')).toBe(-1);
    expect(studentStepIndex('accepted')).toBe(0);
    expect(studentStepIndex('completed')).toBe(3);
  });
});
