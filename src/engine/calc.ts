import { FOUR_PC } from './sets'
import {
  DMG_REACTIONS,
  MAIN_STAT,
  SUB_KEYS,
  SUB_ROLL,
  TRANS,
  TRANS_BY_ELEMENT,
  levelMult,
  type MainKey,
  type SubKey,
} from './tables'
import type {
  ArtifactSetData,
  AttackKey,
  Buff,
  BuffKey,
  CharacterData,
  Element,
  Reaction,
  ScalingStat,
  StatKey,
  TalentRow,
  TransReaction,
  WeaponData,
} from './types'

export type Build = {
  level: string
  talents: [number, number, number]
  cons: number
  weaponLevel: string
  refine: number
  /** two set ids; the same id twice (or a lone first id) = 4-piece */
  sets: [number | null, number | null]
  fourPc: boolean
  mains: { sands: MainKey; goblet: MainKey; circlet: MainKey }
  rolls: Record<SubKey, number>
  reaction: Reaction | 'none'
  infusion: boolean
  enemyLevel: number
  enemyRes: number
  custom: Buff[]
}

export type Panel = {
  base: { hp: number; atk: number; def: number }
  hp: number
  atk: number
  def: number
  em: number
  er: number
  cr: number
  cd: number
  heal: number
  shield: number
  buffs: Buff[]
}

const sum = (buffs: Buff[], key: BuffKey, on?: string) =>
  buffs.reduce((s, b) => (b.key === key && b.on === on ? s + b.value : s), 0)

function mainBuff(key: MainKey, element: Element, source: string): Buff {
  if (key === 'dmg') return { key: 'dmg', value: MAIN_STAT.dmg, on: element, source }
  if (key === 'physical') return { key: 'dmg', value: MAIN_STAT.physical, on: 'physical', source }
  return { key, value: MAIN_STAT[key], source }
}

/** Ascension / weapon secondary stat. genshin-db gives EM as a number and the rest as fractions. */
function specBuff(
  stat: StatKey | 'dmg' | null,
  value: number,
  element: Element,
  source: string,
): Buff[] {
  if (!stat || !value) return []
  return [{ key: stat, value, on: stat === 'dmg' ? element : undefined, source }]
}

export function defaultBuild(char: CharacterData): Build {
  const main = scalingStat(char)
  return {
    level: '90',
    talents: [9, 9, 9],
    cons: 0,
    weaponLevel: '90',
    refine: 1,
    sets: [null, null],
    fourPc: true,
    mains: {
      sands: main === 'em' ? 'em' : (`${main}%` as MainKey),
      goblet: char.element === 'physical' ? 'physical' : 'dmg',
      circlet: 'cr',
    },
    rolls: {
      ...Object.fromEntries(SUB_KEYS.map((k) => [k, 0])),
      cr: 9,
      cd: 9,
      [main === 'em' ? 'em' : `${main}%`]: 4,
      er: 3,
    } as Record<SubKey, number>,
    reaction: 'none',
    infusion: false,
    enemyLevel: 90,
    enemyRes: 0.1,
    custom: [],
  }
}

/** Most common scaling stat across skill and burst damage rows. */
export function scalingStat(char: CharacterData): ScalingStat {
  const count: Record<ScalingStat, number> = { atk: 0, hp: 0, def: 0, em: 0 }
  for (const t of char.talents)
    for (const r of t.rows)
      if (r.kind === 'damage' && t.key !== 'normal')
        for (const v of r.variants) for (const term of v.terms) if (term.stat) count[term.stat]++
  return (Object.entries(count).toSorted((a, b) => b[1] - a[1])[0][0] as ScalingStat) ?? 'atk'
}

export type SetEffect = { name: string; pieces: 2 | 4; note: string; buffs: Buff[] }

export function setEffects(sets: ArtifactSetData[], build: Build, char: CharacterData, er: number) {
  const [a, b] = build.sets.map((id) => sets.find((s) => s.id === id))
  const out: SetEffect[] = []
  const two = (s: ArtifactSetData) =>
    out.push({
      name: s.name,
      pieces: 2,
      note: s.twoPc,
      buffs: s.twoPcBuffs.map((x) => ({ ...x, source: `${s.name} 2pc` })),
    })
  if (a && build.fourPc) {
    two(a)
    const four = FOUR_PC[a.key]
    const buffs =
      four?.buffs({ weapon: char.weapon, er }).map((x) => ({ ...x, source: `${a.name} 4pc` })) ?? []
    out.push({ name: a.name, pieces: 4, note: four?.note ?? '', buffs })
  } else {
    if (a) two(a)
    if (b) two(b)
  }
  return out
}

