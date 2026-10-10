import { FlaskConical } from 'lucide-react';

export function TestModeBanner() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-honey-soft bg-honey-soft/50 px-4 py-3 text-sm text-[#6b4710]">
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-honey" aria-hidden="true" />
      <p>
        <strong className="font-semibold">Test mode.</strong> Payments use Razorpay test keys — no real money is
        charged and orders are for testing only.
      </p>
    </div>
  );
}
