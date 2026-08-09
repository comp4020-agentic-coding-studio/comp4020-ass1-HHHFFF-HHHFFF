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

  it("starts with the comparison hidden, and backs `hidden` with CSS", () => {
    const compare = doc.querySelector('[data-testid="comparison"]');
    expect(compare!.hasAttribute("hidden")).toBe(true);
    // `hidden` is only a user-agent rule, and any author `display` beats it.
    // The comparison panel sets `display: grid`, so without this override it
    // would render while every markup assertion still said it was hidden.
    expect(
      builtCss().replace(/\s+/g, ""),
      "an element that sets its own display needs an explicit [hidden] override",
    ).toContain(".compare[hidden]{display:none");
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
});
