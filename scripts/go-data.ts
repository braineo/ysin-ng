// Exports Genshin Optimizer's passive formulas (MIT, frzyc/genshin-optimizer) as JSON.
// Runs in .github/workflows/go-data.yml against a GO checkout with GO's own dependencies installed:
//
//   git clone --depth 1 https://github.com/frzyc/genshin-optimizer.git go && (cd go && yarn install --immutable)
//   bun scripts/go-data.ts go out/passives.json
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { keepPath, type GoLabel, type GoNode, type GoSheet } from '../src/engine/passives'

const [GO, OUT] = [
  resolve(process.argv[2] ?? 'go'),
  resolve(process.argv[3] ?? 'out/passives.json'),
]

const slim = (n: GoNode): GoNode => {
  const { operation, operands, path, value, list, table } = n
  return {
    operation,
    operands: operands.map(slim),
    ...(path && { path }),
    ...(value !== undefined && { value }),
    ...(list && { list }),
    ...(table && {
      table: Object.fromEntries(Object.entries(table).map(([k, v]) => [k, slim(v)])),
    }),
  }
}

// every path a formula reads
const reads = (n: GoNode, out: Set<string>) => {
  if (n.operation === 'read') out.add(n.path!.join('.'))
  n.operands.forEach((o) => reads(o, out))
  for (const t of Object.values(n.table ?? {})) reads(t, out)
  return out
}

const helper = (p: string) => /^(teamBuff\.)?(tally|nonStacking)\./.test(p)
const isCond = (x?: GoNode) => x?.operation === 'read' && x.path![0] === 'conditional'

/** keep only what the evaluator reads; GO's ascension / weapon substat reads are genshin-db's job */
function prune(data: Record<string, unknown>): GoSheet {
  const nodes: Record<string, GoNode> = {}
  const conds: Record<string, Set<string>> = {}
  const visit = (obj: unknown, prefix: string) => {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix + k
      if ((v as GoNode)?.operation) {
        const n = v as GoNode
        const skip =
          n.operation === 'read' &&
          ['special', 'weapon.sub', 'weapon.main'].includes(n.path!.join('.'))
        if (keepPath(path) && !skip) nodes[path] = slim(n)
      } else if (
        v &&
        typeof v === 'object' &&
        ['premod', 'total', 'teamBuff', 'nonStacking', 'infusion', 'tally'].includes(k)
      )
        visit(v, `${path}.`)
    }
  }
  visit(data, '')
  // helper paths (tally, nonStacking) only matter when a stat node reads them, e.g. lunar-only ones don't
  const needed = new Set<string>()
  const queue = Object.keys(nodes).filter((p) => !helper(p))
  while (queue.length) {
    const p = queue.pop()!
    if (needed.has(p)) continue
    needed.add(p)
    for (const r of reads(nodes[p], new Set()))
      for (const q of [r, `teamBuff.${r}`]) if (nodes[q] && !needed.has(q)) queue.push(q)
  }
  for (const p of Object.keys(nodes)) if (!needed.has(p)) delete nodes[p]
  for (const n of Object.values(nodes))
    for (const r of reads(n, new Set()))
      if (r.startsWith('conditional.')) conds[r.slice(12)] ??= new Set()
  // a toggle's states are the strings it is compared against (match) or looked up by (lookup)
  const states = (n: GoNode) => {
    if (n.operation === 'match') {
      const [a, b] = n.operands
      if (isCond(a) && b.operation === 'const')
        conds[a.path!.slice(1).join('.')].add(String(b.value))
      if (isCond(b) && a.operation === 'const')
        conds[b.path!.slice(1).join('.')].add(String(a.value))
    }
    if (n.operation === 'lookup' && isCond(n.operands[0]))
      for (const k of Object.keys(n.table!)) conds[n.operands[0].path!.slice(1).join('.')].add(k)
    n.operands.forEach(states)
    for (const t of Object.values(n.table ?? {})) states(t)
  }
  Object.values(nodes).forEach(states)
  return {
    nodes,
    // a toggle without states is only compared against other toggles (e.g. "same as the absorbed element")
    conds: Object.fromEntries(
      Object.entries(conds)
        .filter(([, v]) => v.size)
        .map(([k, v]) => [k, [...v]]),
    ),
  }
}