export function collectBuffs(
  char: CharacterData,
  weapon: WeaponData | null,
  sets: ArtifactSetData[],
  build: Build,
) {
  const st = char.stats[build.level] ?? char.stats['90']
  const buffs: Buff[] = [
    ...specBuff(char.ascensionStat, st.spec, char.ascensionElement ?? char.element, 'Ascension'),
    { key: 'hp', value: MAIN_STAT.hp, source: 'Flower' },
    { key: 'atk', value: MAIN_STAT.atk, source: 'Feather' },
    mainBuff(build.mains.sands, char.element, 'Sands'),
    mainBuff(build.mains.goblet, char.element, 'Goblet'),
    mainBuff(build.mains.circlet, char.element, 'Circlet'),
    ...SUB_KEYS.filter((k) => build.rolls[k]).map((k): Buff => ({
      key: k,
      value: SUB_ROLL[k] * build.rolls[k],
      source: 'Substats',
    })),
    ...build.custom,
  ]
  if (weapon) {
    const ws = weapon.stats[build.weaponLevel] ?? weapon.stats['90']
    buffs.push(...specBuff(weapon.mainStat, ws.spec, char.element, weapon.name))
  }
  // Emblem 4pc scales with final ER, which includes the sets' own ER bonus: resolve in two passes
  const setEr = sum(
    setEffects(sets, build, char, 0).flatMap((e) => e.buffs),
    'er',
  )
  const effects = setEffects(sets, build, char, 1 + sum(buffs, 'er') + setEr)
  return { buffs: [...buffs, ...effects.flatMap((e) => e.buffs)], effects }
}

export function buildPanel(
  char: CharacterData,
  weapon: WeaponData | null,
  buffs: Buff[],
  build: Build,
): Panel {
  const st = char.stats[build.level] ?? char.stats['90']
  const wAtk = weapon ? (weapon.stats[build.weaponLevel] ?? weapon.stats['90']).atk : 0
  const base = { hp: st.hp, atk: st.atk + wAtk, def: st.def }
  const plain = buffs.filter((x) => !x.from)
  if (plain.length === buffs.length) return panelOf(base, buffs)
  // conversions read the panel before any conversion is applied, so they don't feed each other
  const pre = panelOf(base, plain)
  // keep `from` on converted entries so the UI can show where the value came from
  return panelOf(
    base,
    buffs.map((x) => (x.from ? { ...x, value: x.value * pre[x.from] } : x)),
  )
}

function panelOf(base: Panel['base'], buffs: Buff[]): Panel {
  return {
    base,
    hp: base.hp * (1 + sum(buffs, 'hp%')) + sum(buffs, 'hp'),
    atk: base.atk * (1 + sum(buffs, 'atk%')) + sum(buffs, 'atk'),
    def: base.def * (1 + sum(buffs, 'def%')) + sum(buffs, 'def'),
    em: sum(buffs, 'em'),
    er: 1 + sum(buffs, 'er'),
    cr: 0.05 + sum(buffs, 'cr'),
    cd: 0.5 + sum(buffs, 'cd'),
    heal: sum(buffs, 'heal'),
    shield: sum(buffs, 'shield'),
    buffs,
  }
}

/** Enemy RES multiplier. Ysin used 1/(1+3r) above 75%; the game uses 1/(1+4r). */
export function resMult(res: number) {
  if (res < 0) return 1 - res / 2
  if (res < 0.75) return 1 - res
  return 1 / (1 + 4 * res)
}

export function defMult(charLevel: number, enemyLevel: number, shred: number, ignore: number) {
  const c = charLevel + 100
  return c / (c + (enemyLevel + 100) * Math.max(1 - shred, 0) * (1 - ignore))
}

export type HitResult = {
  label: string
  attack: AttackKey
  element: Element
  kind: TalentRow['kind']
  formula: string
  reaction?: Reaction
  /** heal / shield amount, or damage without crit */
  nonCrit: number
  crit: number
  avg: number
}

const STAT_LABEL: Record<ScalingStat, string> = { atk: 'ATK', hp: 'HP', def: 'DEF', em: 'EM' }
const pct = (v: number) => `${+(v * 100).toFixed(2)}%`

export function talentLevel(
  char: CharacterData,
  build: Build,
  talent: 'normal' | 'skill' | 'burst',
) {
  if (talent === 'normal') return build.talents[0]
  const lv = build.talents[talent === 'skill' ? 1 : 2]
  const c = char.boost[talent]
  return lv + (c && build.cons >= c ? 3 : 0)
}

