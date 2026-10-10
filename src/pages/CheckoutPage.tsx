import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import { ArrowLeft, CircleAlert, CreditCard, LoaderCircle, Lock, ShieldCheck, ShoppingBag } from 'lucide-react';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { CartLineRow } from '@/components/cart/cart-line-row';
import { PaymentProgress } from '@/components/checkout/payment-progress';
import { TestModeBanner } from '@/components/checkout/test-mode-banner';
import { OrderingStatusBanner } from '@/components/common/ordering-status-banner';
import { PageHeader } from '@/components/common/page-header';
import { Price } from '@/components/common/price';
import { EmptyState, SetupRequired } from '@/components/common/states';
import { Container } from '@/components/layout/container';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useCartSync } from '@/hooks/use-cart-sync';
import { useCheckoutFlow } from '@/hooks/use-checkout-flow';
import { usePageTitle } from '@/hooks/use-page-title';
import { useSettings } from '@/hooks/use-settings';
import { toRequestLines } from '@/lib/cart/cart';
import { useCart } from '@/lib/cart/cart-store';
import { messageFor } from '@/lib/errors';
import { formatPaise } from '@/lib/money';
import { supabaseConfig } from '@/lib/supabase/env';
import { checkoutDetailsSchema, type CheckoutDetails } from '@/lib/validation/checkout';
import { fetchPaymentConfig, quoteCart } from '@/services/checkout';

const NAME_STORAGE_KEY = 'campus-table:customer-name';

