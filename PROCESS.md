# Process overview

## What I built

*One Small Change, One Very Different Outbreak* — an interactive explainer with
one mechanic: contacts per day. A town of 180 dots, one index case, a seeded
simulation, one slider. The visitor predicts, watches a baseline run, changes
one number, compares both curves. The threshold sits at five contacts a day —
one contact either side is the difference between 10 infected and 51. Vaccines,
masks, more parameters — all absent, since each would blur the one comparison
the piece exists to make.

## The moments that mattered

### 1. The test that could never pass

The starter shipped a JSDOM test that clicked the control and asserted the DOM
changed. It was red; the obvious fix was a classic script instead of a module.
Probing JSDOM first showed it never executes `<script type="module">`
— the only script Vite emits — and has no `requestAnimationFrame` or canvas.
Satisfying it meant contorting the site around a blind sensor. Instead I
replaced the sensor: the simulation became a DOM-free module, JSDOM kept the
markup contract, and rendering is checked in real Chrome. To confirm the
boundary holds I retuned `transmissionProb` — three spec tests failed
immediately, all prose-to-model. The copy can no longer drift from the
simulation without the build going red.
[`a71d57b...e2e4125`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-HHHFFF-HHHFFF/compare/a71d57b...e2e4125)

### 2. The page I could not see

Screenshots showed the outbreak frozen on day 0. Headless Chrome renders
roughly a frame per second without a compositor, so twenty seconds of virtual
time advanced the sim one day — every interactive state was invisible. Rather
than accept screenshots of a dead page, I added a test seam that steps the
simulation without frames, and corrected `CLAUDE.md`'s `file://`
recipe, which had been screenshotting a page running no JavaScript at all:
Chrome blocks module scripts from that origin. The seam rendered day 0,
mid-outbreak and completed states, matching the headless sweep exactly — 141
infected, peak 40, 51 days.
[`e2e4125`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-HHHFFF-HHHFFF/commit/e2e4125)

### 3. A bug 36 green tests could not see

Rebuilding the page as a narrative, every test passed — and a screenshot showed
steps reading 01, 03, 04, a hole where 02 should be, because "change one thing"
shared the watch section's marker. The obvious fix was patching the markup.
Instead I asked what class of error got through: the tests knew each section's
content, nothing about the sequence a reader meets. The fix ships with an
invariant asserting step numbers run 1..n with no gap. The same pass caught a
prompt still saying "Run it" after the run had happened.
[`e2e4125...75dc1b6`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-HHHFFF-HHHFFF/compare/e2e4125...75dc1b6)

### 4. Fixing the symptom, twice, before the cause

At 1920 the text ran at six widths, so I capped it to three named tokens. That
fixed the ragged edge but was the wrong diagnosis: prose ended at 936px
inside a 1512px shell, leaving 45% of every section empty. The real cause was
that nothing sat beside the text, so each section's figure moved up next to it,
DOM order kept copy-then-figure so phone and screen-reader order hold. Verified
by re-measuring the 390px frame (`clientWidth=390 scrollWidth=390`, no sub-24px
targets) rather than trusting the diagnosis again. Nothing pinned the split, so
a later edit could drop it silently; a spec assertion now locks the `>=56rem`
rule and the copy-before-companion order.
[`84276f6...ad1caf4`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-HHHFFF-HHHFFF/compare/84276f6...ad1caf4)

## Where to look

The harness is what these moments produced:
[`4d33689`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-HHHFFF-HHHFFF/commit/4d33689)
turns each failure above into an executable rule in `CLAUDE.md`, named by its
trigger. Every later commit was written against that file — including
[`e7ef905`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-HHHFFF-HHHFFF/commit/e7ef905),
which deletes a rule I had never checked.
