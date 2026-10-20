// Passives from Genshin Optimizer's sheets (scripts/go-passives.ts writes passives.gen.json).
// A sheet is a set of formula trees keyed by the stat path they add to ("premod.atk_",
// "total.atk", "teamBuff.premod.pyro_enemyRes_", ...). This evaluates them for one build.
import type { AttackKey, Buff, BuffKey, Element, Reaction, StatKey } from './types'

export type GoNode = {
  operation: string
  operands: GoNode[]
  path?: string[]
  value?: number | string
  list?: number[]
  table?: Record<string, GoNode>
}
/** a toggle's label and its states' labels, as GO shows them */
export type GoLabel = { name?: string; states?: Record<string, string> }
export type GoText = { en?: string; zh?: string }
/** one row of a character's damage table, in GO's sheet order */
export type GoMove = {
  /** GO's display path, e.g. "charged.frostflake" */
  id: string
  /** GO sheet section: auto, skill, burst, passive1..3, constellation1..6 */
  talent: string
  kind: 'damage' | 'heal' | 'shield' | 'lunar'
  name: GoText
  /** damage: the hit's own data by path ("hit.base", "hit.ele", "premod.critRate_", ...); heal / shield: { value } */
  data: Record<string, GoNode>
}
/** one GO sheet: contributions by output path, each toggle's possible states, and their labels */
export type GoSheet = {
  nodes: Record<string, GoNode>
  conds: Record<string, string[]>
  labels?: { en: Record<string, GoLabel>; zh: Record<string, GoLabel> }
  /** characters only */
  moves?: GoMove[]
  talents?: Record<string, GoText>
}

const STAT: Record<string, StatKey> = {
  hp_: 'hp%',
  hp: 'hp',
  atk_: 'atk%',
  atk: 'atk',
  def_: 'def%',
  def: 'def',
  eleMas: 'em',
  enerRech_: 'er',
  critRate_: 'cr',
  critDMG_: 'cd',
  heal_: 'heal',
  shield_: 'shield',
}
const MOVE: Record<string, AttackKey> = {
  normal: 'normal',
  charged: 'charged',
  plunging: 'plunge',
  skill: 'skill',
  burst: 'burst',
}
const ELEMENTS = ['pyro', 'hydro', 'electro', 'cryo', 'anemo', 'geo', 'dendro', 'physical']
const REACT: Record<string, Reaction> = {
  vaporize: 'vaporize',
  melt: 'melt',
  aggravate: 'aggravate',
  spread: 'spread',
  swirl: 'swirl',
  bloom: 'bloom',
  hyperbloom: 'hyperbloom',
  burgeon: 'burgeon',
  burning: 'burning',
  overloaded: 'overloaded',
  electrocharged: 'electrocharged',
  superconduct: 'superconduct',
  shattered: 'shatter',
}

/** GO stat key → ysin-ng buff key; null = a mechanic ysin-ng doesn't model (lunar, stamina, ...) */
export function buffOf(goKey: string): { key: BuffKey; on?: Buff['on']; sign?: -1 } | null {
  if (STAT[goKey]) return { key: STAT[goKey] }
  if (goKey === 'all_dmg_') return { key: 'dmg' }
  if (goKey === 'enemyDefRed_') return { key: 'defShred' }
  if (goKey === 'enemyDefIgn_') return { key: 'defIgnore' }
  const m = goKey.match(/^(\w+?)_(dmg_|critRate_|critDMG_|dmgInc|enemyRes_)$/)
  if (!m) return null
  const [, on, what] = m
  const target = MOVE[on] ?? (ELEMENTS.includes(on) ? (on as Element) : undefined)
  if (what === 'dmg_' && REACT[on]) return { key: 'react', on: REACT[on] }
  if (!target) return null
  if (what === 'enemyRes_')
    return ELEMENTS.includes(on) ? { key: 'res', on: target, sign: -1 } : null
  const key = ({ dmg_: 'dmg', critRate_: 'cr', critDMG_: 'cd', dmgInc: 'flat' } as const)[what]
  return key ? { key, on: target } : null
}

/** Output paths the evaluator reads or turns into buffs; the generator drops everything else. */
export function keepPath(path: string) {
  const p = path.replace(/^teamBuff\./, '')
  if (/^(nonStacking|infusion|tally)\./.test(p)) return true
  const m = p.match(/^(premod|total)\.(\w+)$/)
  return !!m && !!buffOf(m[2])
}

