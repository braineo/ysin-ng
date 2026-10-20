import { describe, expect, test } from 'bun:test'
import { artifactSets, character, weapons } from '#/server/genshin.server'
import { buildPanel, calculate, defMult, defaultBuild, resMult, type Build } from './calc'
import { SUB_KEYS } from './tables'
import type { CharacterData, TransReaction } from './types'

describe('multipliers', () => {
  test('defense: equal levels halve damage', () => expect(defMult(90, 90, 0, 0)).toBe(0.5))
  test('resistance branches', () => {
    expect(resMult(0.1)).toBeCloseTo(0.9)
    expect(resMult(-0.2)).toBeCloseTo(1.1)
    expect(resMult(0.75)).toBeCloseTo(0.25) // continuous at 75%, unlike Ysin's 1/(1+3r)
  })
})

// Ysin parity: each build below was also run through Ysin's own engine (analysis/tools/parity.js), with
// Ysin's substat rolls scaled to SUB_ROLL so both engines see the same stats. Passives come from
// Genshin Optimizer's sheets; `conds` switches on the toggles Ysin turns on (GO's default is off).
// `ysin` is Ysin's panel and its core-skill average (the sum of `rows`).
const near = (actual: number, expected: number, tol: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * tol + 1e-9)

describe('Ysin parity', () => {
  const sets = artifactSets('en')
  const setId = (name: string) => sets.find((s) => s.name === name)!.id
  const zero = Object.fromEntries(SUB_KEYS.map((k) => [k, 0])) as Build['rolls']
  type Case = {
    name: string
    slug: string
    weapon: string
    /** one name = 4pc, two = 2+2 */
    sets: string[]
    mains: Build['mains']
    rolls: Partial<Build['rolls']>
    build?: Partial<Build>
    rows: string[]
    ysin: { hp: number; atk: number; em: number; cr: number; cd: number; er: number; avg: number }
    trans?: [TransReaction, number]
  }
  const A1 = 0.2 // Ganyu A1: Ysin adds it to the panel, ysin-ng (like GO) only to the Frostflake rows
  const cases: Case[] = [
    {
      name: 'Ganyu frostflake (ATK, Amos)',
      slug: 'ganyu',
      weapon: "Amos' Bow",
      sets: ['Blizzard Strayer'],
      mains: { sands: 'atk%', goblet: 'dmg', circlet: 'cd' },
      rolls: { 'atk%': 4, cr: 9, cd: 9, er: 3 },
      build: {
        conds: { 'AmosBow.StrongWilled': '5', 'BlizzardStrayer.state': 'frozen', 'Ganyu.A1': 'on' },
      },
      rows: ['charged.frostflake', 'charged.frostflakeBloom'],
      ysin: { hp: 14577, atk: 2348.3, em: 0, cr: 0.9479 - A1, cd: 2.1018, er: 1.1653, avg: 39714 },
    },
    {
      name: 'Ganyu frostflake melt',
      slug: 'ganyu',
      weapon: "Amos' Bow",
      sets: ['Blizzard Strayer'],
      mains: { sands: 'atk%', goblet: 'dmg', circlet: 'cd' },
      rolls: { 'atk%': 4, em: 3, cr: 9, cd: 9 },
      build: {
        reaction: 'melt',
        conds: { 'AmosBow.StrongWilled': '5', 'BlizzardStrayer.state': 'frozen', 'Ganyu.A1': 'on' },
      },
      rows: ['charged.frostflake', 'charged.frostflakeBloom'],
      ysin: { hp: 14577, atk: 2348.3, em: 59.5, cr: 0.9479 - A1, cd: 2.1018, er: 1, avg: 66318 },
    },
    {
      name: 'Yelan burst (HP, Emblem from ER)',
      slug: 'yelan',
      weapon: 'Favonius Warbow',
      sets: ['Emblem of Severed Fate'],
      mains: { sands: 'hp%', goblet: 'dmg', circlet: 'cr' },
      rolls: { 'hp%': 4, cr: 9, cd: 9, er: 3 },
      rows: ['burst.throwDmg'],
      ysin: { hp: 29697.6, atk: 1009, em: 0, cr: 0.8509, cd: 1.0958, er: 1.9783, avg: 4192 },
    },
    {
      name: 'Hu Tao charged vaporize (HP → ATK)',
      slug: 'hu-tao',
      weapon: 'Staff of Homa',
      sets: ["Shimenawa's Reminiscence"],
      mains: { sands: 'hp%', goblet: 'dmg', circlet: 'cr' },
      rolls: { 'hp%': 4, 'atk%': 3, em: 3, cr: 9, cd: 9 },
      build: {
        reaction: 'vaporize', // Pyro infusion comes from the E toggle
        conds: {
          'HuTao.GuideToAfterlifeVoyage': 'on',
          'HuTao.SanguineRouge': 'on',
          'StaffOfHoma.RecklessCinnabar': 'on',
          'ShimenawasReminiscence.usedEnergy': 'used',
        },
      },
      rows: ['charged.dmg'],
      ysin: { hp: 33775.1, atk: 3880.7, em: 59.5, cr: 0.6589, cd: 2.1418, er: 1, avg: 36922 },
    },
    {
      name: 'Fischl Oz aggravate (2+2)',
      slug: 'fischl',
      weapon: 'Skyward Harp',
      sets: ['Thundering Fury', "Gladiator's Finale"],
      mains: { sands: 'atk%', goblet: 'dmg', circlet: 'cr' },
      rolls: { 'atk%': 4, em: 3, cr: 9, cd: 9 },
      build: { reaction: 'aggravate' },
      rows: ['skill.ozDmg'],
      ysin: { hp: 13969, atk: 2224.5, em: 59.5, cr: 0.8799, cd: 1.2958, er: 1, avg: 8427 },
      trans: ['hyperbloom', 5711],
    },
    {
      // swirled element with VV's 40% RES shred
      name: 'Sucrose swirl (EM)',
      slug: 'sucrose',
      weapon: 'Sacrificial Fragments',
      sets: ['Viridescent Venerer'],
      mains: { sands: 'er', goblet: 'em', circlet: 'em' },
      rolls: { em: 6, er: 3 },
      build: { conds: { 'ViridescentVenerer.swirlhydro': 'hydro' } }, // swirl is listed Hydro first
      rows: ['skill.press'],
      ysin: { hp: 14024, atk: 935, em: 712.9, cr: 0.05, cd: 0.5, er: 1.6833, avg: 2152 },
      trans: ['swirl', 5795],
    },
  ]
  test.each(cases)('$name', (c) => {
    const char = character(`${c.slug}|en`)!
    const weapon = weapons(`${char.weapon}|en`).find((w) => w.name === c.weapon)!
    const build: Build = {
      ...defaultBuild(char),
      sets: [setId(c.sets[0]), c.sets[1] ? setId(c.sets[1]) : null],
      fourPc: c.sets.length === 1,
      mains: c.mains,
      rolls: { ...zero, ...c.rolls },
      ...c.build,
    }
    const { panel, rows, transformative } = calculate(char, weapon, sets, build)
    // Ysin rounds base stats and weapon substats, hence 0.1% on the panel and 0.3% on damage
    for (const k of ['hp', 'atk', 'em', 'cr', 'cd', 'er'] as const) near(panel[k], c.ysin[k], 0.001)
    const avg = c.rows.reduce((s, id) => s + rows.find((r) => r.id === id)!.avg, 0)
    near(avg, c.ysin.avg, 0.003)
    if (c.trans)
      near(transformative.find((t) => t.reaction === c.trans![0])!.damage, c.trans[1], 0.003)
  })
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
