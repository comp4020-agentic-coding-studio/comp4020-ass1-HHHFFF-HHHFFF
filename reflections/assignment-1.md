# Assignment 1 reflection

## What was the breakthrough that moved the work forward?

The breakthrough was realising that a red test isn't always wrong about the
code — sometimes it's wrong about what it *can* see. The starter's JSDOM test
clicked the control and asserted the DOM changed; the obvious fix was to bend
the site to make it pass. Probing first showed JSDOM never executes
`<script type="module">`, has no `requestAnimationFrame`, and no canvas — the
test was blind, not the page wrong. That reframing carried through the rest of
the week: headless Chrome barely advancing simulated time turned out to be the
same problem (a sensor that couldn't see interactive state), and the fix each
time was the same shape — split the DOM-free logic (`sim.ts`) so it can be
tested directly and swept by seed, keep JSDOM to the markup contract it can
actually verify, and check what renders in real Chrome. Once that pattern
existed, tuning the tipping point became a sweep over eight seeds instead of a
guess, and the prose-to-model coupling in `04 Why?` became something a test
could hold instead of something I'd eyeball.

## What did this work change about who I want to be as a software developer?

I want to stop treating "the suite is green" as equivalent to "I checked."
Three of the four moments in this project were bugs that thirty-plus passing
tests didn't catch — a frozen animation, a missing step number, a stale status
prompt — because nothing was pointed at the thing that actually mattered. I'd
rather build a smaller, uglier sensor aimed at the real question than a larger
one aimed at a proxy.
