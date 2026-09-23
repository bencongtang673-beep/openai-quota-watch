// 用 Chromium 把 SVG 图标渲染为 PNG（一次性生成并提交到 public/icons）。
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

function svg(size, { maskable = false } = {}) {
  const pad = maskable ? size * 0.2 : size * 0.12;
  const inner = size - pad * 2;
  const r = maskable ? 0 : size * 0.22;
  const cell = inner / 3;
  const lines = [];
  for (let i = 1; i < 3; i++) {
    const p = pad + cell * i;
    lines.push(`<line x1="${p}" y1="${pad}" x2="${p}" y2="${pad + inner}" />`);
    lines.push(`<line x1="${pad}" y1="${p}" x2="${pad + inner}" y2="${p}" />`);
  }
  const digits = [
    [0, 0, '5', '#1F2430'], [1, 1, '9', '#2F5BC4'], [2, 2, '3', '#1F2430'],
    [2, 0, '7', '#1F2430'], [0, 2, '1', '#1F2430'],
  ].map(([c, rr, d, col]) =>
    `<text x="${pad + cell * c + cell / 2}" y="${pad + cell * rr + cell / 2}" fill="${col}" font-size="${cell * 0.62}" font-family="Inter, Helvetica, Arial" font-weight="700" text-anchor="middle" dominant-baseline="central">${d}</text>`,
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="#F5F0E6"/>
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${inner * 0.06}" fill="#FFFDF8" stroke="#3A3F4B" stroke-width="${size * 0.018}"/>
  <g stroke="#3A3F4B" stroke-width="${size * 0.008}">${lines.join('')}</g>
  <rect x="${pad + cell}" y="${pad + cell}" width="${cell}" height="${cell}" fill="#2F5BC4" fill-opacity="0.14"/>
  ${digits}
</svg>`;
}

mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }],
];
for (const [name, size, opt] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size, opt)}</body></html>`);
  const buf = await page.locator('svg').screenshot({ omitBackground: !opt.maskable });
  writeFileSync(`public/icons/${name}`, buf);
  console.log(name, buf.length);
}
await browser.close();
