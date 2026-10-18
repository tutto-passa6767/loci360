import type { Metadata } from 'next';
import { ContentPage, pageMetadata } from '@/components/content/content-page';
import type { Lang } from '@/lib/types';

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return pageMetadata((await params).lang as Lang, 'permits', '/permits');
}

export default async function PermitsPage({ params }: Props) {
  const lang = (await params).lang as Lang;
  return <ContentPage lang={lang} slug="permits" eyebrow={lang === 'ru' ? 'Гид по производству' : 'Production guide'} />;
}