function rememberedName(): string {
  try {
    return localStorage.getItem(NAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export default function CheckoutPage() {
  usePageTitle('Checkout');
  const { lines, totals } = useCart();
  const { unavailableLineIds } = useCartSync();
  const settings = useSettings();
  const canteenName = settings.data?.canteenName ?? 'Campus Table';
  const flow = useCheckoutFlow(canteenName);

  const paymentConfig = useQuery({
    queryKey: ['payment-config'],
    queryFn: fetchPaymentConfig,
    enabled: supabaseConfig.isConfigured,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const requestKey = useMemo(() => JSON.stringify(toRequestLines(lines)), [lines]);
  const quote = useQuery({
    queryKey: ['cart-quote', requestKey],
    queryFn: () => quoteCart(lines),
    enabled: supabaseConfig.isConfigured && lines.length > 0,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const schema = useMemo(
    () => checkoutDetailsSchema(settings.data?.studentIdMode ?? 'hidden', settings.data?.studentIdLabel ?? 'Student ID'),
    [settings.data?.studentIdMode, settings.data?.studentIdLabel],
  );
  const form = useForm<CheckoutDetails>({
    resolver: zodResolver(schema),
    defaultValues: { customerName: rememberedName(), studentIdentifier: '', acceptTerms: false },
    mode: 'onTouched',
  });

  if (!supabaseConfig.isConfigured) {
    return (
      <Container className="py-14">
        <SetupRequired />
      </Container>
    );
  }

  if (lines.length === 0) {
    return (
      <Container className="py-14">
        <EmptyState
          icon={ShoppingBag}
          title="Your tray is empty"
          description="Add a few dishes from the menu to check out."
          action={
            <Button asChild>
              <Link to="/menu">Browse the menu</Link>
            </Button>
          }
        />
      </Container>
    );
  }

  const status = quote.data?.orderingStatus ?? settings.data?.orderingStatus;
  const orderingOpen = status?.isOpen ?? false;
  const hasIssues = (quote.data?.issues.length ?? 0) > 0 || lines.some((line) => unavailableLineIds.has(line.lineId));
  const maxItems = settings.data?.maxItemsPerOrder ?? 30;
  const tooMany = totals.itemCount > maxItems;
  const paymentsReady = paymentConfig.data?.configured === true;
  const serverTotal = quote.data && !hasIssues ? quote.data.totalPaise : null;
  const priceDrift = serverTotal !== null && serverTotal !== totals.subtotalPaise;
  const busy = ['creating', 'paying', 'verifying', 'confirm_total'].includes(flow.phase.name);

  const canPay =
    orderingOpen && paymentsReady && !hasIssues && !tooMany && serverTotal !== null && !quote.isFetching && !busy;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      localStorage.setItem(NAME_STORAGE_KEY, values.customerName.trim());
    } catch {
      // ignore storage failures
    }
    await flow.startCheckout({
      lines,
      customerName: values.customerName,
      studentIdentifier: values.studentIdentifier,
      displayedTotalPaise: serverTotal,
    });
  });

  return (
    <Container className="py-10 sm:py-14">
      <Button asChild variant="ghost" size="sm" className="-ml-3 mb-4">
        <Link to="/menu">
          <ArrowLeft /> Back to menu
        </Link>
      </Button>
      <PageHeader eyebrow="Almost there" title="Checkout" />

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <form id="checkout-form" onSubmit={onSubmit} noValidate className="space-y-8">
          {paymentConfig.data?.mode === 'test' ? <TestModeBanner /> : null}
          {status ? <OrderingStatusBanner status={status} timeZone={settings.data?.timezone ?? 'Asia/Kolkata'} /> : null}

          <section aria-labelledby="review-heading" className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
            <div className="flex items-center justify-between">
              <h2 id="review-heading" className="text-lg font-semibold">
                Review your order
              </h2>
              <Button asChild variant="link" size="sm" className="px-0">
                <Link to="/menu">Add more</Link>
              </Button>
            </div>
            <ul className="mt-2 divide-y divide-border" aria-label="Items in your order">
              <AnimatePresence initial={false}>
                {lines.map((line) => (
                  <CartLineRow key={line.lineId} line={line} unavailable={unavailableLineIds.has(line.lineId)} />
                ))}
              </AnimatePresence>
            </ul>
            {quote.data && quote.data.issues.length > 0 ? (
              <Alert variant="destructive" className="mt-4">
                <CircleAlert />
                <AlertTitle>Some items can’t be ordered right now</AlertTitle>
                <AlertDescription>
                  {quote.data.issues
                    .map((issue) =>
                      issue.code === 'sold_out'
                        ? `${issue.name ?? 'An item'} is sold out`
                        : issue.code === 'option_unavailable'
                          ? `An option for ${issue.name ?? 'an item'} is unavailable`
                          : 'An item is no longer on the menu',
                    )
                    .join('. ')}
                  . Please remove {quote.data.issues.length === 1 ? 'it' : 'them'} to continue.
                </AlertDescription>
              </Alert>
            ) : null}
            {tooMany ? (
              <p role="alert" className="mt-4 text-sm font-semibold text-status-cancelled">
                A single order can contain at most {maxItems} items.
              </p>
            ) : null}
          </section>

          <section aria-labelledby="details-heading" className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
            <h2 id="details-heading" className="text-lg font-semibold">
              Your details
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We only need a name to call out at the counter. No account, phone number or email required.
            </p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field id="customerName" label="Name for pickup" error={form.formState.errors.customerName?.message}>
                {(props) => (
                  <Input {...props} autoComplete="given-name" placeholder="e.g. Priya" {...form.register('customerName')} />
                )}
              </Field>
              {settings.data && settings.data.studentIdMode !== 'hidden' ? (
                <Field
                  id="studentIdentifier"
                  label={settings.data.studentIdLabel}
                  optional={settings.data.studentIdMode === 'optional'}
                  error={form.formState.errors.studentIdentifier?.message}
                >
                  {(props) => <Input {...props} autoComplete="off" {...form.register('studentIdentifier')} />}
                </Field>
              ) : null}
            </div>
            <div className="mt-6 flex items-start gap-3">
              <Checkbox
                id="acceptTerms"
                checked={form.watch('acceptTerms')}
                onCheckedChange={(checked) => form.setValue('acceptTerms', checked === true, { shouldValidate: true })}
                aria-invalid={Boolean(form.formState.errors.acceptTerms)}
                aria-describedby={form.formState.errors.acceptTerms ? 'acceptTerms-error' : undefined}
                className="mt-0.5"
              />
              <div>
                <label htmlFor="acceptTerms" className="text-sm leading-relaxed">
                  I agree to the{' '}
                  <Link to="/terms" target="_blank" className="font-semibold text-primary underline-offset-4 hover:underline">
                    ordering terms
                  </Link>
                  , including collecting my order from the counter.
                </label>
                {form.formState.errors.acceptTerms ? (
                  <p id="acceptTerms-error" role="alert" className="mt-1 text-xs font-semibold text-destructive">
                    {form.formState.errors.acceptTerms.message}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        </form>

        <aside aria-labelledby="summary-heading" className="lg:sticky lg:top-28">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
            <h2 id="summary-heading" className="text-lg font-semibold">
              Order summary
            </h2>
            {quote.isPending ? (
              <div className="mt-4 space-y-3">
                <Skeleton className="h-4" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-8 w-1/2" />
              </div>
            ) : quote.isError ? (
              <Alert variant="destructive" className="mt-4">
                <CircleAlert />
                <AlertTitle>Couldn’t confirm prices</AlertTitle>
                <AlertDescription>
                  {messageFor(quote.error)}{' '}
                  <button type="button" className="font-semibold underline" onClick={() => void quote.refetch()}>
                    Retry
                  </button>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {quote.data.lines.map((line) => (
                    <li key={line.index} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">
                        <span className="tabular font-semibold text-foreground">{line.quantity} ×</span> {line.name}
                      </span>
                      <span className="tabular shrink-0">{formatPaise(line.lineTotalPaise)}</span>
                    </li>
                  ))}
                </ul>
                <Separator className="my-4" />
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">Total</span>
                  <Price paise={quote.data.totalPaise} className="font-display text-3xl font-medium" />
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {quote.isFetching ? (
                    <>
                      <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> Re-checking prices…
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="size-3.5 text-status-ready" aria-hidden="true" /> Prices confirmed by the
                      canteen’s server · taxes included
                    </>
                  )}
                </p>
                {priceDrift ? (
                  <p className="mt-2 text-xs font-semibold text-honey">
                    Some prices have been updated since you added items.
                  </p>
                ) : null}
              </>
            )}

            {paymentConfig.isError ? (
              <Alert variant="warning" className="mt-5">
                <CreditCard />
                <AlertTitle>Payments unavailable</AlertTitle>
                <AlertDescription>{messageFor(paymentConfig.error)}</AlertDescription>
              </Alert>
            ) : paymentConfig.data && !paymentConfig.data.configured ? (
              <Alert variant="warning" className="mt-5">
                <CreditCard />
                <AlertTitle>Online payments aren’t set up yet</AlertTitle>
                <AlertDescription>
                  Orders can’t be placed until the canteen connects its payment account. No payment has been taken.
                </AlertDescription>
              </Alert>
            ) : null}

            {flow.phase.name === 'error' ? (
              <Alert variant="destructive" className="mt-5">
                <CircleAlert />
                <AlertTitle>We couldn’t complete your order</AlertTitle>
                <AlertDescription>{flow.phase.message}</AlertDescription>
              </Alert>
            ) : null}
            {flow.phase.name === 'dismissed' ? (
              <Alert variant="info" className="mt-5">
                <CircleAlert />
                <AlertTitle>Payment not completed</AlertTitle>
                <AlertDescription>
                  You closed the payment window, so your order hasn’t been placed and you haven’t been charged. You can
                  try again.
                </AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" form="checkout-form" size="xl" className="mt-6 w-full" disabled={!canPay}>
              {busy ? (
                <>
                  <LoaderCircle className="animate-spin" /> Processing…
                </>
              ) : (
                <>
                  <Lock /> {serverTotal !== null ? `Pay ${formatPaise(serverTotal)}` : 'Pay now'}
                </>
              )}
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Secure payment by Razorpay. Your card or UPI details are never shared with the canteen.
            </p>
          </div>
        </aside>
      </div>

      <PaymentProgress phase={flow.phase} attemptError={flow.attemptError} onConfirmTotal={flow.resolveTotalConfirmation} />
    </Container>
  );
}
