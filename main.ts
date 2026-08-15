import {
  DEFAULT_CONTACTS,
  makeOutbreak,
  reproductionNumber,
  spreadTendency,
  wrongWayRound,
  type Outbreak,
  type Person,
  type RunSummary,
  type Tendency,
} from "./sim";

// One tick of the simulation per this many milliseconds. The simulation
// counts ticks, not frames, so a 120 Hz screen and a struggling laptop see the
// same outbreak at the same speed.
const TICK_MS = 22;
const MAX_TICKS_PER_FRAME = 6;

type Phase = "idle" | "running" | "paused" | "done";
type Guess = "fizzle" | "slow" | "big";

function need<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`missing element: ${selector}`);
  return found;
}

// `hidden` is an HTMLElement property; SVG elements only have the attribute.
// Both are honoured by CSS, which is where the actual hiding happens.
function setHidden(element: Element, hidden: boolean): void {
  if (hidden) element.setAttribute("hidden", "");
  else element.removeAttribute("hidden");
}

const ui = {
  watchSection: need<HTMLElement>("#watch"),
  compareSection: need<HTMLElement>("#compare"),
  actTitle: need<HTMLElement>('[data-testid="act-title"]'),

  predictions: Array.from(document.querySelectorAll<HTMLButtonElement>("[data-predict]")),
  predictionEcho: need<HTMLElement>('[data-testid="prediction-echo"]'),

  canvas: need<HTMLCanvasElement>("#field"),
  chart: need<SVGSVGElement>("#chart"),
  curve: need<SVGPolylineElement>(".curve"),
  curveFill: need<SVGPolygonElement>(".curve-fill"),
  ghostCurve: need<SVGPolylineElement>(".ghost-curve"),
  chartEmpty: need<SVGTextElement>(".chart-empty"),
  chartY: need<HTMLElement>('[data-testid="chart-y"]'),
  chartX: need<HTMLElement>('[data-testid="chart-x"]'),

  run: need<HTMLButtonElement>("#run"),
  reset: need<HTMLButtonElement>("#reset"),
  contacts: need<HTMLInputElement>("#contacts"),
  contactsValue: need<HTMLOutputElement>('[data-testid="contacts-value"]'),
  sliderBox: need<HTMLElement>(".slider"),
  baselineMarker: need<HTMLElement>('[data-testid="baseline-marker"]'),
  baselineLabel: need<HTMLElement>('[data-testid="baseline-label"]'),

  tendency: need<HTMLElement>('[data-testid="tendency"]'),
  tendencyPill: need<HTMLElement>('[data-testid="tendency-pill"]'),
  tendencyDetail: need<HTMLElement>('[data-testid="tendency-detail"]'),
  thresholdNotice: need<HTMLElement>('[data-testid="threshold-notice"]'),

  day: need<HTMLElement>('[data-testid="readout-day"]'),
  infected: need<HTMLElement>('[data-testid="readout-infected"]'),
  peak: need<HTMLElement>('[data-testid="readout-peak"]'),
  ever: need<HTMLElement>('[data-testid="readout-ever"]'),

  runSummary: need<HTMLElement>('[data-testid="run-summary"]'),
  runVerdict: need<HTMLElement>('[data-testid="run-verdict"]'),
  summaryPeak: need<HTMLElement>('[data-testid="summary-peak"]'),
  summaryTotal: need<HTMLElement>('[data-testid="summary-total"]'),
  summaryDays: need<HTMLElement>('[data-testid="summary-days"]'),

  prompt: need<HTMLElement>('[data-testid="prompt"]'),
  announcer: need<HTMLElement>('[data-testid="announcer"]'),

  compareEmpty: need<HTMLElement>('[data-testid="compare-empty"]'),
  compareBody: need<HTMLElement>('[data-testid="compare-body"]'),
  overlay: need<SVGSVGElement>("#overlay"),
  overlayBase: need<SVGPolylineElement>('[data-testid="overlay-base"]'),
  overlayMod: need<SVGPolylineElement>('[data-testid="overlay-mod"]'),
  overlayFill: need<SVGPolygonElement>(".overlay-fill"),
  overlayScale: need<HTMLElement>('[data-testid="overlay-scale"]'),
  legendBase: need<HTMLElement>('[data-testid="legend-base"]'),
  legendMod: need<HTMLElement>('[data-testid="legend-mod"]'),
  headBefore: need<HTMLElement>('[data-testid="compare-head-before"]'),
  headAfter: need<HTMLElement>('[data-testid="compare-head-after"]'),
  everBefore: need<HTMLElement>('[data-testid="compare-ever-before"]'),
  everAfter: need<HTMLElement>('[data-testid="compare-ever-after"]'),
  everDelta: need<HTMLElement>('[data-testid="compare-ever-delta"]'),
  peakBefore: need<HTMLElement>('[data-testid="compare-peak-before"]'),
  peakAfter: need<HTMLElement>('[data-testid="compare-peak-after"]'),
  peakDelta: need<HTMLElement>('[data-testid="compare-peak-delta"]'),
  daysBefore: need<HTMLElement>('[data-testid="compare-days-before"]'),
  daysAfter: need<HTMLElement>('[data-testid="compare-days-after"]'),
  daysDelta: need<HTMLElement>('[data-testid="compare-days-delta"]'),
  totalUnit: need<HTMLElement>('[data-testid="total-unit"]'),
  compareNote: need<HTMLElement>('[data-testid="comparison-note"]'),
};

