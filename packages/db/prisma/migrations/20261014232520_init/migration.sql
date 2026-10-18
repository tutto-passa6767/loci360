-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('VIDEO', 'PHOTO', 'PANORAMA');

-- CreateEnum
CREATE TYPE "AssetState" AS ENUM ('UPLOADING', 'PENDING', 'RUNNING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TermKind" AS ENUM ('GENRE', 'LANDSCAPE', 'ERA', 'TAG');

-- CreateEnum
CREATE TYPE "HeavyAccess" AS ENUM ('FULL', 'LIMITED', 'OFFROAD', 'NONE');

-- CreateEnum
CREATE TYPE "Connectivity" AS ENUM ('NONE', 'G2', 'G3', 'G4', 'G5');

-- CreateEnum
CREATE TYPE "PowerSupply" AS ENUM ('GRID', 'NEARBY', 'GENERATOR');

-- CreateEnum
CREATE TYPE "DroneRule" AS ENUM ('ALLOWED', 'PERMIT', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "Season" AS ENUM ('SPRING', 'SUMMER', 'AUTUMN', 'WINTER');

-- CreateEnum
CREATE TYPE "MediaRole" AS ENUM ('SHOWREEL', 'BROLL', 'PHOTO', 'PANORAMA');

-- CreateEnum
CREATE TYPE "TimeOfDay" AS ENUM ('DAY', 'GOLDEN_HOUR', 'NIGHT');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'PROPOSAL', 'WON', 'LOST', 'SPAM');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('FEATURE', 'SERIES', 'COMMERCIAL', 'MUSIC_VIDEO', 'DOCUMENTARY', 'OTHER');

-- CreateEnum
CREATE TYPE "BudgetRange" AS ENUM ('UNDER_500K', 'FROM_500K_TO_2M', 'FROM_2M_TO_10M', 'OVER_10M', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "LeadNoteKind" AS ENUM ('NOTE', 'STATUS', 'ASSIGN');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('PRODUCTION_SERVICES', 'RENTAL', 'CATERING', 'CAST', 'TRANSPORT', 'ACCOMMODATION');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EDITOR',
    "totpSecret" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "title" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "originalKey" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "mime" TEXT,
    "uploadId" TEXT,
    "partSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" DOUBLE PRECISION,
    "credit" TEXT,
    "altEn" TEXT,
    "altRu" TEXT,
    "watermark" BOOLEAN NOT NULL DEFAULT true,
    "state" "AssetState" NOT NULL DEFAULT 'UPLOADING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "rev" INTEGER NOT NULL DEFAULT 0,
    "heartbeatAt" TIMESTAMP(3),
    "retryAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "meta" JSONB,
    "derived" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cluster" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "taglineEn" TEXT NOT NULL,
    "taglineRu" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "descriptionRu" TEXT,
    "coverAssetId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "zoom" DOUBLE PRECISION NOT NULL DEFAULT 6,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Term" (
    "id" TEXT NOT NULL,
    "kind" "TermKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelRu" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "nameEn" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "summaryEn" TEXT NOT NULL,
    "summaryRu" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "descriptionRu" TEXT NOT NULL DEFAULT '',
    "regionEn" TEXT,
    "regionRu" TEXT,
    "clusterId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "elevationM" INTEGER,
    "airportCode" TEXT,
    "airportNameEn" TEXT,
    "airportNameRu" TEXT,
    "airportKm" INTEGER,
    "driveHours" DOUBLE PRECISION,
    "railStationEn" TEXT,
    "railStationRu" TEXT,
    "railKm" INTEGER,
    "nearestTownEn" TEXT,
    "nearestTownRu" TEXT,
    "townKm" INTEGER,
    "heavyAccess" "HeavyAccess" NOT NULL DEFAULT 'LIMITED',
    "accessNotesEn" TEXT,
    "accessNotesRu" TEXT,
    "connectivity" "Connectivity" NOT NULL DEFAULT 'G4',
    "power" "PowerSupply" NOT NULL DEFAULT 'GENERATOR',
    "hotelsEn" TEXT,
    "hotelsRu" TEXT,
    "hotelKm" INTEGER,
    "nationalPark" BOOLEAN NOT NULL DEFAULT false,
    "borderZone" BOOLEAN NOT NULL DEFAULT false,
    "drone" "DroneRule" NOT NULL DEFAULT 'ALLOWED',
    "permitNotesEn" TEXT,
    "permitNotesRu" TEXT,
    "seasons" "Season"[],
    "climateEn" TEXT,
    "climateRu" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "coverAssetId" TEXT,
    "seoTitleEn" TEXT,
    "seoTitleRu" TEXT,
    "seoDescriptionEn" TEXT,
    "seoDescriptionRu" TEXT,
    "ogAssetId" TEXT,
    "searchText" TEXT NOT NULL DEFAULT '',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationTerm" (
    "locationId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,

    CONSTRAINT "LocationTerm_pkey" PRIMARY KEY ("locationId","termId")
);

-- CreateTable
CREATE TABLE "LocationMedia" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "role" "MediaRole" NOT NULL,
    "timeOfDay" "TimeOfDay",
    "labelEn" TEXT,
    "labelRu" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LocationMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeroReel" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelRu" TEXT NOT NULL,
    "assetId" TEXT,
    "genreSlug" TEXT,
    "locationSlug" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HeroReel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "phone" TEXT,
    "projectType" "ProjectType" NOT NULL,
    "budget" "BudgetRange" NOT NULL,
    "shootFrom" TIMESTAMP(3),
    "shootTo" TIMESTAMP(3),
    "message" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "sourcePath" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadLocation" (
    "leadId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "LeadLocation_pkey" PRIMARY KEY ("leadId","locationId")
);

-- CreateTable
CREATE TABLE "LeadNote" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" "LeadNoteKind" NOT NULL DEFAULT 'NOTE',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL,
    "cityEn" TEXT NOT NULL,
    "cityRu" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "descriptionRu" TEXT NOT NULL DEFAULT '',
    "website" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "logoAssetId" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleRu" TEXT NOT NULL,
    "leadEn" TEXT NOT NULL DEFAULT '',
    "leadRu" TEXT NOT NULL DEFAULT '',
    "bodyEn" TEXT NOT NULL DEFAULT '',
    "bodyRu" TEXT NOT NULL DEFAULT '',
    "seoTitleEn" TEXT,
    "seoTitleRu" TEXT,
    "seoDescriptionEn" TEXT,
    "seoDescriptionRu" TEXT,
    "ogAssetId" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_originalKey_key" ON "Asset"("originalKey");

-- CreateIndex
CREATE INDEX "Asset_state_retryAt_idx" ON "Asset"("state", "retryAt");

-- CreateIndex
CREATE INDEX "Asset_kind_createdAt_idx" ON "Asset"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Cluster_slug_key" ON "Cluster"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Term_kind_slug_key" ON "Term"("kind", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Location_slug_key" ON "Location"("slug");

-- CreateIndex
CREATE INDEX "Location_status_sort_idx" ON "Location"("status", "sort");

-- CreateIndex
CREATE INDEX "Location_clusterId_idx" ON "Location"("clusterId");

-- CreateIndex
CREATE INDEX "LocationTerm_termId_idx" ON "LocationTerm"("termId");

-- CreateIndex
CREATE INDEX "LocationMedia_locationId_role_sort_idx" ON "LocationMedia"("locationId", "role", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "LocationMedia_locationId_assetId_key" ON "LocationMedia"("locationId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "HeroReel_key_key" ON "HeroReel"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_number_key" ON "Lead"("number");

-- CreateIndex
CREATE INDEX "Lead_status_createdAt_idx" ON "Lead"("status", "createdAt");

-- CreateIndex
CREATE INDEX "LeadNote_leadId_createdAt_idx" ON "LeadNote"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceCompany_category_sort_idx" ON "ServiceCompany"("category", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_targetType_targetId_idx" ON "AuditEvent"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cluster" ADD CONSTRAINT "Cluster_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "Cluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_ogAssetId_fkey" FOREIGN KEY ("ogAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationTerm" ADD CONSTRAINT "LocationTerm_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationTerm" ADD CONSTRAINT "LocationTerm_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationMedia" ADD CONSTRAINT "LocationMedia_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationMedia" ADD CONSTRAINT "LocationMedia_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeroReel" ADD CONSTRAINT "HeroReel_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadLocation" ADD CONSTRAINT "LeadLocation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadLocation" ADD CONSTRAINT "LeadLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCompany" ADD CONSTRAINT "ServiceCompany_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_ogAssetId_fkey" FOREIGN KEY ("ogAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
