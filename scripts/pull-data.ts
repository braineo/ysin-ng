// Downloads the pinned Genshin Optimizer export (written by .github/workflows/go-data.yml to the
// go-data branch) to src/engine/passives.gen.json. To update, set PIN to a newer go-data commit.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PIN: string = '0995fa62ab6c570cab0bcc8f1a9f32ae51c2a8f2' // a go-data commit
const OUT = join(import.meta.dir, '../src/engine/passives.gen.json')

if (!PIN) throw new Error('scripts/pull-data.ts: no go-data commit pinned yet')
if (!existsSync(OUT) || JSON.parse(readFileSync(OUT, 'utf8')).pin !== PIN) {
  const url = `https://cdn.jsdelivr.net/gh/braineo/ysin-ng@${PIN}/passives.json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`)
  writeFileSync(OUT, `${JSON.stringify({ pin: PIN, ...(await res.json()) })}\n`)
  console.log(`go-data ${PIN.slice(0, 7)} → ${OUT}`)
}
