type Btn = 'left' | 'right';
type State = 'idle' | 'running' | 'done';
type Mode = 'timed' | 'drag' | 'gaps';

const DURATIONS = [0.5, 1, 3, 5, 10, 15, 30, 60];
const BUTTON_CODE: Record<Btn, number> = { left: 0, right: 2 };
// Clicks closer together than this belong to the same drag. Bounces within a drag
// are a few ms apart; lifting and starting the next drag takes well over 100ms.
const DRAG_GAP_MS = 100;
const DRAG_BARS = 40;
// Drag practice has no end, so the coach reports once you've paused this long.
const COACH_IDLE_MS = 2000;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const pad = $<HTMLDivElement>('pad');
const padLabel = $<HTMLDivElement>('pad-label');
const cpsEl = $<HTMLSpanElement>('cps');
const clicksEl = $<HTMLSpanElement>('clicks');
const timeEl = $<HTMLSpanElement>('time');
const bestEl = $<HTMLSpanElement>('best');
const resetBtn = $<HTMLButtonElement>('reset');
const durationRow = $<HTMLDivElement>('durations');
const buttonRow = $<HTMLDivElement>('buttons');
const historyFilter = $<HTMLDivElement>('history-filter');
const historySummary = $<HTMLDivElement>('history-summary');
const historyList = $<HTMLOListElement>('history-list');
const clearBtn = $<HTMLButtonElement>('clear');
const modeRow = $<HTMLDivElement>('modes');
const lengthGroup = $<HTMLDivElement>('length-group');
const timedStats = $<HTMLElement>('timed-stats');
const dragStats = $<HTMLElement>('drag-stats');
const dragLastEl = $<HTMLSpanElement>('drag-last');
const dragAvgEl = $<HTMLSpanElement>('drag-avg');
const dragCountEl = $<HTMLSpanElement>('drag-count');
const dragBestEl = $<HTMLSpanElement>('drag-best');
const dragSummary = $<HTMLDivElement>('drag-summary');
const dragBars = $<HTMLDivElement>('drag-bars');
const coachLive = $<HTMLDivElement>('coach-live');
const coachTips = $<HTMLUListElement>('coach-tips');
const historySection = $<HTMLDivElement>('history-section');
const dragSection = $<HTMLElement>('drag-section');
const gapStats = $<HTMLElement>('gap-stats');
const gapSection = $<HTMLElement>('gap-section');
const gapWorstEl = $<HTMLSpanElement>('gap-worst');
const gapCoverEl = $<HTMLSpanElement>('gap-cover');
const gapCleanEl = $<HTMLSpanElement>('gap-clean');
const gapBestEl = $<HTMLSpanElement>('gap-best');
const gapSummary = $<HTMLDivElement>('gap-summary');
const gapBars = $<HTMLDivElement>('gap-bars');
const bridgeToggle = $<HTMLInputElement>('bridge-coach');
const bridgeNote = $<HTMLElement>('bridge-note');
const maxGapChips = $<HTMLDivElement>('max-gap');
const gapLine = $<HTMLDivElement>('gap-line');
const settingsBtn = $<HTMLButtonElement>('settings-btn');
const settingsMenu = $<HTMLDivElement>('settings');

interface Run { btn: Btn; duration: number; clicks: number; cps: number; at: number }
type Scope = 'length' | 'all';

const HISTORY_KEY = 'runs';
const HISTORY_MAX = 1000;

let btn: Btn = 'left';
let scope: Scope = 'length';
let duration = 5;
let state: State = 'idle';
let clicks = 0;
let startedAt = 0;
let raf = 0;
let mode: Mode = 'timed';
// Click timestamps for each drag in the current run/session.
let drags: number[][] = [];
let lastClickAt = 0;
let bestDragBefore = 0;
let dragEndTimer = 0;
let idleTimer = 0;

const bestKey = () => `best:${btn}:${duration}`;
const bestDragKey = () => `bestDrag:${btn}`;
function getBestDrag(): number {
  try { return Number(localStorage.getItem(bestDragKey())) || 0; } catch { return 0; }
}
function setBestDrag(v: number): void {
  try { localStorage.setItem(bestDragKey(), String(v)); } catch { /* ignore */ }
}

const counts = () => drags.map((d) => d.length);
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};
const dragAvg = () => mean(counts());

function countDragClick(now: number): void {
  if (drags.length === 0 || now - lastClickAt > DRAG_GAP_MS) {
    bestDragBefore = getBestDrag();
    drags.push([now]);
  } else {
    drags[drags.length - 1].push(now);
  }
  lastClickAt = now;
  const current = drags[drags.length - 1].length;
  if (current > getBestDrag()) setBestDrag(current);
  renderDrags();

  if (mode === 'drag') {
    clearTimeout(dragEndTimer);
    clearTimeout(idleTimer);
    dragEndTimer = window.setTimeout(coachDrag, DRAG_GAP_MS + 10);
    idleTimer = window.setTimeout(() => renderTips(analyse(drags)), COACH_IDLE_MS);
  }
}

// --- Coach -------------------------------------------------------------------
// Everything here is inferred from click timing alone, so tips name the likely
// cause rather than pretend to know what the finger did.

type TipKind = 'good' | 'fix' | 'info';
interface Tip { kind: TipKind; title: string; body: string }

// A drag "stalls" when one gap inside it is far longer than its usual bounce
// gap: the buzz died and picked up again.
function stalled(d: number[]): boolean {
  if (d.length < 4) return false;
  const gaps = d.slice(1).map((t, i) => t - d[i]);
  return Math.max(...gaps) > Math.max(3 * median(gaps), 30);
}

function setLive(kind: TipKind, text: string): void {
  coachLive.className = `coach-live ${kind}`;
  coachLive.textContent = text;
}

function coachDrag(): void {
  const d = drags.at(-1);
  if (!d) return;
  const n = d.length;
  const recent = counts().slice(-11, -1);
  const usual = mean(recent);
  const stall = stalled(d) ? ' It stalled partway, so keep the pressure steady right to the end.' : '';
  if (bestDragBefore > 0 && n > bestDragBefore) {
    setLive('good', `New best drag: ${n} clicks! Copy exactly what you just did: spot, angle, pressure.`);
  } else if (recent.length >= 3 && n >= 5 && n >= usual * 1.5) {
    setLive('good', `${n} clicks, well above your usual ~${usual.toFixed(1)}. That's the technique to copy.${stall}`);
  } else if (n <= 1) {
    setLive('fix', '1 click: that drag never buzzed. The finger slipped, or the pressure was off.');
  } else if (n === 2) {
    setLive('fix', `2 clicks: it barely buzzed. Change the pressure a little and try again.${stall}`);
  } else {
    setLive('info', `${n} clicks${recent.length >= 3 ? ` (usual ~${usual.toFixed(1)})` : ''}.${stall}`);
  }
  const hand = handFeedback(d);
  if (hand) coachLive.textContent += ` ${hand}`;
}

function analyse(ds: number[][], seconds?: number): Tip[] {
  const n = ds.map((d) => d.length);
  const need = seconds ? 3 : 5;
  if (n.length < need) {
    return [{ kind: 'info', title: 'Not enough drags yet', body: `Do at least ${need} drags for feedback (${n.length} so far).` }];
  }
  const avg = mean(n);
  const sd = Math.sqrt(mean(n.map((x) => (x - avg) ** 2)));
  const cv = avg ? sd / avg : 0;
  const med = median(n);
  const lo = Math.min(...n);
  const hi = Math.max(...n);
  const fivePlus = n.filter((x) => x >= 5).length / n.length;
  const tips: Tip[] = [{
    kind: 'info',
    title: `${n.length} drags · avg ${avg.toFixed(1)} · ${Math.round(fivePlus * 100)}% got 5+`,
    body: `Range ${lo}–${hi} clicks per drag.`,
  }];

  const weak = n.filter((x) => x <= 2).length / n.length;
  if (weak >= 0.3) tips.push({
    kind: 'fix', title: `${Math.round(weak * 100)}% of drags got only 1–2 clicks`,
    body: "The switch isn't buzzing on those. If you feel the buzz but few clicks register, press slightly harder. " +
      'If it feels like a smooth slide with no buzz, press lighter.',
  });

  if (n.length >= 6 && avg >= 2 && cv >= 0.5) tips.push({
    kind: 'fix', title: 'Inconsistent drags',
    body: `Drags ranged from ${lo} to ${hi} clicks. Start from the same spot with the same angle and pressure every time. ` +
      'Slowing down a little helps it repeat.',
  });

  const eligible = ds.filter((d) => d.length >= 4);
  const stallRate = eligible.length ? eligible.filter(stalled).length / eligible.length : 0;
  if (eligible.length >= 3 && stallRate >= 0.3) tips.push({
    kind: 'fix', title: 'Drags stall partway through',
    body: `${Math.round(stallRate * 100)}% of drags lost the buzz and picked it back up. Your finger is losing grip or lifting, ` +
      'so keep the pressure steady to the end of the drag. Wipe your finger and the tape if they feel dusty.',
  });

  // Fast bounces but few of them: the buzz itself is fine, it just ends early.
  const multi = ds.filter((d) => d.length >= 3);
  const bounceMs = median(multi.map((d) => (d[d.length - 1] - d[0]) / (d.length - 1)));
  if (multi.length >= 3 && bounceMs <= 15 && avg < 5) tips.push({
    kind: 'fix', title: 'Good buzz, but it cuts out early',
    body: `Clicks come quickly (~${Math.round(bounceMs)}ms apart) but stop after a few. Use more of the button: a longer, ` +
      'smooth drag keeps it buzzing for longer.',
  });

  if (n.length >= 6 && cv < 0.35 && avg >= 2 && avg < 5) tips.push({
    kind: 'info', title: `Consistent, but around ${avg.toFixed(1)} per drag`,
    body: 'Your technique repeats well. Now change one thing at a time (pressure first, then angle) and see which way the numbers move.',
  });

  if (n.length >= 10) {
    const half = n.length >> 1;
    const first = mean(n.slice(0, half));
    const second = mean(n.slice(half));
    if (second < first * 0.75) tips.push({
      kind: 'fix', title: `Faded as you went (${first.toFixed(1)} → ${second.toFixed(1)})`,
      body: 'Your hand is tiring, or your fingertip is drying out or getting sweaty. Do shorter sets with a break between them.',
    });
    else if (second > first * 1.25) tips.push({
      kind: 'good', title: `Improved as you went (${first.toFixed(1)} → ${second.toFixed(1)})`,
      body: 'Warming up helps you. Do a quick warm-up set before tests that count.',
    });
  }

  const standouts = n.map((x, i) => [x, i + 1]).filter(([x]) => x >= 6 && x >= med * 1.5);
  if (standouts.length && standouts.length <= n.length / 3) tips.push({
    kind: 'good',
    title: `Standout drag${standouts.length > 1 ? 's' : ''}: ` +
      standouts.slice(0, 4).map(([x, i]) => `#${i} (${x})`).join(', '),
    body: `Well above your usual ${med}. Those are the ones to copy, so try to remember what felt different about them.`,
  });

  if (avg >= 8 && cv < 0.35) tips.push({
    kind: 'good', title: 'Strong, consistent drags',
    body: seconds ? 'Drag quality is there, so faster resets are where more CPS comes from.' : 'Try timed runs to work on resets.',
  });

  if (seconds) {
    const rate = n.length / seconds;
    if (rate < 2.5 && avg >= 4) tips.push({
      kind: 'fix', title: `Slow resets (${rate.toFixed(1)} drags/sec)`,
      body: 'Lift and start the next drag sooner, in one smooth loop. Aim for 3+ drags a second.',
    });
    else if (rate >= 3 && avg < 5) tips.push({
      kind: 'info', title: `Resets are quick (${rate.toFixed(1)} drags/sec)`,
      body: 'Your CPS is limited by clicks per drag, not speed, so practise drag quality in Drag practice mode.',
    });
  }

  if (tips.length === 1) tips.push({
    kind: 'good', title: 'No obvious problems',
    body: 'Keep going. More drags give the coach more to go on.',
  });
  return [...tips, ...handTips(ds)];
}

