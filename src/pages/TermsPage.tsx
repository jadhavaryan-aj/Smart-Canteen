import { PageHeader } from '@/components/common/page-header';
import { Container } from '@/components/layout/container';
import { brand } from '@/config/brand';
import { usePageTitle } from '@/hooks/use-page-title';
import { useSettings } from '@/hooks/use-settings';

export default function TermsPage() {
  usePageTitle('Ordering terms');
  const settings = useSettings();
  const name = settings.data?.canteenName ?? brand.name;

  const sections = [
    {
      title: 'Placing an order',
      body: `Orders are accepted only during opening hours and while online ordering is open. An order is confirmed once your payment has been verified; until then it is not sent to the kitchen.`,
    },
    {
      title: 'Prices and payment',
      body: `Prices are shown in Indian rupees and include applicable taxes. The amount you pay is calculated by ${name}'s server from the current menu. Payments are processed by Razorpay; ${name} does not see or store your card, UPI or bank details.`,
    },
    {
      title: 'Collection',
      body: 'Collect your order from the pickup counter when its status is “Ready for pickup”, showing your order number or receipt QR code. Please collect promptly so food is served fresh.',
    },
    {
      title: 'Cancellations and refunds',
      body: `If an item becomes unavailable or the kitchen cannot fulfil an order, ${name} may cancel it and refund the payment to the original payment method. Refunds usually take 5–7 working days to appear. For other requests, please speak to the counter staff.`,
    },
    {
      title: 'Your information',
      body: 'We ask only for a name to call out at the counter (and, where the college requires it, an ID). This is used solely to prepare and hand over your order.',
    },
  ];

  return (
    <Container className="max-w-3xl py-10 sm:py-14">
      <PageHeader
        eyebrow="The small print"
        title="Ordering terms"
        description="Placeholder terms for this canteen ordering system. The canteen operator should review and replace them before going live."
      />
      <div className="mt-10 space-y-8">
        {sections.map((section, index) => (
          <section key={section.title} aria-labelledby={`terms-${index}`}>
            <h2 id={`terms-${index}`} className="font-display text-xl font-medium">
              {index + 1}. {section.title}
            </h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">{section.body}</p>
          </section>
        ))}
      </div>
    </Container>
  );
}
