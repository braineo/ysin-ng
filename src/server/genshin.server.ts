// genshin-db is ~180 MB of JSON: keep it on the server and send only normalized slices to the client.
import g, { type Language } from 'genshin-db'
import { parseTwoPc } from '#/engine/sets'
import { LEVEL_KEYS, WEAPON_LEVEL_KEYS } from '#/engine/tables'
import { parseTalent } from '#/engine/talents'
import type {
  ArtifactSetData,
  CharacterData,
  Element,
  StatKey,
  WeaponData,
  WeaponType,
} from '#/engine/types'
import { iconUrl, type Lang } from '#/lib/assets'

// the typings call the enum `Language`, the runtime exports it as `Languages`; the values are these strings
const LANG = { en: 'English', zh: 'ChineseSimplified' } as Record<Lang, Language>
const opts = (lang: Lang) => ({ queryLanguages: [LANG.en], resultLanguage: LANG[lang] })
const EN = opts('en')

const ELEMENT: Record<string, Element> = {
  ELEMENT_PYRO: 'pyro',
  ELEMENT_HYDRO: 'hydro',
  ELEMENT_ELECTRO: 'electro',
  ELEMENT_CRYO: 'cryo',
  ELEMENT_ANEMO: 'anemo',
  ELEMENT_GEO: 'geo',
  ELEMENT_DENDRO: 'dendro',
}
const WEAPON: Record<string, WeaponType> = {
  WEAPON_SWORD_ONE_HAND: 'sword',
  WEAPON_CLAYMORE: 'claymore',
  WEAPON_POLE: 'polearm',
  WEAPON_BOW: 'bow',
  WEAPON_CATALYST: 'catalyst',
}
const PROP_ELEMENT: Record<string, Element> = {
  FIRE: 'pyro',
  WATER: 'hydro',
  ELEC: 'electro',
  ICE: 'cryo',
  WIND: 'anemo',
  ROCK: 'geo',
  GRASS: 'dendro',
  PHYSICAL: 'physical',
}
const PROP: Record<string, StatKey> = {
  FIGHT_PROP_HP_PERCENT: 'hp%',
  FIGHT_PROP_ATTACK_PERCENT: 'atk%',
  FIGHT_PROP_DEFENSE_PERCENT: 'def%',
  FIGHT_PROP_ELEMENT_MASTERY: 'em',
  FIGHT_PROP_CHARGE_EFFICIENCY: 'er',
  FIGHT_PROP_CRITICAL: 'cr',
  FIGHT_PROP_CRITICAL_HURT: 'cd',
  FIGHT_PROP_HEAL_ADD: 'heal',
}

function prop(type?: string): { stat: StatKey | 'dmg' | null; element?: Element } {
  if (!type) return { stat: null }
  const dmg = type.match(/^FIGHT_PROP_(\w+)_ADD_HURT$/)
  if (dmg) return { stat: 'dmg', element: PROP_ELEMENT[dmg[1]] }
  return { stat: PROP[type] ?? null }
}

/** Ascended stats at each level breakpoint; "90"+ have no further ascension. */
const statsAt = (gdb: Gdb, key: string) =>
  gdb.stats(Number.parseInt(key), key.endsWith('+') ? '+' : '-')
/** genshin-db's character CRIT ascension values include the base 5% CR / 50% CD the engine adds itself */
const BASE_SPEC: Partial<Record<string, number>> = { cr: 0.05, cd: 0.5 }

export const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

type Gdb = Record<string, any> // genshin-db's own types are loose; we normalize right here

const memo = <T>(fn: (key: string) => T) => {
  const cache = new Map<string, T>()
  return (key: string) => {
    if (!cache.has(key)) cache.set(key, fn(key))
    return cache.get(key)!
  }
}

/** English names of playable characters that have talent data (travelers have per-element entries, skipped). */
const playable = memo(() =>
  (g.characters('names', { matchCategories: true, ...EN }) as string[]).filter((n) =>
    g.talents(n, EN),
  ),
)

/** game avatar id (as used by enka.network) → our slug */
export const slugById = memo(() => {
  const map = new Map<number, string>()
  for (const n of playable('')) map.set((g.characters(n, EN) as Gdb).id, slugOf(n))
  return map
})

export const roster = memo((lang: string) =>
  playable('').map((n) => {
    const en = g.characters(n, EN) as Gdb
    const local = g.characters(n, opts(lang as Lang)) as Gdb
    return {
      slug: slugOf(en.name),
      name: local.name as string,
      rarity: en.rarity as number,
      element: ELEMENT[en.elementType],
      weapon: WEAPON[en.weaponType],
      version: en.version as string,
      ...iconUrl(en.images.filename_icon, en.images.mihoyo_icon),
    }
  }),
)

