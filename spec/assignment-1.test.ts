import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// Turns spec line 4 ("the visitor does something that changes what they
// see") into a test that survives whatever mechanic you end up building.
// Tag your core interactive control with data-testid="interactive-control"
// and this fires it and checks the page actually changed --- it doesn't care
// how, so it isn't tied to a specific idea or DOM shape. Starts red: there's
// no prototype yet.
const distPath = resolve("dist/index.html");

function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const start = Date.now();
    const poll = (): void => {
      if (check()) return resolvePromise();
      if (Date.now() - start > timeoutMs) return rejectPromise(new Error("timed out waiting"));
      setTimeout(poll, 20);
    };
    poll();
  });
}

describe("core interaction (assignment-1 spec)", () => {
  it("tags a core interactive control on the home page", () => {
    const doc = new JSDOM(readFileSync(distPath, "utf8")).window.document;
    expect(
      doc.querySelector('[data-testid="interactive-control"]'),
      'tag your core interactive element with data-testid="interactive-control" so this test can find it',
    ).toBeTruthy();
  });

  it("changes what the visitor sees when they use it", async () => {
    const dom = new JSDOM(readFileSync(distPath, "utf8"), {
      url: pathToFileURL(distPath).toString(),
      runScripts: "dangerously",
      resources: "usable",
    });
    const { document } = dom.window;

    await waitFor(() => document.querySelector('[data-testid="interactive-control"]') !== null);
    const control = document.querySelector('[data-testid="interactive-control"]')!;

    const before = document.body.innerHTML;
    control.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await waitFor(() => document.body.innerHTML !== before).catch(() => {
      // no observed change within the timeout --- assertion below reports it
    });

    expect(
      document.body.innerHTML,
      "clicking the interactive control didn't change the page --- the brief asks for a visitor action that changes what they see",
    ).not.toBe(before);

    dom.window.close();
  });
});
