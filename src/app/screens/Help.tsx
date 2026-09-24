// 游玩说明：基础规则、触控操作、查错与提示、各模式规则（真实渲染器画的正确/违规示例）、
// 难度说明、技巧教程（真实盘面 + 高亮演示）、杀手组合速查表（程序枚举）、安装与备份指引。
import { useMemo, useState } from 'preact/hooks';
import { DIGITS } from '../../engine/bits';
import { COMBOS } from '../../engine/combos';
import { randomJigsawLayout } from '../../engine/generate';
import { getGeometry, type Geometry } from '../../engine/geometry';
import { TECHS, type Step, type TechId } from '../../engine/human/state';
import { generateCages } from '../../engine/killer-gen';
import { createRng } from '../../engine/rng';
import { buildModel, randomSolution } from '../../engine/solver';
import { LEVEL_NAMES, LEVELS, MODE_NAMES, MODES, type Cage, type Mode } from '../../engine/types';
import { Board, type BoardMarks } from '../components/Board';
import { FullPage, Sheet } from '../components/ui';
import { AddIcon, ShareIcon } from '../icons';
import { availableLevels, modeAvailable } from '../levels';
import { useApp, type Layer } from '../store';
import examplesJson from '../help/examples.json';
import { KILLER_LEVEL_EXTRA, LEVEL_TECH_SUMMARY, MODE_RULES, PROBED_ONLY, TECH_DEFS } from './help-data';

interface Example {
  tech: TechId;
  mode: Mode;
  regions?: number[];
  cages?: Cage[];
  givens: number[];
  values: number[];
  cand: number[];
  step: Step;
}
const EXAMPLES = examplesJson as unknown as Record<string, Example>;

type Section = 'basic' | 'modes' | 'levels' | 'techs' | 'combos' | 'install';

export function HelpLayer({ layer }: { layer: Extract<Layer, { type: 'help' }> }) {
  const killer = modeAvailable('killer');
  const [sec, setSec] = useState<Section>((layer.section as Section) ?? 'basic');
  const tabs: [Section, string][] = [
    ['basic', '基础与操作'],
    ['modes', '模式规则'],
    ['levels', '难度'],
    ['techs', '技巧教程'],
    ...(killer ? ([['combos', '杀手速查表']] as [Section, string][]) : []),
    ['install', '安装与备份'],
  ];
  return (
    <FullPage title="游玩说明" testId="help">
      <div class="chips" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={sec === k} class={`chip ${sec === k ? 'on' : ''}`} onClick={() => setSec(k)} data-testid={`help-tab-${k}`}>
            {label}
          </button>
        ))}
      </div>
      {sec === 'basic' && <BasicSection />}
      {sec === 'modes' && MODES.filter(modeAvailable).map((m) => <ModeRules key={m} mode={m} />)}
      {sec === 'levels' && <LevelsSection />}
      {sec === 'techs' && <TechSection />}
      {sec === 'combos' && <ComboTable />}
      {sec === 'install' && <InstallGuide />}
    </FullPage>
  );
}

function BasicSection() {
  return (
    <>
      <section class="card">
        <h2>基础规则</h2>
        <p>在空格中填入 1–9，使每个单元（行、列、宫，以及各模式额外的单元）都恰好包含 1–9 各一次。每道题都只有唯一答案，而且都能靠逻辑推理解出，不需要猜。</p>
      </section>
      <section class="card">
        <h2>触控操作</h2>
        <ul>
          <li>点格子选中，再点下方数字键填入；再点同一个数字可以清除。</li>
          <li>「笔记」开关打开后，点数字键会在格子里记小候选数。</li>
          <li>长按数字键：直接给所选格切换这个数字的笔记，不改变当前模式。</li>
          <li>「更多 → 数字锁定模式」：先选一个数字，再连续点格子填入（再点一次同一数字键取消锁定）。</li>
          <li>数字键上的小数字是这个数字还剩几个没填，填满后按键变暗。</li>
          <li>撤销 / 重做不限步数，笔记、提示、重开都能撤销。</li>
          <li>切到后台、锁屏、来电或分屏失焦时会自动暂停并遮住盘面。</li>
          <li>每一步都会立即自动保存，杀掉 App 后重新打开会原样继续，连撤销历史也在。</li>
        </ul>
      </section>
      <section class="card">
        <h2>查错模式（设置里切换）</h2>
        <ul>
          <li>
            <b>关闭</b>：不做任何提示。
          </li>
          <li>
            <b>规则冲突</b>（默认）：与同行/列/宫等已有数字重复时，数字变红并在右上角加“!”标记，不泄露答案。
          </li>
          <li>
            <b>对照答案</b>：填错立即标红并画斜线，记错误次数；可选“错 3 次即失败”。
          </li>
        </ul>
      </section>
      <section class="card">
        <h2>提示（三段式）</h2>
        <p>第一次点「提示」只标出可以推进的区域；再点说出要用的技巧名；第三次给出完整讲解，并可一键应用。提示由与评级相同的技巧求解器给出，讲的就是真实解法。提示次数会记入成绩。</p>
      </section>
    </>
  );
}

