import { Check } from 'lucide-react';
import { motion } from 'motion/react';

import { formatTime } from '@/lib/dates';
import { STUDENT_STEPS, studentStepIndex } from '@/lib/order-status';
import { cn } from '@/lib/utils';
import type { OrderStatus, ReceiptTimelineEntry } from '@/types/domain';

const STEP_STATUSES: Record<string, OrderStatus[]> = {
  confirmed: ['confirmed'],
  preparing: ['preparing'],
  ready: ['ready'],
  completed: ['completed'],
};

export function StatusTracker({
  status,
  timeline,
  timeZone,
}: {
  status: OrderStatus;
  timeline: ReceiptTimelineEntry[];
  timeZone?: string;
}) {
  const current = studentStepIndex(status);
  const progress = current <= 0 ? 0 : (current / (STUDENT_STEPS.length - 1)) * 100;

  const timeFor = (key: string) => {
    const entry = [...timeline].reverse().find((item) => STEP_STATUSES[key]?.includes(item.status));
    return entry ? formatTime(entry.at, timeZone) : null;
  };

  return (
    <div className="px-6 py-6 sm:px-8" aria-label="Order progress">
      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute top-[1.05rem] right-[12.5%] left-[12.5%] h-[3px] rounded-full bg-muted"
        >
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <ol className="relative grid grid-cols-4">
          {STUDENT_STEPS.map((step, index) => {
            const done = index < current || (index === current && status === 'completed');
            const active = index === current && status !== 'completed';
            const time = index <= current ? timeFor(step.key) : null;
            return (
              <li
                key={step.key}
                className="relative flex flex-col items-center text-center"
                aria-current={active ? 'step' : undefined}
              >
                <motion.span
                  initial={false}
                  animate={{ scale: active ? 1.08 : 1 }}
                  className={cn(
                    'relative z-10 flex size-[2.2rem] items-center justify-center rounded-full border-2 text-sm font-bold transition-colors duration-500',
                    done && 'border-primary bg-primary text-primary-foreground',
                    active && 'border-primary bg-card text-primary shadow-ring',
                    !done && !active && 'border-border bg-card text-muted-foreground',
                  )}
                >
                  {done ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : index + 1}
                  {active ? (
                    <span className="absolute inset-0 animate-ping rounded-full border-2 border-primary/40 motion-reduce:hidden" />
                  ) : null}
                </motion.span>
                <span
                  className={cn(
                    'mt-2 text-xs font-semibold sm:text-sm',
                    index > current && 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </span>
                <span className="tabular h-4 text-[0.7rem] text-muted-foreground">{time ?? ''}</span>
                <span className="sr-only">{done ? 'completed' : active ? 'current step' : 'upcoming'}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
