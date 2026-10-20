import {
  calculate,
  defaultBuild,
  focusRow,
  type ArtifactSlot,
  type Build,
  type TeamMate,
} from './calc'
import { climb } from './optimize'
import { CIRCLET, GOBLET, SANDS, SUB_KEYS, SUB_ROLL, type MainKey, type SubKey } from './tables'
import type { ArtifactSetData, CharacterData, WeaponData } from './types'

export type MainSlot = 'sands' | 'goblet' | 'circlet'
export type Upgrade =
  | { type: 'main'; slot: MainSlot; key: MainKey }
  | { type: 'talent'; index: 0 | 1 | 2 }
  | { type: 'dmg' }

export type Rating = {
  value: number
  /** vs the same main stats with reference substats (Ysin's 词条分), 100 = reference */
  subScore: number
  /** vs reference main stats and substats (Ysin's 数据分) */
  score: number
  /** CRIT DMG rolls lost to an unbalanced CR:CD ratio; null when the target can't crit */
  critLoss: number | null
  /**
   * Ysin's substat families, best first: flat HP/ATK/DEF fold into their % stat (`key`) as a
   * fraction of a roll on the base stat. `gain` = target damage from one more % roll.
   */
  subs: { key: SubKey; rolls: number; value: number; flat: number; gain: number; useful: boolean }[]
  totalRolls: number
  /** rolls that add target damage (Ysin's 词条 count) */
  usefulRolls: number
  /** best case for these main stats: perfect rolls on +20 5★ pieces, current ER kept */
  ceiling: { score: number; progress: number; rolls: number } | null
  /** other single upgrades, best first */
  gains: (Upgrade & { gain: number })[]
  /** per imported piece: the damage its substats add, null when the rolls were edited since */
  pieces: Partial<
    Record<ArtifactSlot, { gain: number; usefulRolls: number; rolls: Record<string, number> }>
  > | null
}

const SLOT_MAINS: Record<MainSlot, MainKey[]> = { sands: SANDS, goblet: GOBLET, circlet: CIRCLET }
const SLOTS: ArtifactSlot[] = ['flower', 'plume', 'sands', 'goblet', 'circlet']
const MIN_GAIN = 0.0005 // Ysin hides anything under 0.05%
const FLAT = { hp: 'hp%', atk: 'atk%', def: 'def%' } as const
type Flat = keyof typeof FLAT
const isFlat = (k: SubKey): k is Flat => k in FLAT
/** the stat a substat counts toward: flat HP/ATK/DEF → HP%/ATK%/DEF% */
export const family = (k: SubKey): SubKey => (isFlat(k) ? FLAT[k] : k)

/** Ysin's roll count for a substat value: flat HP/ATK/DEF count as a share of a % roll of the base stat. */
export function rollsOf(key: SubKey, value: number, base: Record<Flat, number>) {
  return isFlat(key) ? value / (base[key] * SUB_ROLL[FLAT[key]]) : value / SUB_ROLL[key]
}

/** Ysin's tLost: how many CRIT DMG rolls the gap to the best CR:CD split of the same crit value is worth. */
export function critLoss(cr: number, cd: number) {
  const [o, l] = [cr * 100, cd * 100]
  const lost =
    o < 100
      ? o * l < 20000
        ? 2 * o + l - Math.sqrt(8 * o * l)
        : 2 * o + l - 200 - (o * l) / 100
      : l > 200
        ? 2 * (o - 100) // CR past 100% is wasted outright
        : 2 * o + l - Math.sqrt(800 * l)
  return lost / (SUB_ROLL.cd * 100)
}

/** Imported pieces still describe the build: same main stats and substat totals. */
export function piecesMatch(build: Build) {
  const pieces = build.pieces
  if (!pieces || SLOTS.some((s) => !pieces[s])) return false
  if (
    (['sands', 'goblet', 'circlet'] as const).some(
      (s) => (pieces[s]!.main ?? build.mains[s]) !== build.mains[s],
    )
  )
    return false
  return SUB_KEYS.every(
    (k) =>
      Math.abs(
        SLOTS.reduce(
          (n, s) => n + (pieces[s]!.subs.find((x) => x.key === k)?.value ?? 0) / SUB_ROLL[k],
          0,
        ) - build.rolls[k],
      ) < 0.05,
  )
}

/**
 * Artifact rating as in Ysin: the target row against reference artifacts (25 average rolls: 18 crit
 * split at the best ratio, 4 in the main scaling stat, 3 ER), plus what each single upgrade is worth.
 */
