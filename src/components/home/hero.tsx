import { ArrowRight, CircleCheckBig, Smartphone, Timer } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';

import { FoodImage } from '@/components/common/food-image';
import { OpenStatusPill } from '@/components/common/open-status-pill';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { brand } from '@/config/brand';
import { useSettings } from '@/hooks/use-settings';

const ease = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  const settings = useSettings();

  return (
    <section className="bg-grain relative overflow-hidden">
      <Container className="grid items-center gap-12 pt-10 pb-16 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-20 lg:pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
        >
          {settings.data ? (
            <OpenStatusPill settings={settings.data} className="mb-6" />
          ) : (
            <span className="mb-6 inline-flex rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-semibold">
              Campus canteen · Order ahead
            </span>
          )}
          <h1 className="font-display text-[2.9rem] leading-[1.02] font-medium tracking-tight text-balance sm:text-6xl lg:text-[4.4rem]">
            Good food.
            <br />
            <span className="text-primary italic">Less waiting.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
            Order and pay online from anywhere on campus, then collect your food from the counter when it’s
            ready. No queue at the till, no guessing.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/menu">
                Browse the menu <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how-it-works">How it works</a>
            </Button>
          </div>
          <ul className="mt-10 grid max-w-lg grid-cols-1 gap-3 text-sm text-muted-foreground sm:grid-cols-3">
            {[
              { icon: Smartphone, text: 'Pay with UPI or card' },
              { icon: Timer, text: 'Skip the till queue' },
              { icon: CircleCheckBig, text: 'Collect when ready' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2">
                <Icon className="size-4 text-sage" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease, delay: 0.1 }}
          className="relative mx-auto w-full max-w-xl"
        >
          <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] shadow-lift ring-1 ring-black/5 sm:aspect-[5/5] lg:aspect-[4/5]">
            <FoodImage
              src={brand.images.hero}
              alt="A table of freshly prepared canteen dishes"
              hint="meal"
              priority
              className="h-full w-full"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.5 }}
            className="absolute -bottom-6 left-4 w-[15.5rem] rounded-2xl border border-border bg-card/95 p-4 shadow-lift backdrop-blur sm:-left-8"
            aria-hidden="true"
          >
            <p className="text-[0.68rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">
              Your order
            </p>
            <p className="tabular mt-1 font-display text-2xl font-medium">CT-0042</p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-status-ready-soft px-2.5 py-1 text-xs font-semibold text-status-ready">
              <span className="size-1.5 rounded-full bg-status-ready" /> Ready for pickup
            </span>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}
