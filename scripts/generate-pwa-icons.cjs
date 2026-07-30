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

  // 192x192 icon
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));
  console.log('Generated icon-192.png');

  // 512x512 icon
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));
  console.log('Generated icon-512.png');

  // Apple touch icon (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // Maskable 192x192 (with 10% padding safe zone)
  await sharp(svgBuffer)
    .resize(154, 154)
    .extend({
      top: 19,
      bottom: 19,
      left: 19,
      right: 19,
      background: { r: 8, g: 12, b: 20, alpha: 1 } // #080c14 background
    })
    .png()
    .toFile(path.join(publicDir, 'icon-maskable-192.png'));
  console.log('Generated icon-maskable-192.png');

  // Maskable 512x512 (with 10% padding safe zone)
  await sharp(svgBuffer)
    .resize(410, 410)
    .extend({
      top: 51,
      bottom: 51,
      left: 51,
      right: 51,
      background: { r: 8, g: 12, b: 20, alpha: 1 } // #080c14 background
    })
    .png()
    .toFile(path.join(publicDir, 'icon-maskable-512.png'));
  console.log('Generated icon-maskable-512.png');

  // Favicon 32x32
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon-32x32.png'));
  console.log('Generated favicon-32x32.png');

  console.log('All PWA icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
