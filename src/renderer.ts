type Btn = 'left' | 'right';
type State = 'idle' | 'running' | 'done';
type Mode = 'timed' | 'drag';

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
  return tips;
}

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
  clearTimeout(idleTimer);
  setLive('info', mode === 'drag'
    ? 'Feedback on each drag shows here. Pause for 2s to get a session report.'
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
  lengthGroup.hidden = mode === 'drag';
  timedStats.hidden = mode === 'drag';
  dragStats.hidden = mode === 'timed';
  historySection.hidden = mode === 'drag';
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
  if (isBest) setBest(cps);
  saveRuns([...loadRuns(), { btn, duration, clicks, cps, at: Date.now() }]);
  renderHistory();
  renderTips(analyse(drags, duration));
  update(startedAt + duration * 1000);
  pad.className = 'pad done';
  padLabel.innerHTML = `<strong>${cps.toFixed(2)} CPS</strong><br>${clicks} clicks in ${duration}s` +
    `<br>${drags.length} drags · ${dragAvg().toFixed(1)} clicks per drag` +
    (isBest ? '<br><em>New best!</em>' : '') + '<br><small>Press Reset or R to go again</small>';
}

function reset(): void {
  cancelAnimationFrame(raf);
  state = 'idle';
  clicks = 0;
  drags = [];
  resetCoach();
  pad.className = 'pad';
  padLabel.textContent = mode === 'drag'
    ? `Drag ${btn} click here. No timer, press R to clear`
    : `${btn === 'left' ? 'Left' : 'Right'} click here to start`;
  update();
  renderDrags();
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
  if (mode === 'drag') {
    if (session?.phase === 'rest') return;
    if (!session) noteActivity();
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
guideBtn.onclick = () => {
  const open = !!guide.hidden;
  guide.hidden = !open;
  sideMain.hidden = open;
  guideBtn.classList.toggle('active', open);
  guideBtn.textContent = open ? 'Back to practice' : 'How to drag click';
  if (open) guide.scrollTop = 0;
};

renderChips();
reset();
checkSchedule();
