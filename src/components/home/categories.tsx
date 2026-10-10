import { ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';

import { categoryIcon } from '@/components/common/category-icon';
import { Container } from '@/components/layout/container';
import { Skeleton } from '@/components/ui/skeleton';
import { useMenu } from '@/hooks/use-menu';

export function CategoriesSection() {
  const menu = useMenu();
  if (menu.isError || (menu.data && menu.data.categories.length === 0)) return null;

  return (
    <section aria-labelledby="categories-heading" className="py-16 sm:py-20">
      <Container>
        <p className="mb-2 text-xs font-bold tracking-[0.16em] text-sage uppercase">
          Something for every break
        </p>
        <h2 id="categories-heading" className="mb-8 font-display text-3xl font-medium sm:text-4xl">
          Browse by category
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
          {menu.data
            ? menu.data.categories.map((category, index) => {
                const Icon = categoryIcon(category.slug);
                const count = menu.data.items.filter((item) => item.categoryId === category.id).length;
                return (
                  <motion.div
                    key={category.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.05 }}
                  >
                    <Link
                      to={`/menu?category=${category.slug}`}
                      className="group flex h-full flex-col justify-between gap-6 rounded-2xl border border-border bg-card p-5 shadow-soft transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-sage hover:shadow-lift"
                    >
                      <div className="flex items-start justify-between">
                        <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                          <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
                        </span>
                        <ArrowUpRight
                          className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                          aria-hidden="true"
                        />
                      </div>
                      <div>
                        <h3 className="font-display text-xl font-medium">{category.name}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {count} dish{count === 1 ? '' : 'es'}
                        </p>
                      </div>
                    </Link>
                  </motion.div>
                );
              })
            : Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-36 rounded-2xl" />)}
        </div>
      </Container>
    </section>
  );
}
