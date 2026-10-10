import { describe, expect, it } from 'vitest';

import { AppError, fromPostgrestError, messageFor } from './errors';

describe('error mapping', () => {
  it('uses the database code and its human hint', () => {
    const error = fromPostgrestError({
      message: 'ORDERING_CLOSED',
      code: 'P0001',
      hint: 'Back in 10 minutes',
    });
    expect(error).toMatchObject({ code: 'ORDERING_CLOSED', message: 'Back in 10 minutes' });
  });

  it('parses unavailable-item details', () => {
    const error = fromPostgrestError({
      message: 'ITEMS_UNAVAILABLE',
      code: 'P0001',
      details: '[{"menu_item_id":"x","code":"sold_out"}]',
      hint: 'Some items are no longer available.',
    });
    expect(error.details).toEqual([{ menu_item_id: 'x', code: 'sold_out' }]);
  });

  it('never surfaces raw database messages', () => {
    const error = fromPostgrestError({ message: 'relation "orders" does not exist', code: '42P01' });
    expect(error.code).toBe('DATABASE_ERROR');
    expect(error.message).not.toContain('relation');
  });

  it('maps permission errors', () => {
    expect(fromPostgrestError({ message: 'permission denied for table orders', code: '42501' }).code).toBe(
      'FORBIDDEN',
    );
  });

  it('gives friendly text for network failures', () => {
    expect(messageFor(new TypeError('Failed to fetch'))).toMatch(/connection/);
    expect(messageFor(new AppError('X', 'Custom'))).toBe('Custom');
  });
});