const ctx = ui.canvas.getContext("2d");
const stillPlease = window.matchMedia?.("(prefers-reduced-motion: reduce)");

let phase: Phase = "idle";
let guess: Guess | null = null;
let sim: Outbreak = makeOutbreak(readContacts());
/** Positions as first drawn, used when the visitor asked for less motion. */
let anchors: Array<{ x: number; y: number }> = snapshotPositions(sim.people);
/** The first completed run. Fixed: every later run is compared against it, so
 *  the comparison stays controlled however many times the visitor re-runs. */
let baseline: RunSummary | null = null;
let lastFinished: RunSummary | null = null;
let frameHandle = 0;
let carryMs = 0;
let lastFrameAt = 0;

/* Reading the controls ----------------------------------------------------- */

function readContacts(): number {
  return Number(ui.contacts.value);
}

function stillMode(): boolean {
  return stillPlease?.matches === true;
}

/** An outbreak is on screen and unfinished. Paused counts: it is still mid-run. */
function inFlight(): boolean {
  return phase === "running" || phase === "paused";
}

function snapshotPositions(people: Person[]): Array<{ x: number; y: number }> {
  return people.map((p) => ({ x: p.x, y: p.y }));
}

function scrollTo(target: HTMLElement): void {
  target.scrollIntoView({ behavior: stillMode() ? "auto" : "smooth", block: "start" });
}

/* The loop ----------------------------------------------------------------- */

function frame(now: number): void {
  if (phase !== "running") return;
  const dt = Math.min(now - lastFrameAt, 250);
  lastFrameAt = now;
  carryMs += dt;

  let steps = 0;
  while (carryMs >= TICK_MS && steps < MAX_TICKS_PER_FRAME && !sim.finished) {
    sim.tick();
    carryMs -= TICK_MS;
    steps += 1;
  }
  if (carryMs > TICK_MS * MAX_TICKS_PER_FRAME) carryMs = 0;

  render();
  if (sim.finished) finish();
  else frameHandle = requestAnimationFrame(frame);
}

function startRun(): void {
  sim = makeOutbreak(readContacts());
  anchors = snapshotPositions(sim.people);
  phase = "running";
  carryMs = 0;
  setHidden(ui.runSummary, true);
  setHidden(ui.thresholdNotice, true);

  if (typeof requestAnimationFrame !== "function") {
    // No animation host (a test runner, say): the outbreak still has an
    // answer, so give it, rather than leaving the page frozen.
    sim.runToEnd();
    render();
    finish();
    return;
  }
  lastFrameAt = performance.now();
  render();
  updateChrome();
  frameHandle = requestAnimationFrame(frame);
}

function pause(): void {
  phase = "paused";
  cancelAnimationFrame(frameHandle);
  updateChrome();
}

function resume(): void {
  phase = "running";
  lastFrameAt = performance.now();
  carryMs = 0;
  updateChrome();
  frameHandle = requestAnimationFrame(frame);
}

