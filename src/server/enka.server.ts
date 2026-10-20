// Profile import from enka.network (public showcase data). Docs: https://api.enka.network
import {
  calculate,
  defaultBuild,
  focusRow,
  type ArtifactPiece,
  type ArtifactSlot,
  type Build,
} from '#/engine/calc'
import { LEVEL_KEYS, SUB_ROLL, WEAPON_LEVEL_KEYS, type MainKey, type SubKey } from '#/engine/tables'
import type { CharacterData, Element } from '#/engine/types'
import { iconUrl, type Lang } from '#/lib/assets'
import type { GamePanel, SavedBuild } from '#/lib/store'
import { artifactSets, character, roster, slugById, weapons } from './data.server'

const UA = 'ysin-ng/0.1 (local genshin calculator)'
const SKILL_ORDER_URL =
  'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/characters.json'

export type ImportError =
  | 'invalid_uid'
  | 'not_found'
  | 'maintenance'
  | 'rate_limited'
  | 'unavailable'

export type ImportedCharacter = {
  slug: string
  name: string
  icon: string
  iconFallback: string
  element: Element
  rarity: number
  level: number
  cons: number
  weaponId: number | null
  weaponName: string
  weaponIcon: string
  build: Build
  game: GamePanel
  summary: NonNullable<SavedBuild['summary']>
}

export type ImportResult =
  | { ok: false; error: ImportError; retryAfter?: number }
  | {
      ok: true
      uid: string
      /** enka caches a profile; a refresh before this time returns the same data */
      expiresAt: number
      player: {
        nickname: string
        level: number
        worldLevel: number
        signature: string
        avatar?: { icon: string; iconFallback: string }
      }
      characters: ImportedCharacter[]
      /** showcase characters whose details are hidden in-game */
      hidden: number
      skipped: string[]
    }

type Raw = Record<string, any> // enka JSON, normalized below

const profiles = new Map<string, { data: Raw; expiresAt: number }>()
let skillOrder: { data: Record<string, { SkillOrder?: number[] }>; at: number } | null = null

async function getSkillOrder() {
  if (skillOrder && Date.now() - skillOrder.at < 86_400_000) return skillOrder.data
  try {
    const res = await fetch(SKILL_ORDER_URL, { headers: { 'User-Agent': UA } })
    if (res.ok) skillOrder = { data: await res.json(), at: Date.now() }
  } catch {
    // fall back to sorting skill ids below
  }
  return skillOrder?.data ?? {}
}

const ERRORS: Record<number, ImportError> = {
  400: 'invalid_uid',
  404: 'not_found',
  424: 'maintenance',
  429: 'rate_limited',
}

