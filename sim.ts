import { makeRng, type Rng } from "./rng";

// The simulation is deliberately DOM-free and framerate-free: it advances in
// discrete ticks, so it can be run to completion in a test in microseconds and
// on screen at one tick per animation frame. Nothing in here knows how big the
// screen is --- positions live in a unit square and the renderer maps them ---
// so resizing the window mid-run cannot change the outcome.

export type Health = "susceptible" | "infected" | "recovered";

export interface Person {
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: Health;
  /** Ticks spent infectious; drives recovery and the infection pulse. */
  ticksInfected: number;
}

/** A meeting between two people, kept briefly so the renderer can draw it. */
export interface ContactEvent {
  from: number;
  to: number;
  transmitted: boolean;
  age: number;
}

export interface OutbreakConfig {
  population: number;
  /** The one thing the visitor controls. */
  contactsPerDay: number;
  /** Chance a single contact between an infected and a susceptible transmits. */
  transmissionProb: number;
  infectiousDays: number;
  ticksPerDay: number;
  maxDays: number;
  seed: number;
  /** Share of contacts drawn from people nearby rather than anywhere in town. */
  localBias: number;
  contactRadius: number;
  driftSpeed: number;
}

export interface DayPoint {
  day: number;
  susceptible: number;
  infected: number;
  recovered: number;
}

export interface RunSummary {
  contactsPerDay: number;
  history: DayPoint[];
  peakInfected: number;
  peakDay: number;
  everInfected: number;
  lastDay: number;
  population: number;
}

export const MIN_CONTACTS = 1;
export const MAX_CONTACTS = 16;
export const DEFAULT_CONTACTS = 10;

export const BASE_CONFIG: Omit<OutbreakConfig, "contactsPerDay"> = {
  population: 180,
  transmissionProb: 0.025,
  infectiousDays: 8,
  ticksPerDay: 8,
  maxDays: 140,
  seed: 20260817,
  localBias: 0.78,
  contactRadius: 0.13,
  driftSpeed: 0.0016,
};

/**
 * The textbook threshold: each infected person meets `contactsPerDay` people
 * for `infectiousDays` days, and each meeting transmits with probability
 * `transmissionProb`. Above one onward case per case the outbreak grows; below
 * it, every generation is smaller than the last. This is the number the slider
 * is really moving.
 */
export function reproductionNumber(
  contactsPerDay: number,
  config: Pick<OutbreakConfig, "transmissionProb" | "infectiousDays"> = BASE_CONFIG,
): number {
  return contactsPerDay * config.transmissionProb * config.infectiousDays;
}

/** Contacts per day at which R equals one. */
export function tippingPoint(
  config: Pick<OutbreakConfig, "transmissionProb" | "infectiousDays"> = BASE_CONFIG,
): number {
  return 1 / (config.transmissionProb * config.infectiousDays);
}

export type Tendency = "growing" | "shrinking" | "balanced";

/**
 * The indicator the page actually shows. It is the reproduction number wearing
 * plain clothes: the page never says R0, beta or gamma, it says "growing" or
 * "shrinking" and how many people one infection hands it to.
 */
export function spreadTendency(
  contactsPerDay: number,
  config: Pick<OutbreakConfig, "transmissionProb" | "infectiousDays"> = BASE_CONFIG,
): Tendency {
  const onward = reproductionNumber(contactsPerDay, config);
  if (Math.abs(onward - 1) < 1e-9) return "balanced";
  return onward > 1 ? "growing" : "shrinking";
}

export class Outbreak {
  readonly config: OutbreakConfig;
  readonly people: Person[];
  /** Recent meetings, newest last. The renderer fades these out. */
  readonly contacts: ContactEvent[] = [];
  readonly history: DayPoint[] = [];
  day = 0;
  peakInfected = 1;
  peakDay = 0;

  private tickInDay = 0;
  private readonly rng: Rng;

  constructor(config: OutbreakConfig) {
    this.config = config;
    this.people = layout(config);
    this.people[indexCase(this.people)]!.state = "infected";
    // A separate stream for the epidemic, so the town looks identical no
    // matter which contact rate the visitor picked.
    this.rng = makeRng(config.seed ^ 0x9e3779b9);
    this.history.push(this.snapshot());
  }

  get infected(): number {
    return this.people.reduce((n, p) => n + (p.state === "infected" ? 1 : 0), 0);
  }

  get recovered(): number {
    return this.people.reduce((n, p) => n + (p.state === "recovered" ? 1 : 0), 0);
  }

  get everInfected(): number {
    return this.people.reduce((n, p) => n + (p.state === "susceptible" ? 0 : 1), 0);
  }

  get finished(): boolean {
    return this.infected === 0 || this.day >= this.config.maxDays;
  }

  tick(): void {
    if (this.finished) return;
    this.drift();
    this.meet();
    this.recover();
    this.ageContacts();

    this.tickInDay += 1;
    if (this.tickInDay >= this.config.ticksPerDay) {
      this.tickInDay = 0;
      this.day += 1;
      const point = this.snapshot();
      this.history.push(point);
      if (point.infected > this.peakInfected) {
        this.peakInfected = point.infected;
        this.peakDay = point.day;
      }
    }
  }

