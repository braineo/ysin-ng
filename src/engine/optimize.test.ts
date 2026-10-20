import { describe, expect, test } from 'bun:test'
import { artifactSets, character, weapons } from '#/server/data.server'
import { calculate, defaultBuild, focusRow, type Build } from './calc'
import { maxRolls, optimize } from './optimize'
import { SUB_KEYS, type SubKey } from './tables'

const char = character('hu-tao|en')!
const weapon = weapons('polearm|en').find((w) => w.name === 'Staff of Homa')!
const sets = artifactSets('en')
const build: Build = { ...defaultBuild(char), reaction: 'vaporize', focus: 'charged.dmg' } // charged attack

const score = (b: Build) => focusRow(calculate(char, weapon, sets, b).rows, b.focus)!.avg

/** every way to put `n` rolls into the given stats */
function* distributions(keys: SubKey[], n: number): Generator<number[]> {
  if (keys.length === 1) return yield [n]
  for (let i = 0; i <= n; i++)
    for (const rest of distributions(keys.slice(1), n - i)) yield [i, ...rest]
}

describe('substat optimizer', () => {
  test('caps rolls on stats that are also main stats', () => {
    expect(maxRolls('cr', build.mains)).toBe(24) // CRIT Rate circlet
    expect(maxRolls('hp', build.mains)).toBe(24) // flower is flat HP
    expect(maxRolls('em', build.mains)).toBe(30)
  })

  test('matches brute force', async () => {
    const total = 8
    let best = 0
    for (const d of distributions(SUB_KEYS, total)) {
      const rolls = Object.fromEntries(SUB_KEYS.map((k, i) => [k, d[i]])) as Build['rolls']
      best = Math.max(best, score({ ...build, rolls }))
    }
    const result = (await optimize(char, weapon, sets, build, {
      total,
      minEr: 0,
      tryMains: false,
    }))!
    expect(result.value).toBeCloseTo(best, 6)
  })

  test('respects the Energy Recharge floor', async () => {
    const result = (await optimize(char, weapon, sets, build, {
      total: 25,
      minEr: 1.4,
      tryMains: false,
    }))!
    expect(calculate(char, weapon, sets, result.build).panel.er).toBeGreaterThanOrEqual(1.4)
    expect(Object.values(result.build.rolls).reduce((a, b) => a + b, 0)).toBe(25)
  })

  test('main-stat search beats or ties the fixed mains', async () => {
    const fixed = (await optimize(char, weapon, sets, build, {
      total: 25,
      minEr: 0,
      tryMains: false,
    }))!
    const t0 = performance.now()
    const free = (await optimize(char, weapon, sets, build, {
      total: 25,
      minEr: 0,
      tryMains: true,
    }))!
    expect(free.value).toBeGreaterThanOrEqual(fixed.value)
    console.log(
      `main-stat search: ${free.evaluated} evaluations in ${(performance.now() - t0).toFixed(0)} ms`,
    )
  })
})