async function fetchProfile(
  uid: string,
): Promise<{ data: Raw; expiresAt: number } | { error: ImportError; retryAfter?: number }> {
  const hit = profiles.get(uid)
  if (hit && hit.expiresAt > Date.now()) return hit
  let res: Response
  try {
    res = await fetch(`https://enka.network/api/uid/${uid}/`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return { error: 'unavailable' }
  }
  if (!res.ok)
    return {
      error: ERRORS[res.status] ?? 'unavailable',
      retryAfter: Number(res.headers.get('retry-after')) || undefined,
    }
  const data = (await res.json()) as Raw
  const entry = { data, expiresAt: Date.now() + (Number(data.ttl) || 60) * 1000 }
  profiles.set(uid, entry)
  return entry
}

const SLOT: Record<string, ArtifactSlot> = {
  EQUIP_BRACER: 'flower',
  EQUIP_NECKLACE: 'plume',
  EQUIP_SHOES: 'sands',
  EQUIP_RING: 'goblet',
  EQUIP_DRESS: 'circlet',
}
const SUB: Record<string, SubKey> = {
  FIGHT_PROP_HP: 'hp',
  FIGHT_PROP_HP_PERCENT: 'hp%',
  FIGHT_PROP_ATTACK: 'atk',
  FIGHT_PROP_ATTACK_PERCENT: 'atk%',
  FIGHT_PROP_DEFENSE: 'def',
  FIGHT_PROP_DEFENSE_PERCENT: 'def%',
  FIGHT_PROP_ELEMENT_MASTERY: 'em',
  FIGHT_PROP_CHARGE_EFFICIENCY: 'er',
  FIGHT_PROP_CRITICAL: 'cr',
  FIGHT_PROP_CRITICAL_HURT: 'cd',
}
const FLAT = new Set([
  'FIGHT_PROP_HP',
  'FIGHT_PROP_ATTACK',
  'FIGHT_PROP_DEFENSE',
  'FIGHT_PROP_ELEMENT_MASTERY',
])
const DMG_PROP: Record<string, Element> = {
  FIGHT_PROP_FIRE_ADD_HURT: 'pyro',
  FIGHT_PROP_ELEC_ADD_HURT: 'electro',
  FIGHT_PROP_WATER_ADD_HURT: 'hydro',
  FIGHT_PROP_GRASS_ADD_HURT: 'dendro',
  FIGHT_PROP_WIND_ADD_HURT: 'anemo',
  FIGHT_PROP_ROCK_ADD_HURT: 'geo',
  FIGHT_PROP_ICE_ADD_HURT: 'cryo',
  FIGHT_PROP_PHYSICAL_ADD_HURT: 'physical',
}
/** fightPropMap ids for the in-game elemental DMG bonus */
const DMG_FIGHT_PROP: Record<Element, string> = {
  physical: '30',
  pyro: '40',
  electro: '41',
  hydro: '42',
  dendro: '43',
  anemo: '44',
  geo: '45',
  cryo: '46',
}

const statValue = (prop: string, v: number) => (FLAT.has(prop) ? v : v / 100)
const ASCENSION_CAPS = [20, 40, 50, 60, 70, 80]
/** Our level key for an in-game level + ascension phase: "80" before ascending at the cap, "80+" after. */
export function levelKey(keys: string[], level: number, ascension: number) {
  const cap = ASCENSION_CAPS.indexOf(level)
  if (cap >= 0) return ascension > cap ? `${level}+` : String(level)
  // between caps: the closest key below (always the ascended variant)
  const below = keys.filter((k) => Number.parseInt(k) <= level).at(-1) ?? keys[0]
  return keys.includes(`${below}+`) ? `${below}+` : below
}

function mainKey(prop: string, element: Element): MainKey | null {
  if (prop === 'FIGHT_PROP_PHYSICAL_ADD_HURT') return 'physical'
  if (DMG_PROP[prop]) return DMG_PROP[prop] === element ? 'dmg' : null
  if (prop === 'FIGHT_PROP_HEAL_ADD') return 'heal'
  const k = SUB[prop]
  return k && k !== 'hp' && k !== 'atk' && k !== 'def' ? (k as MainKey) : null
}

export function toBuild(
  avatar: Raw,
  char: CharacterData,
  order: number[] | undefined,
  setIds: Set<number>,
) {
  const build = defaultBuild(char)
  const level = Number(avatar.propMap?.['4001']?.val ?? 90)
  build.level = levelKey(LEVEL_KEYS, level, Number(avatar.propMap?.['1002']?.val ?? 6))
  build.cons = avatar.talentIdList?.length ?? 0
  const skillIds =
    order ??
    Object.keys(avatar.skillLevelMap ?? {})
      .map(Number)
      .toSorted((a, b) => a - b)
  build.talents = [0, 1, 2].map((i) =>
    Number(avatar.skillLevelMap?.[skillIds[i]] ?? 1),
  ) as Build['talents']

  build.rolls = Object.fromEntries(Object.keys(SUB_ROLL).map((k) => [k, 0])) as Build['rolls']
  build.mainValues = { flower: 0, plume: 0, sands: 0, goblet: 0, circlet: 0 }
  build.pieces = {}
  const setCount = new Map<number, number>()
  let weapon: Raw | undefined

  for (const item of avatar.equipList ?? []) {
    if (item.weapon) {
      weapon = item
      continue
    }
    const slot = SLOT[item.flat?.equipType]
    if (!slot) continue
    const main = item.flat.reliquaryMainstat
    const mainValue = statValue(main.mainPropId, main.statValue)
    let key: MainKey | null = slot === 'flower' ? 'hp' : slot === 'plume' ? 'atk' : null
    if (slot === 'sands' || slot === 'goblet' || slot === 'circlet') {
      key = mainKey(main.mainPropId, char.element)
      if (key) build.mains[slot] = key
      build.mainValues[slot] = key ? mainValue : 0
    } else build.mainValues[slot] = mainValue
    const subs: ArtifactPiece['subs'] = []
    for (const s of item.flat.reliquarySubstats ?? []) {
      const k = SUB[s.appendPropId]
      if (!k) continue
      const value = statValue(s.appendPropId, s.statValue)
      build.rolls[k] += value / SUB_ROLL[k]
      subs.push({ key: k, value })
    }
    build.pieces[slot] = {
      setId: item.flat.setId,
      icon: iconUrl(item.flat.icon).icon,
      rarity: Number(item.flat.rankLevel ?? 5),
      level: Math.max(0, Number(item.reliquary?.level ?? 1) - 1),
      main: key,
      mainValue,
      subs,
    }
    const setId = item.flat.setId
    if (setIds.has(setId)) setCount.set(setId, (setCount.get(setId) ?? 0) + 1)
  }
  for (const k of Object.keys(build.rolls) as SubKey[])
    build.rolls[k] = Math.round(build.rolls[k] * 100) / 100

  const sets = [...setCount].filter(([, n]) => n >= 2).toSorted((a, b) => b[1] - a[1])
  build.fourPc = (sets[0]?.[1] ?? 0) >= 4
  build.sets = [sets[0]?.[0] ?? null, build.fourPc ? null : (sets[1]?.[0] ?? null)]

  let weaponId: number | null = null
  if (weapon) {
    weaponId = weapon.itemId
    build.refine = Number(Object.values(weapon.weapon.affixMap ?? { 0: 0 })[0] ?? 0) + 1
    build.weaponLevel = levelKey(
      WEAPON_LEVEL_KEYS,
      Number(weapon.weapon.level ?? 90),
      Number(weapon.weapon.promoteLevel ?? 6),
    )
  }
  const fp = avatar.fightPropMap ?? {}
  const game: GamePanel = {
    hp: fp['2000'] ?? 0,
    atk: fp['2001'] ?? 0,
    def: fp['2002'] ?? 0,
    em: fp['28'] ?? 0,
    cr: fp['20'] ?? 0,
    cd: fp['22'] ?? 0,
    er: fp['23'] ?? 0,
    dmg: fp[DMG_FIGHT_PROP[char.element]] ?? 0,
  }
  return { build, weaponId, level, game }
}

export async function importProfile(uid: string, lang: Lang): Promise<ImportResult> {
  if (!/^\d{9,10}$/.test(uid)) return { ok: false, error: 'invalid_uid' }
  const [res, order] = await Promise.all([fetchProfile(uid), getSkillOrder()])
  if ('error' in res) return { ok: false, ...res }
  const { data, expiresAt } = res
  const info = data.playerInfo ?? {}
  const ids = slugById('')
  const people = new Map(roster(lang).map((c) => [c.slug, c]))
  const allSets = artifactSets(lang)
  const setIds = new Set(allSets.map((s) => s.id))
  const skipped: string[] = []
  const characters: ImportedCharacter[] = []

  for (const avatar of (data.avatarInfoList ?? []) as Raw[]) {
    const slug = ids.get(avatar.avatarId)
    const char = slug ? character(`${slug}|${lang}`) : null
    if (!slug || !char) {
      skipped.push(String(avatar.avatarId))
      continue
    }
    const { build, weaponId, level, game } = toBuild(
      avatar,
      char,
      order[avatar.avatarId]?.SkillOrder,
      setIds,
    )
    const weapon = weapons(`${char.weapon}|${lang}`).find((w) => w.id === weaponId)
    const focus = focusRow(calculate(char, weapon ?? null, allSets, build).rows)
    const setNames = build.sets.map((id) => allSets.find((s) => s.id === id)?.name).filter(Boolean)
    characters.push({
      slug,
      name: char.name,
      icon: char.icon,
      iconFallback: char.iconFallback,
      element: char.element,
      rarity: char.rarity,
      level,
      cons: build.cons,
      weaponId: weapon?.id ?? null,
      weaponName: weapon?.name ?? '',
      weaponIcon: weapon?.icon ?? '',
      build,
      game,
      summary: {
        weapon: weapon ? `${weapon.name} R${build.refine}` : '',
        weaponIcon: weapon?.icon ?? '',
        sets: build.fourPc ? `${setNames[0]} 4pc` : setNames.map((n) => `${n} 2pc`).join(' + '),
        focusLabel: focus?.label ?? '',
        focusValue: focus?.avg ?? 0,
      },
    })
  }

  const avatarSlug = ids.get(info.profilePicture?.avatarId)
  const avatar = avatarSlug ? people.get(avatarSlug) : undefined
  return {
    ok: true,
    uid,
    expiresAt,
    player: {
      nickname: info.nickname ?? '',
      level: info.level ?? 0,
      worldLevel: info.worldLevel ?? 0,
      signature: info.signature ?? '',
      avatar: avatar && { icon: avatar.icon, iconFallback: avatar.iconFallback },
    },
    characters,
    hidden: Math.max(
      0,
      (info.showAvatarInfoList?.length ?? 0) - (data.avatarInfoList?.length ?? 0),
    ),
    skipped,
  }
}
