import type { AttackKey, Element, ScalingStat, TalentRow, Term, WeaponType } from './types'

const STAT_TEXT: Record<string, ScalingStat | undefined> = {
  '': undefined,
  each: undefined,
  'per paw': undefined,
  atk: 'atk',
  'max hp': 'hp',
  def: 'def',
  'elemental mastery': 'em',
  // Freminet-style "x% Cryo + y% Physical": both ATK-scaled
  cryo: 'atk',
  physical: 'atk',
}

/** Split on `sep` outside (), {}. */
function splitTop(s: string, sep: string) {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(' || ch === '{') depth++
    if (ch === ')' || ch === '}') depth--
    if (ch === sep && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

const TERM = /^\s*\{param(\d+):([A-Z0-9]+)\}\s*(.*?)\s*(?:[×*]\s*(\d+))?\s*$/

/**
 * Parse the value half of a genshin-db talent label ("{param1:F1P}+{param2:F1P} DEF") into
 * variants of terms. Returns null when the value isn't a plain stat-scaled amount
 * (durations, "/Stack" units, "Current HP", ...).
 */
export function parseValue(value: string, params: Record<string, number[]>) {
  const variants: { terms: Term[]; count: number }[] = []
  const unlabeled = new Set<Term>()
  for (const raw of splitTop(value, '/')) {
    let seg = raw.trim()
    let count = 1
    const group = seg.match(/^\((.*)\)\s*[×*]\s*(\d+)$/)
    if (group) {
      seg = group[1]
      count = Number(group[2])
    }
    const terms: Term[] = []
    for (const part of splitTop(seg, '+')) {
      const m = part.match(TERM)
      if (!m) return null
      const [, idx, fmt, text, n] = m
      const values = params[`param${idx}`]
      if (!values) return null
      const key = text.toLowerCase()
      if (!(key in STAT_TEXT)) return null
      const percent = fmt.endsWith('P')
      const term: Term = {
        stat: percent ? (STAT_TEXT[key] ?? 'atk') : undefined,
        values,
        count: n ? Number(n) : 1,
      }
      if (percent && !STAT_TEXT[key]) unlabeled.add(term)
      terms.push(term)
    }
    variants.push({ terms, count })
  }
  // "{F1P}/{F1P} Max HP": unlabeled terms take the last explicit stat in the row
  const explicit = variants
    .flatMap((v) => v.terms)
    .findLast((t) => t.stat && !unlabeled.has(t))?.stat
  if (explicit) for (const t of unlabeled) t.stat = explicit
  return variants
}

export function rowKind(name: string): TalentRow['kind'] | null {
  if (/lunar/i.test(name)) return 'lunar'
  if (/absorption/i.test(name)) return 'shield'
  if (/cost|bonus|increase|reduction/i.test(name)) return null
  if (/healing|regeneration|restored|heal/i.test(name)) return 'heal'
  // normal-attack rows are often just "Charged Attack" / "Aimed Shot" with no "DMG" suffix
  if (
    /dmg|charged attack|aimed shot|charge level/i.test(name) &&
    !/conversion|ratio|interval/i.test(name)
  )
    return 'damage'
  return null
}

/** Bow charged shots with their own names: Ganyu, Yelan, Tighnari, Lyney, Sethos. */
const CHARGED_ARROW =
  /frostflake|breakthrough barb|wreath arrow|clusterbloom arrow|prop arrow|pyrotechnic strike|shadowpiercing/i

export function attackKey(talent: 'normal' | 'skill' | 'burst', name: string): AttackKey {
  if (talent !== 'normal') return talent
  if (/plunge/i.test(name)) return 'plunge'
  if (
    /charged|aimed|charge level|kesagiri|saichimonji|star jade/i.test(name) ||
    CHARGED_ARROW.test(name)
  )
    return 'charged'
  return 'normal'
}

export function hitElement(
  attack: AttackKey,
  name: string,
  element: Element,
  weapon: WeaponType,
): Element {
  if (attack === 'skill' || attack === 'burst' || weapon === 'catalyst') return element
  if (
    weapon === 'bow' &&
    (/fully-charged|charge level|kindling arrow|riptide/i.test(name) || CHARGED_ARROW.test(name))
  )
    return element
  return 'physical'
}

/**
 * Build damage / heal / shield rows for one talent. Structure comes from the English labels;
 * `localLabels` (same order) supplies the display text.
 */
export function parseTalent(
  talent: 'normal' | 'skill' | 'burst',
  enLabels: string[],
  localLabels: string[],
  params: Record<string, number[]>,
  element: Element,
  weapon: WeaponType,
): TalentRow[] {
  const rows: TalentRow[] = []
  enLabels.forEach((label, i) => {
    const [name, value = ''] = label.split('|')
    const kind = rowKind(name)
    if (!kind) return
    const variants = parseValue(value, params)
    if (!variants) return
    const attack = attackKey(talent, name)
    rows.push({
      label: (localLabels[i] ?? label).split('|')[0],
      attack,
      kind,
      element: hitElement(attack, name, element, weapon),
      variants,
    })
  })
  return rows
}