// ---------- 模式规则示例 ----------
interface RuleExample {
  g: Geometry;
  cages?: Cage[];
  good: number[];
  bad: number[];
  goodMarks: BoardMarks;
  badMarks: BoardMarks;
  goodCaption: string;
  badCaption: string;
  subgrid?: number;
}

function buildRuleExample(mode: Mode): RuleExample {
  const rng = createRng(20240601 + mode.length * 17);
  let g: Geometry;
  if (mode === 'jigsaw') {
    let sol: number[] | null = null;
    let regions: number[] = [];
    while (!sol) {
      regions = randomJigsawLayout(rng);
      sol = randomSolution(buildModel(getGeometry('jigsaw', regions)), rng, 20000);
    }
    g = getGeometry('jigsaw', regions);
    const region0 = g.units.find((u) => u.type === 'region' && u.index === 4)!;
    const bad = sol.slice();
    const [a, b] = [region0.cells[1], region0.cells[7]];
    bad[b] = bad[a];
    return {
      g,
      good: sol,
      bad,
      goodMarks: { good: region0.cells },
      badMarks: { bad: [a, b] },
      goodCaption: '高亮的不规则区域含 1–9 各一次',
      badCaption: `同一区域出现两个 ${sol[a]}`,
    };
  }
  g = getGeometry(mode === 'killer' ? 'classic' : mode);
  const sol = randomSolution(buildModel(g), rng)!;
  const bad = sol.slice();
  if (mode === 'diagonal') {
    const diag = g.units.find((u) => u.type === 'diag' && u.index === 0)!;
    const [a, b] = [diag.cells[0], diag.cells[6]];
    bad[b] = bad[a];
    return { g, good: sol, bad, goodMarks: { good: diag.cells }, badMarks: { bad: [a, b] }, goodCaption: '主对角线含 1–9 各一次', badCaption: `主对角线上出现两个 ${sol[a]}` };
  }
  if (mode === 'killer') {
    const cages = generateCages(sol, rng, 3);
    const cg = cages.find((c) => c.cells.length === 3) ?? cages[0];
    const c = cg.cells[1];
    bad[c] = (bad[c] % 9) + 1;
    const newSum = cg.cells.reduce((s, x) => s + bad[x], 0);
    return {
      g,
      cages,
      good: sol,
      bad,
      goodMarks: { good: cg.cells },
      badMarks: { bad: cg.cells },
      goodCaption: `高亮笼：${cg.cells.map((x) => sol[x]).join('+')}=${cg.sum}`,
      badCaption: `笼和应为 ${cg.sum}，这里却是 ${newSum}`,
    };
  }
  if (mode === 'samurai') {
    const sg = getGeometry('samurai');
    const s2 = randomSolution(buildModel(sg), rng)!;
    const b2 = s2.slice();
    const shared = sg.units.find((u) => u.type === 'box' && u.grids.length > 1)!;
    const [a, b] = [shared.cells[0], shared.cells[8]];
    b2[b] = b2[a];
    return {
      g: sg,
      good: s2,
      bad: b2,
      goodMarks: { good: shared.cells },
      badMarks: { bad: [a, b] },
      goodCaption: '共享宫同时属于两个子盘，在两盘中都要含 1–9',
      badCaption: `共享宫里出现两个 ${s2[a]}`,
    };
  }
  const row = g.units.find((u) => u.type === 'row' && u.index === 2)!;
  const [a, b] = [row.cells[0], row.cells[5]];
  bad[b] = bad[a];
  return { g, good: sol, bad, goodMarks: { good: row.cells }, badMarks: { bad: [a, b] }, goodCaption: '第 3 行含 1–9 各一次', badCaption: `第 3 行出现两个 ${sol[a]}` };
}

