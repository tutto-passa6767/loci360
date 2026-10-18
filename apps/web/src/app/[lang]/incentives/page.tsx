import type { Metadata } from 'next';
import { ContentPage, pageMetadata } from '@/components/content/content-page';
import type { Lang } from '@/lib/types';

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return pageMetadata((await params).lang as Lang, 'incentives', '/incentives');
}

export default async function IncentivesPage({ params }: Props) {
  const lang = (await params).lang as Lang;
  return <ContentPage lang={lang} slug="incentives" eyebrow={lang === 'ru' ? 'Господдержка' : 'State support'} />;
}
