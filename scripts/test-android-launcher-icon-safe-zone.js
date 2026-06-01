const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const colorsXml = fs.readFileSync(
  path.join(root, 'android', 'app', 'src', 'main', 'res', 'values', 'colors.xml'),
  'utf8',
);

function readPng(relativePath) {
  return PNG.sync.read(fs.readFileSync(path.join(root, relativePath)));
}

function alphaBbox(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const i = (y * png.width + x) * 4;
      if (png.data[i + 3] > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  assert(maxX >= 0 && maxY >= 0, 'PNG must contain visible alpha content.');
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function nonBackgroundBbox(png, background = { r: 11, g: 14, b: 18 }) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const i = (y * png.width + x) * 4;
      const delta =
        Math.abs(png.data[i] - background.r) +
        Math.abs(png.data[i + 1] - background.g) +
        Math.abs(png.data[i + 2] - background.b);
      if (delta > 24) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  assert(maxX >= 0 && maxY >= 0, 'Launcher icon must contain visible non-background artwork.');
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

assert.strictEqual(appJson.expo.icon, './assets/images/icon-safe.png');
assert.strictEqual(appJson.expo.android.adaptiveIcon.foregroundImage, './assets/images/adaptive-icon-foreground.png');
assert.strictEqual(appJson.expo.android.adaptiveIcon.backgroundColor, '#0B0E12');
assert(colorsXml.includes('<color name="iconBackground">#0B0E12</color>'), 'Android adaptive icon background must be ECS dark.');

const adaptiveForeground = readPng('assets/images/adaptive-icon-foreground.png');
const adaptiveForegroundBox = alphaBbox(adaptiveForeground);
assert.strictEqual(adaptiveForeground.width, 1024);
assert.strictEqual(adaptiveForeground.height, 1024);
assert(
  adaptiveForegroundBox.width <= 620 &&
    adaptiveForegroundBox.height <= 620 &&
    adaptiveForegroundBox.minX >= 190 &&
    adaptiveForegroundBox.minY >= 190,
  'Expo adaptive foreground must keep the ECS mark inside Android launcher safe-zone padding.',
);

const densities = [
  ['mipmap-mdpi', 48, 108],
  ['mipmap-hdpi', 72, 162],
  ['mipmap-xhdpi', 96, 216],
  ['mipmap-xxhdpi', 144, 324],
  ['mipmap-xxxhdpi', 192, 432],
];

for (const [folder, legacySize, foregroundSize] of densities) {
  const dir = path.join(root, 'android', 'app', 'src', 'main', 'res', folder);
  for (const fileName of ['ic_launcher.webp', 'ic_launcher_round.webp', 'ic_launcher_foreground.webp']) {
    assert(!fs.existsSync(path.join(dir, fileName)), `${fileName} should not keep the old edge-to-edge WebP launcher artwork.`);
  }

  const foreground = readPng(path.join('android', 'app', 'src', 'main', 'res', folder, 'ic_launcher_foreground.png'));
  const foregroundBox = alphaBbox(foreground);
  assert.strictEqual(foreground.width, foregroundSize);
  assert.strictEqual(foreground.height, foregroundSize);
  assert(
    foregroundBox.width <= Math.ceil(foregroundSize * 0.6) &&
      foregroundBox.height <= Math.ceil(foregroundSize * 0.6),
    `${folder} adaptive foreground must keep the ECS mark safely centered for Android masks.`,
  );

  const legacy = readPng(path.join('android', 'app', 'src', 'main', 'res', folder, 'ic_launcher.png'));
  const legacyBox = nonBackgroundBbox(legacy);
  assert.strictEqual(legacy.width, legacySize);
  assert.strictEqual(legacy.height, legacySize);
  assert(
    legacyBox.width <= Math.ceil(legacySize * 0.74) &&
      legacyBox.height <= Math.ceil(legacySize * 0.74) &&
      legacyBox.minX >= Math.floor(legacySize * 0.12) &&
      legacyBox.minY >= Math.floor(legacySize * 0.12),
    `${folder} legacy launcher icon must center the ECS mark inside a solid dark Android icon surface.`,
  );
}

console.log('Android launcher icon safe-zone checks passed.');
