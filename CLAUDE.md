# COMP4020 prototype

This is your starter repo for a COMP4020 prototype: a static site written in
HTML/CSS/TypeScript that builds to plain HTML/CSS/JS and deploys to GitHub
Pages. The **deployed site is what gets marked** --- not this repo, and not "it
works on my machine". It's marked live in Chrome against the deployed URL at two
viewports --- 1920×1080 (desktop) and 390×844 (phone) --- and both count in
full, so make that artefact good at both and use the checks below to know
whether it is.

What you're building this week — the spec — is published on the course website,
and this repo's name tells you which deliverable it is. Run the course plugin's
**start** skill at the start of each week: it pulls the right spec from the
course API, carries your harness forward from last week, and helps you turn the
spec's checkable lines into tests of your own. Read the spec before you build,
and see `spec/README.md` for how the checks in this repo relate to it.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Before you push, run `pnpm check`. It runs most of what CI runs --- build,
  lint, and the spec --- so you catch those in seconds instead of waiting for
  the pipeline. The links check, the evidence check, the secrets scan, and the
  deploy itself only run in CI; run `pnpm dlx linkinator ./dist --silent`
  locally against a fresh `pnpm build` for the links check without waiting for
  CI.
- To see what the page actually looks like rather than what you assume it looks
  like, render it. There is no `agent-browser` CLI on this machine, so use the
  headless Chrome recipe in
  [Seeing the rendered page](#seeing-the-rendered-page-on-this-machine) — served
  over HTTP, never `file://`. The rendered page is the truth; your mental model
  of it isn't, and neither is a green test suite.
- When a check fails, read its output before changing anything. Each check below
  names what it measures, and the failure message is the instruction: it tells
  you the file, the line, or the contract. Treat a red check as authoritative
  --- the page is wrong until the check is green, not until you decide it should
  be.
- Commit when the checks pass. Never commit a red state.

## The checks (your sensors)

CI runs these on every push once your repo is public. GitHub's checks UI shows
two jobs, `check` and `deploy` --- not one status per sensor below --- and
within `check` the steps run in sequence (`pnpm check` chains typecheck, build,
lint, and the spec with `&&`), so an early failure like a broken build stops the
later sensors from running for that push; fix it and push again to see the rest.
While the repo is private (all week, until you ship) the CI jobs stay skipped
--- `pnpm check` is the same roster on your machine, and it's the faster loop
anyway. They aren't hoops. Each is a different way of finding out something true
about the site that you can't reliably see by looking at it.

They also carry a mark at a crit: the sweep runs fifteen minutes after your
cutoff, and green checks there are worth half that week's shipped mark. Still
running counts as not green, so ship with time for CI to finish.

- **typecheck** --- `tsc --noEmit` runs first in `pnpm check`, so a type error
  stops the roster before the build even starts. The types are extra
  backpressure: a red here is the compiler telling you a claim in the code is
  false.
- **build** --- the site must build (`pnpm build`). A build failure means the
  deployed site is broken or stale, so nothing else matters until this is green.
- **deploy / online** --- the live GitHub Pages URL must load and return the
  page you expect. An asset that 404s on the deployed URL counts as broken even
  if it loads locally.
- **spec** --- `spec/invariants.test.ts` asserts what's true of any good
  website, whatever the week's brief asks; the tests you write for the week's
  own spec run alongside it (any `spec/*.test.ts`). A failure names the contract
  you haven't met yet.
- **lint** --- `stylelint` for CSS, `oxlint` for TypeScript. Flags code that's
  wrong, fragile, or non-idiomatic. Read the rule it names.
- **tests** --- any other tests you write, wherever you put them (co-located
  with your source is fine, not just `spec/`), must pass. Vitest picks up both
  this and the spec suite in one `vitest run`, the last step of `pnpm check`. A
  failing test is a claim about the site that's no longer true.
- **evidence** (`pnpm check:evidence`) --- checks your process evidence:
  `PROCESS.md`'s citations resolve to real commits, the current deliverable's
  exact reflection is in `reflections/` (worked out from this repo's name
  against the public course API), and your `CLAUDE.md` is present. Evidence
  gates the deploy --- `deploy` needs `check` to pass, so failing evidence
  blocks the deploy alongside everything else. See
  [Your process is part of the mark](#your-process-is-part-of-the-mark) below,
  and the course website's
  [assessment page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#what-you-submit)
  for what counts as evidence.
- **links** --- internal links must resolve. A broken link is a dead end you
  didn't mean to ship.
- **secrets** --- the repo is scanned for committed credentials. Never put a
  key, token, or password in a tracked file. If one leaks, rotate it. A local
  pre-commit hook (`.githooks/pre-commit`, installed by `pnpm install`) also
  blocks any commit containing something shaped like an API key --- by the time
  CI sees a key it's already pushed, so the hook is the sensor that matters.

Nothing here measures **performance** --- wiring that sensor (Lighthouse, or
whatever you choose) is your work, and later in the course the spec will ask you
to show how you tested it. When you do, read a green performance result
honestly: it's a lab estimate from one run on a CI machine, not proof the site
is fast for real users.

**Accessibility** is half-wired, and the split is deliberate. Contrast is
arithmetic, so `spec/assignment-1.test.ts` computes it from the built
stylesheet: no browser, no false confidence, and it runs in CI. Everything else
axe checks needs a real render, so it is a manual recipe (below) rather than a
CI step --- axe under JSDOM would skip contrast entirely and guess at
visibility, which is the blind-sensor trap this project already paid for once.
Run the recipe after any change to markup, colour or the revealed panels.

## The stack is swappable

Out of the box this is plain HTML/CSS/TypeScript on Vite, and every `.html` file
in the repo is a page: add pages, link them, and the build picks them up with no
config. That's a default, not a rule (unless the week's spec says otherwise).
You can swap in Astro or any other static generator, because nothing in CI names
a tool --- the whole contract is:

- `pnpm build` emits the complete site into `dist/`
- the `package.json` scripts (`check`, `check:evidence`, `build`) keep working
- whatever lands in `dist/` still passes the invariants in `spec/`

Two things bite in a swap. The deployed site lives under a path
(`…github.io/<repo>/`), so configure your generator's base path --- this
template's Vite config uses relative asset URLs to sidestep that, but most
generators (Astro included) need `base` set explicitly, and getting it wrong
looks fine locally while every asset 404s on the live URL. And commit the
updated `pnpm-lock.yaml`: CI installs with `--frozen-lockfile`.

## What this prototype is, and what it refuses to be

An interactive explainer of one idea: **a small change in contact frequency can
flip an outbreak's outcome, because transmission multiplies rather than adds.**
The page is a narrative, not a dashboard, and it runs in beats:

`predict → 01 Watch → 02 Change one thing → 03 Compare → 04 Why?`

These eight rules are ones this project has already paid for. Break them
deliberately, not by accident.

**1. One mechanic, one comparison.** Contact frequency is the only variable. Do
not add vaccination, masks, lockdowns, age groups, mortality, hospital capacity,
variants, real COVID data, maps, or a second slider — each is a different
explainer, and a second adjustable input destroys rule 3. When the piece needs
to be better, deepen `predict → watch → change → compare → why`; don't widen it.

**The closing line reaches past the model, and says so.** `.why-verdict` is the
one place the page speaks about the world rather than about the town. The first
draft of it claimed isolation was the *best* way to control an outbreak, and
that is not a claim this model can make: one lever, nothing to weigh it
against, and no treatment in it anywhere — the infectious period is eight days
whatever happens. It now says isolation is worth taking seriously, names that
limit in its own middle clause, and rests the rest on what the simulation does
show. That version is supportable; the superlative was not.

It is ruled off from the beats above it so the change in register is visible.
Two ways to break it: soften it into a superlative again, or treat it as a
foothold and grow a second slider, a treatment parameter, or a comparison of
interventions. Each of those is the different explainer rule 1 exists to
refuse.

**2. Phenomenon before mechanism.** The visitor sees it happen, then reads why.
The tendency gauge stays hidden until the first run finishes, and the prediction
comes before the town, so the threshold is discovered rather than announced.
`04 Why?` explains the feedback loop afterwards; it is not a place to grow an
SIR theory section, and the page never says R0, beta or gamma.

**3. The comparison stays controlled.** `baseline` in `main.ts` is the **first**
completed run and never moves; every later run is compared against it.
Everything except `contactsPerDay` comes from `BASE_CONFIG`, seed included, so
two runs differ in exactly one input. The whole claim of the piece is that only
one thing changed.

**4. Never move a simulation constant on its own.** Triggered by any edit to
`BASE_CONFIG` — `seed`, `transmissionProb`, `infectiousDays`, `population`, the
contact range. Every number on the page is a claim about the model — "between
five and six contacts a day", "an eight-day illness", "180 people", and the two
blocks in `04 Why?` that read `5 contacts a day → 10` against
`6 contacts a day → 51` — and `spec/assignment-1.test.ts` checks them against
`simulate()` and `tippingPoint()`, reading the Why figures straight off their
elements. So: change the constant, run
`npx vitest run spec/assignment-1.test.ts`, and update the copy the failures
name. The coupling is verifiable — retune `transmissionProb` away from `0.025`
and three tests go red, all prose-to-model.

A claim doesn't have to be a number to be a claim. The page told visitors that
between two runs "the only difference you can see is the one you made" and that
they shared the "same run of luck". Neither is true: the contact rate decides
how many draws `meet()` takes each tick, so two rates walk the same seeded
stream at different speeds and meet their luck in different places. A reader
compared ten contacts against eleven, watched both the peak and the total
*fall*, and concluded the page was contradicting itself — which it was. Only
one **input** is pinned across runs; the realisation isn't, and can't be. Say
that, and don't let the prose quietly promise determinism the model doesn't
have.

Rewording is not fixing. The first repair of that sentence became "the only
thing that differs between two runs" — the same false claim in new words, and
it passed the new assertion because the assertion only knew the old wording.
Check the replacement is *true*, not merely different.

Do **not** repair a failing copy assertion by editing the assertion. The page
once claimed one contact either side of the line was the difference between ten
people infected and a hundred and forty; 140 is the toll at *ten* contacts a
day, five notches above the line, and the true one-step figure is 51. Nothing
caught it because no test pinned those numbers yet. One does now.

**5. Tune by sweep, not by eye.** Triggered by choosing or changing infection,
contact or recovery behaviour. `sim.ts` is DOM-free precisely so it can run
headlessly thousands of times: sweep seeds against contact rates and read the
table. Seed `20260817` was picked from eight candidates for its sharp cliff at
five contacts a day. Don't choose parameters because the animation looks about
right, and don't reach for a more dramatic outbreak — the number worth having
is one a test can hold.

This rule used to add "and a monotone response", and that was false. Sweeping
the whole slider rather than the cliff shows five of the 120 ordered pairs
running the other way — eight contacts a day infects 115, nine infects 85. The
seed is fixed, but **changing the rate changes where the luck falls**, so a
single seeded run is arithmetic and luck together and no two adjacent notches
are guaranteed to order correctly. Nor is a better seed available for free: of
300 scanned, two were monotone across all sixteen rates and both had a duller
cliff (the best, `20260860`, gives 8 → 20 where this one gives 10 → 51).
Sharpness and monotonicity are in tension; the piece needs sharpness.

So don't claim smoothness along the slider. The property the page is entitled
to — and the one `spec/assignment-1.test.ts` now holds — is **separation**:
every rate at or below the line stays smaller than every rate above it, with a
5× margin. Everything the copy says is about the threshold, so that is the
invariant that matches the argument. Wherever the page narrates a comparison it
must check `wrongWayRound` first, or it will eventually explain its own
counter-example as evidence, which is exactly what it did.

**6. The reading sequence is a contract.** Triggered by adding, reordering or
renaming narrative sections. A green suite says nothing about the order a reader
meets things. Step markers must run `1..n` with no gap — asserted in
`spec/assignment-1.test.ts` after a screenshot caught them reading 01, 03, 04 —
and the `role="status"` prompt must describe the state the simulation is
actually in. That prompt has gone stale twice: once still saying "now change
just one thing" after the second run, once still saying "Run it" after the run
had happened. Update the sequence invariant when the structure changes; don't
delete it to make a change pass. The run button and slider also stay in one
control group — split across sections, one of them strands off-screen at 390px.

**7. Verify what renders, not just what compiles.** Triggered by any change to
the core interaction, layout, section order or copy. `pnpm check` is necessary
and not sufficient: every bug in rules 4 and 6 shipped past a green suite. Load
the page in real Chrome at both marked viewports before accepting the change,
and drive interactive states with `window.outbreakHarness.advanceDays(n)`
instead of waiting on frames.

Never reshape production code to satisfy a test environment: no downgrading
module scripts, no inline scripts added for JSDOM's benefit, no second copy of
the simulation for tests. The seam steps the same `Outbreak` instance the
visitor is watching, which is the only reason a screenshot of it proves
anything.

`sim.ts` is deliberately DOM-free and viewport-independent (positions live in a
unit square) so the outcome can't change when the window resizes, and so the
behaviour can be tested without a browser.

**8. A state the visitor can reach has to survive being reached badly.**
Triggered by any change to markup, colour, or the panels the page reveals. The
marked criteria reward a page that "holds up under use it wasn't designed for
--- the keyboard, a resize mid-interaction, a slow connection", so those are
three separate checks, not a vibe.

Everything the page reveals, it reveals by dropping `hidden`, and **an element
that was hidden when its content changed is not reliably announced**. So the
outcome of a run --- the whole payoff --- went to screen readers in complete
silence while every markup assertion passed. The fix is the always-present
`role="status"` region in `index.html` (`data-testid="announcer"`), written in
`finish()` *after* `showCompare`, so it speaks the note that is actually on
screen. Reveal a new panel and it needs to reach that region; don't scatter
`aria-live` onto the panels themselves.

A range input announces a bare `10` --- no unit, no meaning. `aria-valuetext`
carries the unit and, once there's a baseline, the tendency, so arrowing across
the line is audible. It drops the tendency while a run is in flight, for the
same reason the gauge does (rule 6).

Colour comes in two families and mixing them breaks something either way. The
plain tokens (`--infected`, `--recovered`, `--susceptible`) are the colours of
*things* and are duplicated in `COLOURS` in `main.ts`, so the legend swatch
matches the dot. The `-ink` tokens are the same hues darkened to clear 4.5:1,
for small text and for surfaces that carry text. Measured, not eyeballed: the
step markers were 4.17, the legend labels 3.75--3.79, and the run button's
nudge state 4.47 against a 4.5 floor. The spec asserts both the ratios and the
separation of the two families, so a retune fails a check rather than a user.

## Keeping PROCESS.md current

`PROCESS.md` is maintained as the work goes, not written at the end. After any
change that produced a real moment, consider whether it beats one of the four
already there, and say so rather than silently growing the file — the brief
asks for **three or four**, so a fifth means replacing a weaker one.

A moment earns its place only if it has all four jobs: what went wrong, what was
done **instead of the obvious thing**, how that was verified, and a citation
that resolves. The bar for "strong" is a correction that landed in the harness —
a rule in this file, a check wired up, an attempt discarded — not another
prompt. A moment that is really just "it broke and I fixed it" is the routine
case and should lose to one that changed what the agent works against.

Keep it inside 400–600 words (`pnpm check:evidence` verifies the citations
resolve, not the length), and re-run that check after editing: a citation whose
SHA doesn't exist renders perfectly and still fails.

## Seeing the rendered page on this machine

There's no `agent-browser` CLI installed here, so ground truth comes from
headless Chrome directly:

```bash
pnpm build && npx vite preview --port 4173 --strictPort &   # serve dist over http
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu \
  --hide-scrollbars --window-size=1920,1080 --virtual-time-budget=6000 \
  --screenshot="C:\Users\H-F\AppData\Local\Temp\shot.png" \
  "http://localhost:4173/"
```

Three things to know. **Write the PNG to the temp dir, not the repo** --- Chrome
gets "拒绝访问" writing into the working directory. **Serve over http, not
`file://`** --- Vite's build emits `<script type="module">`, and Chrome refuses
to load a module from a `file://` origin (CORS, origin `null`), so a `file://`
screenshot silently shows the page with no JavaScript at all: it looks like a
working static page and is actually a corpse. And to see an interactive state,
write a copy of `dist/index.html` back **into `dist/`** (so it's served from the
same origin and its relative asset URLs resolve) with a `<script type="module">`
appended that drives the page; module scripts run in order, so the injected code
lands after the page's own script has wired up. Delete the copies afterwards.

**`vite build` empties `dist/` first.** Every harness page you write in there
is gone after the next build, so the order is always build → write the harness
pages → measure. A stale `_something.html` left behind will 404 on its
now-deleted `_something.js` and produce an empty result that reads exactly like
a broken page. Delete them when you're done; they are untracked but they end up
in the deployed artefact if a build doesn't clear them first.

### Running axe against the real page

Contrast lives in the spec suite, but the rest of axe needs a render. Build,
then write a copy of `dist/index.html` with two scripts appended before
`</body>` --- `axe.min.js` from a CDN as a classic script, then a module that
drives the page through `window.outbreakHarness` and calls `axe.run(document)`.
Drive it first: axe only sees the panels that are visible, so an undriven page
scores well by having nothing on it. Print the result into the DOM and read it
with `--dump-dom --virtual-time-budget=20000` (the CDN fetch needs the budget).

Two results are expected noise. The injected `<pre>` trips `region` because it
sits outside any landmark, and the four `→` in the loop figure land in
`incomplete` as "content contains only non-text characters" --- they are
`aria-hidden` decoration. Anything else is real. This is how the run button's
nudge state was caught at 4.47:1, which the spec's contrast table had missed
because that table only covered ink-on-paper, not white-on-fill.

### The `<noscript>` path cannot be screenshotted here

`--disable-javascript` is **silently ignored** by this Chrome build --- the page
still ran its module (checked by dumping the DOM and finding the
`aria-valuetext` that only JavaScript sets). And
`--blink-settings=scriptEnabled=false`, which does control whether `<noscript>`
renders, makes the screenshot pipeline produce no file at all.

So don't try to prove the `<noscript>` branch by screenshot. Verify the two
halves separately: that the element is in the built markup (`spec` sees it),
and that its styling is right by rendering a copy of `dist/index.html` with the
`<noscript>` wrapper tags stripped out. The branch itself is guaranteed by the
HTML parser, not by anything a screenshot here could show. (Note that
`--dump-dom` prints `noscript` contents unescaped when scripting is *enabled*,
because it serialises as a raw-text element --- so seeing real tags inside it
proves nothing either way.)

### Headless Chrome barely runs `requestAnimationFrame`

`--virtual-time-budget=20000` advanced this project's animation by **one
simulated day**: virtual time moves, but with no compositor headless produces
roughly a frame per second of it. Anything driven by rAF is therefore invisible
to a screenshot or a `--dump-dom` check --- the page sits on its first frame
forever, which reads as "the interaction is broken" when it is fine.

Adding `--run-all-compositor-stages-before-draw` barely helps. The fix that
works is a **test seam**: expose a small hook on `window` that steps the same
state the visitor sees, without waiting for frames (here,
`window.outbreakHarness.advanceDays(n)` in `main.ts`), and have the injected
script call it. That turns "I can't see the interactive states" into a real
sensor, at the cost of about ten lines of shipped code.

### Chrome won't give you a 390px window --- use an iframe

`--window-size=390,844` **does not produce a 390px viewport** on Windows.
Chrome clamps the window to a 500px minimum (both `--headless` and
`--headless=new`), then writes a PNG that is 390 wide anyway --- so the image
is the left 390px of a 500px layout, cropped. The result looks exactly like
horizontal overflow: text clipped at the right edge, cards running off the
page. It is an artefact of the crop, not a bug in the site, and "fixing" it
means breaking a layout that was correct.

Since 390×844 is one of the two marked viewports, measure it by rendering the
page inside a 390px iframe instead of resizing the window. Simplest version:
write a `_frame.html` into `dist/` whose iframe `src` is the page, so both are
served from the same origin and the frame's document is readable; then read
`clientWidth` / `scrollWidth` and every element's `getBoundingClientRect()` from
the parent and print them into the DOM for `--dump-dom` to pick up. Give it
`--virtual-time-budget=8000` so the measurement runs before the screenshot.
A real result reads `clientWidth=390 scrollWidth=390`.

Pass `--hide-scrollbars` on the measuring run too. Without it the iframe's own
15px scrollbar eats into the frame and you get `clientWidth=375`, which reads as
a layout bug that isn't there.

That same loop is the cheapest place to check hit targets: filter for
`button, input, a` with a `getBoundingClientRect().height < 24` and it names
them. It caught nav links at 22px and a range input at 16px here.

### Don't trust JSDOM for anything about rendering or behaviour

It doesn't model the user-agent/author cascade: `getComputedStyle` reported
`display: none` for a reply form that was plainly visible in Chrome, so the test
passed while the page was wrong.

Worse, **JSDOM does not execute `<script type="module">`** (probed against
jsdom 29 on 2026-08-09), and Vite's build emits exactly one script, a module.
It also has no `requestAnimationFrame` and `canvas.getContext("2d")` returns
`null`. So any JSDOM test shaped like "click the control and assert the DOM
changed" fails for reasons that have nothing to do with the page --- and the
honest fix is not to contort the site until the blind sensor is happy.

What works: keep the logic in a **DOM-free module** (`sim.ts` here) and test the
behaviour there directly, assert the **markup contract** in JSDOM, and check
what actually renders in real Chrome at both marked viewports. Three sensors,
each pointed at something it can actually see.

### `hidden` loses to any author `display`

The `hidden` attribute is only `[hidden] { display: none }` in the user-agent
stylesheet, and **author rules beat the user agent at any specificity**. So
`.thing { display: flex }` plus `<div class="thing" hidden>` renders visible ---
the attribute reads correctly in the DOM and in every markup assertion while
the element sits there on screen. Any element that sets its own `display` and
gets toggled by `hidden` needs the override alongside it:

```css
.reply-form { display: flex; }
.reply-form[hidden] { display: none; }
```

## Your process is part of the mark

The deployed page is only half of it. How you got there is marked too: your
commit history, your agent files, and the decisions visible across them. The
checks above can't see any of that, so a person reads it directly --- which
means building legibly is part of building well.

- **Commit as you go.** Small, frequent commits are the record of how the work
  came together, and that record is read, not just the final state. A trail that
  grew alongside the code is the strongest evidence of your process; a single
  dump the night before is the weakest.
- **Keep a process overview** (`PROCESS.md`). A short reading-guide, not an
  essay: what you built, the moments that mattered --- each pointing at a
  commit, a `CLAUDE.md` change, or a prompt and the commit it produced --- and
  where to look in the history. It points a marker at the evidence; it doesn't
  stand in for it, and claims the history doesn't back don't count. The
  `PROCESS.md` in this repo is a template showing the shape and the citation
  format (link text the commit hash or range, target the commit or compare URL);
  `pnpm check:evidence` verifies your citations resolve to real commits before
  you ship. Markers follow those citations and don't trawl the repo for evidence
  you didn't cite.
- **Write your reflection in `reflections/`** --- a short markdown file in this
  repo, named for the deliverable it answers, so the number in the filename is
  the number in this repo's name (`crit-1.md` in `comp4020-crit1-<you>`,
  `assignment-1.md` in `comp4020-ass1-<you>`); `reflections/README.md` has the
  full rule. `pnpm check:evidence` checks the exact current name against the
  course API, not merely the presence of any well-named file. It answers the two
  standing prompts: the breakthrough that moved the work forward, and what this
  work changed about the developer you want to be. It stays out of the deployed
  site. It's due at the cutoff, and if it isn't in the repo by then the week
  doesn't count as shipped, however good the prototype is.
- **This file is process evidence.** The harness you build to direct the agent,
  this `CLAUDE.md` and any `AGENTS.md`, is itself read as part of how you
  worked. Keep it honest and current (see below).

You don't need a name, a student number, or any identity file in the repo: we
know whose repo it is. Spend the effort on the work.

## This file is yours

This CLAUDE.md is a starting point, not a fixed rulebook. As you learn what your
prototype needs --- a convention to hold the agent to, a sensor that keeps
catching you out, a fact about the stack the agent keeps getting wrong --- write
it down here. Growing this file is the work of harness engineering, and the gap
between this boilerplate and your own version is part of what your prototype
says about the developer you're becoming.
