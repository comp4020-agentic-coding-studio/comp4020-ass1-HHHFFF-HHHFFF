import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  BASE_CONFIG,
  DEFAULT_CONTACTS,
  MAX_CONTACTS,
  MIN_CONTACTS,
  simulate,
  spreadTendency,
  tippingPoint,
} from "../sim";

// Assignment 1 asks for a core interaction stated plainly enough to write a
// test for. Here it is:
//
//   The visitor moves one slider --- how many people each person meets in a
//   day --- and re-runs an otherwise identical town. Everything else (the
//   layout, the first patient, the sequence of chance) is held fixed by a
//   seed, so any difference on screen is caused by the thing they moved.
//
// The template shipped a version of this test that clicked the control inside
// JSDOM and asserted the DOM changed. It cannot pass for this site, or for any
// site built by this template: JSDOM does not execute `<script type="module">`
// (probed 2026-08-09), which is the only script Vite emits, and it also has no
// requestAnimationFrame and no canvas. The click "failed" for reasons that had
// nothing to do with the page.
//
// So the contract is split across sensors that can actually see it: the
// markup half is asserted here in JSDOM, and the behaviour half is asserted
// against the simulation directly, which is why sim.ts is DOM-free. What is
// left --- that it looks right and feels right --- is checked in a real
// browser at both marked viewports, and is not pretended at here.

const DIST = resolve("dist");
const doc = new JSDOM(readFileSync(join(DIST, "index.html"), "utf8")).window.document;

function builtCss(): string {
  const assets = join(DIST, "assets");
  return readdirSync(assets)
    .filter((f) => f.endsWith(".css"))
    .map((f) => readFileSync(join(assets, f), "utf8"))
    .join("\n");
}

describe("core interaction: the controls exist and are usable", () => {
  it("tags the core interactive control, and it is a real button", () => {
    const control = doc.querySelector('[data-testid="interactive-control"]');
    expect(control, 'no element tagged data-testid="interactive-control"').toBeTruthy();
    expect(control!.tagName, "the core control must be keyboard-operable on its own").toBe("BUTTON");
    expect(control!.textContent?.trim(), "the control needs an accessible name").not.toBe("");
    expect(control!.hasAttribute("disabled")).toBe(false);
  });

  it("offers exactly one variable, and it is the contact rate", () => {
    const sliders = doc.querySelectorAll('input[type="range"]');
    expect(sliders.length, "the brief is one idea: one thing the visitor can change").toBe(1);

    const slider = sliders[0] as HTMLInputElement;
    expect(Number(slider.min)).toBe(MIN_CONTACTS);
    expect(Number(slider.max)).toBe(MAX_CONTACTS);
    expect(Number(slider.value)).toBe(DEFAULT_CONTACTS);
    expect(
      doc.querySelector(`label[for="${slider.id}"]`),
      "the slider needs a real label, not just placeholder text",
    ).toBeTruthy();
  });

  it("backs every `hidden` element with a CSS override", () => {
    // `hidden` is only a user-agent rule, and any author `display` beats it at
    // any specificity. Several panels here set their own display, so without
    // an explicit override they would sit on screen while every markup
    // assertion still reported them hidden. Derived from the built page rather
    // than a list, so a section added later is covered without editing this.
    const css = builtCss().replace(/\s+/g, "");
    const hiddenElements = Array.from(doc.querySelectorAll("[hidden]"));
    expect(hiddenElements.length, "the page reveals content as the story moves").toBeGreaterThan(4);

    for (const element of hiddenElements) {
      const cls = element.classList[0];
      expect(cls, `<${element.tagName.toLowerCase()} hidden> needs a class to key the override on`)
        .toBeTruthy();
      expect(css, `.${cls}[hidden] { display: none } is missing from the stylesheet`).toContain(
        `.${cls}[hidden]{display:none`,
      );
    }
  });

  it("starts the comparison empty and the tendency gauge hidden", () => {
    expect(doc.querySelector('[data-testid="compare-body"]')!.hasAttribute("hidden")).toBe(true);
    expect(doc.querySelector('[data-testid="compare-empty"]')!.hasAttribute("hidden")).toBe(false);
    // The threshold is meant to be discovered by running into it, not read off
    // a gauge before the visitor has seen anything happen.
    expect(doc.querySelector('[data-testid="tendency"]')!.hasAttribute("hidden")).toBe(true);
    expect(doc.querySelector('[data-testid="run-summary"]')!.hasAttribute("hidden")).toBe(true);
    expect(doc.querySelector('[data-testid="baseline-marker"]')!.hasAttribute("hidden")).toBe(true);
  });
});

