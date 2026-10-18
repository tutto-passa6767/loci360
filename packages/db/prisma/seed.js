'use strict';
// Creates the taxonomy, clusters, demo locations, editorial pages and default settings.
// Safe to run on every deploy: it only inserts what is missing and never overwrites CMS edits.
const { PrismaClient } = require('@prisma/client');
const { terms, clusters, locations, heroReels, highlights } = require('./seed-data');
const { pages, services } = require('./seed-pages');

const prisma = new PrismaClient();

/** Same as buildSearchText in apps/api/src/public/catalogue.service.ts */
function searchText(loc, termRows, cluster) {
  return [
    loc.nameEn,
    loc.nameRu,
    loc.summaryEn,
    loc.summaryRu,
    loc.regionEn,
    loc.regionRu,
    loc.nearestTownEn,
    loc.nearestTownRu,
    cluster && cluster.nameEn,
    cluster && cluster.nameRu,
    ...termRows.flatMap((t) => [t.labelEn, t.labelRu, t.slug.replace(/-/g, ' ')]),
  ]
    .filter(Boolean)
    .join(' · ')
    .toLowerCase();
}

async function main() {
  const counts = { terms: 0, clusters: 0, locations: 0, pages: 0, services: 0 };

  for (const [kind, list] of Object.entries(terms)) {
    for (const [i, [slug, labelEn, labelRu]] of list.entries()) {
      const exists = await prisma.term.findUnique({ where: { kind_slug: { kind, slug } } });
      if (exists) continue;
      await prisma.term.create({ data: { kind, slug, labelEn, labelRu, sort: i } });
      counts.terms++;
    }
  }

  for (const c of clusters) {
    if (await prisma.cluster.findUnique({ where: { slug: c.slug } })) continue;
    await prisma.cluster.create({ data: c });
    counts.clusters++;
  }

  const allTerms = await prisma.term.findMany();
  const allClusters = await prisma.cluster.findMany();
  // Each demo location is created once: the seed remembers what it has created, so a location the team
  // deleted or renamed never comes back, while locations added to seed-data later reach existing catalogues
  const seeded = await prisma.setting.findUnique({ where: { key: 'seed.locations' } });
  const done = new Set(
    seeded ? seeded.value.slugs : (await prisma.location.findMany({ select: { slug: true } })).map((l) => l.slug),
  );
  for (const [sort, l] of locations.entries()) {
    if (done.has(l.slug)) continue;
    done.add(l.slug);
    if (await prisma.location.findUnique({ where: { slug: l.slug } })) continue;
    const { terms: slugs, cluster: clusterSlug, ...data } = l;
    const cluster = clusterSlug ? allClusters.find((c) => c.slug === clusterSlug) : null;
    const termRows = slugs.map((s) => {
      const t = allTerms.find((x) => x.slug === s);
      if (!t) throw new Error(`Unknown term ${s} in ${l.slug}`);
      return t;
    });
    await prisma.location.create({
      data: {
        ...data,
        sort,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        clusterId: cluster ? cluster.id : null,
        searchText: searchText(data, termRows, cluster),
        terms: { create: termRows.map((t) => ({ termId: t.id })) },
      },
    });
    counts.locations++;
  }
  await prisma.setting.upsert({
    where: { key: 'seed.locations' },
    create: { key: 'seed.locations', value: { slugs: [...done] } },
    update: { value: { slugs: [...done] } },
  });

  if ((await prisma.heroReel.count()) === 0) {
    await prisma.heroReel.createMany({ data: heroReels.map((h, sort) => ({ ...h, sort })) });
  }

  for (const p of pages) {
    if (await prisma.page.findUnique({ where: { slug: p.slug } })) continue;
    await prisma.page.create({ data: p });
    counts.pages++;
  }

  if ((await prisma.serviceCompany.count()) === 0) {
    await prisma.serviceCompany.createMany({ data: services });
    counts.services = services.length;
  }

  if (!(await prisma.setting.findUnique({ where: { key: 'home' } }))) {
    await prisma.setting.create({ data: { key: 'home', value: { highlights } } });
  }

  console.log(`seed: +${counts.terms} terms, +${counts.clusters} clusters, +${counts.locations} locations, +${counts.pages} pages, +${counts.services} companies`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
