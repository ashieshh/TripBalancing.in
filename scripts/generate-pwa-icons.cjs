const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generateIcons() {
  const svgPath = path.join(__dirname, '../public/logo.svg');
  const publicDir = path.join(__dirname, '../public');

  if (!fs.existsSync(svgPath)) {
    console.error('logo.svg not found!');
    process.exit(1);
  }

  const svgBuffer = fs.readFileSync(svgPath);

  // 192x192 icon (centered with safe zone padding so it is never cut off)
  await sharp(svgBuffer)
    .resize(144, 144)
    .flatten({ background: { r: 8, g: 12, b: 20 } })
    .extend({
      top: 24,
      bottom: 24,
      left: 24,
      right: 24,
      background: { r: 8, g: 12, b: 20, alpha: 1 }
    })
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));
  console.log('Generated icon-192.png (192x192 with padding)');

  // 512x512 icon (centered with safe zone padding so it is never cut off)
  await sharp(svgBuffer)
    .resize(384, 384)
    .flatten({ background: { r: 8, g: 12, b: 20 } })
    .extend({
      top: 64,
      bottom: 64,
      left: 64,
      right: 64,
      background: { r: 8, g: 12, b: 20, alpha: 1 }
    })
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));
  console.log('Generated icon-512.png (512x512 with padding)');

  // Apple touch icon (180x180 centered with padding)
  await sharp(svgBuffer)
    .resize(136, 136)
    .flatten({ background: { r: 8, g: 12, b: 20 } })
    .extend({
      top: 22,
      bottom: 22,
      left: 22,
      right: 22,
      background: { r: 8, g: 12, b: 20, alpha: 1 }
    })
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // Maskable 192x192 (with safe zone padding)
  await sharp(svgBuffer)
    .resize(144, 144)
    .flatten({ background: { r: 8, g: 12, b: 20 } })
    .extend({
      top: 24,
      bottom: 24,
      left: 24,
      right: 24,
      background: { r: 8, g: 12, b: 20, alpha: 1 }
    })
    .png()
    .toFile(path.join(publicDir, 'icon-maskable-192.png'));
  console.log('Generated icon-maskable-192.png');

  // Maskable 512x512 (with safe zone padding)
  await sharp(svgBuffer)
    .resize(384, 384)
    .flatten({ background: { r: 8, g: 12, b: 20 } })
    .extend({
      top: 64,
      bottom: 64,
      left: 64,
      right: 64,
      background: { r: 8, g: 12, b: 20, alpha: 1 }
    })
    .png()
    .toFile(path.join(publicDir, 'icon-maskable-512.png'));
  console.log('Generated icon-maskable-512.png');

  // Favicon 32x32
  await sharp(svgBuffer)
    .resize(32, 32)
    .flatten({ background: { r: 8, g: 12, b: 20 } })
    .png()
    .toFile(path.join(publicDir, 'favicon-32x32.png'));
  console.log('Generated favicon-32x32.png');

  console.log('All PWA icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
