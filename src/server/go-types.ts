import type { GoText } from '#/engine/passives'
import type { Element, WeaponType } from '#/engine/types'

/** One level row: base HP / ATK / DEF and the ascension (characters) or secondary (weapons) stat. */
type LevelStats = { hp: number; atk: number; def: number; spec: number }

/**
 * data.json of the go-data export (scripts/go-data.ts): everything ysin-ng shows about a character,
 * weapon or set, from Genshin Optimizer. Keys are GO keys ("HuTao"); ids are the game's ids.
 * Icons are game file names (no extension), served by enka.network or under `assets`.
 */
export type GoData = {
  source: string
  license: string
  /** GO's image folder on jsDelivr, at the exported commit */
  assets: string
  chars: Record<
    string,
    {
      id: number
      name: GoText
      rarity: number
      element: Element
      weapon: WeaponType
      /** GO stat key of the ascension stat, e.g. "critDMG_", "pyro_dmg_" */
      spec: string | null
      stats: Record<string, LevelStats>
      /** constellation that adds 3 skill / burst levels */
      boost: { skill: number; burst: number }
      icons: { icon: string; auto: string; skill: string; burst: string }
    }
  >
  weapons: Record<
    string,
    {
      id: number
      name: GoText
      rarity: number
      type: WeaponType
      spec: string | null
      stats: Record<string, { atk: number; spec: number }>
      passiveName: GoText
      /** passive text for R1..R5 */
      passive: { en: string[]; zh: string[] }
      icon: string
    }
  >
  sets: Record<
    string,
    { id: number; name: GoText; rarity: number; twoPc: GoText; fourPc: GoText; icon: string }
  >
}
