import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('index.html', 'utf8');
const robots = fs.readFileSync('public/robots.txt', 'utf8');
const sitemap = fs.readFileSync('public/sitemap.xml', 'utf8');
const data = JSON.parse(fs.readFileSync('scripts/seo-destinations.json', 'utf8'));
const generator = fs.readFileSync('scripts/generate-seo-pages.mjs', 'utf8');

for (const oldUrl of ['https://tripbalancing.app', 'http://tripbalancing.app']) {
  assert.doesNotMatch(index, new RegExp(oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `index.html must not publish the retired ${oldUrl} domain`);
  assert.doesNotMatch(robots, new RegExp(oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `robots.txt must not publish the retired ${oldUrl} domain`);
  assert.doesNotMatch(sitemap, new RegExp(oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `sitemap must not publish the retired ${oldUrl} domain`);
}

assert.match(index, /<link rel="canonical" href="https:\/\/www\.tripbalancing\.in\/"/);
assert.match(index, /"url": "https:\/\/www\.tripbalancing\.in\/"/);
assert.match(robots, /Sitemap: https:\/\/www\.tripbalancing\.in\/sitemap\.xml/);
assert.match(sitemap, /<loc>https:\/\/www\.tripbalancing\.in\//);
assert.match(generator, /TripBalancing to build a personalized trip/);
assert.match(generator, /should not silently replace it with another city/);
assert.equal(new Set(data.map((d) => d.slug)).size, data.length, 'SEO destination slugs must be unique');
for (const d of data) {
  assert.match(d.slug, /^[a-z0-9-]+$/);
  assert.ok(d.city && d.country && d.currency && d.highlights?.length >= 3, `SEO destination record is incomplete: ${d.slug}`);
}

console.log(`SEO regression passed: ${data.length} curated destination records use the production .in domain.`);
