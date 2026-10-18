import type { AttackKey, Buff, Element, WeaponType } from './types'

type RawBuff = Omit<Buff, 'source'>
const ELEMENT_WORD: Record<string, Element> = {
  pyro: 'pyro',
  hydro: 'hydro',
  electro: 'electro',
  cryo: 'cryo',
  anemo: 'anemo',
  geo: 'geo',
  dendro: 'dendro',
  physical: 'physical',
}

const RULES: [RegExp, (n: number, m: RegExpMatchArray) => RawBuff[]][] = [
  [/^Max HP increased by ([\d,]+)/, (n) => [{ key: 'hp', value: n }]],
  [/^(?:Max )?HP (?:\+|increased by )(\d+)%/, (n) => [{ key: 'hp%', value: n / 100 }]],
  [/^ATK \+(\d+)%/, (n) => [{ key: 'atk%', value: n / 100 }]],
  [/^DEF \+(\d+)%/, (n) => [{ key: 'def%', value: n / 100 }]],
  [/^DEF increased by (\d+)\./, (n) => [{ key: 'def', value: n }]],
  [/Elemental Mastery by (\d+)/, (n) => [{ key: 'em', value: n }]],
  [/Energy Recharge \+(\d+)%/, (n) => [{ key: 'er', value: n / 100 }]],
  [/CRIT Rate \+(\d+)%/, (n) => [{ key: 'cr', value: n / 100 }]],
  [/Heal(?:ing Bonus|ing Effectiveness) \+(\d+)%/, (n) => [{ key: 'heal', value: n / 100 }]],
  [/Shield Strength by (\d+)%/, (n) => [{ key: 'shield', value: n / 100 }]],
  [
    /Physical DMG (?:is increased by |\+)(\d+)%/,
    (n) => [{ key: 'dmg', value: n / 100, on: 'physical' }],
  ],
  [
    /^(\w+) DMG Bonus \+(\d+)%|^Gain a (\d+)% (\w+) DMG Bonus/,
    (_, m) => {
      const el = ELEMENT_WORD[(m[1] ?? m[4]).toLowerCase()]
      return el ? [{ key: 'dmg', value: Number(m[2] ?? m[3]) / 100, on: el }] : []
    },
  ],
  [
    /Normal and Charged Attack DMG \+(\d+)%/,
    (n) =>
      (['normal', 'charged'] as const).map((on) => ({ key: 'dmg' as const, value: n / 100, on })),
  ],
  [/Elemental Burst DMG \+(\d+)%/, (n) => [{ key: 'dmg', value: n / 100, on: 'burst' }]],
  [/Elemental Skill DMG by (\d+)%/, (n) => [{ key: 'dmg', value: n / 100, on: 'skill' }]],
  [
    /Plunging Attack DMG increased by (\d+)%/,
    (n) => [{ key: 'dmg', value: n / 100, on: 'plunge' }],
  ],
  [/DMG dealt is increased by (\d+)%/, (n) => [{ key: 'dmg', value: n / 100 }]],
]

/** Turn an English 2-piece bonus into buffs; [] when it has no damage-relevant stat. */
export function parseTwoPc(text: string): RawBuff[] {
  for (const [re, fn] of RULES) {
    const m = text.match(re)
    if (m) return fn(Number((m[1] ?? m[3] ?? '0').replace(/,/g, '')), m)
  }
  return []
}

type FourPcCtx = { weapon: WeaponType; er: number }
type FourPc = { note: string; buffs: (ctx: FourPcCtx) => RawBuff[] }

const dmgOn = (value: number, ...on: (AttackKey | Element)[]): RawBuff[] =>
  on.map((o) => ({ key: 'dmg', value, on: o }))
const melee = (w: WeaponType) => w === 'sword' || w === 'claymore' || w === 'polearm'

/**
 * Hand-written 4-piece effects, keyed by English set name, at full stacks / condition met.
 * Sets missing here still show their text; add them as custom buffs.
 */
