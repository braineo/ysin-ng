import type { GoMove, GoSheet } from './passives'

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
/** lunar and Stellar Glimmer reactions (GO's "special" reactions): own damage formula, can crit */
export type SpecialReaction =
  | 'lunarcharged'
  | 'lunarbloom'
  | 'lunarcrystallize'
  | 'stellarconduct'
  | 'stellarswirl'
export type Reaction = AmpReaction | AddReaction | TransReaction | SpecialReaction

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
 * lunar / Stellar Glimmer (`on` = that reaction): baseDmg / specialDmg (GO's "Base DMG" and "Elevated"
 * bonuses), mult (Stellar multiplier bonus), reactionFlat / directFlat (flat DMG on reaction / direct hits)
 */
export type BuffKey =
  | StatKey
  | 'dmg'
  | 'flat'
  | 'res'
  | 'defShred'
  | 'defIgnore'
  | 'react'
  | 'baseDmg'
  | 'specialDmg'
  | 'mult'
  | 'reactionFlat'
  | 'directFlat'

export type Buff = {
  key: BuffKey
  value: number
  on?: Element | AttackKey | Reaction
  /** stat conversion: value is a ratio of this pre-conversion panel stat (e.g. Hu Tao E: ATK += 6.26% HP) */
  from?: ScalingStat
  source: string
}

/** A damage-table row: GO's move with its name and talent-section name in the page's language. */
export type Move = Omit<GoMove, 'name'> & { label: string; group: string }

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
  talents: { key: 'normal' | 'skill' | 'burst'; name: string; icon: string }[]
  moves: Move[]
  /** +3 talent level from C3 / C5 */
  boost: { skill: number; burst: number }
  /** Genshin Optimizer key ("HuTao") and passives / constellations */
  goKey: string
  passives?: GoSheet
  /** GO's elemental resonance, named in the page's language */
  resonance?: { name: string; sheet: GoSheet }
}

export type WeaponData = {
  id: number
  name: string
  rarity: number
  icon: string
  iconFallback: string
  mainStat: StatKey | 'dmg' | null
  /** element of a DMG Bonus secondary stat (physical on most) */
  mainElement?: Element
  stats: Record<string, { atk: number; spec: number }>
  passiveName: string
  /** passive text for R1..R5 */
  passive: string[]
  goKey: string
  passives?: GoSheet
}

export type ArtifactSetData = {
  id: number
  name: string
  icon: string
  iconFallback: string
  twoPc: string
  fourPc: string
  goKey: string
  passives?: GoSheet
}