function finish(): void {
  phase = "done";
  // Nobody is infectious any more, so no meeting should still be drawn.
  sim.contacts.length = 0;
  const summary = sim.summary();
  const isFirst = baseline === null;
  if (isFirst) baseline = summary;
  lastFinished = summary;

  showRunSummary(summary, isFirst);
  if (baseline && !isFirst) {
    showCompare(baseline, summary);
    scrollTo(ui.compareSection);
  }
  render();
  updateChrome();
  // After showCompare, so the note it reads is the one on screen.
  announce(speakOutcome(summary, isFirst));
}

/**
 * The whole payoff of the page — how many caught it, and what the comparison
 * made of that — arrives by unhiding a panel, which says nothing to a screen
 * reader. This is the one place it gets spoken.
 */
function speakOutcome(summary: RunSummary, isFirst: boolean): string {
  const head = `Run finished at ${summary.contactsPerDay} contacts a day. ${summary.everInfected} of ${summary.population} caught it, ${summary.peakInfected} on the worst day, over ${summary.lastDay} days.`;
  return isFirst ? head : `${head} ${ui.compareNote.textContent}`;
}

function announce(message: string): void {
  ui.announcer.textContent = message;
}

function startOver(): void {
  cancelAnimationFrame(frameHandle);
  phase = "idle";
  baseline = null;
  lastFinished = null;
  ui.contacts.value = String(DEFAULT_CONTACTS);
  sim = makeOutbreak(readContacts());
  anchors = snapshotPositions(sim.people);
  setHidden(ui.runSummary, true);
  setHidden(ui.thresholdNotice, true);
  setHidden(ui.compareBody, true);
  setHidden(ui.compareEmpty, false);
  setHidden(ui.ghostCurve, true);
  render();
  updateChrome();
}

/* Drawing the town --------------------------------------------------------- */

