import { describe, expect, test } from 'bun:test'
import fixture from '#/server/__fixtures__/enka-profile.json'
import { toBuild } from '#/server/enka.server'
import { artifactSets, character, slugById, weapons } from '#/server/genshin.server'
import { defaultBuild, type Build } from './calc'
import { critLoss, rate } from './rating'

const char = character('hu-tao|en')!
const weapon = weapons('polearm|en').find((w) => w.name === 'Staff of Homa')!
const sets = artifactSets('en')
const build: Build = { ...defaultBuild(char), reaction: 'vaporize', focus: 'charged.dmg' }

describe('artifact rating', () => {
  test('crit loss is zero at 1:2 and counts wasted CRIT Rate', () => {
    expect(critLoss(0.5, 1)).toBeCloseTo(0, 6)
    expect(critLoss(1, 2)).toBeCloseTo(0, 6)
    expect(critLoss(0.3, 2)).toBeGreaterThan(0)
    expect(critLoss(1.0662, 2.5)).toBeCloseTo(2, 6) // 6.62% CR over the cap = 2 CR rolls
  })

  test('the reference rolls score ~100, more rolls score higher', () => {
    const r = rate(char, weapon, sets, build)!
    // reference splits its 18 crit rolls at the best ratio, so the 9/9 default is at most 100
    expect(r.subScore).toBeLessThanOrEqual(100 + 1e-9)
    expect(r.subScore).toBeGreaterThan(90)
    const better = rate(char, weapon, sets, { ...build, rolls: { ...build.rolls, cd: 15 } })!
    expect(better.subScore).toBeGreaterThan(r.subScore)
  })

  test('substat gains are sorted and only useful stats count', () => {
    const r = rate(char, weapon, sets, build)!
    for (let i = 1; i < r.subs.length; i++)
      expect(r.subs[i - 1].gain).toBeGreaterThanOrEqual(r.subs[i].gain)
    expect(r.subs.find((s) => s.key === 'def')).toBeUndefined() // Hu Tao scales on HP
    expect(r.subs.find((s) => s.key === 'cd')!.useful).toBe(true)
    expect(r.totalRolls).toBe(25)
    expect(r.gains.every((g) => g.gain > 0)).toBe(true)
  })

  test('the ceiling beats the current build', () => {
    const r = rate(char, weapon, sets, build)!
    expect(r.ceiling!.progress).toBeLessThan(1)
    expect(r.ceiling!.score).toBeGreaterThan(r.subScore)
    expect(r.ceiling!.rolls).toBeLessThanOrEqual(45)
  })

  test('imported pieces get a score until the rolls are edited', () => {
    const avatar = fixture.avatarInfoList.find((a) => a.avatarId === 10000037)! // Ganyu
    const ganyu = character(`${slugById('').get(10000037)}|en`)!
    const { build: imported, weaponId } = toBuild(
      avatar,
      ganyu,
      undefined,
      new Set(sets.map((s) => s.id)),
    )
    const bow = weapons('bow|en').find((w) => w.id === weaponId) ?? null
    const r = rate(ganyu, bow, sets, imported)!
    expect(Object.keys(r.pieces!)).toHaveLength(5)
    expect(Object.values(r.pieces!).every((p) => p.gain >= 0)).toBe(true)
    const edited = { ...imported, rolls: { ...imported.rolls, cd: imported.rolls.cd + 1 } }
    expect(rate(ganyu, bow, sets, edited)!.pieces).toBeNull()
  })
})
