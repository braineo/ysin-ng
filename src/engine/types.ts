export type Element =
  | 'pyro'
  | 'hydro'
  | 'electro'
  | 'cryo'
  | 'anemo'
  | 'geo'
  | 'dendro'
  | 'physical'
export type AttackKey = 'normal' | 'charged' | 'plunge' | 'skill' | 'burst'
export type ScalingStat = 'hp' | 'atk' | 'def' | 'em'
export type WeaponType = 'sword' | 'claymore' | 'polearm' | 'bow' | 'catalyst'
export type AmpReaction = 'vaporize' | 'melt'
export type AddReaction = 'aggravate' | 'spread'
export type TransReaction =
  | 'overloaded'
  | 'superconduct'
  | 'electrocharged'
  | 'shatter'
  | 'swirl'
  | 'bloom'
  | 'hyperbloom'
  | 'burgeon'
  | 'burning'
export type Reaction = AmpReaction | AddReaction | TransReaction

/** Panel stat a substat roll, main stat, ascension bonus or buff can add to. */
export type StatKey =
  | 'hp%'
  | 'hp'
  | 'atk%'
  | 'atk'
  | 'def%'
  | 'def'
  | 'em'
  | 'er'
  | 'cr'
  | 'cd'
  | 'heal'
  | 'shield'

/**
 * dmg / cr / cd: `on` = element or attack key (none = all)
 * flat: flat damage added to each hit's base, `on` = attack key
 * res: resistance shred, `on` = element · defIgnore: `on` = attack key · react: reaction bonus, `on` = reaction
 */
export type BuffKey = StatKey | 'dmg' | 'flat' | 'res' | 'defShred' | 'defIgnore' | 'react'

export type Buff = {
  key: BuffKey
  value: number
  on?: Element | AttackKey | Reaction
  /** stat conversion: value is a ratio of this pre-conversion panel stat (e.g. Hu Tao E: ATK += 6.26% HP) */
  from?: ScalingStat
  source: string
}

/** One summand of a talent value: `mult[level-1] × stat`, or a flat number when `stat` is absent. */
export type Term = { stat?: ScalingStat; values: number[]; count: number }

export type TalentRow = {
  label: string
  attack: AttackKey
  kind: 'damage' | 'heal' | 'shield' | 'lunar'
  element: Element
  /** `/`-separated alternatives in the game text, e.g. Low / High plunge. */
  variants: { terms: Term[]; count: number }[]
}

export type CharacterData = {
  slug: string
  name: string
  rarity: number
  element: Element
  weapon: WeaponType
  icon: string
  iconFallback: string
  ascensionStat: StatKey | 'dmg' | null
  ascensionElement?: Element
  /** keyed by level label, e.g. "90", "80+" */
  stats: Record<string, { hp: number; atk: number; def: number; spec: number }>
  talents: { key: 'normal' | 'skill' | 'burst'; name: string; icon: string; rows: TalentRow[] }[]
  /** +3 talent level from C3 / C5 */
  boost: { skill: number; burst: number }
}

export type WeaponData = {
  id: number
  name: string
  rarity: number
  icon: string
  iconFallback: string
  mainStat: StatKey | 'dmg' | null
  stats: Record<string, { atk: number; spec: number }>
  passiveName: string
  /** passive text for R1..R5 */
  passive: string[]
}

export type ArtifactSetData = {
  id: number
  name: string
  icon: string
  iconFallback: string
  twoPc: string
  fourPc: string
  /** English set name, used to look up hand-written 4pc effects */
  key: string
  twoPcBuffs: Omit<Buff, 'source'>[]
}
