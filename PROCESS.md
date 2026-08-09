# Process overview

## What I built

*One Small Change, One Very Different Outbreak* — an interactive explainer with
one mechanic: how many people each person meets in a day. A town of 180 dots,
one index case, a seeded simulation, one slider. The visitor predicts what will
happen, watches a baseline outbreak, changes exactly one number, and gets both
curves on the same axes. The idea is the threshold: between five and six
contacts a day, the same virus in the same town goes from ten people infected to
a hundred and forty. Everything that would dilute that — vaccines, masks, real
COVID data, a second parameter — is deliberately absent.

## The moments that mattered

### 1. The test that could never pass

The starter shipped a spec test that clicked the control in JSDOM and asserted
the DOM changed. It was red, and the obvious fix was to make it green: emit a
classic script instead of a module, or add an inline script the test could see.
Before doing that I probed JSDOM and found it does not execute
`<script type="module">` at all — the only script Vite emits — and has no
`requestAnimationFrame` and no canvas. The test was failing for reasons that had
nothing to do with my page, and satisfying it would have meant contorting the
site around a blind sensor. So I replaced the sensor: the simulation moved into
a DOM-free module testable on its own, JSDOM kept only the markup contract, and
what renders is checked in real Chrome. I knew it had taken when tests that
pin the copy to the model went red on a retune.
[`a71d57b...e2e4125`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-HHHFFF-HHHFFF/compare/a71d57b...e2e4125)

### 2. Choosing the tipping point by sweep, not by eye

The whole piece rests on there being a sharp, findable threshold. The easy path
was to pick plausible transmission numbers and eyeball whether the outbreak
"looked right". Because the simulation was already DOM-free, I swept it instead
— eight seeds against every contact rate — and read the table rather than the
animation. Seed 20260817 gave a monotone response with a cliff between 5 and 6
contacts a day: 10 people infected against 51. That is now asserted in the spec,
so retuning the model without rewriting the copy fails the build.
[`e2e4125`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-HHHFFF-HHHFFF/commit/e2e4125)

### 3. The page I could not see

Screenshots showed the outbreak frozen on day 0. Twenty seconds of virtual time
in headless Chrome advanced it by one simulated day, because headless produces
roughly a frame per second without a compositor — so every interactive state was
invisible to verification. Rather than accept screenshots of a dead page, I
added a small documented test seam that steps the same simulation the visitor
sees without waiting for frames, and corrected `CLAUDE.md`, whose `file://`
screenshot recipe was silently wrong: Chrome blocks module scripts from a
`file://` origin, so those screenshots were of a page with no JavaScript at all.
[`e2e4125`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-HHHFFF-HHHFFF/commit/e2e4125)

### 4. A bug 36 green tests could not see

Rebuilding the page as a narrative, every test passed — and a screenshot showed
the steps reading 01, 03, 04, with a hole where 02 should be, because "change
one thing" shared the watch section's marker. The obvious response was to fix
the markup and move on. Instead I asked what class of error had got through: the
tests knew each section's content but nothing about the sequence a reader meets.
So the fix ships with a test asserting the step numbers run 1..n with no gap.
The same screenshot pass caught a prompt still saying "Run it" after the run had
happened.
[`e2e4125...75dc1b6`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-HHHFFF-HHHFFF/compare/e2e4125...75dc1b6)
