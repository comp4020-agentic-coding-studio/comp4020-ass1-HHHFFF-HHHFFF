import { makeOutbreak, type Outbreak, type Person, type RunSummary } from "./sim";

// One tick of the simulation per this many milliseconds. The simulation
// counts ticks, not frames, so a 120 Hz screen and a struggling laptop see the
// same outbreak at the same speed.
const TICK_MS = 20;
const MAX_TICKS_PER_FRAME = 6;

type Phase = "idle" | "running" | "paused" | "done";

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
  day: need<HTMLElement>('[data-testid="readout-day"]'),
  infected: need<HTMLElement>('[data-testid="readout-infected"]'),
  peak: need<HTMLElement>('[data-testid="readout-peak"]'),
  ever: need<HTMLElement>('[data-testid="readout-ever"]'),
  prompt: need<HTMLElement>('[data-testid="prompt"]'),
  comparison: need<HTMLElement>('[data-testid="comparison"]'),
  comparisonTitle: need<HTMLElement>('[data-testid="comparison-title"]'),
  comparisonNote: need<HTMLElement>('[data-testid="comparison-note"]'),
  headBefore: need<HTMLElement>('[data-testid="compare-head-before"]'),
  headAfter: need<HTMLElement>('[data-testid="compare-head-after"]'),
  everBefore: need<HTMLElement>('[data-testid="compare-ever-before"]'),
  everAfter: need<HTMLElement>('[data-testid="compare-ever-after"]'),
  peakBefore: need<HTMLElement>('[data-testid="compare-peak-before"]'),
  peakAfter: need<HTMLElement>('[data-testid="compare-peak-after"]'),
  daysBefore: need<HTMLElement>('[data-testid="compare-days-before"]'),
  daysAfter: need<HTMLElement>('[data-testid="compare-days-after"]'),
};

const ctx = ui.canvas.getContext("2d");
const stillPlease = window.matchMedia?.("(prefers-reduced-motion: reduce)");

let phase: Phase = "idle";
let sim: Outbreak = makeOutbreak(readContacts());
/** Positions as first drawn, used when the visitor asked for less motion. */
let anchors: Array<{ x: number; y: number }> = snapshotPositions(sim.people);
/** The last finished run: the "before" column, and the dashed line. */
let lastFinished: RunSummary | null = null;
/** The run being compared against while the current one plays. */
let ghost: RunSummary | null = null;
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

function snapshotPositions(people: Person[]): Array<{ x: number; y: number }> {
  return people.map((p) => ({ x: p.x, y: p.y }));
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
  ghost = lastFinished;
  sim = makeOutbreak(readContacts());
  anchors = snapshotPositions(sim.people);
  phase = "running";
  carryMs = 0;
  ui.comparison.hidden = true;

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
  if (ghost) showComparison(ghost, summary);
  lastFinished = summary;
  render();
  updateChrome();
}

function startOver(): void {
  cancelAnimationFrame(frameHandle);
  phase = "idle";
  lastFinished = null;
  ghost = null;
  sim = makeOutbreak(readContacts());
  anchors = snapshotPositions(sim.people);
  ui.comparison.hidden = true;
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
    }
    ctx.beginPath();
    ctx.arc(x, y, person.state === "infected" ? r * 1.25 : r, 0, Math.PI * 2);
    ctx.fillStyle = COLOURS[person.state];
    ctx.globalAlpha = person.state === "recovered" ? 0.75 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

/* Drawing the curve -------------------------------------------------------- */

const CHART = { left: 8, right: 592, top: 14, bottom: 200 };

function niceCeil(value: number, steps: number[]): number {
  for (const step of steps) if (value <= step) return step;
  return steps[steps.length - 1]!;
}

function pointsFor(history: RunSummary["history"], xMax: number, yMax: number): string {
  const sx = (CHART.right - CHART.left) / xMax;
  const sy = (CHART.bottom - CHART.top) / yMax;
  return history
    .map((p) => `${(CHART.left + p.day * sx).toFixed(1)},${(CHART.bottom - p.infected * sy).toFixed(1)}`)
    .join(" ");
}

