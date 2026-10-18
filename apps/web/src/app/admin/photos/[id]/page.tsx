'use client';

import { useParams } from 'next/navigation';
import { PhotoManager } from '@/components/admin/photo-manager';

export default function LocationPhotosPage() {
  const { id } = useParams<{ id: string }>();
  return <PhotoManager key={id} id={id} />;
}