// --- Gap check -----------------------------------------------------------------
// Steady drag clicking means no long pauses, so this mode looks at every gap
// between clicks, not clicks per drag. The longest gap that still counts as
// steady is a setting: 50ms (one Minecraft tick) is the strictest, and 100ms
// lets a quick reset between drags through.

const MAX_GAP_KEY = 'maxGap';
const MAX_GAPS = [50, 75, 100, 150];
let maxGap = (() => {
  try { const v = Number(localStorage.getItem(MAX_GAP_KEY)); return MAX_GAPS.includes(v) ? v : 100; } catch { return 100; }
})();
// A pause this long means you stopped, so the next click starts a new run.
const STREAM_GAP_MS = 300;
const GAP_BARS = 160;
const GAP_SCALE_MS = 200;
const GAP_CHART_PX = 60;

let streams: number[][] = [];
let bestCleanBefore = 0;
let streamEndTimer = 0;

const BRIDGE_KEY = 'bridgeCoach';
let bridgeCoach = (() => { try { return localStorage.getItem(BRIDGE_KEY) === '1'; } catch { return false; } })();

// Bests from before the setting existed were all at 50ms, so that keeps the old key.
const bestCleanKey = () => `bestClean:${btn}${maxGap === 50 ? '' : `:${maxGap}`}`;
function getBestClean(): number {
  try { return Number(localStorage.getItem(bestCleanKey())) || 0; } catch { return 0; }
}
function setBestClean(v: number): void {
  try { localStorage.setItem(bestCleanKey(), String(v)); } catch { /* ignore */ }
}

const gapsOf = (s: number[]) => s.slice(1).map((t, i) => t - s[i]);
// Split the run into max-gap-sized windows: a gap of g ms spans g/maxGap of them,
// and the click that ends it fills one, so the rest are windows with no click.
function coverage(s: number[]): number {
  const gaps = gapsOf(s);
  const span = gaps.reduce((a, g) => a + g, 0);
  if (span <= 0) return 1;
  const missed = gaps.reduce((m, g) => m + Math.max(0, g / maxGap - 1), 0);
  return Math.max(0, 1 - missed / (span / maxGap));
}
// A drag that dies out spaces its clicks out first, so a long gap right after an
// already slow one is the buzz thinning; after fast clicks it's a reset.
function thinned(gaps: number[], i: number): boolean {
  return i > 0 && gaps[i - 1] > Math.max(1.5 * median(gaps), 25);
}
// Longest stretch, in seconds, with no gap over the max gap.
function cleanSecs(s: number[]): number {
  let best = 0;
  let from = s[0];
  for (let i = 1; i < s.length; i++) {
    if (s[i] - s[i - 1] > maxGap) from = s[i];
    best = Math.max(best, s[i] - from);
  }
  return best / 1000;
}

function countGapClick(now: number): void {
  const s = streams.at(-1);
  if (!s || now - s[s.length - 1] > STREAM_GAP_MS) {
    bestCleanBefore = getBestClean();
    streams.push([now]);
  } else {
    s.push(now);
  }
  const clean = cleanSecs(streams[streams.length - 1]);
  if (clean > getBestClean()) setBestClean(clean);
  renderGaps();
  clearTimeout(streamEndTimer);
  clearTimeout(idleTimer);
  streamEndTimer = window.setTimeout(coachStream, STREAM_GAP_MS + 10);
  idleTimer = window.setTimeout(() => renderTips(analyseGaps(streams)), STREAM_GAP_MS + COACH_IDLE_MS);
}

function coachStream(): void {
  const s = streams.at(-1);
  if (!s) return;
  if (s.length < 2) return setLive('fix', 'Only one click. Keep clicking for the whole bridge.');
  const gaps = gapsOf(s);
  const worst = Math.max(...gaps);
  const over = gaps.filter((g) => g > maxGap).length;
  const secs = (s[s.length - 1] - s[0]) / 1000;
  const clean = cleanSecs(s);
  const where = thinned(gaps, gaps.indexOf(worst)) ? 'the drag thinned out before it' : 'a reset between drags';
  const bridge = !bridgeCoach ? ''
    : over === 0 ? ` Steady enough to god bridge: no gap over ${maxGap}ms.`
    : ` Risky for god bridging: a ${Math.round(worst)}ms gap is a long time with no block going down.`;
  if (bestCleanBefore > 0 && clean > bestCleanBefore) {
    setLive('good', `New best clean run: ${clean.toFixed(2)}s with no gap over ${maxGap}ms.${bridge}`);
  } else if (over === 0) {
    setLive('good', `${secs.toFixed(2)}s, longest gap ${Math.round(worst)}ms. No pauses at all.${bridge}`);
  } else {
    setLive(worst > 1.5 * maxGap ? 'fix' : 'info',
      `Longest gap ${Math.round(worst)}ms, at click ${gaps.indexOf(worst) + 2} (${where}). ` +
      `${over} gap${over > 1 ? 's' : ''} over ${maxGap}ms, ${Math.round(coverage(s) * 100)}% steady.${bridge}`);
  }
}

function analyseGaps(ss: number[][]): Tip[] {
  const runs = ss.filter((s) => s.length >= 5);
  if (runs.length < 3) {
    return [{ kind: 'info', title: 'Not enough runs yet', body: `Do at least 3 runs of 5+ clicks for feedback (${runs.length} so far).` }];
  }
  const covs = runs.map(coverage);
  const worsts = runs.map((s) => Math.max(...gapsOf(s)));
  const avgCov = mean(covs);
  const tips: Tip[] = [{
    kind: 'info',
    title: `${runs.length} runs · ${Math.round(avgCov * 100)}% steady · longest gap ~${Math.round(median(worsts))}ms`,
    body: `Best clean run this session: ${Math.max(...runs.map(cleanSecs)).toFixed(2)}s.`,
  }];

  const over = runs.flatMap((s) => {
    const gaps = gapsOf(s);
    return gaps.map((g, i) => ({ g, thin: thinned(gaps, i) })).filter((x) => x.g > maxGap);
  });
  const resets = over.filter((x) => !x.thin).length;
  if (over.length >= 3 && resets >= over.length * 0.6) tips.push({
    kind: 'fix', title: 'Your gaps are the resets between drags',
    body: `${resets} of ${over.length} long gaps came between drags. Keep your drags long, but start the next one ` +
      'while the last is still buzzing, so your finger is already back at the top of the button when it ends.',
  });
  else if (over.length >= 3 && resets <= over.length * 0.4) tips.push({
    kind: 'fix', title: 'Your drags thin out before they end',
    body: `${over.length - resets} of ${over.length} long gaps came inside drags, where the clicks spaced out as the buzz faded. ` +
      'Reset a little earlier, before a drag fades, or keep the pressure steadier through it.',
  });

  if (avgCov >= 0.95) tips.push(bridgeCoach ? {
    kind: 'good', title: 'Steady enough for god bridging',
    body: `Almost no gaps over ${maxGap}ms. Now keep it that steady for longer runs.`,
  } : {
    kind: 'good', title: 'Very steady clicking',
    body: 'Almost no pauses between clicks. Now keep it that steady for longer runs.',
  });
  else if (avgCov < 0.8) tips.push({
    kind: 'fix', title: `Only ${Math.round(avgCov * 100)}% steady`,
    body: `More than one ${maxGap}ms stretch in five has no click in it. Even, steady clicks matter more here than fast ones.`,
  });

  if (runs.length >= 6 && Math.max(...covs) - Math.min(...covs) > 0.3) tips.push({
    kind: 'info', title: 'Some runs are much steadier than others',
    body: `Runs ranged from ${Math.round(Math.min(...covs) * 100)}% to ${Math.round(Math.max(...covs) * 100)}% steady. ` +
      'Your technique is there sometimes, so repeat what the good runs did.',
  });
  return tips;
}

function renderGaps(): void {
  const s = streams.at(-1) ?? [];
  const gaps = gapsOf(s);
  gapWorstEl.textContent = gaps.length ? `${Math.round(Math.max(...gaps))}ms` : '–';
  gapCoverEl.textContent = gaps.length ? `${Math.round(coverage(s) * 100)}%` : '–';
  gapCleanEl.textContent = s.length ? `${cleanSecs(s).toFixed(2)}s` : '0.00s';
  gapBestEl.textContent = `${getBestClean().toFixed(2)}s`;

  if (!gaps.length) {
    gapSummary.textContent = `Each bar is the gap before one click. Bars above the ${maxGap}ms line are pauses ` +
      'in your clicking (change the line in Settings).';
  } else {
    const secs = (s[s.length - 1] - s[0]) / 1000;
    const over = gaps.filter((g) => g > maxGap).length;
    gapSummary.innerHTML = `<b>${s.length}</b> clicks over <b>${secs.toFixed(2)}s</b> · ` +
      `<b>${secs > 0 ? ((s.length - 1) / secs).toFixed(1) : '0'}</b> CPS · <b>${over}</b> gaps over ${maxGap}ms`;
  }

  gapBars.querySelectorAll('.gap-bar').forEach((b) => b.remove());
  for (const g of gaps.slice(-GAP_BARS)) {
    const bar = el('div', 'gap-bar' + (g > 1.5 * maxGap ? ' bad' : g > maxGap ? ' warn' : ''), '');
    bar.style.height = `${(Math.min(g, GAP_SCALE_MS) / GAP_SCALE_MS) * GAP_CHART_PX}px`;
    bar.title = `${Math.round(g)}ms`;
    gapBars.appendChild(bar);
  }
}