export const character = memo((key: string): CharacterData | null => {
  const [slug, lang] = key.split('|') as [string, Lang]
  const enName = playable('').find((n) => slugOf(n) === slug)
  if (!enName) return null
  const L = opts(lang)
  const en = g.characters(enName, EN) as Gdb
  const local = g.characters(enName, L) as Gdb
  const tEn = g.talents(enName, EN) as Gdb
  const tLocal = g.talents(enName, L) as Gdb
  const cEn = g.constellations(enName, EN) as Gdb
  const element = ELEMENT[en.elementType]
  const weapon = WEAPON[en.weaponType]
  const asc = prop(en.substatType)

  const stats: CharacterData['stats'] = {}
  for (const lv of LEVEL_KEYS) {
    const s = statsAt(en, lv)
    stats[lv] = {
      hp: s.hp,
      atk: s.attack,
      def: s.defense,
      spec: s.specialized - (BASE_SPEC[asc.stat ?? ''] ?? 0),
    }
  }
  const boostOf = (talentName: string) => {
    for (const c of [3, 5]) if (cEn[`c${c}`]?.description.includes(talentName)) return c
    return 0
  }
  const keys = [
    ['normal', 'combat1'],
    ['skill', 'combat2'],
    ['burst', 'combat3'],
  ] as const

  return {
    slug,
    name: local.name,
    rarity: en.rarity,
    element,
    weapon,
    ...iconUrl(en.images.filename_icon, en.images.mihoyo_icon),
    ascensionStat: asc.stat,
    ascensionElement: asc.element,
    stats,
    talents: keys.map(([talent, combat]) => ({
      key: talent,
      name: tLocal[combat].name,
      icon: iconUrl(tEn.images[`filename_${combat}`]).icon,
      rows: parseTalent(
        talent,
        tEn[combat].attributes.labels,
        tLocal[combat].attributes.labels,
        tEn[combat].attributes.parameters,
        element,
        weapon,
      ),
    })),
    boost: { skill: boostOf(tEn.combat2.name), burst: boostOf(tEn.combat3.name) },
  }
})

export const weapons = memo((key: string): WeaponData[] => {
  const [type, lang] = key.split('|') as [WeaponType, Lang] // memo key: "<type>|<lang>"
  return (
    (g.weapons('names', { matchCategories: true, ...EN }) as string[])
      .map((n) => [g.weapons(n, EN) as Gdb, g.weapons(n, opts(lang)) as Gdb])
      .filter(([w]) => WEAPON[w.weaponType] === type && w.rarity >= 3 && w.stats)
      // Prized Isshin Blade is listed once per quest form, all with one id: keep the first
      .filter(([w], i, all) => all.findIndex(([x]) => x.id === w.id) === i)
      .toSorted(([a], [b]) => b.rarity - a.rarity || a.name.localeCompare(b.name))
      .map(([w, local]) => {
        const stats: WeaponData['stats'] = {}
        for (const lv of WEAPON_LEVEL_KEYS) {
          const s = statsAt(w, lv)
          stats[lv] = { atk: s.attack, spec: s.specialized ?? 0 }
        }
        return {
          id: w.id,
          name: local.name,
          rarity: w.rarity,
          ...iconUrl(w.images.filename_icon, w.images.mihoyo_icon),
          mainStat: prop(w.mainStatType).stat,
          stats,
          passiveName: local.effectName ?? '',
          passive: [1, 2, 3, 4, 5].map((r) => local[`r${r}`]?.description ?? ''),
        }
      })
  )
})

export const artifactSets = memo((lang: string): ArtifactSetData[] =>
  (g.artifacts('names', { matchCategories: true, ...EN }) as string[])
    .map((n) => [g.artifacts(n, EN) as Gdb, g.artifacts(n, opts(lang as Lang)) as Gdb])
    .filter(([a]) => a.effect2Pc && Math.max(...a.rarityList) >= 4)
    .map(([a, local]) => ({
      id: a.id,
      key: a.name,
      name: local.name,
      ...iconUrl(a.images.filename_flower, a.images.mihoyo_flower),
      twoPc: local.effect2Pc,
      fourPc: local.effect4Pc ?? '',
      twoPcBuffs: parseTwoPc(a.effect2Pc),
    })),
)
