# Ysin NG

A Genshin Impact damage calculator, rebuilt from the original [Ysin](https://ufoda0304.github.io) web app.
English UI with Chinese (`?lang=zh`).

**Stack:** TanStack Start (React 19, SSR, server functions) · Bun (package manager and runtime) ·
shadcn/ui + Tailwind v4 · oxlint · oxfmt · game data, formulas and translations from
[Genshin Optimizer](https://github.com/frzyc/genshin-optimizer) (MIT).

## Features

- **Calculator** (`/c/$slug`): stats, every talent hit (non-crit / crit / average), reactions. Star a row to make it the
  build's _target_ for the optimizer and comparisons.
- **Team**: up to three teammates, each one of their saved builds (or a default build). Their team buffs are worked out
  from their own stats; element counts, non-stacking buffs and elemental resonance (full party) follow the team.
- **Saved builds** (`/builds`): stored in this browser only (localStorage, no account or cloud). The calculator also keeps
  a per-character draft, so a reload never loses work. Export / import a JSON file to back up or move builds.
- **Artifact rating** (`src/engine/rating.ts`, after Ysin): substat score and artifact score against reference
  artifacts (100 = 25 average rolls), CRIT ratio loss, and the target-damage gain of each single upgrade
  (+1 roll per substat, best main-stat swap per slot, +1 talent level, +5% DMG), best first.
- **Substat optimizer**: best integer split of N rolls for the target row, with an Energy Recharge floor and optional
  sands / goblet / circlet search. Greedy + hill climbing, checked against brute force in `optimize.test.ts`.
- **Compare** (`/compare`): 2–4 saved builds side by side against a chosen baseline: target damage, stats, and every
  hit when the builds share a character.
- **UID import** (`/import`): reads the in-game Character Showcase through enka.network. Re-importing a UID updates its
  builds instead of duplicating them; imported builds show the in-game stat panel next to the calculator's, so missing
  passives stand out.

## Commands

```bash
bun install
bun run data         # pull the pinned GO export (dev / build / test / check run it first)
bun run dev          # http://localhost:3000
bun run check        # oxfmt --check, oxlint, tsc, bun test
bun run build && bun run start   # production server (serve.ts) on $PORT, default 3000
```

## How it fits together

| Path                            | Role                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `.github/workflows/go-data.yml` | Daily: checks out GO, installs its dependencies, runs `scripts/go-data.ts`, publishes to `go-data`.       |
| `scripts/go-data.ts`            | Exports `passives.json` (formulas, damage rows, toggles) and `data.json` (stats, en/zh text, icons, ids). |
| `scripts/pull-data.ts`          | Downloads the pinned `go-data` commit from jsDelivr into the git-ignored `*.gen.json` files.              |
| `src/server/data.server.ts`     | Normalizes the export into characters, weapons and artifact sets for one language (server only).          |
| `src/server/fns.ts`             | Server functions: `getRoster`, `getCalculatorData`, `importUid`.                                          |
| `src/server/enka.server.ts`     | enka.network profile → builds (game ids; skill order from enka's `characters.json`), cached per TTL.      |
| `src/engine/passives.ts`        | Evaluates GO's formula trees: passives / constellations / weapons / sets as buffs, and per-hit values.    |
| `src/engine/calc.ts`            | Stat panel and damage formula (ported from Ysin's engine, see below) over GO's damage rows.               |
| `src/engine/optimize.ts`        | Substat / main-stat optimizer.                                                                            |
| `src/lib/store.ts`              | localStorage store (saved builds, drafts, recent UIDs) via `useSyncExternalStore`.                        |
| `src/engine/tables.ts`          | Reaction level multipliers, transformative coefficients, artifact main stats, substat roll values.        |
| `src/lib/i18n.ts`               | UI strings (en / zh). Game text comes localized from GO.                                                  |
| `src/routes/`                   | `/` roster, `/c/$slug` calculator, `/builds`, `/compare`, `/import`.                                      |

Images are hotlinked, never bundled: `https://enka.network/ui/<filename>.png` (game file names from GO), with GO's own
copy on jsDelivr as fallback.

## Damage formula

```
Damage = Base × (1 + DMG%) × DEF × RES × AMP × CRIT
Base   = Σ talent% × stat (ATK / HP / DEF / EM) + flat buffs (+ aggravate/spread bonus)
DEF    = (Lc + 100) / ((Lc + 100) + (Le + 100)(1 − shred)(1 − ignore))
RES    = 1 − r (0 ≤ r < 75%) · 1 − r/2 (r < 0) · 1/(1 + 4r) (r ≥ 75%)
AMP    = 1.5 | 2 × (1 + 2.78·EM/(EM+1400) + bonus)          vaporize / melt
CRIT   = 1 + CR·CD (average) · 1 + CD (crit)
Transformative = LevelMult × coef × (1 + 16·EM/(EM+2000) + bonus) × RES
```

`src/engine/calc.test.ts` runs six builds through `calculate()` and compares them with Ysin's own engine
(`analysis/tools/parity.js`): stat panels within 0.1%, damage within 0.3%, with no hand-entered buffs.

## What comes from Genshin Optimizer

Everything game-specific: base stats by level, talent rows (damage, heal, shield) and their per-hit bonuses, character
passives and constellations, weapon passives, artifact set effects, toggle labels, names and texts in English and
Chinese, icon file names and game ids. Toggles start off, as in GO. Where GO has no Chinese label yet, the toggle or row
takes the Chinese game name of its talent, weapon passive or set. Not modelled yet: lunar reactions (shown but not
calculated). Teammates' own stats ignore buffs from the other teammates.