function applyMaxGap(): void {
  maxGapChips.querySelectorAll<HTMLButtonElement>('.chip').forEach((c) => c.classList.toggle('active', Number(c.dataset.gap) === maxGap));
  gapLine.style.bottom = `${(maxGap / GAP_SCALE_MS) * GAP_CHART_PX}px`;
  gapLine.querySelector('span')!.textContent = `${maxGap}ms`;
  renderGaps();
}

maxGapChips.onclick = (e) => {
  const v = Number((e.target as HTMLElement).closest<HTMLButtonElement>('.chip')?.dataset.gap);
  if (!MAX_GAPS.includes(v) || v === maxGap) return;
  maxGap = v;
  try { localStorage.setItem(MAX_GAP_KEY, String(v)); } catch { /* ignore */ }
  applyMaxGap();
  if (mode === 'gaps' && !session) reset();
};

function applyBridge(): void {
  bridgeToggle.checked = bridgeCoach;
  bridgeNote.hidden = !bridgeCoach;
  renderGaps();
}

bridgeToggle.onchange = () => {
  bridgeCoach = bridgeToggle.checked;
  try { localStorage.setItem(BRIDGE_KEY, bridgeCoach ? '1' : '0'); } catch { /* ignore */ }
  applyBridge();
  if (mode === 'gaps' && !session) reset();
};
settingsBtn.onclick = () => {
  settingsMenu.hidden = !settingsMenu.hidden;
  settingsBtn.classList.toggle('active', !settingsMenu.hidden);
};
window.addEventListener('mousedown', (e) => {
  if (!settingsMenu.hidden && !settingsMenu.contains(e.target as Node) && e.target !== settingsBtn) {
    settingsMenu.hidden = true;
    settingsBtn.classList.remove('active');
  }
});

function renderTips(tips: Tip[]): void {
  coachTips.innerHTML = '';
  for (const t of tips) {
    const li = el('li', `tip ${t.kind}`, '');
    li.append(el('b', '', t.title), el('span', '', t.body));
    coachTips.appendChild(li);
  }
}

function resetCoach(): void {
  clearTimeout(dragEndTimer);
  clearTimeout(streamEndTimer);
  clearTimeout(idleTimer);
  setLive('info', mode === 'drag'
    ? 'Feedback on each drag shows here. Pause for 2s to get a session report.'
    : mode === 'gaps'
      ? `${bridgeCoach ? 'Click the way you would while bridging' : 'Drag click in a steady stream'}. ` +
        'Stop for a moment to see your longest gap, or pause for 2s for a report.'
      : 'Finish a run for a breakdown of your drags.');
  renderTips([]);
}

function renderDrags(): void {
  const n = counts();
  dragLastEl.textContent = String(n.at(-1) ?? 0);
  dragAvgEl.textContent = dragAvg().toFixed(1);
  dragCountEl.textContent = String(drags.length);
  dragBestEl.textContent = String(getBestDrag());

  if (drags.length === 0) {
    dragSummary.textContent = mode === 'drag'
      ? 'Each bar is one drag. Clicks within 100ms of each other count as the same drag.'
      : 'Clicks per drag for this run show here.';
  } else {
    const top = Math.max(...n);
    const fivePlus = n.filter((x) => x >= 5).length / n.length;
    dragSummary.innerHTML = `<b>${drags.length}</b> drags · avg <b>${dragAvg().toFixed(1)}</b> · ` +
      `best <b>${top}</b> · 5+ clicks <b>${Math.round(fivePlus * 100)}%</b>`;
  }

  const shown = n.slice(-DRAG_BARS);
  const scale = Math.max(...shown, 1);
  const top = Math.max(...n, 0);
  dragBars.innerHTML = '';
  for (const x of shown) {
    const bar = el('div', 'drag-bar' + (x === top ? ' best' : ''), '');
    bar.style.height = `${(x / scale) * 60}px`;
    bar.appendChild(el('span', '', String(x)));
    dragBars.appendChild(bar);
  }
}
function getBest(): number {
  try { return Number(localStorage.getItem(bestKey())) || 0; } catch { return 0; }
}
function setBest(v: number): void {
  try { localStorage.setItem(bestKey(), String(v)); } catch { /* ignore */ }
}

function loadRuns(): Run[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as Run[]; } catch { return []; }
}
function saveRuns(runs: Run[]): void {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(runs.slice(-HISTORY_MAX))); } catch { /* ignore */ }
}
const inView = (r: Run) => r.btn === btn && (scope === 'all' || r.duration === duration);

function formatWhen(at: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

function el(tag: string, cls: string, text: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
}

function renderHistory(): void {
  historyFilter.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) => {
    b.classList.toggle('active', b.dataset.scope === scope);
    b.onclick = () => { scope = b.dataset.scope as Scope; renderHistory(); };
  });

  const runs = loadRuns().filter(inView).reverse();
  historyList.innerHTML = '';
  if (runs.length === 0) {
    historySummary.textContent = '';
    historyList.appendChild(el('li', 'empty', 'No runs yet.'));
    return;
  }

  // Best per length, so each speed's top run is highlighted even in "All lengths".
  const bestFor = new Map<number, number>();
  for (const r of runs) bestFor.set(r.duration, Math.max(bestFor.get(r.duration) ?? 0, r.cps));

  const avg = runs.reduce((s, r) => s + r.cps, 0) / runs.length;
  const top = Math.max(...runs.map((r) => r.cps));
  historySummary.innerHTML = `<b>${runs.length}</b> runs · avg <b>${avg.toFixed(2)}</b> · best <b>${top.toFixed(2)}</b>`;

  for (const r of runs) {
    const li = document.createElement('li');
    li.append(
      el('span', 'h-cps' + (r.cps === bestFor.get(r.duration) ? ' best' : ''), `${r.cps.toFixed(2)} CPS`),
      el('span', 'h-when', formatWhen(r.at)),
      el('span', 'h-meta', `${r.clicks} clicks · ${r.duration}s`),
    );
    historyList.appendChild(li);
  }
}

function renderChips(): void {
  durationRow.innerHTML = '';
  for (const d of DURATIONS) {
    const b = document.createElement('button');
    b.className = 'chip' + (d === duration ? ' active' : '');
    b.textContent = `${d}s`;
    b.onclick = () => { duration = d; reset(); renderChips(); };
    durationRow.appendChild(b);
  }
  buttonRow.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) => {
    b.classList.toggle('active', b.dataset.btn === btn);
    b.onclick = () => { btn = b.dataset.btn as Btn; reset(); renderChips(); };
    b.disabled = !!session;
  });
  modeRow.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
    b.onclick = () => { mode = b.dataset.mode as Mode; reset(); renderChips(); };
    b.disabled = !!session;
  });
  lengthGroup.hidden = mode !== 'timed';
  timedStats.hidden = mode !== 'timed';
  dragStats.hidden = mode !== 'drag';
  gapStats.hidden = mode !== 'gaps';
  dragSection.hidden = mode === 'gaps';
  gapSection.hidden = mode !== 'gaps';
  historySection.hidden = mode !== 'timed';
}

function update(now = performance.now()): void {
  const elapsed = state === 'idle' ? 0 : Math.min((now - startedAt) / 1000, duration);
  const left = state === 'idle' ? duration : duration - elapsed;
  const cps = elapsed > 0 ? clicks / elapsed : 0;
  cpsEl.textContent = cps.toFixed(2);
  clicksEl.textContent = String(clicks);
  timeEl.textContent = left.toFixed(2);
  bestEl.textContent = getBest().toFixed(2);
}

function tick(now: number): void {
  if (state !== 'running') return;
  if ((now - startedAt) / 1000 >= duration) return finish();
  update(now);
  raf = requestAnimationFrame(tick);
}

function finish(): void {
  state = 'done';
  cancelAnimationFrame(raf);
  const cps = clicks / duration;
  const isBest = cps > getBest();
  const allGaps = gapsOf(drags.flat());
  if (isBest) setBest(cps);
  saveRuns([...loadRuns(), { btn, duration, clicks, cps, at: Date.now() }]);
  renderHistory();
  renderTips(analyse(drags, duration));
  update(startedAt + duration * 1000);
  pad.className = 'pad done';
  padLabel.innerHTML = `<strong>${cps.toFixed(2)} CPS</strong><br>${clicks} clicks in ${duration}s` +
    `<br>${drags.length} drags · ${dragAvg().toFixed(1)} clicks per drag` +
    (allGaps.length ? ` · longest gap ${Math.round(Math.max(...allGaps))}ms` : '') +
    (isBest ? '<br><em>New best!</em>' : '') + '<br><small>Press Reset or R to go again</small>';
}

function reset(): void {
  cancelAnimationFrame(raf);
  state = 'idle';
  clicks = 0;
  drags = [];
  streams = [];
  resetCoach();
  pad.className = 'pad';
  padLabel.textContent = mode === 'drag'
    ? `Drag ${btn} click here. No timer, press R to clear`
    : mode === 'gaps'
      ? `${btn === 'left' ? 'Left' : 'Right'} click here ${bridgeCoach ? "like you're bridging" : 'in a steady stream'}. Press R to clear`
      : `${btn === 'left' ? 'Left' : 'Right'} click here to start`;
  update();
  renderDrags();
  renderGaps();
  renderHistory();
}

// --- Practice schedule -----------------------------------------------------------
// Session shape and spacing follow motor-learning research:
// - 10s drag / 10s rest sets: early skill gains mostly happen during short rests
//   between practice, not during it (Bönstrup et al. 2019, Current Biology).
// - Short sessions spread out: distributed practice beats massed practice for
//   motor skills (Lee & Genovese 1988 meta-analysis), and drag clicking strains the hand.
// - 6h+ between sessions, max 2 a day: motor memories take hours to stabilise
//   (Shadmehr & Brashers-Krug 1997) and keep improving over sleep (Walker et al. 2002).