export function rate(
  char: CharacterData,
  weapon: WeaponData | null,
  sets: ArtifactSetData[],
  build: Build,
  team: TeamMate[] = [],
): Rating | null {
  const now = calculate(char, weapon, sets, build, team)
  const target = focusRow(now.rows, build.focus)
  if (!target || Number.isNaN(target.avg) || !target.avg) return null
  const evaluate = (b: Build) => {
    const r = calculate(char, weapon, sets, b, team)
    return { v: r.rows.find((x) => x.id === target.id)?.avg ?? 0, er: r.panel.er }
  }
  const value = (b: Build) => evaluate(b).v
  const gainOf = (b: Build) => value(b) / target.avg - 1
  const withRolls = (rolls: Build['rolls']) => ({ ...build, rolls })

  const ref = defaultBuild(char)
  const crit = ref.rolls.cr + ref.rolls.cd
  const reference = (b: Build) => {
    let best = 0
    for (let cr = 0; cr <= crit; cr++)
      best = Math.max(best, value({ ...b, rolls: { ...ref.rolls, cr, cd: crit - cr } }))
    return best
  }
  const refSub = reference(build)

  const base = now.panel.base
  const subs = SUB_KEYS.filter((k) => !isFlat(k))
    .map((key) => {
      const flatKey = (Object.keys(FLAT) as Flat[]).find((f) => FLAT[f] === key)
      const flat = flatKey ? build.rolls[flatKey] * SUB_ROLL[flatKey] : 0
      const amount = build.rolls[key] * SUB_ROLL[key]
      const gain = gainOf(withRolls({ ...build.rolls, [key]: build.rolls[key] + 1 }))
      const rolls = build.rolls[key] + (flatKey ? rollsOf(flatKey, flat, base) : 0)
      return { key, rolls, value: amount, flat, gain, useful: gain > MIN_GAIN }
    })
    .filter((s) => s.rolls > 0.05 || s.useful)
    .toSorted((a, b) => b.gain - a.gain || b.rolls - a.rolls)
  const useful = new Set<SubKey>(subs.filter((s) => s.useful).map((s) => s.key))

  // a +20 5★ piece has 9 rolls on 4 different stats, never its own main stat: with k useful stats
  // available, at most k + 5 of them can be useful (all 9 once k ≥ 4)
  const mainOf: Record<ArtifactSlot, string> = { flower: 'hp', plume: 'atk', ...build.mains }
  const maxUseful = SLOTS.reduce(
    (n, s) => n + Math.min(9, [...useful].filter((k) => k !== mainOf[s]).length + 5),
    0,
  )
  const best = useful.size
    ? climb(
        build,
        build.mains,
        { total: maxUseful, minEr: now.panel.er, tryMains: false },
        evaluate,
      )
    : null

  const gains: Rating['gains'] = []
  for (const slot of ['sands', 'goblet', 'circlet'] as const) {
    // only the best swap per slot: the rest is noise next to the substat list
    let top: (Upgrade & { gain: number }) | null = null
    for (const key of SLOT_MAINS[slot]) {
      if (key === build.mains[slot]) continue
      const gain = gainOf({
        ...build,
        mains: { ...build.mains, [slot]: key },
        mainValues: build.mainValues && { ...build.mainValues, [slot]: undefined },
      })
      if (!top || gain > top.gain) top = { type: 'main', slot, key, gain }
    }
    if (top) gains.push(top)
  }
  for (const index of [0, 1, 2] as const)
    if (build.talents[index] < 10) {
      const talents = [...build.talents] as Build['talents']
      talents[index]++
      gains.push({ type: 'talent', index, gain: gainOf({ ...build, talents }) })
    }
  gains.push({
    type: 'dmg',
    gain: gainOf({ ...build, custom: [...build.custom, { key: 'dmg', value: 0.05, source: '' }] }),
  })

  let pieces: Rating['pieces'] = null
  if (piecesMatch(build)) {
    pieces = {}
    for (const slot of SLOTS) {
      const piece = build.pieces![slot]!
      const rolls = { ...build.rolls }
      for (const s of piece.subs) rolls[s.key] -= s.value / SUB_ROLL[s.key]
      const counts = Object.fromEntries(
        piece.subs.map((s) => [s.key, rollsOf(s.key, s.value, base)]),
      )
      pieces[slot] = {
        // Ysin's piece score: how much the build loses without this piece's substats
        gain: target.avg / value(withRolls(rolls)) - 1,
        usefulRolls: piece.subs.reduce(
          (n, s) => n + (useful.has(family(s.key)) ? counts[s.key] : 0),
          0,
        ),
        rolls: counts,
      }
    }
  }

  return {
    value: target.avg,
    subScore: (target.avg / refSub) * 100,
    score: (target.avg / reference({ ...build, mains: ref.mains, mainValues: undefined })) * 100,
    critLoss: target.kind === 'damage' ? critLoss(now.panel.cr, now.panel.cd) : null,
    subs,
    totalRolls: subs.reduce((n, s) => n + s.rolls, 0),
    usefulRolls: subs.reduce((n, s) => n + (s.useful ? s.rolls : 0), 0),
    ceiling: best && {
      score: (best.value / refSub) * 100,
      progress: target.avg / best.value,
      rolls: maxUseful,
    },
    gains: gains.filter((g) => g.gain > MIN_GAIN).toSorted((a, b) => b.gain - a.gain),
    pieces,
  }
}
