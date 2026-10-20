// Game data from the go-data export (Genshin Optimizer, see scripts/go-data.ts), pulled by
// scripts/pull-data.ts. Kept on the server: the client only gets per-page slices.
import { buffOf, type GoSheet, type GoText } from '#/engine/passives'
import passives from '#/engine/passives.gen.json'
import type {
  ArtifactSetData,
  CharacterData,
  Element,
  StatKey,
  WeaponData,
  WeaponType,
} from '#/engine/types'
import { iconUrl, type Lang } from '#/lib/assets'
import goData from './data.gen.json'
import type { GoData } from './go-types'

const DATA = goData as unknown as GoData
const SHEETS = passives as unknown as Record<
  'chars' | 'weapons' | 'sets',
  Record<string, GoSheet>
> & {
  resonance: GoSheet
}
const RESONANCE: GoText = { en: 'Elemental Resonance', zh: '元素共鸣' }
/** the damage table's group of reaction rows (Lunar-Charged, Stellar Swirl, ...) */
const REACTIONS: GoText = { en: 'Reactions', zh: '剧变反应' }

const text = (t: GoText, lang: Lang) => t[lang] || t.en || ''
/** enka.network's UI mirror first, GO's own copy (jsDelivr, pinned commit) as fallback */
const icon = (folder: string, key: string, file: string) =>
  iconUrl(file || undefined, file ? `${DATA.assets}/${folder}/${key}/${file}.png` : '')
/** GO stat key ("critDMG_", "pyro_dmg_") → ysin-ng's ascension / weapon secondary stat */
function spec(goKey: string | null): { stat: StatKey | 'dmg' | null; element?: Element } {
  const b = goKey ? buffOf(goKey) : null
  if (!b) return { stat: null }
  return b.key === 'dmg' ? { stat: 'dmg', element: b.on as Element } : { stat: b.key as StatKey }
}

export const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const memo = <T>(fn: (key: string) => T) => {
  const cache = new Map<string, T>()
  return (key: string) => {
    if (!cache.has(key)) cache.set(key, fn(key))
    return cache.get(key)!
  }
}

const chars = Object.entries(DATA.chars).map(([key, c]) => ({
  key,
  slug: slugOf(c.name.en ?? key),
  ...c,
}))

/** game avatar id (as used by enka.network) → our slug */
export const slugById = memo(() => new Map(chars.map((c) => [c.id, c.slug])))

export const roster = memo((lang: string) =>
  chars.map((c) => ({
    slug: c.slug,
    name: text(c.name, lang as Lang),
    rarity: c.rarity,
    element: c.element,
    weapon: c.weapon,
    /** game ids grow with releases: newest first sorts by this */
    id: c.id,
    ...icon('chars', c.key, c.icons.icon),
  })),
)

export const character = memo((key: string): CharacterData | null => {
  const [slug, lang] = key.split('|') as [string, Lang]
  const c = chars.find((x) => x.slug === slug)
  if (!c) return null
  const go = SHEETS.chars[c.key]
  const asc = spec(c.spec)
  const talentName = (t: string) =>
    text(t === 'reaction' ? REACTIONS : (go?.talents?.[t] ?? {}), lang) || t
  return {
    slug,
    name: text(c.name, lang),
    rarity: c.rarity,
    element: c.element,
    weapon: c.weapon,
    ...icon('chars', c.key, c.icons.icon),
    ascensionStat: asc.stat,
    ascensionElement: asc.element,
    stats: c.stats,
    talents: (
      [
        ['normal', 'auto', c.icons.auto],
        ['skill', 'skill', c.icons.skill],
        ['burst', 'burst', c.icons.burst],
      ] as const
    ).map(([k, t, file]) => ({
      key: k,
      name: talentName(t),
      icon: icon('chars', c.key, file).icon,
    })),
    boost: c.boost,
    goKey: c.key,
    // the damage table comes from GO; the client only needs names in this page's language
    moves: (go?.moves ?? []).map(({ name, ...m }) => ({
      ...m,
      label: text(name, lang) || m.id,
      group: talentName(m.talent),
    })),
    passives: go && { nodes: go.nodes, conds: go.conds, labels: go.labels },
    resonance: SHEETS.resonance && { name: text(RESONANCE, lang), sheet: SHEETS.resonance },
  }
})

export const weapons = memo((key: string): WeaponData[] => {
  const [type, lang] = key.split('|') as [WeaponType, Lang] // memo key: "<type>|<lang>"
  return Object.entries(DATA.weapons)
    .filter(([, w]) => w.type === type && w.rarity >= 3)
    .toSorted(
      ([, a], [, b]) => b.rarity - a.rarity || text(a.name, 'en').localeCompare(text(b.name, 'en')),
    )
    .map(([k, w]) => {
      const s = spec(w.spec)
      return {
        id: w.id,
        name: text(w.name, lang),
        rarity: w.rarity,
        ...icon('weapons', k, w.icon),
        mainStat: s.stat,
        mainElement: s.element,
        stats: w.stats,
        passiveName: text(w.passiveName, lang),
        passive: w.passive.en.map((en, i) => w.passive[lang][i] || en),
        goKey: k,
        passives: SHEETS.weapons[k],
      }
    })
})

export const artifactSets = memo((lang: string): ArtifactSetData[] =>
  Object.entries(DATA.sets)
    .filter(([, a]) => a.rarity >= 4 && text(a.twoPc, 'en'))
    .map(([k, a]) => ({
      id: a.id,
      name: text(a.name, lang as Lang),
      ...icon('artifacts', k, a.icon),
      twoPc: text(a.twoPc, lang as Lang),
      fourPc: text(a.fourPc, lang as Lang),
      goKey: k,
      passives: SHEETS.sets[k],
    })),
)
