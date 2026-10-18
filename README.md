# Ysin NG

A Genshin Impact damage calculator, rebuilt from the original [Ysin](https://ufoda0304.github.io) web app.
English UI with Chinese (`?lang=zh`).

**Stack:** TanStack Start (React 19, SSR, server functions) · Bun (package manager and runtime) ·
shadcn/ui + Tailwind v4 · oxlint · oxfmt · [genshin-db](https://github.com/theBowja/genshin-db) for game data.

## Commands

```bash
bun install
bun run dev          # http://localhost:3000
bun run check        # oxfmt --check, oxlint, tsc, bun test
bun run build && bun run start   # production server (serve.ts) on $PORT, default 3000
```

## How it fits together

| Path                           | Role                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `src/server/genshin.server.ts` | Queries genshin-db (server only, it is ~180 MB) and normalizes characters, weapons and artifact sets for one language. |
| `src/server/fns.ts`            | Server functions the routes load: `getRoster`, `getCalculatorData`.                                                    |
| `src/engine/talents.ts`        | Parses genshin-db talent labels (`({param1:F1P} ATK+{param2:F1P} Elemental Mastery)×2`) into scaling terms.            |
| `src/engine/calc.ts`           | Stat panel and damage formula (ported from Ysin's engine, see below).                                                  |
| `src/engine/sets.ts`           | 2-piece bonuses parsed from set text; hand-written 4-piece effects for common sets.                                    |
| `src/engine/tables.ts`         | Constants genshin-db does not have: reaction level multipliers, artifact main stats, substat roll values.              |
| `src/lib/i18n.ts`              | UI strings (en / zh). Game text comes localized from genshin-db.                                                       |
| `src/routes/`                  | `/` roster, `/c/$slug` calculator.                                                                                     |

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
