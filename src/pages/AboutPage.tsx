import { ArrowRight, MapPin } from 'lucide-react';
import { Link } from 'react-router';

import { FoodImage } from '@/components/common/food-image';
import { OpeningHoursTable } from '@/components/common/opening-hours';
import { PageHeader } from '@/components/common/page-header';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { brand } from '@/config/brand';
import { usePageTitle } from '@/hooks/use-page-title';
import { useSettings } from '@/hooks/use-settings';

const FAQ = [
  {
    q: 'Do I need an account?',
    a: 'No. Just add food to your tray, enter a name we can call out, and pay. Your orders are linked to this device so you can track them under My Orders.',
  },
  {
    q: 'When does the kitchen start my order?',
    a: 'Only after your payment has been verified. Orders that are not paid never reach the kitchen, so there is no risk of being charged for food that was not prepared.',
  },
  {
    q: 'How do I collect my order?',
    a: 'Watch the status on your receipt. When it says “Ready for pickup”, show your order number (or the QR code on the receipt) at the counter.',
  },
  {
    q: 'My payment went through but the order still says pending.',
    a: 'Occasionally the bank takes a moment to confirm. The page updates automatically. If a payment is taken but the order cannot be confirmed, it is refunded.',
  },
  {
    q: 'Can I cancel or get a refund?',
    a: 'Please speak to the counter staff. If the canteen cancels an order, the payment is refunded to the original payment method, usually within 5–7 working days.',
  },
  {
    q: 'Is my payment information safe?',
    a: 'Payments are handled by Razorpay. The canteen never sees or stores your card, UPI or bank details.',
  },
];

export default function AboutPage() {
  usePageTitle('About');
  const settings = useSettings();
  const name = settings.data?.canteenName ?? brand.name;

  return (
    <Container className="py-10 sm:py-14">
      <PageHeader eyebrow="About us" title={`Welcome to ${name}`} />
      <div className="mt-10 grid items-start gap-10 lg:grid-cols-2">
        <div className="space-y-5 text-[1.02rem] leading-relaxed text-muted-foreground">
          <p>
            {name} is the campus canteen — fresh breakfasts, hearty lunches, quick snacks and plenty of chai,
            cooked in our kitchen every day.
          </p>
          <p>
            Online ordering lets you skip the till: choose your food from anywhere on campus, pay in a few
            taps, and collect it from the pickup counter when it’s ready. It’s quicker for you and calmer for
            the kitchen at rush hour.
          </p>
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <MapPin className="size-4 text-sage" aria-hidden="true" /> {brand.location}
          </p>
          <Button asChild size="lg" className="mt-2">
            <Link to="/menu">
              See today’s menu <ArrowRight />
            </Link>
          </Button>
        </div>
        <FoodImage
          src={brand.images.about}
          alt="The canteen counter"
          hint="meal"
          className="aspect-[4/3] w-full rounded-3xl shadow-lift"
        />
      </div>

      <div className="mt-16 grid items-start gap-10 lg:grid-cols-[1fr_1.2fr]">
        <section
          aria-labelledby="hours-heading"
          className="rounded-2xl border border-border bg-card p-6 shadow-soft sm:p-8"
        >
          <h2 id="hours-heading" className="font-display text-2xl font-medium">
            Opening hours
          </h2>
          {settings.data ? (
            <OpeningHoursTable
              hours={settings.data.openingHours}
              timeZone={settings.data.timezone}
              className="mt-4"
            />
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Hours will appear here once the site is connected.
            </p>
          )}
          {settings.data?.pickupInstructions ? (
            <p className="mt-6 rounded-xl bg-secondary p-4 text-sm text-secondary-foreground">
              {settings.data.pickupInstructions}
            </p>
          ) : null}
        </section>

        <section aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="font-display text-2xl font-medium">
            Frequently asked questions
          </h2>
          <div className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card shadow-soft">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group px-5 py-4 sm:px-6 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="text-xl text-muted-foreground transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </Container>
  );
}
