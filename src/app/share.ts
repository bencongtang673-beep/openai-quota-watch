// 分享码：内含完整题面数据与格式版本号（不是只存种子）。导入时重新求解、验证唯一性、重新评级。
import LZString from 'lz-string';
import { fingerprint } from '../engine/fingerprint';
import { getGeometry } from '../engine/geometry';
import { rate } from '../engine/human/solver';
import { buildModel, countSolutions } from '../engine/solver';
import { LEVEL_NAMES, MODE_NAMES, MODES, type Cage, type Mode, type PuzzleData } from '../engine/types';
import { validateRegions } from '../engine/validate';

export const SHARE_VERSION = 1;
const PREFIX = 'SDK1.';

interface ShareV1 {
  v: 1;
  m: Mode;
  g: string;
  r?: string;
  c?: [number[], number][];
}

export function encodeShare(p: PuzzleData): string {
  const payload: ShareV1 = { v: 1, m: p.mode, g: p.givens.join('') };
  if (p.regions) payload.r = p.regions.join('');
  if (p.cages) payload.c = p.cages.map((c) => [c.cells, c.sum]);
  return PREFIX + LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function shareText(p: PuzzleData): string {
  return `来挑战这道${MODE_NAMES[p.mode]}（${LEVEL_NAMES[p.level]}）！复制整段文字，打开“数独”App → 首页「导入题目」粘贴即可：\n${encodeShare(p)}`;
}

export class ShareError extends Error {}

/** 从任意文本中提取并解析分享码，返回经过完整验证的题目 */
export function decodeShare(text: string): PuzzleData {
  const m = text.match(/SDK(\d+)\.([A-Za-z0-9+\-$]+)/);
  if (!m) throw new ShareError('没有找到分享码（应以 SDK1. 开头）');
  if (m[1] !== '1') throw new ShareError(`分享码版本 ${m[1]} 太新，请先更新 App`);
  let payload: ShareV1;
  try {
    const json = LZString.decompressFromEncodedURIComponent(m[2]);
    if (!json) throw new Error('empty');
    payload = JSON.parse(json);
  } catch {
    throw new ShareError('分享码已损坏或不完整');
  }
  if (!payload || payload.v !== 1 || !MODES.includes(payload.m)) throw new ShareError('分享码格式不正确');
  const mode = payload.m;
  const size = mode === 'samurai' ? 369 : 81;
  if (typeof payload.g !== 'string' || payload.g.length !== size || !/^[0-9]+$/.test(payload.g))
    throw new ShareError('题面数据长度不对');
  const givens = payload.g.split('').map(Number);
  let regions: number[] | undefined;
  if (mode === 'jigsaw') {
    if (typeof payload.r !== 'string' || payload.r.length !== 81) throw new ShareError('缺少锯齿区域布局');
    regions = payload.r.split('').map(Number);
    if (validateRegions(regions).length) throw new ShareError('锯齿区域布局不合法');
  }
  let cages: Cage[] | undefined;
  if (mode === 'killer') {
    if (!Array.isArray(payload.c)) throw new ShareError('缺少杀手笼数据');
    cages = payload.c.map(([cells, sum]) => ({ cells: cells.map(Number), sum: Number(sum) }));
    const cover = new Array(81).fill(0);
    for (const cg of cages) for (const c of cg.cells) {
      if (!(c >= 0 && c < 81)) throw new ShareError('笼数据越界');
      cover[c]++;
    }
    if (cover.some((x) => x !== 1)) throw new ShareError('笼没有恰好覆盖全部格子');
  }
  const g = getGeometry(mode, regions);
  const r = countSolutions(buildModel(g, cages), givens, { limit: 2, nodeLimit: 2_000_000 });
  if (r.aborted) throw new ShareError('题目过于复杂，无法在手机上验证');
  if (r.count === 0) throw new ShareError('这道题无解');
  if (r.count > 1) throw new ShareError('这道题不唯一（有多个解）');
  const rating = rate(g, givens, cages);
  if (!rating.solved || !rating.level)
    throw new ShareError('这道题需要超出五档技巧的推理（猜测/试错），本 App 不支持');
  return {
    mode,
    regions,
    cages,
    givens,
    solution: r.solution!,
    level: rating.level,
    score: rating.score,
    fingerprint: fingerprint({ mode, givens, regions, cages }),
  };
}
