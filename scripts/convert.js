import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure sharp is installed
try {
  await import('sharp');
} catch (e) {
  console.log('Installing sharp library for high-quality SVG rendering...');
  execSync('npm install --no-save sharp', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
}

const sharp = (await import('sharp')).default;
const svgPath = path.join(__dirname, '..', 'public', 'favicon.svg');
const publicDir = path.join(__dirname, '..', 'public');

async function convert() {
  console.log('Generating PWA icons from favicon.svg...');

  // Ensure public directory exists
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // 1. icon-192.png
  await sharp(svgPath)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));
  console.log('Generated icon-192.png');

  // 2. icon-512.png
  await sharp(svgPath)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));
  console.log('Generated icon-512.png');

  // 3. apple-touch-icon.png (180x180)
  await sharp(svgPath)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // For maskable icons, we need to add 15% padding around the SVG content
  // and place it on a solid background color matching the theme (#09090b).
  // 4. icon-192-maskable.png
  const size192 = 192;
  const pad192 = Math.round(size192 * 0.15);
  const contentSize192 = size192 - (pad192 * 2);
  const resizedSvg192 = await sharp(svgPath)
    .resize(contentSize192, contentSize192)
    .toBuffer();

  await sharp({
    create: {
      width: size192,
      height: size192,
      channels: 4,
      background: '#09090b'
    }
  })
    .composite([{ input: resizedSvg192, blend: 'over' }])
    .png()
    .toFile(path.join(publicDir, 'icon-192-maskable.png'));
  console.log('Generated icon-192-maskable.png');

  // 5. icon-512-maskable.png
  const size512 = 512;
  const pad512 = Math.round(size512 * 0.15);
  const contentSize512 = size512 - (pad512 * 2);
  const resizedSvg512 = await sharp(svgPath)
    .resize(contentSize512, contentSize512)
    .toBuffer();

  await sharp({
    create: {
      width: size512,
      height: size512,
      channels: 4,
      background: '#09090b'
    }
  })
    .composite([{ input: resizedSvg512, blend: 'over' }])
    .png()
    .toFile(path.join(publicDir, 'icon-512-maskable.png'));
  console.log('Generated icon-512-maskable.png');

  console.log('All PWA icons generated successfully.');
}

convert().catch(console.error);
