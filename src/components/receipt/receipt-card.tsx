import { QRCodeSVG } from 'qrcode.react';

import { PaymentStatusBadge } from '@/components/common/status-badge';
import { VegIndicator } from '@/components/common/veg-indicator';
import { BrandMonogram } from '@/components/layout/brand-mark';
import { formatDateTime } from '@/lib/dates';
import { formatPaise } from '@/lib/money';
import type { OrderReceipt } from '@/types/domain';

import { StatusTracker } from './status-tracker';

const METHOD_LABELS: Record<string, string> = {
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Net banking',
  wallet: 'Wallet',
  emi: 'EMI',
};

/** Splits "CT-20261010-0042" so the short pickup number can be emphasised. */
function splitOrderNumber(orderNumber: string): { prefix: string; short: string } {
  const index = orderNumber.lastIndexOf('-');
  return index > 0
    ? { prefix: orderNumber.slice(0, index + 1), short: orderNumber.slice(index + 1) }
    : { prefix: '', short: orderNumber };
}

export function ReceiptCard({ receipt, timeZone }: { receipt: OrderReceipt; timeZone?: string }) {
  const { prefix, short } = splitOrderNumber(receipt.orderNumber);
  const paid = receipt.payment !== null;

  return (
    <article
      aria-label={`Receipt for order ${receipt.orderNumber}`}
      className="print-surface overflow-hidden rounded-3xl border border-border bg-card shadow-lift"
    >
      <header className="flex items-center justify-between gap-4 bg-primary px-6 py-5 text-primary-foreground sm:px-8">
        <div className="flex items-center gap-3">
          <BrandMonogram className="bg-primary-foreground text-primary" />
          <div>
            <p className="font-display text-xl leading-tight">{receipt.canteen.name}</p>
            <p className="text-xs text-primary-foreground/75">Digital receipt</p>
          </div>
        </div>
        <PaymentStatusBadge status={receipt.paymentStatus} className="bg-primary-foreground/95" />
      </header>

      <div className="border-b border-dashed border-border px-6 py-7 text-center sm:px-8">
        <p className="text-[0.7rem] font-bold tracking-[0.18em] text-muted-foreground uppercase">Order number</p>
        <p className="mt-1 font-display leading-none font-medium" aria-label={receipt.orderNumber}>
          <span className="tabular text-xl text-muted-foreground sm:text-2xl">{prefix}</span>
          <span className="tabular text-5xl text-primary sm:text-6xl">{short}</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">Show this number at the pickup counter.</p>
      </div>

      {receipt.status !== 'cancelled' && receipt.status !== 'payment_pending' ? (
        <div className="border-b border-dashed border-border">
          <StatusTracker status={receipt.status} timeline={receipt.timeline} timeZone={timeZone} />
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-dashed border-border px-6 py-6 text-sm sm:px-8">
        <div>
          <dt className="text-xs text-muted-foreground">Ordered</dt>
          <dd className="mt-0.5 font-medium">{formatDateTime(receipt.createdAt, timeZone)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Name</dt>
          <dd className="mt-0.5 font-medium">{receipt.customerName}</dd>
        </div>
        {receipt.studentIdentifier ? (
          <div>
            <dt className="text-xs text-muted-foreground">ID</dt>
            <dd className="mt-0.5 font-medium">{receipt.studentIdentifier}</dd>
          </div>
        ) : null}
        {paid ? (
          <>
            <div>
              <dt className="text-xs text-muted-foreground">Paid</dt>
              <dd className="mt-0.5 font-medium">
                {formatDateTime(receipt.paidAt, timeZone)}
                {receipt.payment?.method ? ` · ${METHOD_LABELS[receipt.payment.method] ?? receipt.payment.method}` : ''}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Payment reference</dt>
              <dd className="tabular mt-0.5 font-mono text-[0.8rem] break-all">{receipt.payment?.providerPaymentId}</dd>
            </div>
          </>
        ) : null}
      </dl>

      <div className="px-6 py-6 sm:px-8">
        <table className="w-full text-sm">
          <caption className="sr-only">Items purchased</caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="pb-2 font-semibold">
                Item
              </th>
              <th scope="col" className="pb-2 text-center font-semibold">
                Qty
              </th>
              <th scope="col" className="pb-2 text-right font-semibold">
                Price
              </th>
              <th scope="col" className="pb-2 text-right font-semibold">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {receipt.lines.map((line, index) => (
              <tr key={index} className="align-top">
                <td className="py-3 pr-2">
                  <span className="flex items-center gap-2 font-medium">
                    <VegIndicator vegetarian={line.isVegetarian} className="size-3.5" />
                    {line.name}
                  </span>
                  {line.customizations.length > 0 ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {line.customizations.map((c) => c.name).join(' · ')}
                    </span>
                  ) : null}
                  {line.note ? <span className="mt-0.5 block text-xs text-muted-foreground italic">“{line.note}”</span> : null}
                </td>
                <td className="tabular py-3 text-center">{line.quantity}</td>
                <td className="tabular py-3 text-right text-muted-foreground">{formatPaise(line.unitPricePaise)}</td>
                <td className="tabular py-3 text-right font-medium">{formatPaise(line.lineTotalPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular">{formatPaise(receipt.subtotalPaise)}</dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="font-semibold">{paid ? 'Total paid' : 'Total'}</dt>
            <dd className="tabular font-display text-2xl font-medium">{formatPaise(receipt.totalPaise)}</dd>
          </div>
          {receipt.amountRefundedPaise > 0 ? (
            <div className="flex justify-between text-status-cancelled">
              <dt>Refunded</dt>
              <dd className="tabular">−{formatPaise(receipt.amountRefundedPaise)}</dd>
            </div>
          ) : null}
          <p className="pt-1 text-xs text-muted-foreground">All prices include applicable taxes.</p>
        </dl>
      </div>

      <footer className="flex items-center gap-5 border-t border-dashed border-border bg-muted/40 px-6 py-5 sm:px-8">
        <div className="rounded-xl bg-white p-2 shadow-soft">
          <QRCodeSVG value={receipt.orderNumber} size={88} level="M" title={`Order ${receipt.orderNumber}`} />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {receipt.canteen.pickupInstructions ??
            'Show your order number at the pickup counter when your order is ready.'}{' '}
          The QR code contains only your order number.
        </p>
      </footer>
    </article>
  );
}
