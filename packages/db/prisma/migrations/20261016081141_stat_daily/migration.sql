-- CreateTable
CREATE TABLE "StatDaily" (
    "day" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StatDaily_pkey" PRIMARY KEY ("day","metric","key")
);

-- CreateIndex
CREATE INDEX "StatDaily_metric_day_idx" ON "StatDaily"("metric", "day");