  /** Run headlessly to the end. Used by tests and by parameter sweeps. */
  runToEnd(): RunSummary {
    while (!this.finished) this.tick();
    return this.summary();
  }

  summary(): RunSummary {
    return {
      contactsPerDay: this.config.contactsPerDay,
      history: this.history.slice(),
      peakInfected: this.peakInfected,
      peakDay: this.peakDay,
      everInfected: this.everInfected,
      lastDay: this.day,
      population: this.config.population,
    };
  }

  private snapshot(): DayPoint {
    let susceptible = 0;
    let infected = 0;
    let recovered = 0;
    for (const p of this.people) {
      if (p.state === "susceptible") susceptible += 1;
      else if (p.state === "infected") infected += 1;
      else recovered += 1;
    }
    return { day: this.day, susceptible, infected, recovered };
  }

  /** Gentle wandering. Busier towns visibly move more; the mixing itself is
   *  handled by the contact process below, not by collisions. */
  private drift(): void {
    const busy = 0.45 + (0.55 * this.config.contactsPerDay) / MAX_CONTACTS;
    for (const p of this.people) {
      p.x += p.vx * busy;
      p.y += p.vy * busy;
      if (p.x < 0.01 || p.x > 0.99) {
        p.vx *= -1;
        p.x = Math.min(0.99, Math.max(0.01, p.x));
      }
      if (p.y < 0.01 || p.y > 0.99) {
        p.vy *= -1;
        p.y = Math.min(0.99, Math.max(0.01, p.y));
      }
    }
  }

  private meet(): void {
    const { contactsPerDay, ticksPerDay, localBias, transmissionProb } = this.config;
    const rate = contactsPerDay / ticksPerDay;
    // Snapshot first: someone infected this tick doesn't pass it on in the
    // same tick.
    const spreaders: number[] = [];
    this.people.forEach((p, i) => {
      if (p.state === "infected") spreaders.push(i);
    });

    for (const i of spreaders) {
      let n = Math.floor(rate);
      if (this.rng() < rate - n) n += 1;
      for (let k = 0; k < n; k += 1) {
        const j = this.rng() < localBias ? this.pickNearby(i) : this.pickAnyone(i);
        if (j < 0) continue;
        const other = this.people[j]!;
        const transmitted = other.state === "susceptible" && this.rng() < transmissionProb;
        if (transmitted) {
          other.state = "infected";
          other.ticksInfected = 0;
        }
        this.contacts.push({ from: i, to: j, transmitted, age: 0 });
      }
    }
  }

  private pickAnyone(self: number): number {
    const n = this.config.population;
    const j = Math.floor(this.rng() * (n - 1));
    return j >= self ? j + 1 : j;
  }

  private pickNearby(self: number): number {
    const me = this.people[self]!;
    const r2 = this.config.contactRadius * this.config.contactRadius;
    const near: number[] = [];
    for (let j = 0; j < this.people.length; j += 1) {
      if (j === self) continue;
      const p = this.people[j]!;
      const dx = p.x - me.x;
      const dy = p.y - me.y;
      if (dx * dx + dy * dy <= r2) near.push(j);
    }
    if (near.length === 0) return this.pickAnyone(self);
    return near[Math.floor(this.rng() * near.length)]!;
  }

  private recover(): void {
    const span = this.config.infectiousDays * this.config.ticksPerDay;
    for (const p of this.people) {
      if (p.state !== "infected") continue;
      p.ticksInfected += 1;
      if (p.ticksInfected >= span) p.state = "recovered";
    }
  }

  private ageContacts(): void {
    for (const c of this.contacts) c.age += 1;
    // Keep only the last few ticks' worth; this array is render fuel.
    while (this.contacts.length > 0 && this.contacts[0]!.age > 6) this.contacts.shift();
  }
}

/** Build a town. Depends only on seed and population, never on contact rate. */
function layout(config: OutbreakConfig): Person[] {
  const rng = makeRng(config.seed);
  const people: Person[] = [];
  for (let i = 0; i < config.population; i += 1) {
    const angle = rng() * Math.PI * 2;
    people.push({
      x: 0.04 + rng() * 0.92,
      y: 0.04 + rng() * 0.92,
      vx: Math.cos(angle) * config.driftSpeed,
      vy: Math.sin(angle) * config.driftSpeed,
      state: "susceptible",
      ticksInfected: 0,
    });
  }
  return people;
}

/** Patient zero is whoever stands closest to the middle of town --- stable
 *  across runs, and easy to find on screen when the page says "one person". */
function indexCase(people: Person[]): number {
  let best = 0;
  let bestDist = Infinity;
  people.forEach((p, i) => {
    const d = (p.x - 0.5) ** 2 + (p.y - 0.5) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

export function makeOutbreak(
  contactsPerDay: number,
  overrides: Partial<OutbreakConfig> = {},
): Outbreak {
  return new Outbreak({ ...BASE_CONFIG, contactsPerDay, ...overrides });
}

/** Convenience for tests and sweeps. */
export function simulate(
  contactsPerDay: number,
  overrides: Partial<OutbreakConfig> = {},
): RunSummary {
  return makeOutbreak(contactsPerDay, overrides).runToEnd();
}
