'use client';

import { useParams } from 'next/navigation';
import { LocationEditor } from '@/components/admin/location-editor';

export default function EditLocationPage() {
  const { id } = useParams<{ id: string }>();
  return <LocationEditor key={id} id={id} />;
}