const SET_MS = 10_000;
const REST_MS = 10_000;
const SESSION_SETS = 30;
const SESSION_MIN = (SESSION_SETS * (SET_MS + REST_MS)) / 60_000;
const MIN_GAP_MS = 6 * 3_600_000;
const MAX_PER_DAY = 2;
const QUIET_FROM = 23;
const QUIET_TO = 9;
const FREE_IDLE_MS = 5 * 60_000; // a pause this long ends a block of free practice
const FREE_MIN_MS = 2 * 60_000; // shorter blocks don't count as practice
const FREE_LIMIT_MS = 10 * 60_000;
const RENOTIFY_MS = 2 * 3_600_000;
const PRACTICE_KEY = 'practice';
const FREE_KEY = 'freeBlock';
const NOTIFIED_KEY = 'practiceNotified';
const WHY = 'Short 10s drag / 10s rest sets: skill gains mostly happen in the rests (Bönstrup 2019). ' +
  'Short, spread-out sessions beat long ones (Lee & Genovese 1988). 6h+ apart and max 2 a day ' +
  'so practice can consolidate (Shadmehr & Brashers-Krug 1997), with sleep helping most (Walker 2002).';

interface Window { cps?: { notify(title: string, body: string): void; openKofi(): void } }
interface Practice { start: number; end: number; kind: 'session' | 'free' }
interface FreeBlock { start: number; last: number; warned: boolean }
interface Session { start: number; set: number; phase: 'drag' | 'rest'; phaseEnds: number; setStartIdx: number; setAvgs: number[] }

const sessionBtn = $<HTMLButtonElement>('session-btn');
const practiceStatus = $<HTMLDivElement>('practice-status');
const practiceToday = $<HTMLDivElement>('practice-today');
const sessionInfo = $<HTMLDivElement>('session-info');
const sessionPhase = $<HTMLSpanElement>('session-phase');
const sessionTime = $<HTMLSpanElement>('session-time');
const sessionProgress = $<HTMLDivElement>('session-progress');

let session: Session | null = null;
let sessionTimer = 0;

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}
function store(key: string, v: unknown): void {
  try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}

function notify(title: string, body: string): void {
  if (window.cps) window.cps.notify(title, body);
  else if ('Notification' in window) new Notification(title, { body });
}

function logPractice(p: Practice): void {
  store(PRACTICE_KEY, [...load<Practice[]>(PRACTICE_KEY, []), p].slice(-500));
}

function closeFreeBlock(): void {
  const b = load<FreeBlock | null>(FREE_KEY, null);
  if (b && b.last - b.start >= FREE_MIN_MS) logPractice({ start: b.start, end: b.last, kind: 'free' });
  store(FREE_KEY, null);
}

// Clicking outside a guided session still counts as practice, and gets the
// same "time to stop" nudge once it runs long.
function noteActivity(): void {
  const now = Date.now();
  let b = load<FreeBlock | null>(FREE_KEY, null);
  if (!b || now - b.last > FREE_IDLE_MS) {
    closeFreeBlock();
    b = { start: now, last: now, warned: false };
  }
  b.last = now;
  if (!b.warned && b.last - b.start >= FREE_LIMIT_MS) {
    b.warned = true;
    notify('Time to stop', "You've been drag clicking for 10 minutes. Take a break: the skill sets in while you rest, and it saves your hand.");
  }
  store(FREE_KEY, b);
}

function allPractice(): Practice[] {
  const ps = load<Practice[]>(PRACTICE_KEY, []);
  const b = load<FreeBlock | null>(FREE_KEY, null);
  return b && b.last - b.start >= FREE_MIN_MS ? [...ps, { start: b.start, end: b.last, kind: 'free' }] : ps;
}

const inQuiet = (t: number) => { const h = new Date(t).getHours(); return h >= QUIET_FROM || h < QUIET_TO; };

function outOfQuiet(t: number): number {
  if (!inQuiet(t)) return t;
  const d = new Date(t);
  if (d.getHours() >= QUIET_FROM) d.setDate(d.getDate() + 1);
  d.setHours(QUIET_TO, 0, 0, 0);
  return d.getTime();
}

function nextDue(now = Date.now()): number {
  const ps = allPractice();
  if (!ps.length) return outOfQuiet(now);
  const last = Math.max(...ps.map((p) => p.end));
  let due = last + MIN_GAP_MS;
  const lastDay = new Date(last).toDateString();
  if (ps.filter((p) => new Date(p.start).toDateString() === lastDay).length >= MAX_PER_DAY) {
    const morning = new Date(last);
    morning.setDate(morning.getDate() + 1);
    morning.setHours(QUIET_TO, 0, 0, 0);
    due = Math.max(due, morning.getTime());
  }
  return outOfQuiet(due);
}

function fmtDur(ms: number): string {
  const m = Math.ceil(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}
const fmtClock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
  (new Date(t).toDateString() === new Date().toDateString() ? '' : ' tomorrow');

function renderPractice(): void {
  sessionBtn.textContent = session ? 'Stop session' : `Start ${SESSION_MIN}-min session`;
  sessionInfo.hidden = !session;
  practiceStatus.hidden = !!session;
  practiceStatus.title = WHY;

  const today = new Date().toDateString();
  const todays = allPractice().filter((p) => new Date(p.start).toDateString() === today);
  const mins = Math.round(todays.reduce((s, p) => s + (p.end - p.start), 0) / 60_000);
  practiceToday.textContent = `Today: ${todays.length} of ${MAX_PER_DAY} sessions · ${mins} min practised`;

  if (session) return;
  const now = Date.now();
  const due = nextDue(now);
  practiceStatus.className = 'practice-status' + (now >= due ? ' due' : '');
  if (now >= due) practiceStatus.textContent = 'Practice is due now.';
  else if (todays.length >= MAX_PER_DAY) practiceStatus.textContent = `Done for today. Next session ${fmtClock(due)}.`;
  else practiceStatus.textContent = `Next session in ${fmtDur(due - now)} (${fmtClock(due)}).`;
}

function checkSchedule(): void {
  const b = load<FreeBlock | null>(FREE_KEY, null);
  const now = Date.now();
  if (b && now - b.last > FREE_IDLE_MS) closeFreeBlock();
  renderPractice();
  if (session || (b && now - b.last <= FREE_IDLE_MS) || inQuiet(now)) return;
  const due = nextDue(now);
  if (now < due) return;
  const lastNotified = load<number>(NOTIFIED_KEY, 0);
  if (lastNotified >= due && now - lastNotified < RENOTIFY_MS) return;
  store(NOTIFIED_KEY, now);
  notify('Time to practice drag clicking', `A ${SESSION_MIN}-minute session is due. Press "Start session" in Drag Trainer.`);
}

// True when the last 5 sets are well below the best 5 earlier on: the hand is
// tiring and more reps now just practise bad drags.
function fading(avgs: number[]): boolean {
  if (avgs.length < 10) return false;
  const last5 = mean(avgs.slice(-5));
  let best5 = 0;
  for (let i = 0; i + 5 <= avgs.length - 5; i++) best5 = Math.max(best5, mean(avgs.slice(i, i + 5)));
  return last5 < best5 * 0.7;
}

function startSession(): void {
  closeFreeBlock();
  mode = 'drag';
  reset();
  session = { start: Date.now(), set: 1, phase: 'drag', phaseEnds: performance.now() + SET_MS, setStartIdx: 0, setAvgs: [] };
  renderChips();
  renderPractice();
  setLive('info', `Set 1 of ${SESSION_SETS}: drag for 10 seconds, then rest for 10.`);
  sessionTimer = window.setInterval(sessionTick, 100);
  sessionTick();
}

function sessionTick(): void {
  const now = performance.now();
  // A loop, so phases still advance correctly if timers were throttled.
  while (session && now >= session.phaseEnds) {
    if (session.phase === 'drag') {
      const c = counts().slice(session.setStartIdx);
      if (c.length) session.setAvgs.push(mean(c));
      setLive('info', c.length ? `Set ${session.set}: ${c.length} drags, ${mean(c).toFixed(1)} per drag. Rest.` : `Set ${session.set}: no drags. Rest.`);
      if (session.set >= SESSION_SETS) return endSession('done');
      if (fading(session.setAvgs)) return endSession('fading');
      session.phase = 'rest';
      session.phaseEnds += REST_MS;
    } else {
      session.phase = 'drag';
      session.set++;
      session.setStartIdx = drags.length;
      session.phaseEnds += SET_MS;
    }
  }
  if (!session) return;
  const secs = Math.ceil((session.phaseEnds - now) / 1000);
  const total = SESSION_SETS * (SET_MS + REST_MS) - REST_MS;
  const elapsed = (session.set - 1) * (SET_MS + REST_MS) + (session.phase === 'rest' ? SET_MS : 0) +
    ((session.phase === 'drag' ? SET_MS : REST_MS) - (session.phaseEnds - now));
  sessionPhase.textContent = session.phase === 'drag' ? `DRAG · set ${session.set}/${SESSION_SETS}` : `REST · set ${session.set}/${SESSION_SETS}`;
  sessionPhase.className = `session-phase ${session.phase}`;
  sessionTime.textContent = `${fmtDur(total - elapsed)} left`;
  sessionProgress.style.width = `${Math.min(100, (elapsed / total) * 100)}%`;
  pad.className = session.phase === 'drag' ? 'pad running' : 'pad rest';
  padLabel.innerHTML = `<span class="count">${secs}</span><br>` +
    (session.phase === 'drag' ? 'Drag!' : 'Rest. Hands off the button');
}

function endSession(reason: 'done' | 'fading' | 'stopped'): void {
  if (!session) return;
  clearInterval(sessionTimer);
  const s = session;
  session = null;
  const end = Date.now();
  if (end - s.start >= FREE_MIN_MS) logPractice({ start: s.start, end, kind: 'session' });
  const avg = dragAvg().toFixed(1);
  const next = fmtClock(nextDue());
  pad.className = 'pad done';
  padLabel.innerHTML = `<strong>${reason === 'fading' ? 'Stopped early' : 'Session over'}</strong><br>` +
    `${drags.length} drags · ${avg} clicks per drag<br><small>Next session: ${next}. Clicking now counts as free practice.</small>`;
  renderTips(analyse(drags));
  if (reason === 'done') {
    notify('Session complete', `${drags.length} drags at ${avg} clicks per drag. Stop for now: next session ${next}.`);
  } else if (reason === 'fading') {
    const first = mean(s.setAvgs.slice(0, 5)).toFixed(1);
    const last = mean(s.setAvgs.slice(-5)).toFixed(1);
    notify('Time to stop', `Clicks per drag dropped from ~${first} to ~${last}. You're tiring, so more practice now won't help. Next session ${next}.`);
  }
  renderChips();
  renderPractice();
}

sessionBtn.onclick = () => (session ? endSession('stopped') : startSession());
setInterval(checkSchedule, 30_000);

clearBtn.onclick = () => {
  const what = `${btn} click${scope === 'length' ? `, ${duration}s` : ', all lengths'}`;
  if (!confirm(`Clear history for ${what}?`)) return;
  saveRuns(loadRuns().filter((r) => !inView(r)));
  renderHistory();
};

function pulse(): void {
  pad.classList.remove('pulse');
  void pad.offsetWidth;
  pad.classList.add('pulse');
}

pad.addEventListener('mousedown', (e) => {
  if (e.button !== BUTTON_CODE[btn] || state === 'done') return;
  e.preventDefault();
  if (mode !== 'timed') {
    if (session?.phase === 'rest') return;
    if (!session) noteActivity();
    if (mode === 'gaps') { countGapClick(performance.now()); return pulse(); }
    countDragClick(performance.now());
    return pulse();
  }
  // Clicks landing after the timer ran out (before the next frame) don't count.
  if (state === 'running' && (performance.now() - startedAt) / 1000 >= duration) return finish();
  if (state === 'idle') {
    state = 'running';
    startedAt = performance.now();
    pad.className = 'pad running';
    padLabel.textContent = 'Go!';
    raf = requestAnimationFrame(tick);
  }
  clicks++;
  noteActivity();
  countDragClick(performance.now());
  pulse();
});

window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => { if (!session && (e.key === 'r' || e.key === 'R')) reset(); });
resetBtn.onclick = () => { if (!session) reset(); };