describe("the story: predict, watch, change one thing, compare", () => {
  it("asks for a prediction before anything runs", () => {
    const choices = Array.from(doc.querySelectorAll("[data-predict]"));
    expect(choices.length, "three ways the outbreak could go").toBe(3);
    expect(choices.map((c) => c.getAttribute("data-predict")).sort()).toEqual([
      "big",
      "fizzle",
      "slow",
    ]);
    for (const choice of choices) {
      expect(choice.tagName).toBe("BUTTON");
      expect(choice.textContent?.trim()).not.toBe("");
    }
  });

  it("numbers its steps contiguously, in document order", () => {
    // Caught by a screenshot: the "change one thing" step used to share the
    // watch section's marker and swap in after the first run, so a first-time
    // reader saw 01, 03, 04 and a hole where 02 should be.
    const numbers = Array.from(doc.querySelectorAll(".step"))
      .map((el) => /^(\d+)/.exec(el.textContent!.trim())?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number);
    expect(numbers.length, "the story is told in numbered beats").toBeGreaterThan(3);
    expect(numbers, "a reader shouldn't meet a gap in the numbering").toEqual(
      numbers.map((_, i) => i + 1),
    );
  });

  it("puts the prediction ahead of the simulation in the document", () => {
    const predict = doc.querySelector("#predict")!;
    const watch = doc.querySelector("#watch")!;
    expect(
      predict.compareDocumentPosition(watch) & 4,
      "the prediction must come before the town, or it isn't a prediction",
    ).toBeTruthy();
  });

  it("keeps the run button and the slider in the same control group", () => {
    const controls = doc.querySelector(".controls")!;
    expect(controls.querySelector('[data-testid="interactive-control"]')).toBeTruthy();
    expect(
      controls.querySelector('input[type="range"]'),
      "splitting these across sections would strand one of them off-screen on a phone",
    ).toBeTruthy();
  });

  it("gives the baseline run something to be compared against", () => {
    // The comparison is only controlled if the second run differs in exactly
    // one input. Everything except contactsPerDay comes from BASE_CONFIG.
    const base = simulate(DEFAULT_CONTACTS);
    const changed = simulate(6);
    expect(base.population).toBe(changed.population);
    expect(base.history[0]!.infected).toBe(changed.history[0]!.infected);
    expect(base.peakInfected).toBeGreaterThan(changed.peakInfected);
    expect(base.everInfected).toBeGreaterThan(changed.everInfected);
  });

  it("makes the baseline run a large outbreak, so the prediction has an answer", () => {
    const base = simulate(DEFAULT_CONTACTS);
    expect(base.everInfected / base.population).toBeGreaterThan(0.35);
  });
});

describe("spread tendency: the threshold in plain clothes", () => {
  it("reads growing above the line and shrinking below it", () => {
    expect(spreadTendency(tippingPoint() + 1)).toBe("growing");
    expect(spreadTendency(tippingPoint() - 1)).toBe("shrinking");
    expect(spreadTendency(tippingPoint())).toBe("balanced");
  });

  it("agrees with what the simulation actually does", () => {
    // The gauge is a claim about the model. If they ever disagree, the page is
    // lying to the visitor in a way no screenshot would show.
    for (let c = MIN_CONTACTS; c <= MAX_CONTACTS; c += 1) {
      const share = simulate(c).everInfected / BASE_CONFIG.population;
      if (spreadTendency(c) === "shrinking") {
        expect(share, `${c} contacts a day is labelled shrinking but infected ${share}`).toBeLessThan(
          0.2,
        );
      }
    }
  });

  it("says the default is growing, so act 02 starts above the line", () => {
    expect(spreadTendency(DEFAULT_CONTACTS)).toBe("growing");
  });
});

describe("core interaction: using it changes the outcome", () => {
  const population = BASE_CONFIG.population;

  it("is reproducible: the same setting gives the same outbreak every time", () => {
    const a = simulate(DEFAULT_CONTACTS);
    const b = simulate(DEFAULT_CONTACTS);
    expect(b.everInfected).toBe(a.everInfected);
    expect(b.peakInfected).toBe(a.peakInfected);
    expect(b.lastDay).toBe(a.lastDay);
  });

  it("holds everything else fixed: the same town, whatever the contact rate", () => {
    const quiet = simulate(2).history[0]!;
    const busy = simulate(14).history[0]!;
    expect(quiet.susceptible).toBe(busy.susceptible);
    expect(quiet.infected, "always exactly one index case").toBe(1);
    expect(quiet.susceptible + quiet.infected).toBe(population);
  });

  it("takes off above the tipping point and dies out below it", () => {
    const above = simulate(DEFAULT_CONTACTS);
    const below = simulate(Math.floor(tippingPoint()));
    expect(above.everInfected).toBeGreaterThan(population * 0.5);
    expect(below.everInfected).toBeLessThan(population * 0.1);
  });

  it("has the cliff where the page says it does: between five and six a day", () => {
    expect(tippingPoint()).toBe(5);
    const five = simulate(5);
    const six = simulate(6);
    expect(
      six.everInfected,
      "one extra contact a day should be the difference the explainer promises",
    ).toBeGreaterThan(five.everInfected * 3);
  });

  it("moving the slider one notch changes what the visitor sees", () => {
    // The literal brief line: the visitor does something, and the picture is
    // different. Nearly every adjacent pair on the slider must do something.
    const changes: number[] = [];
    for (let c = MIN_CONTACTS; c < MAX_CONTACTS; c += 1) {
      const a = simulate(c);
      const b = simulate(c + 1);
      if (a.everInfected !== b.everInfected || a.peakInfected !== b.peakInfected) changes.push(c);
    }
    expect(changes.length, "most notches on the slider should change the outcome").toBeGreaterThan(
      MAX_CONTACTS - MIN_CONTACTS - 3,
    );
  });
});

