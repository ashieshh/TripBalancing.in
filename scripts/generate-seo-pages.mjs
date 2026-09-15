import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const destinations = JSON.parse(fs.readFileSync(path.join(root, 'scripts/seo-destinations.json'), 'utf8'));
const site = 'https://www.tripbalancing.in';
const today = new Date().toISOString().slice(0, 10);

const escapeHtml = (value) => String(value).replace(/[&<>\"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]));
const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

for (const d of destinations) {
  const title = `AI Travel Planner for ${d.city}, ${d.country} | TripBalancing`;
  const description = `Plan a ${d.city} trip with TripBalancing: personalized itineraries, smart budget planning, destination guidance and travel cost balancing for ${d.country}.`;
  const url = `${site}/travel-guides/${d.slug}/`;
  const highlights = d.highlights.map(escapeHtml).join('</li><li>');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:site_name" content="TripBalancing">
<script type="application/ld+json">${JSON.stringify({
    '@context':'https://schema.org','@type':'TravelGuide',name:title,url,
    description, dateModified:today, inLanguage:'en',
    about:{'@type':'Place',name:`${d.city}, ${d.country}`},
    publisher:{'@type':'Organization',name:'TripBalancing',url:site}
  })}</script>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:900px;margin:0 auto;padding:32px 20px;line-height:1.65;color:#172033}a{color:#0f766e}main{padding:24px 0}li{margin:8px 0}.cta{display:inline-block;background:#0f766e;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700}</style>
</head>
<body><header><a href="${site}/">TripBalancing</a></header><main>
<p><a href="${site}/travel-guides/">Travel Guides</a> / ${escapeHtml(d.city)}</p>
<h1>${escapeHtml(d.city)}, ${escapeHtml(d.country)} Travel Guide</h1>
<p>Use TripBalancing to build a personalized trip to <strong>${escapeHtml(d.city)}, ${escapeHtml(d.country)}</strong> around your dates, traveler type, travel style and budget. The planner can organize a day-by-day itinerary and help balance the major trip costs.</p>
<h2>Top places to consider</h2><ul><li>${highlights}</li></ul>
<h2>Who is this destination good for?</h2><p>${escapeHtml(d.city)} can work especially well for ${escapeHtml(d.bestFor)}. Choose the travel style that matches your priorities instead of using a one-size-fits-all itinerary.</p>
<h2>Budget planning</h2><p>The local currency is <strong>${escapeHtml(d.currency)}</strong>. Actual airfare, hotel rates, attraction prices, exchange rates and availability can change, so TripBalancing planning figures should be treated as estimates until you confirm a live booking or official source.</p>
<h2>Build your personalized ${escapeHtml(d.city)} itinerary</h2><p>Enter your origin, dates, travelers and budget in TripBalancing to generate a destination-specific plan. If a location cannot be verified, the planner should not silently replace it with another city.</p>
<p><a class="cta" href="${site}/planner">Plan ${escapeHtml(d.city)} with TripBalancing</a></p>
</main><footer><small>Last updated ${today}. Travel information and prices should be independently confirmed before booking.</small></footer></body></html>`;
  const outDir = path.join(root, 'public', 'travel-guides', slug(d.slug));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
}

const staticUrls = [
  ['', 'daily', '1.0'], ['/planner', 'weekly', '0.9'], ['/explore', 'daily', '0.8'], ['/currency-converter', 'weekly', '0.7'],
  ...destinations.map((d) => [`/travel-guides/${d.slug}/`, 'weekly', '0.7'])
];
const entries = staticUrls.map(([url, freq, priority]) => `  <url><loc>${site}${url}</loc><lastmod>${today}</lastmod><changefreq>${freq}</changefreq><priority>${priority}</priority></url>`).join('\n');
fs.writeFileSync(path.join(root, 'public', 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`);
console.log(`Generated ${destinations.length} destination SEO pages and sitemap entries.`);