type Value = number | string | undefined
export type PassiveInput = {
  /** sheets in play: character, weapon, equipped sets */
  sheets: { source: string; sheet: GoSheet }[]
  /** GO input paths: "constellation", "weapon.refinement", "conditional.HuTao.X", "artSet.X", ... */
  inputs: Record<string, Value>
  base: { hp: number; atk: number; def: number }
  /** the build's own (non-GO) contribution to a GO stat key, without the 5% CR / 50% CD / 100% ER base */
  own: (goKey: string) => number
}

const BASE_STAT: Record<string, number> = { critRate_: 0.05, critDMG_: 0.5, enerRech_: 1 }

export function evaluatePassives({ sheets, inputs, base, own }: PassiveInput) {
  const byPath = new Map<string, { source: string; node: GoNode }[]>()
  for (const { source, sheet } of sheets)
    for (const [path, node] of Object.entries(sheet.nodes)) {
      const p = path.replace(/^teamBuff\./, '') // solo: team buffs reach the wearer too
      byPath.set(p, [...(byPath.get(p) ?? []), { source, node }])
    }
  const memo = new Map<string, Value>()
  const busy = new Set<string>()
  const contrib = (path: string) => {
    let n = 0
    for (const { node } of byPath.get(path) ?? []) n += num(evalNode(node))
    return n
  }
  const stat = (layer: string, k: string): number => {
    if (layer === 'base') return base[k as keyof typeof base] ?? 0
    if (k === 'hp' || k === 'atk' || k === 'def') {
      const b = base[k]
      const pre = b * (1 + own(`${k}_`) + contrib(`premod.${k}_`)) + own(k) + contrib(`premod.${k}`)
      return layer === 'premod' ? pre : pre + b * contrib(`total.${k}_`) + contrib(`total.${k}`)
    }
    const pre = (BASE_STAT[k] ?? 0) + own(k) + contrib(`premod.${k}`)
    return layer === 'premod' ? pre : pre + contrib(`total.${k}`)
  }
  const read = (path: string[]): Value => {
    const key = path.join('.')
    if (key in inputs) return inputs[key]
    if (memo.has(key)) return memo.get(key)
    if (busy.has(key)) return undefined // GO sheets never loop; this only guards bad data
    busy.add(key)
    let v: Value
    if (['base', 'premod', 'total'].includes(path[0]) && path.length === 2)
      v = stat(path[0], path[1])
    else
      for (const { node } of byPath.get(key) ?? []) {
        const x = evalNode(node)
        v = typeof x === 'number' ? num(v) + x : (v ?? x) // strings (nonStacking, infusion): first one wins
      }
    busy.delete(key)
    memo.set(key, v)
    return v
  }
  const evalNode = (n: GoNode): Value => {
    const o = n.operands
    switch (n.operation) {
      case 'const':
        return n.value
      case 'read':
        return read(n.path!)
      case 'add':
        return o.reduce((s, x) => s + num(evalNode(x)), 0)
      case 'mul':
        return o.reduce((s, x) => s * num(evalNode(x)), 1)
      case 'min':
        return Math.min(...o.map((x) => num(evalNode(x))))
      case 'max':
        return Math.max(...o.map((x) => num(evalNode(x))))
      case 'sum_frac': {
        const [a, b] = o.map((x) => num(evalNode(x)))
        return a / (a + b)
      }
      case 'threshold':
        return num(evalNode(o[0])) >= num(evalNode(o[1])) ? evalNode(o[2]) : evalNode(o[3])
      case 'match':
        return evalNode(o[0]) === evalNode(o[1]) ? evalNode(o[2]) : o[3] && evalNode(o[3])
      case 'subscript':
        return n.list![num(evalNode(o[0]))]
      case 'lookup': {
        const hit = n.table![String(evalNode(o[0]))]
        return hit ? evalNode(hit) : o[1] && evalNode(o[1])
      }
      default:
        throw new Error(`unsupported GO operation ${n.operation}`)
    }
  }

  const buffs: Buff[] = []
  for (const [path, list] of byPath) {
    const m = path.match(/^(premod|total)\.(\w+)$/)
    const b = m && buffOf(m[2])
    if (!b) continue
    for (const { source, node } of list) {
      const v = num(evalNode(node))
      // a total-layer % stat would be read as premod by ysin-ng; GO only uses flat ones there
      if (v) buffs.push({ key: b.key, on: b.on, value: b.sign ? -v : v, source })
    }
  }
  const infusion = read(['infusion', 'nonOverridableSelf']) ?? read(['infusion', 'overridableSelf'])
  return { buffs, infusion: typeof infusion === 'string' && infusion !== '' }
}

const num = (v: Value) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0)

/** GO's key for an English name: "Amos' Bow" → "AmosBow", "Hu Tao" → "HuTao" */
export const goKey = (name: string) =>
  name
    .replace(/['’]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
