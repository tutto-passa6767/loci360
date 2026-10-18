-- CreateTable
CREATE TABLE "PanoramaEmbed" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "src" TEXT NOT NULL,
    "labelEn" TEXT,
    "labelRu" TEXT,
    "credit" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PanoramaEmbed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PanoramaEmbed_locationId_sort_idx" ON "PanoramaEmbed"("locationId", "sort");

-- AddForeignKey
ALTER TABLE "PanoramaEmbed" ADD CONSTRAINT "PanoramaEmbed_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
