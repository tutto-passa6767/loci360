'use client';

import { useState } from 'react';
import { AssetBrowser, AssetDialog } from '@/components/admin/assets';
import { PageHeader } from '@/components/admin/ui';
import { Uploader } from '@/components/admin/uploader';

export default function MediaPage() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <PageHeader
        title="Медиатека"
        subtitle="Мастер-файлы хранятся в оригинале. Обработчик делает HLS 4K / 1080p / 720p с водяным знаком, превью и размеры фото — затем файл можно привязать к локации."
      />
      <div className="mb-8">
        <Uploader />
      </div>
      <AssetBrowser onOpen={(a) => setOpen(a.id)} />
      <AssetDialog id={open} onClose={() => setOpen(null)} />
    </div>
  );
}
