# Process overview

## What I built

*One Small Change, One Very Different Outbreak* — an interactive explainer with
one mechanic: how many people each person meets in a day. A town of 180 dots,
one index case, a seeded simulation, one slider. The visitor predicts what will
happen, watches a baseline outbreak, changes exactly one number, and gets both
curves on the same axes. The idea is the threshold: the line sits at five
contacts a day, and one contact either side of it is the difference between 10
people infected and 51. Vaccines, masks, real COVID data, a second parameter —
all deliberately absent, because each would blur the single comparison the piece
exists to make.

## The moments that mattered

### 1. The test that could never pass

The starter shipped a spec test that clicked the control in JSDOM and asserted
the DOM changed. It was red, and the obvious fix was to make it green: emit a
classic script instead of a module. Probing JSDOM first showed it never executes
`<script type="module">` — the only script Vite emits — and has no
`requestAnimationFrame` and no canvas. The test was failing for reasons
unrelated to my page, and satisfying it meant contorting the site around a blind
sensor. So I replaced the sensor: the simulation moved into a DOM-free module
testable on its own, JSDOM kept only the markup contract, and what renders is
checked in real Chrome. To confirm the new boundary actually holds, I retuned
`transmissionProb` so the threshold moved off five contacts a day — three spec
tests failed immediately, all of them prose-to-model couplings. The explanatory
copy can no longer drift from the simulation without the build going red.
[`a71d57b...e2e4125`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-HHHFFF-HHHFFF/compare/a71d57b...e2e4125)

### 2. The page I could not see

Screenshots showed the outbreak frozen on day 0. Twenty seconds of virtual time
in headless Chrome advanced it by one simulated day, because headless produces
roughly a frame per second without a compositor, so every interactive state was
invisible to verification. Rather than accept screenshots of a dead page, I
added a documented test seam that steps the same simulation without waiting for
frames, and corrected `CLAUDE.md`, whose `file://` screenshot recipe was
silently wrong: Chrome blocks module scripts from a `file://` origin, so those
screenshots were of a page running no JavaScript at all. The seam then rendered
day 0, mid-outbreak and completed states, and the readouts on screen matched the
headless sweep exactly — 141 infected, peak 40, over 51 days.
[`e2e4125`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-HHHFFF-HHHFFF/commit/e2e4125)

### 3. A bug 36 green tests could not see

Rebuilding the page as a narrative, every test passed — and a screenshot showed
the steps reading 01, 03, 04, with a hole where 02 should be, because "change
one thing" shared the watch section's marker. The obvious response was to fix
the markup and move on. Instead I asked what class of error had got through: the
tests knew each section's content, but nothing about the sequence a reader
actually meets. So the fix ships with an invariant asserting the step numbers
run 1..n with no gap. The same screenshot pass caught a prompt still saying "Run
it" after the run had already happened.
[`e2e4125...75dc1b6`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-HHHFFF-HHHFFF/compare/e2e4125...75dc1b6)

### 4. Fixing the symptom, twice, before the cause

At 1920 the page's text ran at six different widths, so I capped it to three
named tokens. That fixed the ragged edge and was still the wrong diagnosis:
prose now ended at 936px inside a 1512px shell, so 45% of every text section
was empty — the page looked unfinished for a reason no width token could fix.
The real cause was that nothing sat beside the text, so each section's figure
moved up next to it — the three choices beside the prediction, the live prompt
beside "change one thing", the generation figures beside the argument in
`04 Why?` — with DOM order kept copy-then-figure so phone and screen-reader
order don't move. Verified by re-measuring the 390px frame
(`clientWidth=390 scrollWidth=390`, no sub-24px targets) rather than trusting
the first diagnosis again. Nothing pinned the split itself, so a later edit
could drop it silently; a spec assertion now locks the `>=56rem` CSS rule and
the copy-before-companion order.
[`84276f6...ad1caf4`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-HHHFFF-HHHFFF/compare/84276f6...ad1caf4)