$<HTMLButtonElement>('kofi').onclick = () => window.cps?.openKofi();

const guideBtn = $<HTMLButtonElement>('guide-btn');
const guide = $<HTMLElement>('guide');
const sideMain = $<HTMLDivElement>('side-main');
guideBtn.onclick = () => showPanel(guide.hidden ? 'guide' : null);

// --- Hand tracking ----------------------------------------------------------------
// A side-on camera watches the clicking hand. MediaPipe finds 21 points on the hand
// in every frame (all on this PC, nothing is sent anywhere), and each drag is matched
// to the frames recorded while it happened.
//
// Calibration marks the fingertip at the back and the front edge of the button. That
// gives the button's direction in the picture (angles read 0° = flat along the button,
// 90° = straight down) and its length, so a fingertip position can be described as a
// spot on the button. Other distances are in hand-lengths (wrist to index knuckle,
// roughly 9cm on an adult), so moving the camera closer or further doesn't change them.

interface Pt { x: number; y: number }
interface HandFrame { t: number; lm: Pt[] }
interface Calibration { back: Pt; front: Pt }
interface HandMetrics {
  angle: number; start: number; end: number; travel: number; speed: number; lift: number; turn: number; buttonCm: number;
}
interface Vision {
  FilesetResolver: { forVisionTasks(path: string): Promise<unknown> };
  HandLandmarker: {
    createFromOptions(fs: unknown, opts: unknown): Promise<HandLandmarkerInstance>;
  };
}
interface HandLandmarkerInstance {
  detectForVideo(v: HTMLVideoElement, t: number): { landmarks: { x: number; y: number; z: number }[][] };
  close(): void;
}
interface Window { mpVision?: Vision }

const WRIST = 0, INDEX_MCP = 5, INDEX_PIP = 6, INDEX_TIP = 8;
const HAND_CM = 9; // typical wrist-to-index-knuckle length, only used to show rough cm
const FRAME_KEEP_MS = 4000;
const CAM_KEY = 'handCamera';
const CAM_FPS_KEY = 'handCameraFps';
const CALIB_KEY = 'handCalibButton';
const LIFT = 0.08; // hand-lengths the tip must rise to count as lifting (~0.7cm)
const SPOT_DIFF = 0.15; // fraction of the button that counts as a different start spot

const handBtn = $<HTMLButtonElement>('hand-btn');
const handPanel = $<HTMLElement>('hand-panel');
const camSelect = $<HTMLSelectElement>('cam-select');
const camFps = $<HTMLSelectElement>('cam-fps');
camFps.value = String(load<number>(CAM_FPS_KEY, 60));
const camBtn = $<HTMLButtonElement>('cam-btn');
const camStatus = $<HTMLDivElement>('cam-status');
const markBackBtn = $<HTMLButtonElement>('mark-back');
const markFrontBtn = $<HTMLButtonElement>('mark-front');
const calibStatus = $<HTMLDivElement>('calib-status');
const camBox = $<HTMLDivElement>('cam-box');
const camVideo = $<HTMLVideoElement>('cam-video');
const camCanvas = $<HTMLCanvasElement>('cam-canvas');
const camReadout = $<HTMLDivElement>('cam-readout');

let landmarker: HandLandmarkerInstance | null = null;
let camStream: MediaStream | null = null;
let handFrames: HandFrame[] = [];
let lastHand: Pt[] | null = null;
let fpsCount = 0;
let fpsShown = 0;
let fpsTimer = 0;
let calib: Calibration | null = load<Calibration | null>(CALIB_KEY, null);
let pendingBack: Pt | null = null;
let marking = false;
// Where this run's best drags start (fraction along the button), drawn on the preview.
let targetSpot: number | null = null;
const handMetrics = new WeakMap<number[], HandMetrics | null>();

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const len = (a: Pt) => Math.hypot(a.x, a.y);
const cm = (handLengths: number) => (Math.abs(handLengths) * HAND_CM).toFixed(1);
const handScale = (lm: Pt[]) => len(sub(lm[INDEX_MCP], lm[WRIST])) || 1;

// Unit vectors along the button, back to front (u), and pointing up away from it (n).
function axes(c: Calibration | null = calib): { u: Pt; n: Pt } {
  let u = { x: 1, y: 0 };
  if (c) { const v = sub(c.front, c.back); const l = len(v) || 1; u = { x: v.x / l, y: v.y / l }; }
  let n = { x: u.y, y: -u.x };
  if (n.y > 0) n = { x: -n.x, y: -n.y }; // image y grows downwards, so "up" has negative y
  return { u, n };
}

// 0 = back of the button, 1 = front edge.
function spotOf(tip: Pt, c: Calibration | null = calib): number {
  if (!c) return 0;
  const { u } = axes(c);
  return dot(sub(tip, c.back), u) / (len(sub(c.front, c.back)) || 1);
}

function describeSpot(f: number, buttonCm?: number): string {
  const zone = f < 0.12 ? 'right at the back of the button'
    : f < 0.38 ? 'in the back third of the button'
    : f < 0.62 ? 'in the middle of the button'
    : f < 0.88 ? 'in the front third of the button'
    : 'right at the front edge of the button';
  const fromFront = buttonCm && f > 0 && f < 0.95 ? ` (about ${((1 - f) * buttonCm).toFixed(1)}cm from the front edge)` : '';
  return zone + fromFront;
}

function loadVision(): Promise<Vision> {
  if (window.mpVision) return Promise.resolve(window.mpVision);
  return new Promise((resolve, reject) => {
    window.addEventListener('mpready', () => (window.mpVision ? resolve(window.mpVision) : reject(new Error('no vision'))), { once: true });
    const s = document.createElement('script');
    s.type = 'module';
    s.src = 'hand-loader.mjs';
    s.onerror = () => reject(new Error('Could not load the hand tracker'));
    document.head.appendChild(s);
  });
}

async function listCameras(): Promise<void> {
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  const saved = load<string>(CAM_KEY, '');
  camSelect.innerHTML = '';
  if (!cams.length) {
    camSelect.appendChild(el('option', '', 'No cameras found'));
    return;
  }
  cams.forEach((c, i) => {
    const o = el('option', '', c.label || `Camera ${i + 1}`) as HTMLOptionElement;
    o.value = c.deviceId;
    camSelect.appendChild(o);
  });
  if (cams.some((c) => c.deviceId === saved)) camSelect.value = saved;
}

async function startCamera(): Promise<void> {
  camBtn.disabled = true;
  camStatus.textContent = 'Starting camera and hand tracker…';
  try {
    const vision = await loadVision();
    if (!landmarker) {
      const base = new URL('vendor/mediapipe/', location.href).href;
      const fileset = await vision.FilesetResolver.forVisionTasks(base + 'wasm');
      landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: base + 'hand_landmarker.task', delegate: 'GPU' },
        runningMode: 'VIDEO', numHands: 1,
      });
    }
    const deviceId = camSelect.value;
    const fps = Number(camFps.value);
    // max as well as ideal, so a faster camera is slowed to the chosen rate instead of ignoring it.
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: fps, max: fps } },
    });
    store(CAM_KEY, deviceId);
    store(CAM_FPS_KEY, fps);
    camVideo.srcObject = camStream;
    await camVideo.play();
    await listCameras(); // labels only appear once permission is granted
    camBox.hidden = false;
    handFrames = [];
    fpsTimer = window.setInterval(() => { fpsShown = fpsCount; fpsCount = 0; renderCamStatus(); }, 1000);
    camVideo.requestVideoFrameCallback(onFrame);
  } catch (err) {
    stopCamera();
    camStatus.textContent = `Couldn't start the camera: ${err instanceof Error ? err.message : String(err)}`;
  }
  camBtn.disabled = false;
  renderCamStatus();
}

function stopCamera(): void {
  camStream?.getTracks().forEach((t) => t.stop());
  camStream = null;
  camVideo.srcObject = null;
  camBox.hidden = true;
  clearInterval(fpsTimer);
  lastHand = null;
  clearRecordBuffer();
  renderCamStatus();
}

let lastDetectAt = 0;

function onFrame(now: DOMHighResTimeStamp, meta: VideoFrameCallbackMetadata): void {
  if (!camStream || !landmarker) return;
  // Stopping and restarting the camera can leave the old callback chain alive next to the
  // new one. The tracker breaks for good on a repeated timestamp, so the extra chain ends here.
  if (now <= lastDetectAt) return;
  lastDetectAt = now;
  // captureTime is when the camera took the frame, in the same clock as click times.
  const t = meta.captureTime ?? now;
  const res = landmarker.detectForVideo(camVideo, now);
  const w = camVideo.videoWidth;
  const h = camVideo.videoHeight;
  const hand = res.landmarks[0];
  lastHand = hand ? hand.map((p) => ({ x: p.x * w, y: p.y * h })) : null;
  if (lastHand) handFrames.push({ t, lm: lastHand });
  while (handFrames.length && handFrames[0].t < t - FRAME_KEEP_MS) handFrames.shift();
  if (recording) bufferFrame(t);
  fpsCount++;
  drawOverlay();
  camVideo.requestVideoFrameCallback(onFrame);
}

