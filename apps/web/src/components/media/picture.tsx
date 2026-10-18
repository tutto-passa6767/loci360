import clsx from 'clsx';
import type { PublicImage } from '@/lib/types';

/**
 * Responsive image from the worker's WebP sizes. The blurred placeholder sits in the background
 * until the real image paints, so cards never flash empty.
 */
export function Picture({
  image,
  sizes = '100vw',
  className,
  priority = false,
  alt,
}: {
  image: PublicImage | null;
  sizes?: string;
  className?: string;
  priority?: boolean;
  alt?: string;
}) {
  if (!image) return <div className={clsx('topo', className)} aria-hidden="true" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.src}
      srcSet={image.srcSet}
      sizes={sizes}
      width={image.width}
      height={image.height}
      alt={alt ?? image.alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      fetchPriority={priority ? 'high' : 'auto'}
      className={clsx('object-cover', className)}
      style={{
        backgroundColor: image.color ?? '#0b0b0b',
        backgroundImage: image.blur ? `url(${image.blur})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    />
  );
}