const sheets = await import(join(GO, 'libs/gi/sheets/src/index.ts'))
const consts = await import(join(GO, 'libs/gi/consts/src/index.ts'))
// GO's own React and i18n instance, so its <Translate> label elements render exactly as on its site
const { renderToStaticMarkup } = await import(join(GO, 'node_modules/react-dom/server.js'))
const { i18n } = await import(join(GO, 'libs/gi/i18n/src/index.ts'))
const LANGS = { en: 'en', zh: 'chs' } as const
for (const lng of Object.values(LANGS))
  for (const lib of ['common/localization', 'gi/localization', 'gi/dm-localization']) {
    const dir = join(GO, 'libs', lib, 'assets/locales', lng)
    if (existsSync(dir))
      for (const f of readdirSync(dir))
        if (f.endsWith('.json'))
          i18n.addResourceBundle(
            lng,
            f.slice(0, -5),
            JSON.parse(readFileSync(join(dir, f), 'utf8')),
            true,
            true,
          )
  }
i18n.options.react = { ...i18n.options.react, useSuspense: false }

type Doc = {
  path?: unknown
  states?: Record<string, { name?: unknown }>
  name?: unknown
  value?: GoNode
}
/** every conditional field in a sheet's UI description: { path: [sheet, cond], name, states } */
function condDocs(root: unknown) {
  const out: Doc[] = []
  const seen = new Set<unknown>()
  const walk = (o: unknown) => {
    if (!o || typeof o !== 'object' || seen.has(o) || '$$typeof' in o || 'operation' in o) return
    seen.add(o)
    const d = o as Doc
    if (Array.isArray(d.path) && d.states && d.value?.operation === 'read') out.push(d)
    for (const v of Array.isArray(o) ? o : Object.values(o)) walk(v)
  }
  walk(root)
  return out
}
const text = (el: unknown): string | undefined => {
  if (el === undefined || el === null || el === false) return undefined
  if (typeof el === 'string' || typeof el === 'number') return String(el)
  const html: string = renderToStaticMarkup(el)
  const plain = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return plain || undefined
}
async function labels(sheet: unknown, conds: GoSheet['conds']) {
  const docs = condDocs(sheet).filter((d) => (d.path as string[]).join('.') in conds)
  const out: GoSheet['labels'] = { en: {}, zh: {} }
  for (const [lang, lng] of Object.entries(LANGS) as [keyof typeof LANGS, string][]) {
    await i18n.changeLanguage(lng)
    for (const d of docs) {
      const id = (d.path as string[]).join('.')
      const label: GoLabel = { name: text(d.name) }
      const states = Object.fromEntries(
        Object.entries(d.states!).flatMap(([k, v]) => {
          const t = text(v?.name)
          return t ? [[k, t]] : []
        }),
      )
      if (Object.keys(states).length) label.states = states
      out[lang][id] ??= label
    }
  }
  return out
}

async function collect(keys: string[], get: (k: string) => { data: Record<string, unknown> }) {
  const out: Record<string, GoSheet> = {}
  for (const k of keys) {
    const sheet = get(k)
    const s = prune(sheet.data)
    if (!Object.keys(s.nodes).length) continue
    if (Object.keys(s.conds).length) s.labels = await labels(sheet, s.conds)
    out[k] = s
  }
  return out
}
const sha = execFileSync('git', ['-C', GO, 'rev-parse', 'HEAD']).toString().trim()
const out = {
  source: `https://github.com/frzyc/genshin-optimizer/tree/${sha}`,
  license: readFileSync(join(GO, 'LICENSE'), 'utf8'),
  chars: await collect(consts.allCharacterKeys, (k) => sheets.getCharSheet(k, 'F')),
  weapons: await collect(consts.allWeaponKeys, (k) => sheets.getWeaponSheet(k)),
  sets: await collect(consts.allArtifactSetKeys, (k) => sheets.getArtSheet(k)),
}
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(out)}\n`)
const count = (o: object) => Object.keys(o).length
console.log(
  `chars ${count(out.chars)} weapons ${count(out.weapons)} sets ${count(out.sets)} → ${OUT}`,
)
process.exit(0) // GO's i18n setup keeps the event loop alive