function drawChart(): void {
  const xMax = niceCeil(
    Math.max(sim.day, ghost?.lastDay ?? 0, lastFinished?.lastDay ?? 0, 20),
    [20, 30, 45, 60, 90, 120, 140],
  );
  const yMax = niceCeil(
    Math.max(sim.peakInfected, ghost?.peakInfected ?? 0, 6),
    [6, 10, 15, 25, 40, 60, 90, 130, 180],
  );

  const current = pointsFor(sim.history, xMax, yMax);
  setHidden(ui.chartEmpty, sim.history.length > 1 || ghost !== null);
  ui.curve.setAttribute("points", current);
  ui.curveFill.setAttribute(
    "points",
    current === ""
      ? ""
      : `${CHART.left},${CHART.bottom} ${current} ${(CHART.left + sim.day * ((CHART.right - CHART.left) / xMax)).toFixed(1)},${CHART.bottom}`,
  );

  if (ghost) {
    ui.ghostCurve.setAttribute("points", pointsFor(ghost.history, xMax, yMax));
    setHidden(ui.ghostCurve, false);
  } else {
    setHidden(ui.ghostCurve, true);
  }

  ui.chartY.textContent = ghost
    ? `Infected at once (0–${yMax}) · dashed = ${ghost.contactsPerDay} a day`
    : `Infected at once (0–${yMax})`;
  ui.chartX.textContent = `Day 0–${xMax}`;
  ui.chart.setAttribute(
    "aria-label",
    `Infected people over time. Day ${sim.day} of up to ${xMax}. ${sim.infected} infected now, ${sim.peakInfected} at the worst.`,
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

function updateChrome(): void {
  const c = readContacts();
  ui.contactsValue.textContent = `${c} contacts a day, each person`;

  if (phase === "running") ui.run.textContent = "Pause";
  else if (phase === "paused") ui.run.textContent = "Resume";
  else if (lastFinished) ui.run.textContent = `Run again — ${c} a day`;
  else ui.run.textContent = "Start the outbreak";

  const changed = lastFinished !== null && c !== lastFinished.contactsPerDay;
  ui.run.dataset.nudge = String(changed && phase !== "running");
  ui.sliderBox.dataset.highlight = String(
    phase === "done" && lastFinished !== null && c === lastFinished.contactsPerDay,
  );
  ui.prompt.textContent = promptFor(c);
}

function promptFor(c: number): string {
  if (phase === "running" || phase === "paused") {
    return "Red is infectious. Green has had it and can't catch it again. Every line is one meeting.";
  }
  if (!lastFinished) {
    return `One person is infected. Everyone else is healthy. Press start and watch what ${c} contacts a day does.`;
  }
  const { everInfected, peakInfected, population, contactsPerDay } = lastFinished;

  // The visitor has moved the slider since the last run: point at the rerun.
  if (c !== contactsPerDay) {
    return `Same town, same virus, same first patient — now at ${c} contacts a day instead of ${contactsPerDay}. Run it.`;
  }

  // A comparison just landed. Say what it means, not what to do next.
  if (ghost) {
    const gap = ghost.everInfected - everInfected;
    if (gap > 0) {
      return `The dashed line is the town you just left. ${gap} people who caught it at ${ghost.contactsPerDay} contacts a day never caught it at ${contactsPerDay} — same virus, same first patient, one number moved.`;
    }
    if (gap < 0) {
      return `The dashed line is the town you just left. Going the other way cost ${-gap} more people. Nothing about the virus changed.`;
    }
    return "Both runs came out the same. The seed is fixed, so that is the model talking, not luck.";
  }

  return everInfected > population * 0.25
    ? `${everInfected} of ${population} people caught it, and ${peakInfected} were sick on the worst day. Now change just one thing — move the slider — and run the same town again.`
    : `Only ${everInfected} of ${population} people ever caught it. Move the slider up and watch how little it takes to change that.`;
}

function showComparison(before: RunSummary, after: RunSummary): void {
  ui.headBefore.textContent = `${before.contactsPerDay} a day`;
  ui.headAfter.textContent = `${after.contactsPerDay} a day`;
  ui.everBefore.textContent = `${before.everInfected} of ${before.population}`;
  ui.everAfter.textContent = `${after.everInfected} of ${after.population}`;
  ui.peakBefore.textContent = `${before.peakInfected} at once`;
  ui.peakAfter.textContent = `${after.peakInfected} at once`;
  ui.daysBefore.textContent = `${before.lastDay} days`;
  ui.daysAfter.textContent = `${after.lastDay} days`;
  ui.comparisonTitle.textContent =
    after.contactsPerDay === before.contactsPerDay
      ? "You changed nothing"
      : `You changed ${Math.abs(after.contactsPerDay - before.contactsPerDay)} ${
          Math.abs(after.contactsPerDay - before.contactsPerDay) === 1 ? "contact" : "contacts"
        } a day`;
  ui.comparisonNote.textContent = noteFor(before, after);
  ui.comparison.hidden = false;
}

function noteFor(before: RunSummary, after: RunSummary): string {
  const step = after.contactsPerDay - before.contactsPerDay;
  if (step === 0) {
    return "Identical settings, identical outbreak — the random seed is fixed, so nothing here is luck. Move the slider and try again.";
  }
  const collapsed = after.everInfected <= before.everInfected * 0.3;
  const grew = after.everInfected > before.everInfected * 1.3;
  if (collapsed) {
    return `${Math.abs(step)} fewer ${Math.abs(step) === 1 ? "contact" : "contacts"} a day didn't slow this outbreak down. It stopped it — the chain broke before it found most of the town.`;
  }
  if (grew) {
    return `${step} more a day, and the outbreak reached ${after.everInfected - before.everInfected} extra people. Nothing about the virus changed.`;
  }
  return after.peakInfected < before.peakInfected
    ? `Fewer people sick at once (${before.peakInfected} → ${after.peakInfected}), often spread over more days. That gap is what a hospital feels.`
    : `Not much moved. Keep going — the change that matters is not evenly spaced along this slider.`;
}

/* Wiring ------------------------------------------------------------------- */

// Test seam. Headless Chrome runs only a frame or so per second of virtual
// time, so an animation driven by requestAnimationFrame is invisible to a
// screenshot or a --dump-dom check: the page sits on day 0 forever. This lets
// an automated check advance the same simulation the visitor sees, without
// waiting for frames, so the rendered page can actually be inspected mid- and
// post-outbreak. It reads and drives existing state; it cannot set an outcome.
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
});

render();
updateChrome();
