import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PauseCircle, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { messageFor } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { orderingStatusKey } from '@/hooks/admin/query-keys';
import { fetchOrderingStatus, setOrderingPaused } from '@/services/admin/settings';

/** Lets counter staff pause new orders during a rush (and resume them). */
export function OrderingControl() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: orderingStatusKey, queryFn: fetchOrderingStatus, refetchInterval: 60_000 });
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: ({ paused, note }: { paused: boolean; note?: string }) => setOrderingPaused(paused, note),
    onSuccess: (result) => {
      queryClient.setQueryData(orderingStatusKey, result);
      void queryClient.invalidateQueries({ queryKey: ['public-settings'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      toast.success(result.reason === 'paused' ? 'New orders paused' : 'Ordering resumed');
      setOpen(false);
      setMessage('');
    },
    onError: (error) => toast.error(messageFor(error)),
  });

  const data = status.data;
  const paused = data?.reason === 'paused';
  const label = !data ? '…' : data.isOpen ? 'Taking orders' : paused ? 'Paused' : 'Closed';

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => (paused ? mutation.mutate({ paused: false }) : setOpen(true))}
        disabled={!data || mutation.isPending || (!data.isOpen && !paused)}
        title={data && !data.isOpen && !paused ? data.message ?? 'Ordering is closed' : undefined}
        className={cn(
          'h-9 gap-2',
          data?.isOpen && 'border-status-ready/30 text-status-ready',
          paused && 'border-honey/40 bg-honey-soft text-honey',
        )}
      >
        {paused ? <PlayCircle /> : <PauseCircle />}
        <span className="hidden sm:inline">{paused ? 'Resume orders' : label}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause new orders?</DialogTitle>
            <DialogDescription>
              Students will not be able to start new checkouts until you resume. Orders already paid are unaffected.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="pause-message">Message for students (optional)</Label>
            <Input
              id="pause-message"
              maxLength={200}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="e.g. Back in 15 minutes — kitchen is catching up"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep taking orders
            </Button>
            <Button onClick={() => mutation.mutate({ paused: true, note: message })} disabled={mutation.isPending}>
              Pause new orders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
