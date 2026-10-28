#!/usr/bin/env node
/**
 * Generates the extension icons (16/32/48/128) from assets/logo.png.
 * The logo is an opaque rounded square on a white background; the white outside the square is made transparent
 * (flood fill from the edges, with the anti-aliased rim converted to partial alpha) so the icon sits cleanly on any
 * toolbar colour. Downscaling is an area average in premultiplied alpha.
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.join(__dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'assets', 'logo.png')));
const W = src.width;
const H = src.height;
const px = (x, y) => (W * y + x) << 2;
const isWhite = (i) => src.data[i] > 235 && src.data[i + 1] > 235 && src.data[i + 2] > 235;

// Flood fill white pixels connected to the image border -> transparent.
const outside = new Uint8Array(W * H);
const stack = [];
for (let x = 0; x < W; x++) stack.push([x, 0], [x, H - 1]);
for (let y = 0; y < H; y++) stack.push([0, y], [W - 1, y]);
while (stack.length) {
  const [x, y] = stack.pop();
  if (x < 0 || y < 0 || x >= W || y >= H || outside[W * y + x] || !isWhite(px(x, y))) continue;
  outside[W * y + x] = 1;
  stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}

// Logo blue, sampled from the middle of the left margin (solid background colour).
const bi = px(60, Math.floor(H / 2));
const bg = [src.data[bi], src.data[bi + 1], src.data[bi + 2]];

// Premultiplied RGBA float buffer.
const buf = new Float32Array(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = px(x, y);
    const o = (W * y + x) * 4;
    let a = 1;
    let r = src.data[i];
    let g = src.data[i + 1];
    let b = src.data[i + 2];
    if (outside[W * y + x]) {
      a = 0;
    } else {
      // Rim pixel: blends the blue with the white that was outside; recover its coverage from the red channel.
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && outside[W * ny + nx]) {
            near = true;
            break;
          }
        }
      if (near) {
        a = Math.min(1, Math.max(0, (255 - r) / (255 - bg[0])));
        r = bg[0];
        g = bg[1];
        b = bg[2];
      }
    }
    buf[o] = (r / 255) * a;
    buf[o + 1] = (g / 255) * a;
    buf[o + 2] = (b / 255) * a;
    buf[o + 3] = a;
  }
}

function resize(size) {
  const out = new PNG({ width: size, height: size });
  const s = W / size;
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      const y0 = ty * s, y1 = (ty + 1) * s, x0 = tx * s, x1 = (tx + 1) * s;
      for (let y = Math.floor(y0); y < Math.min(H, Math.ceil(y1)); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.min(W, Math.ceil(x1)); x++) {
          const w = wy * (Math.min(x + 1, x1) - Math.max(x, x0));
          const o = (W * y + x) * 4;
          r += buf[o] * w; g += buf[o + 1] * w; b += buf[o + 2] * w; a += buf[o + 3] * w;
          wsum += w;
        }
      }
      const o = (size * ty + tx) << 2;
      const A = a / wsum;
      out.data[o] = A > 0 ? Math.round((r / wsum / A) * 255) : 0;
      out.data[o + 1] = A > 0 ? Math.round((g / wsum / A) * 255) : 0;
      out.data[o + 2] = A > 0 ? Math.round((b / wsum / A) * 255) : 0;
      out.data[o + 3] = Math.round(A * 255);
    }
  }
  return PNG.sync.write(out);
}

const iconsDir = path.join(root, 'chrome-extension', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });
for (const size of [16, 32, 48, 128]) fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), resize(size));
console.log('Icons generated in chrome-extension/icons/ from assets/logo.png');
