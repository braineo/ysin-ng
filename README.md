# Ysin NG

A Genshin Impact damage calculator, rebuilt from the original [Ysin](https://ufoda0304.github.io) web app.
English UI with Chinese (`?lang=zh`).

**Stack:** TanStack Start (React 19, SSR, server functions) · Bun (package manager and runtime) ·
shadcn/ui + Tailwind v4 · oxlint · oxfmt · [genshin-db](https://github.com/theBowja/genshin-db) for game data.

## Features

- **Calculator** (`/c/$slug`): stats, every talent hit (non-crit / crit / average), reactions. Star a row to make it the
  build's _target_ for the optimizer and comparisons.
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
bun run dev          # http://localhost:3000
bun run check        # oxfmt --check, oxlint, tsc, bun test
bun run build && bun run start   # production server (serve.ts) on $PORT, default 3000
```

## How it fits together

| Path                           | Role                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `src/server/genshin.server.ts` | Queries genshin-db (server only, it is ~180 MB) and normalizes characters, weapons and artifact sets for one language.  |
| `src/server/fns.ts`            | Server functions: `getRoster`, `getCalculatorData`, `importUid`.                                                        |
| `src/server/enka.server.ts`    | enka.network profile → builds (ids match genshin-db; skill order from enka's `characters.json`), cached per enka's TTL. |
| `src/engine/talents.ts`        | Parses genshin-db talent labels (`({param1:F1P} ATK+{param2:F1P} Elemental Mastery)×2`) into scaling terms.             |
| `src/engine/calc.ts`           | Stat panel and damage formula (ported from Ysin's engine, see below).                                                   |
| `src/engine/sets.ts`           | 2-piece bonuses parsed from set text; hand-written 4-piece effects for common sets.                                     |
| `src/engine/optimize.ts`       | Substat / main-stat optimizer.                                                                                          |
| `src/lib/store.ts`             | localStorage store (saved builds, drafts, recent UIDs) via `useSyncExternalStore`.                                      |
| `src/engine/tables.ts`         | Constants genshin-db does not have: reaction level multipliers, artifact main stats, substat roll values.               |
| `src/lib/i18n.ts`              | UI strings (en / zh). Game text comes localized from genshin-db.                                                        |
| `src/routes/`                  | `/` roster, `/c/$slug` calculator, `/builds`, `/compare`, `/import`.                                                    |

Images are hotlinked, never bundled: `https://enka.network/ui/<filename>.png` (the filename comes from genshin-db), with the official miHoYo CDN URL from genshin-db as fallback.

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

`src/engine/calc.test.ts` checks the port against a number Ysin's own engine produced (Hu Tao vaporize charged attack, within 0.5%).

## What genshin-db does and doesn't cover

genshin-db provides base stats by level, talent multipliers by level, weapon stats and refinement text, set text,
constellations, and names in every language. It does **not** describe passives, constellations or weapon effects as
data, only as text. Those are entered in the calculator's "Buffs from kit, weapon & team" panel (stat conversions such as
"ATK + 6.26% of Max HP" are supported). Lunar reactions (6.x+) are shown but not calculated.
