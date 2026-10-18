import type { AttackKey, Element, Reaction, StatKey, TransReaction } from './types'

/** Character-level reaction multiplier, index = level - 1 (lv1..90). Same table Ysin ships. */
export const LEVEL_MULT = [
  17.16560555, 18.53504753, 19.90485382, 21.27490234, 22.64539909, 24.64961243, 26.64064217,
  28.86858749, 31.3676796, 34.14334488, 37.20100021, 40.65999985, 44.44666672, 48.56351852,
  53.74848175, 59.08189774, 64.42004395, 69.72445679, 75.12313843, 80.58477783, 86.11203003,
  91.70374298, 97.24462891, 102.812645, 108.4095612, 113.2016907, 118.1029053, 122.9793167,
  129.7273254, 136.2929077, 142.6708527, 149.0290222, 155.4169922, 161.8255005, 169.106308,
  176.5180817, 184.0727386, 191.7095184, 199.5569153, 207.3820496, 215.3988953, 224.1656647,
  233.5021667, 243.3505707, 256.0630798, 268.5434875, 281.526062, 295.0136414, 309.0671997,
  323.601593, 336.7575378, 350.530304, 364.4826965, 378.6191711, 398.6004028, 416.3982544,
  434.3869934, 452.9510498, 472.6062317, 492.8848877, 513.5685425, 539.1032104, 565.5105591,
  592.5387573, 624.4434204, 651.4701538, 679.4968262, 707.7940674, 736.6714478, 765.6402588,
  794.7733765, 824.6773682, 851.1577759, 877.7420654, 914.229126, 946.7467651, 979.411377,
  1011.223022, 1044.791748, 1077.443726, 1109.997559, 1142.976563, 1176.369507, 1210.184448,
  1253.835693, 1288.952759, 1325.484131, 1363.456909, 1405.097412, 1446.853516,
]

// shortcut: table stops at lv90; levels 95/100 reuse the lv90 value until the curve is added.
export const levelMult = (level: number) => LEVEL_MULT[Math.min(Math.max(level, 1), 90) - 1]

/** Transformative reaction coefficients (current game values per the Genshin wiki, not genshin-db). */
export const TRANS: Record<TransReaction, { coef: number; element: Element }> = {
  overloaded: { coef: 2.75, element: 'pyro' },
  superconduct: { coef: 1.5, element: 'cryo' },
  electrocharged: { coef: 2, element: 'electro' },
  shatter: { coef: 3, element: 'physical' },
  swirl: { coef: 0.6, element: 'anemo' },
  bloom: { coef: 2, element: 'dendro' },
  hyperbloom: { coef: 3, element: 'dendro' },
  burgeon: { coef: 3, element: 'dendro' },
  burning: { coef: 0.25, element: 'pyro' },
}

/** Which transformative reactions a character of this element can trigger. */
export const TRANS_BY_ELEMENT: Partial<Record<Element, TransReaction[]>> = {
  pyro: ['overloaded', 'burning', 'burgeon'],
  hydro: ['electrocharged', 'bloom'],
  electro: ['overloaded', 'electrocharged', 'superconduct', 'hyperbloom'],
  cryo: ['superconduct'],
  anemo: ['swirl'],
  dendro: ['bloom', 'burning'],
}

/** Damage-reaction modes per element and their multiplier. */
export const DMG_REACTIONS: Partial<Record<Element, { reaction: Reaction; mult: number }[]>> = {
  pyro: [
    { reaction: 'vaporize', mult: 1.5 },
    { reaction: 'melt', mult: 2 },
  ],
  hydro: [{ reaction: 'vaporize', mult: 2 }],
  cryo: [{ reaction: 'melt', mult: 1.5 }],
  electro: [{ reaction: 'aggravate', mult: 1.15 }],
  dendro: [{ reaction: 'spread', mult: 1.25 }],
}

/** 5★ +20 artifact main stats. Goblet "dmg" = matching elemental / physical DMG bonus. */
export const MAIN_STAT = {
  hp: 4780,
  atk: 311,
  'hp%': 0.466,
  'atk%': 0.466,
  'def%': 0.583,
  em: 186.5,
  er: 0.518,
  cr: 0.311,
  cd: 0.622,
  heal: 0.359,
  dmg: 0.466,
  physical: 0.583,
} as const

export type MainKey = keyof typeof MAIN_STAT
export const SANDS: MainKey[] = ['atk%', 'hp%', 'def%', 'em', 'er']
export const GOBLET: MainKey[] = ['dmg', 'physical', 'atk%', 'hp%', 'def%', 'em']
export const CIRCLET: MainKey[] = ['cr', 'cd', 'atk%', 'hp%', 'def%', 'em', 'heal']

export type SubKey = Exclude<StatKey, 'heal' | 'shield'>
/** Average 5★ substat roll = 0.85 × max roll. */
export const SUB_ROLL: Record<SubKey, number> = {
  hp: 253.94,
  atk: 16.54,
  def: 19.68,
  'hp%': 0.0496,
  'atk%': 0.0496,
  'def%': 0.062,
  em: 19.82,
  er: 0.0551,
  cr: 0.0331,
  cd: 0.0662,
}
export const SUB_KEYS = Object.keys(SUB_ROLL) as SubKey[]

/** Level keys in order: "80" = before ascending at the level cap, "80+" = after. */
export const LEVEL_KEYS = [
  '1',
  '20',
  '20+',
  '40',
  '40+',
  '50',
  '50+',
  '60',
  '60+',
  '70',
  '70+',
  '80',
  '80+',
  '90',
  '95',
  '100',
]
export const WEAPON_LEVEL_KEYS = LEVEL_KEYS.slice(0, LEVEL_KEYS.indexOf('90') + 1)

export const ATTACK_KEYS: AttackKey[] = ['normal', 'charged', 'plunge', 'skill', 'burst']
export const ELEMENTS: Element[] = [
  'pyro',
  'hydro',
  'electro',
  'cryo',
  'anemo',
  'geo',
  'dendro',
  'physical',
]