export const FOUR_PC: Record<string, FourPc> = {
  "Gladiator's Finale": {
    note: 'Normal +35% (sword, claymore, polearm)',
    buffs: ({ weapon }) => (melee(weapon) ? dmgOn(0.35, 'normal') : []),
  },
  "Wanderer's Troupe": {
    note: 'Charged +35% (catalyst, bow)',
    buffs: ({ weapon }) => (melee(weapon) ? [] : dmgOn(0.35, 'charged')),
  },
  'Crimson Witch of Flames': {
    note: 'Pyro +22.5% (3 stacks), vaporize/melt +15%, overloaded/burning/burgeon +40%',
    buffs: () => [
      { key: 'dmg', value: 0.225, on: 'pyro' },
      { key: 'react', value: 0.15, on: 'vaporize' },
      { key: 'react', value: 0.15, on: 'melt' },
      { key: 'react', value: 0.4, on: 'overloaded' },
      { key: 'react', value: 0.4, on: 'burning' },
      { key: 'react', value: 0.4, on: 'burgeon' },
    ],
  },
  "Shimenawa's Reminiscence": {
    note: 'Normal/charged/plunge +50%',
    buffs: () => dmgOn(0.5, 'normal', 'charged', 'plunge'),
  },
  'Emblem of Severed Fate': {
    note: 'Burst +25% of ER (max 75%)',
    buffs: ({ er }) => dmgOn(Math.min(0.25 * er, 0.75), 'burst'),
  },
  'Noblesse Oblige': { note: 'ATK +20% after burst', buffs: () => [{ key: 'atk%', value: 0.2 }] },
  'Blizzard Strayer': {
    note: 'CRIT Rate +40% vs frozen',
    buffs: () => [{ key: 'cr', value: 0.4 }],
  },
  'Viridescent Venerer': {
    note: 'Swirl +60% (the 40% RES shred helps the swirled element, not Anemo)',
    buffs: () => [{ key: 'react', value: 0.6, on: 'swirl' }],
  },
  'Thundering Fury': {
    note: 'Overloaded/EC/superconduct/hyperbloom +40%, aggravate +20%',
    buffs: () => [
      ...(['overloaded', 'electrocharged', 'superconduct', 'hyperbloom'] as const).map((on) => ({
        key: 'react' as const,
        value: 0.4,
        on,
      })),
      { key: 'react', value: 0.2, on: 'aggravate' },
    ],
  },
  'Deepwood Memories': {
    note: 'Dendro RES −30%',
    buffs: () => [{ key: 'res', value: 0.3, on: 'dendro' }],
  },
  'Gilded Dreams': {
    note: 'Assumes 1 same-element + 2 other-element allies: ATK +14%, EM +100',
    buffs: () => [
      { key: 'atk%', value: 0.14 },
      { key: 'em', value: 100 },
    ],
  },
  'Marechaussee Hunter': {
    note: 'CRIT Rate +36% (3 stacks)',
    buffs: () => [{ key: 'cr', value: 0.36 }],
  },
  'Golden Troupe': { note: 'Skill +50% (off-field)', buffs: () => dmgOn(0.5, 'skill') },
  'Heart of Depth': { note: 'Normal/charged +30%', buffs: () => dmgOn(0.3, 'normal', 'charged') },
  'Pale Flame': {
    note: 'ATK +18%, Physical +25% (2 stacks)',
    buffs: () => [{ key: 'atk%', value: 0.18 }, ...dmgOn(0.25, 'physical')],
  },
  'Bloodstained Chivalry': { note: 'Charged +50%', buffs: () => dmgOn(0.5, 'charged') },
  'Tenacity of the Millelith': {
    note: 'ATK +20%, shield strength +30%',
    buffs: () => [
      { key: 'atk%', value: 0.2 },
      { key: 'shield', value: 0.3 },
    ],
  },
  'Husk of Opulent Dreams': {
    note: 'DEF +24%, Geo +24% (4 stacks)',
    buffs: () => [{ key: 'def%', value: 0.24 }, ...dmgOn(0.24, 'geo')],
  },
  'Vermillion Hereafter': {
    note: 'ATK +48% (4 stacks)',
    buffs: () => [{ key: 'atk%', value: 0.48 }],
  },
  "Nymph's Dream": {
    note: 'ATK +25%, Hydro +15% (3 stacks)',
    buffs: () => [{ key: 'atk%', value: 0.25 }, ...dmgOn(0.15, 'hydro')],
  },
  'Desert Pavilion Chronicle': {
    note: 'Normal/charged/plunge +40%',
    buffs: () => dmgOn(0.4, 'normal', 'charged', 'plunge'),
  },
  'Flower of Paradise Lost': {
    note: 'Bloom/hyperbloom/burgeon +80% (4 stacks)',
    buffs: () =>
      (['bloom', 'hyperbloom', 'burgeon'] as const).map((on) => ({
        key: 'react' as const,
        value: 0.8,
        on,
      })),
  },
  'Nighttime Whispers in the Echoing Woods': { note: 'Geo +20%', buffs: () => dmgOn(0.2, 'geo') },
  'Fragment of Harmonic Whimsy': {
    note: 'DMG +54% (3 stacks)',
    buffs: () => [{ key: 'dmg', value: 0.54 }],
  },
  'Unfinished Reverie': { note: 'DMG +50% (max)', buffs: () => [{ key: 'dmg', value: 0.5 }] },
  'Obsidian Codex': { note: 'CRIT Rate +40%', buffs: () => [{ key: 'cr', value: 0.4 }] },
  'Finale of the Deep Galleries': {
    note: 'Normal +60%, burst +60% (0 energy)',
    buffs: () => dmgOn(0.6, 'normal', 'burst'),
  },
  Berserker: { note: 'CRIT Rate +24% (HP < 70%)', buffs: () => [{ key: 'cr', value: 0.24 }] },
  Instructor: { note: 'EM +120', buffs: () => [{ key: 'em', value: 120 }] },
  'Retracing Bolide': {
    note: 'Normal/charged +40% (shielded)',
    buffs: () => dmgOn(0.4, 'normal', 'charged'),
  },
}
