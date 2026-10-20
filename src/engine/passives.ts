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
  if (/^(nonStacking|infusion|tally|flags)\./.test(p)) return true
  const m = p.match(/^(premod|total)\.(\w+)$/)
  return !!m && !!buffOf(m[2])
}

export type Value = number | string | undefined
export type Reader = (path: string[]) => Value

/** Evaluates a GO formula tree; `read` resolves the input paths it refers to. */
export function evalNode(n: GoNode, read: Reader): Value {
  const o = n.operands
  const ev = (x: GoNode) => evalNode(x, read)
  switch (n.operation) {
    case 'const':
      return n.value
    case 'read':
      return read(n.path!)
    case 'add':
      return o.reduce((s, x) => s + num(ev(x)), 0)
    case 'mul':
      return o.reduce((s, x) => s * num(ev(x)), 1)
    case 'min':
      return Math.min(...o.map((x) => num(ev(x))))
    case 'max':
      return Math.max(...o.map((x) => num(ev(x))))
    case 'sum_frac': {
      const [a, b] = o.map((x) => num(ev(x)))
      return a / (a + b)
    }
    case 'threshold':
      return num(ev(o[0])) >= num(ev(o[1])) ? ev(o[2]) : ev(o[3])
    case 'match':
      return ev(o[0]) === ev(o[1]) ? ev(o[2]) : o[3] && ev(o[3])
    case 'subscript':
      return n.list![num(ev(o[0]))]
    case 'lookup': {
      const hit = n.table![String(ev(o[0]))]
      return hit ? ev(hit) : o[1] && ev(o[1])
    }
    case 'data': // shortcut: a heal/shield formula's own extra data is ignored; GO rarely sets one
      return ev(o[0])
    case 'prio': // first non-empty string, e.g. element: infusion before physical
      for (const x of o) {
        const v = ev(x)
        if (v !== undefined && v !== '') return v
      }
      return undefined
    default:
      throw new Error(`unsupported GO operation ${n.operation}`)
  }
}

/** One team member as the formulas see it. */
export type Member = {
  /** sheets in play: character, weapon, equipped sets (and resonance, for the active character) */
  sheets: { source: string; sheet: GoSheet }[]
  /** GO input paths: "charKey", "constellation", "weapon.refinement", "conditional.HuTao.X", "artSet.X", ... */
  inputs: Record<string, Value>
  base: { hp: number; atk: number; def: number }
  /** the member's own (non-GO) contribution to a GO stat key, without the 5% CR / 50% CD / 100% ER base */
  own: (goKey: string) => number
}

const BASE_STAT: Record<string, number> = { critRate_: 0.05, critDMG_: 0.5, enerRech_: 1 }
/** paths whose value is a property of the whole team, not of one member */
const TEAM_PATH = /^(tally|nonStacking)\.|^infusion\.team$/

/**
 * One member's formula context. `shared` holds team-wide values (tally, nonStacking); `target`
 * resolves `target.*` reads, i.e. the character a team buff lands on (default: this member).
 */