describe("wide layout: text and the thing it discusses split into two columns above 56rem", () => {
  // The first attempt at this (three prose widths instead of six) fixed the
  // ragged right edge but left the diagnosis wrong: at 1920 the prose column
  // still ended at 936px inside a 1512px shell, so 45% of every text section
  // was empty. The actual fix put copy and companion side by side; this locks
  // the CSS contract in place so a later change can't quietly lose the split.
  it("defines the split as a CSS rule, not a JS one, so it holds without a re-render", () => {
    const css = builtCss().replace(/\s+/g, "");
    expect(css, "the >=56rem two-column rule for .act-split is missing").toContain(
      ".act-split{grid-template-columns:minmax(0,var(--measure))minmax(0,1fr)",
    );
  });

  it("gives every act-split section exactly one copy block and one companion, copy first", () => {
    const sections = Array.from(doc.querySelectorAll(".act-split"));
    expect(sections.length, "predict, change one thing, and why all split above 56rem").toBe(3);

    for (const section of sections) {
      // `why` also carries a closing `.why-callout`, which the >=56rem rule
      // spans across both columns rather than treating as a third one.
      const children = Array.from(section.children);
      expect(children.length, `#${section.id} needs at least two things to split into columns`)
        .toBeGreaterThanOrEqual(2);
      expect(
        children[0]!.classList.contains("act-copy"),
        `#${section.id}: reading order must stay copy-then-figure for phone and screen readers`,
      ).toBe(true);
      expect(
        children[1]!.classList.contains("act-copy"),
        `#${section.id}: the second column is the companion, not more copy`,
      ).toBe(false);
    }
  });
});

describe("the prose and the model agree", () => {
  const text = doc.body.textContent!.replace(/\s+/g, " ").toLowerCase();

  it("quotes the population the simulation actually runs", () => {
    expect(text).toContain(String(BASE_CONFIG.population));
  });

  it("names the tipping point the simulation actually has", () => {
    // If the model is retuned and the copy isn't, this is what catches it.
    expect(tippingPoint()).toBe(5);
    expect(text).toContain("between five and six contacts a day");
  });

  it("promises an eight-day illness and runs one", () => {
    expect(BASE_CONFIG.infectiousDays).toBe(8);
    expect(text).toContain("eight-day illness");
  });

  it("proves the tipping point in `04 Why?` with the model's own numbers", () => {
    // The copy used to pair "one meeting either side of the line" with the toll
    // from ten contacts a day — five notches above it — overstating a single
    // step threefold. Why? now shows only the two runs either side of the line,
    // as blocks, and each is read straight off the element so a retune of the
    // model fails here rather than quietly leaving the page wrong.
    const line = tippingPoint();
    const read = (id: string): string =>
      doc.querySelector(`[data-testid="${id}"]`)!.textContent!.trim();

    expect(read("why-below-rate")).toContain(`${line} contacts a day`);
    expect(read("why-below-value")).toBe(String(simulate(line).everInfected));
    expect(read("why-above-rate")).toContain(`${line + 1} contacts a day`);
    expect(read("why-above-value")).toBe(String(simulate(line + 1).everInfected));
  });

  it("keeps `04 Why?` to the one comparison that carries the point", () => {
    // Naming the default run's toll here as well pulls attention off the
    // single-step comparison, which is the whole argument of the section.
    const why = doc.querySelector("#why")!.textContent!.replace(/\s+/g, " ");
    expect(why).not.toContain(String(simulate(DEFAULT_CONTACTS).everInfected));
    // ...and it stays an explanation, not an epidemiology lecture or advice.
    for (const banned of ["r0", "beta", "gamma", "lockdown", "vaccin", "mask"]) {
      expect(why.toLowerCase()).not.toContain(banned);
    }
  });
});
