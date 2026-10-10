import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';

import { queueQueryKey, useAdminQueue } from '@/hooks/admin/use-admin-queue';
import { playChime, primeAudio } from '@/lib/admin/chime';
import { readPreference, writePreference } from '@/lib/admin/preferences';
import { formatPaise } from '@/lib/money';
import { getAdminSupabase } from '@/lib/supabase/client';
import type { AdminOrder } from '@/services/admin/types';

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

interface AdminRealtimeValue {
  connection: ConnectionState;
  lastSyncedAt: number | null;
  newOrderIds: ReadonlySet<string>;
  acknowledge: (orderId: string) => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => Promise<void>;
  desktopEnabled: boolean;
  setDesktopEnabled: (enabled: boolean) => Promise<void>;
  refreshAll: () => void;
}

const AdminRealtimeContext = createContext<AdminRealtimeValue | null>(null);

const HIGHLIGHT_MS = 3 * 60_000;

/**
 * Keeps every admin screen in sync with the orders table.
 *
 * Realtime events are treated only as "something changed" hints: each one
 * triggers a re-fetch of the authoritative data, and a 30-second poll covers
 * any events missed while disconnected. New orders are detected by comparing
 * fetched data, so nothing is missed after a reconnect either.
 */
export function AdminRealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const queue = useAdminQueue();
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(() => new Set());
  const [soundEnabled, setSoundState] = useState(() => readPreference('sound', false));
  const [desktopEnabled, setDesktopState] = useState(
    () =>
      readPreference('desktop-notifications', false) &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted',
  );
  const known = useRef<Set<string> | null>(null);
  const prefs = useRef({ soundEnabled, desktopEnabled });
  useEffect(() => {
    prefs.current = { soundEnabled, desktopEnabled };
  }, [soundEnabled, desktopEnabled]);

  const refreshAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['admin'] });
  }, [queryClient]);

  const acknowledge = useCallback((orderId: string) => {
    setNewOrderIds((current) => {
      if (!current.has(orderId)) return current;
      const next = new Set(current);
      next.delete(orderId);
      return next;
    });
  }, []);

  const announce = useCallback(
    (orders: AdminOrder[]) => {
      setNewOrderIds((current) => new Set([...current, ...orders.map((order) => order.id)]));
      for (const order of orders) setTimeout(() => acknowledge(order.id), HIGHLIGHT_MS);

      const first = orders[0];
      if (!first) return;
      const title = orders.length === 1 ? `New order ${first.orderNumber}` : `${orders.length} new orders`;
      const body =
        orders.length === 1
          ? `${first.itemCount} item${first.itemCount === 1 ? '' : 's'} · ${formatPaise(first.totalPaise)} · ${first.customerName}`
          : orders.map((order) => order.orderNumber).join(', ');
      toast(title, { description: body, duration: 8_000 });
      if (prefs.current.soundEnabled) playChime();
      if (
        prefs.current.desktopEnabled &&
        document.visibilityState === 'hidden' &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(title, { body, tag: 'campus-table-new-order', icon: '/favicon.svg' });
        } catch {
          // Some browsers only allow notifications from a service worker.
        }
      }
    },
    [acknowledge],
  );

  // Detect new confirmed orders from authoritative data (works across reconnects).
  useEffect(() => {
    if (!queue.data) return;
    const confirmed = queue.data.filter((order) => order.status === 'confirmed');
    if (known.current === null) {
      known.current = new Set(queue.data.map((order) => order.id));
      return;
    }
    const fresh = confirmed.filter((order) => !known.current?.has(order.id));
    for (const order of queue.data) known.current.add(order.id);
    if (fresh.length > 0) announce(fresh);
  }, [queue.data, announce]);

  // Subscribe to order changes with reconnect + backoff.
  useEffect(() => {
    const client = getAdminSupabase();
    let disposed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let current: RealtimeChannel | null = null;

    const connect = () => {
      if (disposed) return;
      setConnection(attempt === 0 ? 'connecting' : 'reconnecting');
      const channel = client
        .channel(`admin-orders-${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
          const row = payload.new as { id?: string } | undefined;
          void queryClient.invalidateQueries({ queryKey: queueQueryKey });
          void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
          void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
          if (row?.id) void queryClient.invalidateQueries({ queryKey: ['admin', 'order', row.id] });
        });
      current = channel;
      channel.subscribe((status) => {
        if (disposed || current !== channel) return;
        if (status === 'SUBSCRIBED') {
          attempt = 0;
          setConnection('live');
          void queryClient.invalidateQueries({ queryKey: ['admin'] }); // reconcile after (re)connecting
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection(navigator.onLine ? 'reconnecting' : 'offline');
          current = null;
          void client.removeChannel(channel);
          const delay = Math.min(30_000, 1_000 * 2 ** attempt);
          attempt += 1;
          clearTimeout(retryTimer);
          retryTimer = setTimeout(connect, delay);
        }
      });
    };

    connect();

    const onOnline = () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      if (!current) {
        clearTimeout(retryTimer);
        attempt = 0;
        connect();
      }
    };
    const onOffline = () => setConnection('offline');
    const onVisible = () => {
      if (document.visibilityState === 'visible') void queryClient.invalidateQueries({ queryKey: ['admin'] });
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      if (current) void client.removeChannel(current);
    };
  }, [queryClient]);

  const setSoundEnabled = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const ok = await primeAudio();
      if (!ok) {
        toast.error('Sound could not be enabled in this browser.');
        return;
      }
      playChime();
    }
    writePreference('sound', enabled);
    setSoundState(enabled);
  }, []);

  const setDesktopEnabled = useCallback(async (enabled: boolean) => {
    if (enabled) {
      if (typeof Notification === 'undefined') {
        toast.error('This browser does not support notifications.');
        return;
      }
      const permission =
        Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Notifications are blocked. Allow them in your browser settings to use this.');
        return;
      }
    }
    writePreference('desktop-notifications', enabled);
    setDesktopState(enabled);
  }, []);

  const value = useMemo<AdminRealtimeValue>(
    () => ({
      connection,
      lastSyncedAt: queue.dataUpdatedAt || null,
      newOrderIds,
      acknowledge,
      soundEnabled,
      setSoundEnabled,
      desktopEnabled,
      setDesktopEnabled,
      refreshAll,
    }),
    [
      connection,
      queue.dataUpdatedAt,
      newOrderIds,
      acknowledge,
      soundEnabled,
      setSoundEnabled,
      desktopEnabled,
      setDesktopEnabled,
      refreshAll,
    ],
  );

  return <AdminRealtimeContext.Provider value={value}>{children}</AdminRealtimeContext.Provider>;
}

export function useAdminRealtime(): AdminRealtimeValue {
  const value = useContext(AdminRealtimeContext);
  if (!value) throw new Error('useAdminRealtime must be used inside AdminRealtimeProvider');
  return value;
}