function fingerAngle(lm: Pt[], c: Calibration | null = calib): number {
  const { u, n } = axes(c);
  const v = sub(lm[INDEX_TIP], lm[INDEX_PIP]);
  return (Math.atan2(-dot(v, n), Math.abs(dot(v, u))) * 180) / Math.PI;
}

// MediaPipe's hand skeleton (joint pairs), kept here so replays can draw it without
// loading the tracker.
const HAND_BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

type Mark = 'hand' | 'finger' | 'button' | 'target' | 'flash';
const ALL_MARKS: Record<Mark, boolean> = { hand: true, finger: true, button: true, target: true, flash: true };

// Shared by the live preview and replays: hand skeleton, measured finger part, the
// calibrated button and a target start spot, each of which can be switched off.
function drawHand(ctx: CanvasRenderingContext2D, w: number, lm: Pt[] | null, c: Calibration | null, target: number | null,
  show: Record<Mark, boolean> = ALL_MARKS): void {
  const lw = Math.max(2, w / 400);
  if (c && show.button) {
    ctx.strokeStyle = 'rgba(240,165,68,.85)';
    ctx.lineWidth = lw;
    ctx.setLineDash([lw * 3, lw * 2]);
    ctx.beginPath();
    ctx.moveTo(c.back.x, c.back.y);
    ctx.lineTo(c.front.x, c.front.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (c && target !== null && show.target) {
    const p = { x: c.back.x + (c.front.x - c.back.x) * target, y: c.back.y + (c.front.y - c.back.y) * target };
    ctx.strokeStyle = '#3ecf8e';
    ctx.lineWidth = lw * 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, lw * 6, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (!lm) return;
  if (show.hand) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    for (const [a, b] of HAND_BONES) {
      ctx.beginPath();
      ctx.moveTo(lm[a].x, lm[a].y);
      ctx.lineTo(lm[b].x, lm[b].y);
      ctx.stroke();
    }
  }
  if (show.finger) {
    ctx.strokeStyle = '#3ecf8e';
    ctx.lineWidth = lw * 2.5;
    ctx.beginPath();
    ctx.moveTo(lm[INDEX_PIP].x, lm[INDEX_PIP].y);
    ctx.lineTo(lm[INDEX_TIP].x, lm[INDEX_TIP].y);
    ctx.stroke();
    ctx.fillStyle = '#3ecf8e';
    ctx.beginPath();
    ctx.arc(lm[INDEX_TIP].x, lm[INDEX_TIP].y, lw * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawOverlay(): void {
  const w = camVideo.videoWidth;
  const h = camVideo.videoHeight;
  if (camCanvas.width !== w) camCanvas.width = w;
  if (camCanvas.height !== h) camCanvas.height = h;
  const ctx = camCanvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  drawHand(ctx, w, lastHand, calib, targetSpot);
  const rec = recording ? '● REC · ' : '';
  if (!lastHand) camReadout.textContent = `${rec}No hand in view`;
  else if (!calib) camReadout.textContent = `${rec}Calibrate for angles and spots`;
  else camReadout.textContent = `${rec}Finger ${Math.round(fingerAngle(lastHand))}° · tip ${describeSpot(spotOf(lastHand[INDEX_TIP])).replace(' of the button', '')}`;
}

function renderCamStatus(): void {
  const on = !!camStream;
  camBtn.textContent = on ? 'Stop camera' : 'Start camera';
  camSelect.disabled = on;
  camFps.disabled = on;
  markBackBtn.disabled = !on || marking;
  markFrontBtn.disabled = !on || marking || !pendingBack;
  handBtn.classList.toggle('live', on);
  if (on) {
    camStatus.textContent = `Camera on · ${fpsShown} of ${camFps.value} fps · ${lastHand ? 'hand found' : 'no hand in view'}` +
      (fpsShown && fpsShown < 25 ? ' · low frame rate, try better lighting or a 60fps setting' : '');
  } else if (!camStatus.textContent?.startsWith("Couldn't")) {
    camStatus.textContent = 'Camera off.';
  }
  if (!marking) {
    calibStatus.textContent = pendingBack ? 'Back marked ✓. Now mark the front edge.'
      : calib ? 'Calibrated ✓ (do it again if you move the camera)' : 'Not calibrated yet.';
  }
  renderReplayCount();
}

// Counts down so the hand can get back on the mouse, then takes the median fingertip
// position over the last half second.
function markPoint(which: 'back' | 'front'): void {
  marking = true;
  renderCamStatus();
  let left = 3;
  const where = which === 'back' ? 'at the back of the button (the end nearest your palm)' : 'on the front edge of the button';
  const tick = () => {
    if (left > 0) {
      calibStatus.textContent = `Hold your fingertip ${where}… ${left}`;
      left--;
      setTimeout(tick, 1000);
      return;
    }
    marking = false;
    const now = performance.now();
    const tips = handFrames.filter((f) => f.t >= now - 500).map((f) => f.lm[INDEX_TIP]);
    if (!tips.length) {
      renderCamStatus();
      calibStatus.textContent = "Couldn't see your hand. Keep your whole hand in the camera view and try again.";
      return;
    }
    const p = { x: median(tips.map((q) => q.x)), y: median(tips.map((q) => q.y)) };
    if (which === 'back') {
      pendingBack = p;
    } else if (pendingBack) {
      const lm = handFrames[handFrames.length - 1].lm;
      if (len(sub(p, pendingBack)) < handScale(lm) * 0.2) {
        renderCamStatus();
        calibStatus.textContent = 'Those two spots are too close together. Mark the very back and the very front of the button.';
        return;
      }
      calib = { back: pendingBack, front: p };
      pendingBack = null;
      store(CALIB_KEY, calib);
    }
    renderCamStatus();
  };
  tick();
}

function measureDrag(d: number[]): HandMetrics | null {
  if (!camStream) return null;
  const fs = handFrames.filter((f) => f.t >= d[0] - 40 && f.t <= d[d.length - 1] + 40);
  if (!fs.length) return null;
  const { u, n } = axes();
  const first = fs[0].lm;
  const last = fs[fs.length - 1].lm;
  const scale = median(fs.map((f) => handScale(f.lm)));
  const angles = fs.map((f) => fingerAngle(f.lm));
  const up = (f: HandFrame) => dot(f.lm[INDEX_TIP], n) / scale;
  const dt = (fs[fs.length - 1].t - fs[0].t) / 1000;
  const travel = Math.abs(dot(last[INDEX_TIP], u) - dot(first[INDEX_TIP], u)) / scale;
  return {
    angle: median(angles),
    start: spotOf(first[INDEX_TIP]),
    end: spotOf(last[INDEX_TIP]),
    travel,
    speed: dt > 0 ? travel / dt : 0,
    lift: Math.max(...fs.map(up)) - up(fs[0]),
    turn: Math.max(...angles) - Math.min(...angles),
    buttonCm: calib ? (len(sub(calib.front, calib.back)) / scale) * HAND_CM : 0,
  };
}

// Drags with camera data so far this run, paired with their click counts.
function handSamples(ds: number[][]): { n: number; m: HandMetrics }[] {
  return ds.flatMap((d) => { const m = handMetrics.get(d); return m ? [{ n: d.length, m }] : []; });
}

interface GroupStats { angle: number; start: number; end: number; travel: number; speed: number; buttonCm: number }

// Average measurements of the best and worst thirds of drags, by clicks.
function bestWorst(samples: { n: number; m: HandMetrics }[]): { best: GroupStats; worst: GroupStats } {
  const sorted = [...samples].sort((a, b) => b.n - a.n);
  const k = Math.max(2, Math.floor(sorted.length / 3));
  const stats = (xs: { m: HandMetrics }[]): GroupStats => ({
    angle: mean(xs.map((x) => x.m.angle)), start: mean(xs.map((x) => x.m.start)), end: mean(xs.map((x) => x.m.end)),
    travel: mean(xs.map((x) => x.m.travel)), speed: mean(xs.map((x) => x.m.speed)), buttonCm: mean(xs.map((x) => x.m.buttonCm)),
  });
  return { best: stats(sorted.slice(0, k)), worst: stats(sorted.slice(-k)) };
}

// One sentence about the hand on the drag that just ended, or '' if nothing useful.
function handFeedback(d: number[]): string {
  if (!camStream) return '';
  const m = measureDrag(d);
  handMetrics.set(d, m);
  // Queued so rankings from quick back-to-back drags don't interleave.
  if (m && recording) setTimeout(() => { clipQueue = clipQueue.then(() => keepClip(d, m)).catch(() => {}); }, 350);
  if (!m) return "(Couldn't see your hand on that one.)";
  if (!calib) return '(Calibrate in the Hand tracking panel to get angle and position feedback.)';

  const samples = handSamples(drags);
  if (samples.length >= 8) targetSpot = bestWorst(samples).best.start;
  if (m.lift > LIFT) return `Your fingertip lifted about ${cm(m.lift)}cm partway through, so keep it pressed to the end.`;

  const earlier = handSamples(drags.slice(0, -1));
  if (earlier.length >= 8) {
    const { best } = bestWorst(earlier);
    if (Math.abs(m.angle - best.angle) >= 10) {
      return `Finger at ${Math.round(m.angle)}°; your best drags are around ${Math.round(best.angle)}°.`;
    }
    if (Math.abs(m.start - best.start) >= SPOT_DIFF) {
      return `You started ${describeSpot(m.start)}; your best drags start ${describeSpot(best.start, best.buttonCm)}.`;
    }
    return `Angle ${Math.round(m.angle)}°, started ${describeSpot(m.start)}, just like your best drags.`;
  }
  if (m.angle < 25) return `Finger is quite flat (${Math.round(m.angle)}°), so try tilting it up towards 45°.`;
  if (m.angle > 70) return `Finger is very steep (${Math.round(m.angle)}°), so try lowering it a little.`;
  if (m.turn > 20) return `Your finger angle changed by ${Math.round(m.turn)}° during the drag. Try to hold it steady.`;
  return `Angle ${Math.round(m.angle)}°, started ${describeSpot(m.start)}.`;
}

function handTips(ds: number[][]): Tip[] {
  const samples = handSamples(ds);
  if (!calib || samples.length < 8) {
    return camStream ? [{ kind: 'info', title: 'Hand tracking', body: `${samples.length} drags tracked so far. After 8 it compares your best and worst drags.` }] : [];
  }
  const tips: Tip[] = [];
  const { best: b, worst: w } = bestWorst(samples);
  const diffs: string[] = [];
  if (Math.abs(b.angle - w.angle) >= 8) diffs.push(`a ${b.angle > w.angle ? 'steeper' : 'flatter'} finger (${Math.round(b.angle)}° vs ${Math.round(w.angle)}°)`);
  if (Math.abs(b.start - w.start) >= SPOT_DIFF) diffs.push(`started ${describeSpot(b.start, b.buttonCm)} instead of ${describeSpot(w.start)}`);
  if (w.travel > 0 && Math.abs(b.travel - w.travel) / w.travel >= 0.25) diffs.push(`${b.travel > w.travel ? 'longer' : 'shorter'} drags (~${cm(b.travel)}cm vs ~${cm(w.travel)}cm)`);
  if (w.speed > 0 && Math.abs(b.speed - w.speed) / w.speed >= 0.3) diffs.push(`${b.speed > w.speed ? 'faster' : 'slower'} drags`);
  if (diffs.length) {
    tips.push({ kind: 'good', title: 'What your best drags do differently', body: `Compared with your worst drags, your best ones had ${diffs.join(', ')}. Aim for that.` });
  } else {
    tips.push({ kind: 'info', title: 'Best and worst drags look alike on camera', body: 'The difference is probably pressure, which a camera can\'t see. Focus on the pressure sweet spot.' });
  }
  tips.push({ kind: 'info', title: 'Your best drags', body: `Start ${describeSpot(b.start, b.buttonCm)} and finish ${describeSpot(b.end)}, with the finger at about ${Math.round(b.angle)}°. The green circle on the camera preview marks the start spot.` });

  const sd = (f: (m: HandMetrics) => number) => { const xs = samples.map((s) => f(s.m)); const a = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - a) ** 2))); };
  const startSd = sd((m) => m.start);
  if (startSd >= SPOT_DIFF) tips.push({ kind: 'fix', title: 'Your start spot moves around', body: `It varied by about ${(startSd * b.buttonCm).toFixed(1)}cm between drags. Start from the same place every time.` });
  const angleSd = sd((m) => m.angle);
  if (angleSd >= 10) tips.push({ kind: 'fix', title: 'Your finger angle varies', body: `It changed by about ${Math.round(angleSd)}° between drags. Keep the same angle for every drag.` });
  const lifts = samples.filter((s) => s.m.lift > LIFT).length / samples.length;
  if (lifts >= 0.3) tips.push({ kind: 'fix', title: 'Fingertip lifts partway', body: `${Math.round(lifts * 100)}% of drags lifted off partway. Keep light, steady contact to the end.` });
  return tips;
}

// --- Recording and replays ----------------------------------------------------------
// While recording, a short rolling buffer of small video frames is kept in memory.
// When a drag ranks among the session's 3 best or 3 worst, its frames are saved as JPEGs
// in IndexedDB (on this PC only) with its measurements and the reasons it was good or bad.

interface ClipFrame { t: number; img: Blob; lm: Pt[] | null }
interface ClipMeta {
  id: number; session: number; at: number; clicks: number; kind: 'best' | 'worst';
  metrics: HandMetrics; reasons: string[]; clickTimes: number[]; w: number; h: number;
  calib: Calibration | null; target: number | null; duration: number;
}

const REC_W = 360;
const REC_KEEP_MS = 3000;
const REC_PAD_MS = 250; // video kept either side of the drag
const REC_MIN_GAP_MS = 7; // records at most ~120fps even when tracking at 240, to keep clips small
const KEEP_EACH = 3;
const KEEP_SESSIONS = 10;
const REC_KEY = 'handRecord';

const recToggle = $<HTMLInputElement>('rec-toggle');
const replayCount = $<HTMLButtonElement>('replay-open');
const camReplayBtn = $<HTMLButtonElement>('cam-replays');

let recording = load<boolean>(REC_KEY, false);
let recBuffer: { t: number; bmp: ImageBitmap }[] = [];
let recSessionId = 0;
let recSessionDrags: number[][] | null = null;
// Drags ranked this session; clipId is set once its clip has been saved.
let recRanked: { d: number[]; clicks: number; m: HandMetrics; clipId: number | null }[] = [];
let clipCount = 0;
let clipQueue: Promise<void> = Promise.resolve();
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('drag-trainer', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('clips', { keyPath: 'id' });
      req.result.createObjectStore('frames');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(stores, mode);
    const req = fn(t);
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

const allClips = async () => ((await tx<ClipMeta[]>(['clips'], 'readonly', (t) => t.objectStore('clips').getAll())) ?? []);
const clipFrames = async (id: number) => (await tx<ClipFrame[]>(['frames'], 'readonly', (t) => t.objectStore('frames').get(id))) ?? [];
const deleteClip = (id: number) => tx(['clips', 'frames'], 'readwrite', (t) => { t.objectStore('clips').delete(id); t.objectStore('frames').delete(id); });

let recLastT = -Infinity;

function bufferFrame(t: number): void {
  if (t - recLastT < REC_MIN_GAP_MS) return;
  recLastT = t;
  const h =Math.round((REC_W * camVideo.videoHeight) / (camVideo.videoWidth || 1));
  createImageBitmap(camVideo, { resizeWidth: REC_W, resizeHeight: h, resizeQuality: 'medium' }).then((bmp) => {
    recBuffer.push({ t, bmp });
    while (recBuffer.length && recBuffer[0].t < t - REC_KEEP_MS) recBuffer.shift()!.bmp.close();
  }).catch(() => {});
}

function clearRecordBuffer(): void {
  recBuffer.forEach((f) => f.bmp.close());
  recBuffer = [];
  recLastT = -Infinity;
}

// Why a saved drag was good or bad, compared with the rest of its session.
function clipReasons(m: HandMetrics, clicks: number, kind: 'best' | 'worst', s: { best: GroupStats; worst: GroupStats } | null): string[] {
  const r: string[] = [];
  const a = Math.round(m.angle);
  if (kind === 'best') {
    r.push(`${clicks} clicks, one of your best drags this session.`);
    if (s && Math.abs(m.angle - s.worst.angle) >= 8) r.push(`Finger at ${a}°, ${Math.round(Math.abs(m.angle - s.worst.angle))}° ${m.angle > s.worst.angle ? 'steeper' : 'flatter'} than your worst drags.`);
    else r.push(`Finger at ${a}°${a >= 30 && a <= 60 ? ', a good middle angle' : ''}.`);
    r.push(`Started ${describeSpot(m.start, m.buttonCm)}` +
      (s && Math.abs(m.start - s.worst.start) >= SPOT_DIFF ? `, while your worst drags started ${describeSpot(s.worst.start)}.` : '.'));
    r.push(`Dragged about ${cm(m.travel)}cm, finishing ${describeSpot(m.end)}.`);
    if (m.turn < 12) r.push('Kept the finger angle steady the whole way.');
    if (m.lift < LIFT / 2) r.push('Fingertip stayed down from start to finish.');
    return r;
  }
  r.push(`${clicks} click${clicks === 1 ? '' : 's'}, one of your worst drags this session.`);
  const before = r.length;
  if (s && Math.abs(m.angle - s.best.angle) >= 8) r.push(`Finger at ${a}°, ${Math.round(Math.abs(m.angle - s.best.angle))}° ${m.angle < s.best.angle ? 'flatter' : 'steeper'} than your best drags (~${Math.round(s.best.angle)}°).`);
  else if (!s && a < 25) r.push(`Finger was quite flat (${a}°).`);
  else if (!s && a > 70) r.push(`Finger was very steep (${a}°).`);
  if (s && Math.abs(m.start - s.best.start) >= SPOT_DIFF) r.push(`Started ${describeSpot(m.start)}; your best drags start ${describeSpot(s.best.start, s.best.buttonCm)}.`);
  if (m.lift > LIFT) r.push(`Fingertip lifted about ${cm(m.lift)}cm partway through.`);
  if (m.turn > 20) r.push(`Finger angle wobbled by ${Math.round(m.turn)}° during the drag.`);
  if (s && s.best.travel > 0 && m.travel < s.best.travel * 0.6) r.push(`Short drag: about ${cm(m.travel)}cm, against ~${cm(s.best.travel)}cm on your best drags.`);
  if (r.length === before) r.push("On camera it looks like your good drags, so the difference was probably pressure, which the camera can't see.");
  return r;
}

async function keepClip(d: number[], m: HandMetrics): Promise<void> {
  if (!recording || !calib) return;
  if (recSessionDrags !== drags) {
    // A new run (Reset, new mode or new practice session) starts a new replay session.
    recSessionDrags = drags;
    recSessionId = Date.now();
    recRanked = [];
    await pruneSessions();
  }
  recRanked.push({ d, clicks: d.length, m, clipId: null });
  const byBest = [...recRanked].sort((a, b) => b.clicks - a.clicks);
  const best = byBest.slice(0, KEEP_EACH);
  const worst = byBest.slice(KEEP_EACH).slice(-KEEP_EACH);
  const kindOf = (x: (typeof recRanked)[number]) => (best.includes(x) ? 'best' : worst.includes(x) ? 'worst' : null);
  const stats = recRanked.length >= 6 ? bestWorst(recRanked.map((x) => ({ n: x.clicks, m: x.m }))) : null;

  for (const x of recRanked) {
    const kind = kindOf(x);
    if (!kind && x.clipId !== null) { await deleteClip(x.clipId); x.clipId = null; }
  }
  const entry = recRanked[recRanked.length - 1];
  if (kindOf(entry) && entry.clipId === null) entry.clipId = await saveClip(entry.d, entry.m);
  // Rankings and comparisons shift as the session goes on, so refresh every kept clip.
  for (const x of recRanked) {
    const kind = kindOf(x);
    if (!kind || x.clipId === null) continue;
    const id = x.clipId;
    const meta = (await tx<ClipMeta>(['clips'], 'readonly', (t) => t.objectStore('clips').get(id)));
    if (!meta) continue;
    meta.kind = kind;
    meta.reasons = clipReasons(x.m, x.clicks, kind, stats);
    meta.target = stats ? stats.best.start : null;
    await tx(['clips'], 'readwrite', (t) => { t.objectStore('clips').put(meta); });
  }
  renderReplayCount();
}

async function saveClip(d: number[], m: HandMetrics): Promise<number | null> {
  const t0 = d[0] - REC_PAD_MS;
  const t1 = d[d.length - 1] + REC_PAD_MS;
  const src = recBuffer.filter((f) => f.t >= t0 && f.t <= t1);
  if (src.length < 2) return null;
  const w = src[0].bmp.width;
  const h = src[0].bmp.height;
  const k = w / (camVideo.videoWidth || w);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const frames: ClipFrame[] = [];
  for (const f of src) {
    ctx.drawImage(f.bmp, 0, 0);
    const img = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    // Nearest tracked hand position, scaled down to the clip's size.
    const near = handFrames.reduce<HandFrame | null>((b, x) => (Math.abs(x.t - f.t) < 40 && (!b || Math.abs(x.t - f.t) < Math.abs(b.t - f.t)) ? x : b), null);
    frames.push({ t: f.t - t0, img, lm: near ? near.lm.map((p) => ({ x: p.x * k, y: p.y * k })) : null });
  }
  const id = Date.now() * 10 + (clipCount++ % 10);
  const meta: ClipMeta = {
    id, session: recSessionId, at: Date.now(), clicks: d.length, kind: 'best', metrics: m, reasons: [],
    clickTimes: d.map((t) => t - t0), w, h, duration: t1 - t0, target: null,
    calib: calib ? { back: { x: calib.back.x * k, y: calib.back.y * k }, front: { x: calib.front.x * k, y: calib.front.y * k } } : null,
  };
  await tx(['clips', 'frames'], 'readwrite', (t) => { t.objectStore('clips').put(meta); t.objectStore('frames').put(frames, id); });
  return id;
}

async function pruneSessions(): Promise<void> {
  const clips = await allClips();
  const sessions = [...new Set(clips.map((c) => c.session))].sort((a, b) => b - a);
  const drop = new Set(sessions.slice(KEEP_SESSIONS - 1));
  for (const c of clips) if (drop.has(c.session)) await deleteClip(c.id);
}

async function renderReplayCount(): Promise<void> {
  const n = (await allClips().catch(() => [])).length;
  replayCount.textContent = n ? `Open replays (${n})` : 'Open replays';
  camReplayBtn.textContent = n ? `Replays (${n})` : 'Replays';
}

recToggle.checked = recording;
recToggle.onchange = () => {
  recording = recToggle.checked;
  store(REC_KEY, recording);
  if (!recording) clearRecordBuffer();
};

// --- Replay player ------------------------------------------------------------------

const replays = $<HTMLDivElement>('replays');
const replayList = $<HTMLDivElement>('replay-list');
const replayCanvas = $<HTMLCanvasElement>('replay-canvas');
const replayInfo = $<HTMLDivElement>('replay-info');
const replayReasons = $<HTMLUListElement>('replay-reasons');
const replayPlay = $<HTMLButtonElement>('replay-play');
const replayScrub = $<HTMLInputElement>('replay-scrub');
const replaySpeeds = $<HTMLDivElement>('replay-speeds');
const replayClicks = $<HTMLSpanElement>('replay-clicks');
const replayMarkRow = $<HTMLDivElement>('replay-marks');
const MARKS_KEY = 'replayMarkings';
let marks: Record<Mark, boolean> = { ...ALL_MARKS, ...load<Partial<Record<Mark, boolean>>>(MARKS_KEY, {}) };

let current: { meta: ClipMeta; frames: { t: number; bmp: ImageBitmap; lm: Pt[] | null }[] } | null = null;
let playhead = 0;
let speed = 0.25;
let playing = false;
let replayRaf = 0;
let lastTick = 0;

async function openReplays(): Promise<void> {
  replays.hidden = false;
  const clips = (await allClips()).sort((a, b) => b.session - a.session || (a.kind === b.kind ? b.clicks - a.clicks : a.kind === 'best' ? -1 : 1));
  replayList.innerHTML = '';
  if (!clips.length) {
    replayList.appendChild(el('p', 'summary', 'No replays yet. Turn on "Record my drags" in the Hand tracking panel, then practise in Drag practice mode.'));
    drawReplayEmpty();
    return;
  }
  let session = -1;
  for (const c of clips) {
    if (c.session !== session) {
      session = c.session;
      replayList.appendChild(el('div', 'replay-session', new Date(session).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
    }
    const b = el('button', `replay-item ${c.kind}`, `${c.kind === 'best' ? 'Best' : 'Worst'} · ${c.clicks} click${c.clicks === 1 ? '' : 's'}`) as HTMLButtonElement;
    b.onclick = () => { replayList.querySelectorAll('.replay-item').forEach((x) => x.classList.remove('active')); b.classList.add('active'); loadClip(c); };
    replayList.appendChild(b);
  }
  (replayList.querySelector('.replay-item') as HTMLButtonElement | null)?.click();
}

function closeReplays(): void {
  replays.hidden = true;
  playing = false;
  cancelAnimationFrame(replayRaf);
  current?.frames.forEach((f) => f.bmp.close());
  current = null;
}

function drawReplayEmpty(): void {
  const ctx = replayCanvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, replayCanvas.width, replayCanvas.height);
  replayInfo.textContent = '';
  replayReasons.innerHTML = '';
  replayClicks.textContent = '';
}

async function loadClip(meta: ClipMeta): Promise<void> {
  playing = false;
  cancelAnimationFrame(replayRaf);
  current?.frames.forEach((f) => f.bmp.close());
  const raw = await clipFrames(meta.id);
  const frames = await Promise.all(raw.map(async (f) => ({ t: f.t, lm: f.lm, bmp: await createImageBitmap(f.img) })));
  current = { meta, frames };
  replayCanvas.width = meta.w;
  replayCanvas.height = meta.h;
  replayScrub.max = String(Math.round(meta.duration));
  const m = meta.metrics;
  replayInfo.textContent = `${meta.kind === 'best' ? 'Best' : 'Worst'} drag · ${meta.clicks} click${meta.clicks === 1 ? '' : 's'} · ` +
    `finger ${Math.round(m.angle)}° · ~${cm(m.travel)}cm in ${((meta.clickTimes[meta.clickTimes.length - 1] - meta.clickTimes[0]) / 1000).toFixed(2)}s`;
  replayInfo.className = `replay-info ${meta.kind}`;
  replayReasons.innerHTML = '';
  for (const r of meta.reasons) replayReasons.appendChild(el('li', '', r));
  seek(0);
  play();
}

function seek(ms: number): void {
  if (!current) return;
  playhead = Math.max(0, Math.min(ms, current.meta.duration));
  replayScrub.value = String(Math.round(playhead));
  drawReplay();
}

function drawReplay(): void {
  if (!current) return;
  const ctx = replayCanvas.getContext('2d');
  if (!ctx) return;
  const { meta, frames } = current;
  let f = frames[0];
  for (const x of frames) if (x.t <= playhead) f = x;
  ctx.drawImage(f.bmp, 0, 0);
  drawHand(ctx, meta.w, f.lm, meta.calib, meta.target, marks);
  const done = meta.clickTimes.filter((t) => t <= playhead).length;
  // A click landing in the last 40ms of playback flashes the frame.
  if (marks.flash && meta.clickTimes.some((t) => t <= playhead && t > playhead - 40)) {
    ctx.strokeStyle = '#3ecf8e';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, meta.w - 6, meta.h - 6);
  }
  replayClicks.textContent = `Clicks ${done} / ${meta.clicks} · ${(playhead / 1000).toFixed(2)}s`;
}

function play(): void {
  if (!current) return;
  if (playhead >= current.meta.duration) seek(0);
  playing = true;
  replayPlay.textContent = 'Pause';
  lastTick = performance.now();
  const step = (now: number) => {
    if (!playing || !current) return;
    playhead += (now - lastTick) * speed;
    lastTick = now;
    if (playhead >= current.meta.duration) {
      seek(current.meta.duration);
      playing = false;
      replayPlay.textContent = 'Play';
      return;
    }
    seek(playhead);
    replayRaf = requestAnimationFrame(step);
  };
  replayRaf = requestAnimationFrame(step);
}

function pause(): void {
  playing = false;
  replayPlay.textContent = 'Play';
  cancelAnimationFrame(replayRaf);
}

function stepFrame(dir: 1 | -1): void {
  if (!current) return;
  pause();
  const ts = current.frames.map((f) => f.t);
  const i = ts.findIndex((t) => t > playhead + 0.5);
  const cur = i === -1 ? ts.length - 1 : Math.max(0, i - 1);
  seek(ts[Math.max(0, Math.min(ts.length - 1, cur + dir))]);
}

function renderMarkButtons(): void {
  const all = Object.values(marks).every(Boolean);
  replayMarkRow.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) => {
    const k = b.dataset.mark as Mark | 'all';
    b.classList.toggle('active', k === 'all' ? all : marks[k]);
    b.onclick = () => {
      if (k === 'all') marks = Object.fromEntries(Object.keys(marks).map((m) => [m, !all])) as Record<Mark, boolean>;
      else marks[k] = !marks[k];
      store(MARKS_KEY, marks);
      renderMarkButtons();
      drawReplay();
    };
  });
}
renderMarkButtons();
replayPlay.onclick = () => (playing ? pause() : play());
replayScrub.oninput = () => { pause(); seek(Number(replayScrub.value)); };
$<HTMLButtonElement>('replay-prev').onclick = () => stepFrame(-1);
$<HTMLButtonElement>('replay-next').onclick = () => stepFrame(1);
$<HTMLButtonElement>('replay-close').onclick = closeReplays;
$<HTMLButtonElement>('replay-clear').onclick = async () => {
  if (!confirm('Delete all saved replays?')) return;
  for (const c of await allClips()) await deleteClip(c.id);
  recRanked.forEach((x) => { x.clipId = null; });
  closeReplays();
  renderReplayCount();
};
replaySpeeds.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) => {
  b.classList.toggle('active', Number(b.dataset.speed) === speed);
  b.onclick = () => {
    speed = Number(b.dataset.speed);
    replaySpeeds.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === b));
  };
});
replayCount.onclick = () => openReplays();
camReplayBtn.onclick = () => openReplays();
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !replays.hidden) closeReplays(); });

function showPanel(which: 'guide' | 'hand' | null): void {
  guide.hidden = which !== 'guide';
  handPanel.hidden = which !== 'hand';
  sideMain.hidden = which !== null;
  guideBtn.classList.toggle('active', which === 'guide');
  handBtn.classList.toggle('active', which === 'hand');
  guideBtn.textContent = which === 'guide' ? 'Back to practice' : 'How to drag click';
  handBtn.textContent = which === 'hand' ? 'Back to practice' : 'Hand tracking';
  if (which === 'guide') guide.scrollTop = 0;
  if (which === 'hand') { listCameras().catch(() => {}); renderCamStatus(); }
}

handBtn.onclick = () => showPanel(handPanel.hidden ? 'hand' : null);
camBtn.onclick = () => (camStream ? stopCamera() : startCamera());
markBackBtn.onclick = () => markPoint('back');
markFrontBtn.onclick = () => markPoint('front');
renderReplayCount();

applyBridge();
applyMaxGap();
renderChips();
reset();
checkSchedule();