export function calcRows(
  char: CharacterData,
  panel: Panel,
  build: Build,
): (HitResult & { talent: string })[] {
  const b = panel.buffs
  const charLevel = Number.parseInt(build.level)
  const statValue = (s: ScalingStat) => (s === 'em' ? panel.em : panel[s])
  const ampEntry =
    build.reaction === 'none'
      ? undefined
      : DMG_REACTIONS[char.element]?.find((r) => r.reaction === build.reaction)
  const out: (HitResult & { talent: string })[] = []

  for (const t of char.talents) {
    const idx = talentLevel(char, build, t.key) - 1
    for (const row of t.rows) {
      const element = build.infusion && row.element === 'physical' ? char.element : row.element
      row.variants.forEach((v, vi) => {
        let base = 0
        const parts: string[] = []
        for (const term of v.terms) {
          const val = term.values[Math.min(idx, term.values.length - 1)] * term.count * v.count
          base += term.stat ? val * statValue(term.stat) : val
          parts.push(term.stat ? `${pct(val)} ${STAT_LABEL[term.stat]}` : `${+val.toFixed(0)}`)
        }
        const label = row.variants.length > 1 ? `${row.label} #${vi + 1}` : row.label
        const common = {
          talent: t.name,
          label,
          attack: row.attack,
          element,
          kind: row.kind,
          formula: parts.join(' + '),
        }
        if (row.kind === 'heal' || row.kind === 'shield') {
          const amount = base * (1 + (row.kind === 'heal' ? panel.heal : panel.shield))
          out.push({ ...common, nonCrit: amount, crit: amount, avg: amount })
          return
        }
        if (row.kind === 'lunar') {
          out.push({ ...common, nonCrit: Number.NaN, crit: Number.NaN, avg: Number.NaN })
          return
        }
        const hits = v.count * v.terms.reduce((n, term) => Math.max(n, term.count), 1)
        base += hits * (sum(b, 'flat') + sum(b, 'flat', row.attack))

        let amp = 1
        let reaction: Reaction | undefined
        if (ampEntry && element === char.element) {
          reaction = ampEntry.reaction
          const em = panel.em
          if (reaction === 'aggravate' || reaction === 'spread') {
            base +=
              hits *
              levelMult(charLevel) *
              ampEntry.mult *
              (1 + (5 * em) / (em + 1200) + sum(b, 'react', reaction))
          } else {
            amp = ampEntry.mult * (1 + (2.78 * em) / (em + 1400) + sum(b, 'react', reaction))
          }
        }
        const dmg = 1 + sum(b, 'dmg') + sum(b, 'dmg', element) + sum(b, 'dmg', row.attack)
        const def = defMult(
          charLevel,
          build.enemyLevel,
          sum(b, 'defShred'),
          sum(b, 'defIgnore') + sum(b, 'defIgnore', row.attack),
        )
        const res = resMult(build.enemyRes - sum(b, 'res', element))
        const cr = Math.min(
          Math.max(panel.cr + sum(b, 'cr', element) + sum(b, 'cr', row.attack), 0),
          1,
        )
        const cd = cr === 0 ? 0 : panel.cd + sum(b, 'cd', element) + sum(b, 'cd', row.attack)
        const nonCrit = base * dmg * def * res * amp
        out.push({
          ...common,
          reaction,
          nonCrit,
          crit: nonCrit * (1 + cd),
          avg: nonCrit * (1 + cr * cd),
        })
      })
    }
  }
  return out
}

/** Transformative reactions the character can trigger: no DEF, no crit. */
export function calcTransformative(char: CharacterData, panel: Panel, build: Build) {
  const em = panel.em
  const lv = levelMult(Number.parseInt(build.level))
  return (TRANS_BY_ELEMENT[char.element] ?? []).map((r: TransReaction) => {
    const { coef, element } = TRANS[r]
    const bonus = 1 + (16 * em) / (em + 2000) + sum(panel.buffs, 'react', r)
    return {
      reaction: r,
      damage: lv * coef * bonus * resMult(build.enemyRes - sum(panel.buffs, 'res', element)),
    }
  })
}

export function calculate(
  char: CharacterData,
  weapon: WeaponData | null,
  sets: ArtifactSetData[],
  build: Build,
) {
  const { buffs, effects } = collectBuffs(char, weapon, sets, build)
  const panel = buildPanel(char, weapon, buffs, build)
  return {
    panel,
    effects,
    rows: calcRows(char, panel, build),
    transformative: calcTransformative(char, panel, build),
  }
}
