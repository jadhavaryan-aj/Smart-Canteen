import { CategoriesSection } from '@/components/home/categories';
import { FeaturedItems } from '@/components/home/featured';
import { Hero } from '@/components/home/hero';
import { HoursSection } from '@/components/home/hours-section';
import { HowItWorks } from '@/components/home/how-it-works';
import { usePageTitle } from '@/hooks/use-page-title';

export default function HomePage() {
  usePageTitle(null);
  return (
    <>
      <Hero />
      <FeaturedItems />
      <CategoriesSection />
      <HowItWorks />
      <HoursSection />
    </>
  );
}
