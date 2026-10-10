import { HandPlatter, ShieldCheck, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';

import { Container } from '@/components/layout/container';

const STEPS: { title: string; body: string; icon: LucideIcon }[] = [
  {
    title: 'Choose your food',
    body: 'Browse today’s menu, customise your dish and add it to your tray. Sold-out items are marked clearly.',
    icon: UtensilsCrossed,
  },
  {
    title: 'Pay online',
    body: 'Pay securely with UPI, card or net banking. Your order reaches the kitchen only after the payment is verified.',
    icon: ShieldCheck,
  },
  {
    title: 'Collect your order',
    body: 'Track it live. When it says Ready, show your order number at the counter and enjoy.',
    icon: HandPlatter,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-24 py-16 sm:py-20">
      <Container>
        <div className="rounded-[2rem] bg-primary px-6 py-12 text-primary-foreground sm:px-12 sm:py-16">
          <p className="mb-2 text-xs font-bold tracking-[0.16em] text-sage-soft/80 uppercase">How it works</p>
          <h2 id="how-heading" className="max-w-xl font-display text-3xl font-medium sm:text-4xl">
            Three steps from craving to counter.
          </h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
            {STEPS.map((step, index) => (
              <motion.li
                key={step.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-6"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-5xl font-light text-sage-soft/70 tabular">
                    0{index + 1}
                  </span>
                  <step.icon className="size-6 text-sage-soft" strokeWidth={1.6} aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-primary-foreground/75">{step.body}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
