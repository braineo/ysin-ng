import { describe, expect, test } from 'bun:test'
import { buildPanel, calcRows, defMult, resMult, type Build, type Panel } from './calc'
import { parseTwoPc } from './sets'
import { parseValue } from './talents'
import type { CharacterData } from './types'

describe('multipliers', () => {
  test('defense: equal levels halve damage', () => expect(defMult(90, 90, 0, 0)).toBe(0.5))
  test('resistance branches', () => {
    expect(resMult(0.1)).toBeCloseTo(0.9)
    expect(resMult(-0.2)).toBeCloseTo(1.1)
    expect(resMult(0.75)).toBeCloseTo(0.25) // continuous at 75%, unlike Ysin's 1/(1+3r)
  })
})

describe('talent label parser', () => {
  const p = { param1: [0.5, 0.6], param2: [1, 2], param3: [100, 200] }
  test('plain percent = ATK', () =>
    expect(parseValue('{param1:F1P}', p)).toEqual([
      { count: 1, terms: [{ stat: 'atk', values: [0.5, 0.6], count: 1 }] },
    ]))
  test('grouped multi-stat with count', () => {
    const v = parseValue('({param1:F1P} ATK+{param2:F1P} Elemental Mastery)×3', p)!
    expect(v[0].count).toBe(3)
    expect(v[0].terms.map((t) => t.stat)).toEqual(['atk', 'em'])
  })
  test('variants inherit trailing stat', () =>
    expect(parseValue('{param1:F1P}/{param2:F1P} Max HP', p)!.map((v) => v.terms[0].stat)).toEqual([
      'hp',
      'hp',
    ]))
  test('flat heal term', () =>
    expect(parseValue('{param1:P} Max HP+{param3:I}', p)![0].terms.map((t) => t.stat)).toEqual([
      'hp',
      undefined,
    ]))
  test('per-term repeat', () =>
    expect(parseValue('{param1:F1P}×2+{param2:F1P}×2', p)![0].terms.map((t) => t.count)).toEqual([
      2, 2,
    ]))
  test('units are not damage', () =>
    expect(parseValue('{param1:F1P} Max HP/Droplet', p)).toBeNull())
})

describe('2-piece parser', () => {
  test.each([
    ['ATK +18%.', { key: 'atk%', value: 0.18 }],
    ['Gain a 15% Geo DMG Bonus.', { key: 'dmg', value: 0.15, on: 'geo' }],
    ['Increases Elemental Mastery by 80.', { key: 'em', value: 80 }],
    ['Max HP increased by 1,000.', { key: 'hp', value: 1000 }],
    ['Physical DMG is increased by 25%.', { key: 'dmg', value: 0.25, on: 'physical' }],
  ])('%s', (text: string, buff: object) => expect(parseTwoPc(text)[0]).toEqual(buff as never))
})

// Ysin parity: Hu Tao charged attack, vaporize, Ysin default build. Ysin's engine printed 38236
// for this panel (3884 ATK, 60 EM, 86% CR, 173% CD, Pyro +79.6%, charged +50%, ×228.7%).
test('matches Ysin output for Hu Tao vaporize charged attack', () => {
  const char = {
    element: 'pyro',
    weapon: 'polearm',
    boost: { skill: 0, burst: 0 },
    talents: [
      {
        key: 'normal',
        name: 'Normal',
        icon: '',
        rows: [
          {
            label: 'Charged',
            attack: 'charged',
            kind: 'damage',
            element: 'pyro',
            variants: [
              { count: 1, terms: [{ stat: 'atk', values: Array(15).fill(2.287), count: 1 }] },
            ],
          },
        ],
      },
    ],
  } as unknown as CharacterData
  const panel: Panel = {
    base: { hp: 0, atk: 0, def: 0 },
    hp: 33800,
    atk: 3884,
    def: 0,
    em: 60,
    er: 1,
    cr: 0.86,
    cd: 1.73,
    heal: 0,
    shield: 0,
    buffs: [
      { key: 'dmg', value: 0.466 + 0.33, on: 'pyro', source: 'goblet + passive' },
      { key: 'dmg', value: 0.5, on: 'charged', source: 'Shimenawa' },
    ],
  }
  const build = {
    level: '90',
    talents: [9, 9, 9],
    cons: 0,
    reaction: 'vaporize',
    infusion: false,
    enemyLevel: 90,
    enemyRes: 0.1,
  } as Build
  const [row] = calcRows(char, panel, build)
  expect(Math.abs(row.avg / 38236 - 1)).toBeLessThan(0.005)
})

test('stat conversion buff reads the pre-conversion panel', () => {
  const char = {
    stats: { '90': { hp: 10000, atk: 100, def: 500, spec: 0 } },
  } as unknown as CharacterData
  const panel = buildPanel(char, null, [{ key: 'atk', value: 0.05, from: 'hp', source: 'E' }], {
    level: '90',
  } as Build)
  expect(panel.atk).toBeCloseTo(600)
  expect(panel.buffs[0].from).toBe('hp')
})