function context(m: Member, shared: Record<string, Value>, target?: Reader) {
  // GO's teamBuff.* formulas reach every member, the provider included; the rest only the provider
  const byPath = new Map<string, { source: string; node: GoNode; team: boolean }[]>()
  for (const { source, sheet } of m.sheets)
    for (const [path, node] of Object.entries(sheet.nodes)) {
      const team = path.startsWith('teamBuff.')
      const p = team ? path.slice(9) : path
      byPath.set(p, [...(byPath.get(p) ?? []), { source, node, team }])
    }
  const memo = new Map<string, Value>()
  const busy = new Set<string>()
  const contrib = (path: string) => {
    let n = 0
    for (const { node } of byPath.get(path) ?? []) n += num(evalNode(node, read))
    return n
  }
  const stat = (layer: string, k: string): number => {
    if (layer === 'base') return m.base[k as keyof Member['base']] ?? 0
    if (k === 'hp' || k === 'atk' || k === 'def') {
      const b = m.base[k]
      const pre =
        b * (1 + m.own(`${k}_`) + contrib(`premod.${k}_`)) + m.own(k) + contrib(`premod.${k}`)
      return layer === 'premod' ? pre : pre + b * contrib(`total.${k}_`) + contrib(`total.${k}`)
    }
    const pre = (BASE_STAT[k] ?? 0) + m.own(k) + contrib(`premod.${k}`)
    return layer === 'premod' ? pre : pre + contrib(`total.${k}`)
  }
  const read: Reader = (path) => {
    const key = path.join('.')
    if (key in m.inputs) return m.inputs[key]
    if (key in shared) return shared[key]
    // the receiving character; on its own sheets that is the member itself
    if (path[0] === 'target' || path[0] === 'active') return (target ?? read)(path.slice(1))
    if (memo.has(key)) return memo.get(key)
    if (busy.has(key)) return undefined // GO sheets never loop; this only guards bad data
    busy.add(key)
    let v: Value
    if (['base', 'premod', 'total'].includes(path[0]) && path.length === 2)
      v = stat(path[0], path[1])
    else
      for (const { node } of byPath.get(key) ?? []) {
        const x = evalNode(node, read)
        v = typeof x === 'number' ? num(v) + x : (v ?? x) // strings (nonStacking, infusion): first one wins
      }
    busy.delete(key)
    memo.set(key, v)
    return v
  }
  /** stat contributions as buffs; `teamOnly`: just the ones this member gives the team */
  const buffs = (teamOnly: boolean) => {
    const out: Buff[] = []
    for (const [path, list] of byPath) {
      const p = path.match(/^(premod|total)\.(\w+)$/)
      const b = p && buffOf(p[2])
      if (!b) continue
      for (const { source, node, team } of list) {
        if (teamOnly && !team) continue
        const v = num(evalNode(node, read))
        // a total-layer % stat would be read as premod by ysin-ng; GO only uses flat ones there
        if (v) out.push({ key: b.key, on: b.on, value: b.sign ? -v : v, source })
      }
    }
    return out
  }
  return { read, buffs, paths: () => byPath.keys() }
}

/** A GO stat key summed over buffs, the way `Member.own` reports it. */
export function sumGo(buffs: Buff[], goKey: string) {
  const b = buffOf(goKey)
  return b
    ? buffs.reduce((s, x) => (x.key === b.key && x.on === b.on && !x.from ? s + x.value : s), 0)
    : 0
}

/**
 * Passives for the active character with its teammates: own formulas, every member's team buffs
 * (evaluated with the provider's stats) and the team-wide tallies they depend on.
 */
export function evaluateTeam(active: Member, mates: Member[] = []) {
  // team-wide values: element / region counts add up, the highest EM wins, non-stacking buffs go to the first provider
  const shared: Record<string, Value> = {}
  for (const m of [active, ...mates]) {
    const c = context(m, {})
    for (const key of c.paths()) {
      if (!TEAM_PATH.test(key) || (key === 'infusion.team' && m === active)) continue
      const v = c.read(key.split('.'))
      if (typeof v === 'number')
        shared[key] =
          key === 'tally.maxEleMas' ? Math.max(num(shared[key]), v) : num(shared[key]) + v
      else if (v !== undefined && v !== '' && shared[key] === undefined) shared[key] = v
    }
  }
  // teammates' buffs read their own stats; `target.*` is the active character as it stands without them
  // shortcut: teammates' stats ignore buffs from each other, which matters for few team buffs
  const before = context(active, shared)
  const given = mates.flatMap((m) => context(m, shared, before.read).buffs(true))
  const self = context({ ...active, own: (k) => active.own(k) + sumGo(given, k) }, shared)
  const infusion =
    self.read(['infusion', 'nonOverridableSelf']) ??
    self.read(['infusion', 'team']) ??
    self.read(['infusion', 'overridableSelf'])
  return {
    buffs: [...self.buffs(false), ...given],
    infusion: typeof infusion === 'string' && infusion !== '',
    read: self.read,
  }
}

/** Toggles a sheet's team buffs depend on (all of them for the active character's own sheets). */
export function teamConds(sheet: GoSheet) {
  const ids = new Set<string>()
  const walk = (n: GoNode) => {
    if (n.operation === 'read' && n.path![0] === 'conditional') ids.add(n.path!.slice(1).join('.'))
    n.operands.forEach(walk)
    for (const t of Object.values(n.table ?? {})) walk(t)
  }
  for (const [path, node] of Object.entries(sheet.nodes))
    if (path.startsWith('teamBuff.')) walk(node)
  return ids
}

const num = (v: Value) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0)

/** GO's key for an English name: "Amos' Bow" → "AmosBow", "Hu Tao" → "HuTao" */
export const goKey = (name: string) =>
  name
    .replace(/['’]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