function fitCanvas(): { w: number; h: number } | null {
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = ui.canvas.clientWidth;
  const h = ui.canvas.clientHeight;
  if (w === 0 || h === 0) return null;
  const wantW = Math.round(w * dpr);
  const wantH = Math.round(h * dpr);
  if (ui.canvas.width !== wantW || ui.canvas.height !== wantH) {
    ui.canvas.width = wantW;
    ui.canvas.height = wantH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

const COLOURS = {
  susceptible: "#b4bcc8",
  infected: "#d6402c",
  recovered: "#3f8f80",
};

function drawField(): void {
  const size = fitCanvas();
  if (!ctx || !size) return;
  const { w, h } = size;
  const pad = Math.max(10, w * 0.03);
  const span = Math.min(w, h) - pad * 2;
  const ox = (w - span) / 2;
  const oy = (h - span) / 2;
  const still = stillMode();
  const r = Math.max(2.4, span * 0.0115);

  ctx.clearRect(0, 0, w, h);

  const at = (i: number): { x: number; y: number } => {
    const p = still ? anchors[i]! : sim.people[i]!;
    return { x: ox + p.x * span, y: oy + p.y * span };
  };

  if (!still) {
    for (const contact of sim.contacts) {
      // Ordinary meetings vanish almost immediately; the ones that passed it
      // on linger. At forty infected people every tick draws a hundred lines,
      // and undimmed they turn the town into a hairball.
      const life = contact.transmitted ? 7 : 2;
      const fade = 1 - contact.age / life;
      if (fade <= 0) continue;
      const a = at(contact.from);
      const b = at(contact.to);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = contact.transmitted
        ? `rgba(214, 64, 44, ${fade * 0.9})`
        : `rgba(120, 128, 140, ${fade * 0.22})`;
      ctx.lineWidth = contact.transmitted ? 1.6 : 1;
      ctx.stroke();
    }
  }

  sim.people.forEach((person, i) => {
    const { x, y } = at(i);
    if (person.state === "infected" && !still && person.ticksInfected < 12) {
      const t = person.ticksInfected / 12;
      ctx.beginPath();
      ctx.arc(x, y, r * (1 + t * 3), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(214, 64, 44, ${0.3 * (1 - t)})`;
      ctx.fill();
      // A crisp ring on the first few ticks, so a change of state reads as
      // "this person just caught it" rather than as a dot quietly recolouring.
      if (person.ticksInfected < 5) {
        ctx.beginPath();
        ctx.arc(x, y, r * (1.8 + person.ticksInfected * 0.5), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(214, 64, 44, ${0.85 - person.ticksInfected * 0.16})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.arc(x, y, person.state === "infected" ? r * 1.25 : r, 0, Math.PI * 2);
    ctx.fillStyle = COLOURS[person.state];
    ctx.globalAlpha = person.state === "recovered" ? 0.75 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

/* Drawing the curves ------------------------------------------------------- */

interface Geometry {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const PLOT: Geometry = { left: 8, right: 592, top: 14, bottom: 200 };
const X_STEPS = [20, 30, 45, 60, 90, 120, 140];
const Y_STEPS = [6, 10, 15, 25, 40, 60, 90, 130, 180];

function niceCeil(value: number, steps: number[]): number {
  for (const step of steps) if (value <= step) return step;
  return steps[steps.length - 1]!;
}

function pointsFor(history: RunSummary["history"], xMax: number, yMax: number): string {
  const sx = (PLOT.right - PLOT.left) / xMax;
  const sy = (PLOT.bottom - PLOT.top) / yMax;
  return history
    .map(
      (p) => `${(PLOT.left + p.day * sx).toFixed(1)},${(PLOT.bottom - p.infected * sy).toFixed(1)}`,
    )
    .join(" ");
}

function closedUnder(points: string, lastDay: number, xMax: number): string {
  if (points === "") return "";
  const x = (PLOT.left + lastDay * ((PLOT.right - PLOT.left) / xMax)).toFixed(1);
  return `${PLOT.left},${PLOT.bottom} ${points} ${x},${PLOT.bottom}`;
}

function drawChart(): void {
  const xMax = niceCeil(Math.max(sim.day, baseline?.lastDay ?? 0, 20), X_STEPS);
  const yMax = niceCeil(Math.max(sim.peakInfected, baseline?.peakInfected ?? 0, 6), Y_STEPS);

  const current = pointsFor(sim.history, xMax, yMax);
  setHidden(ui.chartEmpty, sim.history.length > 1 || baseline !== null);
  ui.curve.setAttribute("points", current);
  ui.curveFill.setAttribute("points", closedUnder(current, sim.day, xMax));

  // During a re-run the baseline sits underneath as a dashed line, so the
  // difference is visible while it happens, not only afterwards.
  const showGhost = baseline !== null && lastFinished !== baseline;
  if (baseline && showGhost) {
    ui.ghostCurve.setAttribute("points", pointsFor(baseline.history, xMax, yMax));
  }
  setHidden(ui.ghostCurve, !showGhost);

  ui.chartY.textContent = showGhost
    ? `Infected at once (0–${yMax}) · dashed = baseline`
    : `Infected at once (0–${yMax})`;
  ui.chartX.textContent = `Day 0–${xMax}`;
  ui.chart.setAttribute(
    "aria-label",
    `Infected people over time. Day ${sim.day} of up to ${xMax}. ${sim.infected} infected now, ${sim.peakInfected} at the worst.`,
  );
}

function drawOverlay(base: RunSummary, mod: RunSummary): void {
  const xMax = niceCeil(Math.max(base.lastDay, mod.lastDay, 20), X_STEPS);
  const yMax = niceCeil(Math.max(base.peakInfected, mod.peakInfected, 6), Y_STEPS);
  const modPoints = pointsFor(mod.history, xMax, yMax);

  ui.overlayBase.setAttribute("points", pointsFor(base.history, xMax, yMax));
  ui.overlayMod.setAttribute("points", modPoints);
  ui.overlayFill.setAttribute("points", closedUnder(modPoints, mod.lastDay, xMax));
  ui.legendBase.textContent = `Baseline — ${base.contactsPerDay} contacts a day`;
  ui.legendMod.textContent = `Yours — ${mod.contactsPerDay} contacts a day`;
  ui.overlayScale.textContent = `0–${yMax} infected · day 0–${xMax}`;
  ui.overlay.setAttribute(
    "aria-label",
    `Both outbreaks on the same axes. Baseline at ${base.contactsPerDay} contacts a day peaked at ${base.peakInfected}; yours at ${mod.contactsPerDay} peaked at ${mod.peakInfected}.`,
  );
}

/* Numbers, labels, narration ----------------------------------------------- */

function render(): void {
  drawField();
  drawChart();
  ui.day.textContent = String(sim.day);
  ui.infected.textContent = String(sim.infected);
  ui.peak.textContent = String(sim.peakInfected);
  ui.ever.textContent = String(sim.everInfected);
  ui.canvas.setAttribute(
    "aria-label",
    `A town of ${sim.config.population} people on day ${sim.day}: ${sim.infected} infected, ${sim.recovered} recovered.`,
  );
}

const TENDENCY_LABEL: Record<Tendency, string> = {
  growing: "Growing",
  shrinking: "Shrinking",
  balanced: "On the line",
};

function updateChrome(): void {
  const c = readContacts();
  ui.contactsValue.textContent = `${c} contacts a day, each person`;
  // A range input announces a bare "10" without this — no unit, and none of
  // what the number means. The tendency rides along once there is a baseline,
  // so arrowing across the line is audible, but not while a run is in flight,
  // when it would describe a rate that outbreak isn't using.
  const spoken = `${c} ${c === 1 ? "contact" : "contacts"} a day`;
  ui.contacts.setAttribute(
    "aria-valuetext",
    baseline && !inFlight()
      ? `${spoken}, ${TENDENCY_LABEL[spreadTendency(c)].toLowerCase()}`
      : spoken,
  );

  if (phase === "running") ui.run.textContent = "Pause";
  else if (phase === "paused") ui.run.textContent = "Resume";
  else if (baseline) ui.run.textContent = `Run again — ${c} a day`;
  else ui.run.textContent = "Start the outbreak";

  const moved = baseline !== null && c !== baseline.contactsPerDay;
  ui.run.dataset.nudge = String(moved && phase !== "running");
  ui.sliderBox.dataset.highlight = String(
    phase === "done" && baseline !== null && c === baseline.contactsPerDay,
  );

  // Act 02 only becomes an instruction once there is a baseline to change.
  ui.actTitle.textContent = baseline ? "Now change just one thing" : "Then change just one thing";

  updateBaselineMarker();
  updateTendency(c);
  ui.prompt.textContent = promptFor(c);
}

function updateBaselineMarker(): void {
  if (!baseline) {
    setHidden(ui.baselineMarker, true);
    return;
  }
  const min = Number(ui.contacts.min);
  const max = Number(ui.contacts.max);
  const pct = (baseline.contactsPerDay - min) / (max - min);
  // The thumb is about 16px wide and its centre never reaches the track ends,
  // so a plain percentage would drift by half a thumb at each extreme.
  ui.baselineMarker.style.left = `calc(8px + (100% - 16px) * ${pct})`;
  ui.baselineLabel.textContent = `baseline ${baseline.contactsPerDay}`;
  setHidden(ui.baselineMarker, false);
}

function updateTendency(c: number): void {
  // Withheld during act 01 on purpose: the visitor should meet the threshold
  // by running into it, not by reading a gauge before they have seen anything.
  if (!baseline) {
    setHidden(ui.tendency, true);
    setHidden(ui.thresholdNotice, true);
    return;
  }
  // `startRun` reads the slider once, at the start, so moving it mid-run does
  // not touch the outbreak on screen. While one is in flight the gauge has to
  // describe the rate that outbreak is actually running at, and say which rate
  // that is. Pause at twelve a day and drag to three, and this used to announce
  // "Shrinking — each infected person passes it to about 0.6 others" over a
  // twelve-a-day outbreak sitting paused mid-screen; resuming then infected 145.
  const live = inFlight();
  const rate = live ? sim.config.contactsPerDay : c;
  const now = spreadTendency(rate);
  const onward = reproductionNumber(rate);
  ui.tendencyPill.textContent = TENDENCY_LABEL[now];
  ui.tendencyPill.dataset.tendency = now;
  ui.tendencyDetail.textContent = live
    ? `this run is at ${rate} a day — each infected person passes it to about ${onward.toFixed(1)} others`
    : `each infected person passes it to about ${onward.toFixed(1)} others`;
  setHidden(ui.tendency, false);

  // "You crossed the threshold" is about a change you are about to run, so it
  // has nothing to say while an outbreak is already in flight.
  const before = spreadTendency(baseline.contactsPerDay);
  if (now === before || live) {
    setHidden(ui.thresholdNotice, true);
    return;
  }
  ui.thresholdNotice.textContent =
    now === "growing"
      ? `You crossed back over the threshold. At ${c} a day each infection makes more than one more, so the outbreak has room to grow again.`
      : `You crossed the threshold. At ${c} a day each infection makes less than one more — every round should now be smaller than the one before it.`;
  setHidden(ui.thresholdNotice, false);
}

function promptFor(c: number): string {
  if (phase === "running" || phase === "paused") {
    return "Red is infectious. Green has had it and can't catch it again. Every line is one meeting.";
  }
  if (!baseline) {
    return `One person is infected. Everyone else is healthy. Press start and watch what ${c} contacts a day does.`;
  }
  // A comparison has already landed and the slider hasn't moved since: send
  // them to the result, not back to a button they have just pressed.
  if (lastFinished && lastFinished !== baseline && c === lastFinished.contactsPerDay) {
    return "Both runs are drawn on the same axes below — same people, same first patient, one input apart. Move the slider again to try another version.";
  }
  if (c !== baseline.contactsPerDay) {
    const step = Math.abs(c - baseline.contactsPerDay);
    return `Same town, same virus, same first patient — ${step} ${step === 1 ? "contact" : "contacts"} a day ${c < baseline.contactsPerDay ? "fewer" : "more"}. Run it and see what that alone is worth.`;
  }
  // Careful here. Contacts per day decides how many draws `meet()` takes each
  // tick, so two rates walk the same seeded stream at different speeds and
  // meet their luck in different places. The town, the virus and the first
  // patient really are pinned; the exact run of chance is not, and promising
  // otherwise is what makes an unlucky pair read as the page contradicting
  // itself.
  return "Move the slider. The town, the virus and the first patient are all pinned — the contact rate is the one input you can change, and everything the two runs do differently follows from it.";
}

/* Prediction ---------------------------------------------------------------- */

const GUESS_PHRASE: Record<Guess, string> = {
  fizzle: "it would die out quickly",
  slow: "it would spread slowly",
  big: "it would become a large outbreak",
};

const OUTCOME_PHRASE: Record<Guess, string> = {
  fizzle: "it died out",
  slow: "it spread, but slowly",
  big: "it became a large outbreak",
};

function outcomeOf(summary: RunSummary): Guess {
  const share = summary.everInfected / summary.population;
  if (share <= 0.1) return "fizzle";
  if (share <= 0.35) return "slow";
  return "big";
}

function choosePrediction(kind: Guess): void {
  guess = kind;
  for (const button of ui.predictions) {
    button.setAttribute("aria-pressed", String(button.dataset.predict === kind));
  }
  ui.predictionEcho.textContent = `You said ${GUESS_PHRASE[kind]}. Hold that thought — run the town and find out.`;
  setHidden(ui.predictionEcho, false);
  scrollTo(ui.watchSection);
}

function showRunSummary(summary: RunSummary, isFirst: boolean): void {
  ui.summaryPeak.textContent = `${summary.peakInfected} at once`;
  ui.summaryTotal.textContent = `${summary.everInfected} of ${summary.population}`;
  ui.summaryDays.textContent = `${summary.lastDay} days`;

  const detail = `${summary.everInfected} of ${summary.population} caught it, ${summary.peakInfected} of them on the worst day`;
  if (isFirst && guess) {
    const actual = outcomeOf(summary);
    ui.runVerdict.textContent =
      guess === actual
        ? `You called it: ${OUTCOME_PHRASE[actual]}. ${detail}.`
        : `You said ${GUESS_PHRASE[guess]}. In fact ${OUTCOME_PHRASE[actual]} — ${detail}.`;
  } else {
    ui.runVerdict.textContent = `${detail}.`;
  }
  setHidden(ui.runSummary, false);
}

function showCompare(base: RunSummary, mod: RunSummary): void {
  drawOverlay(base, mod);

  ui.headBefore.textContent = `${base.contactsPerDay} a day`;
  ui.headAfter.textContent = `${mod.contactsPerDay} a day`;
  ui.peakBefore.textContent = `${base.peakInfected}`;
  ui.peakAfter.textContent = `${mod.peakInfected}`;
  // "141 of 180" twice in one row collides at 390px, so the population moves
  // into the row header and the cells stay short enough to sit side by side.
  ui.totalUnit.textContent = `of ${base.population}`;
  ui.everBefore.textContent = `${base.everInfected}`;
  ui.everAfter.textContent = `${mod.everInfected}`;
  ui.daysBefore.textContent = `${base.lastDay} days`;
  ui.daysAfter.textContent = `${mod.lastDay} days`;

  // Same reasoning as the duration column below: when the pair runs against the
  // argument, a green "−30" would be the page claiming that meeting more people
  // helped. It doesn't know that — this run is one draw, and the note says so.
  const upended = wrongWayRound(base, mod);
  setDelta(ui.peakDelta, mod.peakInfected - base.peakInfected, upended);
  setDelta(ui.everDelta, mod.everInfected - base.everInfected, upended);
  // Duration is left uncoloured on purpose: fewer days is good when the
  // outbreak was stopped and bad when it was merely flattened, so green here
  // would be the page asserting something it doesn't know.
  setDelta(ui.daysDelta, mod.lastDay - base.lastDay, true);

  ui.compareNote.textContent = noteFor(base, mod);
  setHidden(ui.compareEmpty, true);
  setHidden(ui.compareBody, false);
}

function setDelta(cell: HTMLElement, delta: number, neutral = false): void {
  cell.textContent = delta === 0 ? "no change" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`;
  cell.dataset.dir = neutral || delta === 0 ? "same" : delta > 0 ? "up" : "down";
}

function noteFor(base: RunSummary, mod: RunSummary): string {
  const step = mod.contactsPerDay - base.contactsPerDay;
  if (step === 0) {
    return "Identical settings, identical outbreak — a given rate always runs exactly the same way, so re-running this number can't tell you anything new. Move the slider and run it again.";
  }
  const size = Math.abs(step);
  const contacts = `${size} ${size === 1 ? "contact" : "contacts"} a day`;
  const spared = base.everInfected - mod.everInfected;

  // Say it plainly when this particular pair runs against the argument, rather
  // than reaching for one of the explanations below — all of which assume the
  // outbreak moved the way the contact rate did.
  if (wrongWayRound(base, mod)) {
    return `${contacts} ${step > 0 ? "more" : "fewer"}, and this time the outbreak came out ${step > 0 ? "smaller" : "larger"}. The seed is fixed, but changing the rate changes where the luck falls, so two neighbouring settings can land the wrong way round. It's the span of the slider that carries the argument, not one step of it — move further from the baseline and it shows.`;
  }

  if (mod.everInfected <= base.everInfected * 0.3) {
    return `${contacts} ${step < 0 ? "fewer" : "more"} didn't slow this outbreak down. It stopped it: ${spared} people who caught it in the baseline never caught it here, because the chain broke before it found the town.`;
  }
  if (mod.everInfected > base.everInfected * 1.3) {
    return `${contacts} more, and the outbreak reached ${Math.abs(spared)} extra people. Nothing about the virus changed.`;
  }
  if (mod.peakInfected < base.peakInfected) {
    return `The worst day went from ${base.peakInfected} sick at once to ${mod.peakInfected}, spread over ${mod.lastDay - base.lastDay > 0 ? "more" : "fewer"} days. Same people, same virus — fewer chances.`;
  }
  return "Not much moved. Keep going: the change that matters isn't spread evenly along this slider, and there is a point where it stops being gradual.";
}

/* Test seam ----------------------------------------------------------------- */

// Headless Chrome runs only a frame or so per second of virtual time, so an
// animation driven by requestAnimationFrame is invisible to a screenshot or a
// --dump-dom check: the page sits on day 0 forever. This lets an automated
// check advance the same simulation the visitor sees, without waiting for
// frames. It reads and drives existing state; it cannot set an outcome.
declare global {
  interface Window {
    outbreakHarness?: { advanceDays: (days: number) => void };
  }
}

window.outbreakHarness = {
  advanceDays(days: number): void {
    const ticks = Math.max(0, Math.round(days)) * sim.config.ticksPerDay;
    for (let i = 0; i < ticks && !sim.finished; i += 1) sim.tick();
    render();
    if (sim.finished && phase === "running") finish();
  },
};

/* Wiring ------------------------------------------------------------------- */

for (const button of ui.predictions) {
  button.addEventListener("click", () => {
    choosePrediction(button.dataset.predict as Guess);
  });
}

ui.run.addEventListener("click", () => {
  if (phase === "running") pause();
  else if (phase === "paused") resume();
  else startRun();
});

ui.reset.addEventListener("click", startOver);

ui.contacts.addEventListener("input", () => {
  updateChrome();
});

window.addEventListener("resize", () => {
  // Positions live in a unit square, so a resize only re-maps them: the
  // outbreak in progress is untouched.
  render();
  updateBaselineMarker();
});

render();
updateChrome();
