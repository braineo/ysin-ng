import { calculate, focusRow, type Build } from './calc'
import { CIRCLET, GOBLET, SANDS, SUB_KEYS, type SubKey } from './tables'
import type { ArtifactSetData, CharacterData, WeaponData } from './types'

export type OptimizeOptions = {
  /** total substat rolls to distribute (a good 5-piece set has ~20–30 useful rolls) */
  total: number
  /** minimum Energy Recharge as a ratio, e.g. 1.3 */
  minEr: number
  /** also search sands / goblet / circlet main stats */
  tryMains: boolean
}

export type OptimizeResult = { build: Build; value: number; before: number; evaluated: number }

type Mains = Build['mains']
const ROLLS_PER_PIECE = 6 // 1 initial line + 5 upgrades can all land on one stat

/** A stat can't roll on a piece whose main stat it is (flower = flat HP, plume = flat ATK). */
export function maxRolls(key: SubKey, mains: Mains) {
  const taken = [key === 'hp', key === 'atk', ...Object.values(mains).map((m) => m === key)].filter(
    Boolean,
  ).length
  return ROLLS_PER_PIECE * (5 - taken)
}

const zeroRolls = () => Object.fromEntries(SUB_KEYS.map((k) => [k, 0])) as Record<SubKey, number>

/**
 * Best integer substat distribution for the build's focus row. Greedy allocation, then
 * hill-climbing by moving single rolls between stats until no move helps. Exact against brute
 * force on the tested cases (see optimize.test.ts) and ~1000 evaluations per main-stat combo.
 */
export async function optimize(
  char: CharacterData,
  weapon: WeaponData | null,
  sets: ArtifactSetData[],
  build: Build,
  opts: OptimizeOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<OptimizeResult | null> {
  let evaluated = 0
  const value = (b: Build) => {
    evaluated++
    const r = calculate(char, weapon, sets, b)
    return { v: focusRow(r.rows, b.focus)?.avg ?? 0, er: r.panel.er }
  }
  const before = value(build).v
  const target = focusRow(calculate(char, weapon, sets, build).rows, build.focus)
  const focus = build.focus ?? target?.id

  const combos: Mains[] = []
  if (opts.tryMains) {
    const goblets = GOBLET.filter((g) => g !== 'physical' || target?.element === 'physical')
    const circlets = CIRCLET.filter((c) => c !== 'heal' || target?.kind === 'heal')
    for (const sands of SANDS)
      for (const goblet of goblets)
        for (const circlet of circlets) combos.push({ sands, goblet, circlet })
  } else combos.push(build.mains)

  let best: OptimizeResult | null = null
  for (const [i, mains] of combos.entries()) {
    const base: Build = {
      ...build,
      focus,
      mains,
      // imported exact main values only describe the original pieces
      mainValues: opts.tryMains ? undefined : build.mainValues,
    }
    const found = climb(base, mains, opts, value)
    if (found && (!best || found.value > best.value)) best = { ...found, before, evaluated: 0 }
    if (opts.tryMains && i % 10 === 9) {
      onProgress?.(i + 1, combos.length)
      await new Promise((r) => setTimeout(r)) // keep the UI responsive between batches
    }
  }
  return best && { ...best, evaluated }
}

export function climb(
  base: Build,
  mains: Mains,
  opts: OptimizeOptions,
  value: (b: Build) => { v: number; er: number },
) {
  const rolls = zeroRolls()
  const at = () => value({ ...base, rolls: { ...rolls } })
  const cap = (k: SubKey) => maxRolls(k, mains)
  let used = 0

  // satisfy the ER floor first, with as few rolls as possible
  while (at().er < opts.minEr - 1e-9) {
    if (rolls.er >= cap('er') || used >= opts.total) return null
    rolls.er++
    used++
  }
  const erFloor = rolls.er

  for (; used < opts.total; used++) {
    let pick: SubKey | null = null
    let bestV = -1
    for (const k of SUB_KEYS) {
      if (rolls[k] >= cap(k)) continue
      rolls[k]++
      const { v } = at()
      rolls[k]--
      if (v > bestV) [bestV, pick] = [v, k]
    }
    if (!pick) break // every stat is capped
    rolls[pick]++
  }

  let current = at().v
  for (let iter = 0; iter < 500; iter++) {
    let move: [SubKey, SubKey] | null = null
    let moveV = current
    for (const from of SUB_KEYS) {
      if (rolls[from] === 0 || (from === 'er' && rolls.er <= erFloor)) continue
      for (const to of SUB_KEYS) {
        if (to === from || rolls[to] >= cap(to)) continue
        rolls[from]--
        rolls[to]++
        const { v } = at()
        rolls[to]--
        rolls[from]++
        if (v > moveV + 1e-9) [moveV, move] = [v, [from, to]]
      }
    }
    if (!move) break
    rolls[move[0]]--
    rolls[move[1]]++
    current = moveV
  }
  return { build: { ...base, rolls: { ...rolls } }, value: current }
}