export function ModeRules({ mode }: { mode: Mode }) {
  const ex = useMemo(() => buildRuleExample(mode), [mode]);
  return (
    <section class="card" data-testid={`rules-${mode}`}>
      <h2>{MODE_NAMES[mode]}</h2>
      <ul>
        {MODE_RULES[mode].map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <div class="help-pair">
        <figure>
          <Board g={ex.g} givens={ex.good} values={ex.good} cages={ex.cages} marks={ex.goodMarks} pixelWidth={150} jigsawTint label="正确示例" />
          <figcaption>
            <span class="ok-tag">✓ 正确</span> {ex.goodCaption}
          </figcaption>
        </figure>
        <figure>
          <Board
            g={ex.g}
            givens={ex.bad}
            values={ex.bad}
            cages={ex.cages}
            marks={ex.badMarks}
            conflicts={new Set(ex.badMarks.bad)}
            pixelWidth={150}
            jigsawTint
            label="违规示例"
          />
          <figcaption>
            <span class="bad-tag">✗ 违规</span> {ex.badCaption}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

export function RulesLayer({ layer }: { layer: Extract<Layer, { type: 'rules' }> }) {
  return (
    <Sheet title={`${MODE_NAMES[layer.mode]} · 规则`} testId="rules-card">
      <ModeRules mode={layer.mode} />
      {layer.auto && <p class="small muted">首次进入该模式时自动显示。之后可随时点顶栏的「?」再看。</p>}
    </Sheet>
  );
}

function LevelsSection() {
  const killer = modeAvailable('killer');
  return (
    <section class="card">
      <h2>五档难度</h2>
      <p class="small muted">难度由人类技巧求解器评出：每一步总是先用最简单的可用技巧，档位 = 全程用到的最难技巧所在档；同档内按技巧权重累加的“难度分”排序。用全部技巧仍解不出的题一律丢弃。</p>
      {LEVELS.map((l) => (
        <div key={l} style={{ margin: '10px 0' }}>
          <b>
            {l} 档 · {LEVEL_NAMES[l]}
          </b>
          <div class="small">{LEVEL_TECH_SUMMARY[l]}</div>
          {killer && <div class="small muted">杀手专属：{KILLER_LEVEL_EXTRA[l]}</div>}
        </div>
      ))}
      <h3>各模式开放的档位</h3>
      {MODES.filter(modeAvailable).map((m) => (
        <div key={m} class="small">
          {MODE_NAMES[m]}：{availableLevels(m).map((l) => LEVEL_NAMES[l]).join('、')}
        </div>
      ))}
    </section>
  );
}

// ---------- 技巧教程 ----------
function TechSection() {
  const killer = modeAvailable('killer');
  const list = TECHS.filter((t) => !t.killerOnly || killer);
  return (
    <>
      {list.map((t) => (
        <TechCard key={t.id} id={t.id} />
      ))}
    </>
  );
}

function TechCard({ id }: { id: TechId }) {
  const t = TECHS.find((x) => x.id === id)!;
  const ex = EXAMPLES[id];
  const [stage, setStage] = useState(0);
  return (
    <section class="card" data-testid={`tech-${id}`}>
      <h2>
        {t.name} <span class="muted small">· {t.level} 档</span>
      </h2>
      <p>{TECH_DEFS[id]}</p>
      {ex && <TechDemo ex={ex} stage={stage} />}
      {ex && (
        <div class="steps-anim">
          {['盘面', '找出关键', '得出结论'].map((label, i) => (
            <button key={label} class={`chip ${stage === i ? 'on' : ''}`} onClick={() => setStage(i)} data-testid={`tech-${id}-stage-${i}`}>
              {i + 1}. {label}
            </button>
          ))}
        </div>
      )}
      {ex && stage > 0 && <p class="small">{ex.step.text}</p>}
      {ex && PROBED_ONLY.includes(id) && <p class="small muted">注：这个盘面里也存在更简单的推进方法，此处仅用来演示该技巧本身（推理同样成立）。</p>}
    </section>
  );
}

function TechDemo({ ex, stage }: { ex: Example; stage: number }) {
  const g = getGeometry(ex.mode === 'killer' ? 'killer' : ex.mode, ex.regions);
  const area = new Set(ex.step.highlight.area);
  const values = ex.values.slice();
  const notes = ex.cand.slice();
  // 只在相关区域显示候选，其他空格留白，让示例更聚焦
  for (let c = 0; c < notes.length; c++) if (!area.has(c) && !ex.step.eliminations.some((e) => e.cell === c)) notes[c] = 0;
  let marks: BoardMarks | undefined;
  if (stage === 1) {
    marks = {
      area: ex.step.highlight.area,
      keys: ex.step.highlight.keys,
      keys2: ex.step.highlight.keys2,
      elims: ex.step.eliminations,
      links: ex.step.highlight.links,
    };
  }
  if (stage === 2) {
    for (const e of ex.step.eliminations) notes[e.cell] &= ~(1 << (e.digit - 1));
    for (const p of ex.step.placements) {
      values[p.cell] = p.digit;
      notes[p.cell] = 0;
    }
    marks = { good: [...ex.step.placements.map((p) => p.cell), ...ex.step.eliminations.map((e) => e.cell)] };
  }
  return (
    <div class="help-board">
      <Board g={g} givens={ex.givens} values={values} notes={notes} cages={ex.cages} marks={marks} pixelWidth={300} jigsawTint />
    </div>
  );
}

// ---------- 杀手组合速查表（程序枚举） ----------
export function ComboTable() {
  const rows: preact.JSX.Element[] = [];
  for (let k = 2; k <= 5; k++) {
    for (let s = 1; s <= 45; s++) {
      const list = COMBOS[k][s];
      if (!list.length) continue;
      rows.push(
        <tr key={`${k}-${s}`}>
          <th>
            {k}格 {s}
          </th>
          <td class={list.length === 1 ? 'one' : ''}>{list.map((m) => DIGITS[m].join('')).join('  ')}</td>
        </tr>,
      );
    }
  }
  return (
    <section class="card" data-testid="combo-table">
      <h2>杀手组合速查表（2–5 格）</h2>
      <p class="small muted">由程序枚举生成。蓝色加粗 = 只有唯一组合。</p>
      <table class="combo-table">
        <tbody>{rows}</tbody>
      </table>
    </section>
  );
}

// ---------- 安装与备份 ----------
export function InstallGuide() {
  return (
    <>
      <section class="card" data-testid="guide-ios">
        <h2>iPhone（Safari）安装</h2>
        <ol class="steps ios-steps">
          <li>
            <span class="step-icon">
              <ShareIcon />
            </span>
            用 Safari 打开本页，点底部（或地址栏旁）的「分享」按钮。
          </li>
          <li>
            <span class="step-icon">
              <AddIcon />
            </span>
            向下滑动菜单，选「添加到主屏幕」，再点右上角「添加」。
          </li>
          <li>
            <span class="step-icon digits">✓</span>
            以后从主屏幕图标打开。Safari 标签页里的数据可能在长期不访问后被系统清除，主屏幕 App 不会。
          </li>
        </ol>
      </section>
      <section class="card" data-testid="guide-android">
        <h2>安卓（Chrome）安装</h2>
        <ol class="steps ios-steps">
          <li>
            <span class="step-icon digits">⋮</span>
            用 Chrome 打开本页。若首页出现「安装」按钮，直接点它；否则点右上角「⋮」菜单。
          </li>
          <li>
            <span class="step-icon">
              <AddIcon />
            </span>
            选择「安装应用」或「添加到主屏幕」，确认安装。
          </li>
          <li>
            <span class="step-icon digits">!</span>
            国产浏览器（华为、小米、OPPO/vivo、UC、QQ 浏览器等）的“添加到桌面”表现不一，可能只是书签、不能离线。推荐用 Chrome 安装。
          </li>
        </ol>
      </section>
      <section class="card">
        <h2>备份与换机</h2>
        <ol>
          <li>首页 → 备份 → 「导出为 JSON 文件」（iPhone 会弹出分享面板，选“存储到文件”；安卓会下载到“下载”文件夹）。也可以「导出为文本码」复制后发给自己。</li>
          <li>在新手机上打开本 App → 备份 → 「选择备份文件」或粘贴文本码导入。</li>
          <li>iPhone 与安卓的备份格式相同，可以互相导入；导入是合并，不会删除新手机上已有的数据。</li>
        </ol>
      </section>
    </>
  );
}

export function InstallLayer() {
  const a = useApp();
  void a;
  return (
    <FullPage title="安装到主屏幕" testId="install-guide">
      <InstallGuide />
    </FullPage>
  );
}
