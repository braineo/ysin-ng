// Downloads the pinned Genshin Optimizer export (written by .github/workflows/go-data.yml to the
// go-data branch). To update, set PIN to a newer go-data commit.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PIN: string = "aeeed911c4e899134215705e2119d1a3c3ccc474"; // a go-data commit
const FILES = {
  "passives.json": "../src/engine/passives.gen.json",
  "data.json": "../src/server/data.gen.json",
};

if (!PIN) throw new Error("scripts/pull-data.ts: no go-data commit pinned yet");
for (const [name, path] of Object.entries(FILES)) {
  const out = join(import.meta.dir, path);
  if (existsSync(out) && JSON.parse(readFileSync(out, "utf8")).pin === PIN) continue;
  const url = `https://cdn.jsdelivr.net/gh/braineo/ysin-ng@${PIN}/${name}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  writeFileSync(out, `${JSON.stringify({ pin: PIN, ...(await res.json()) })}\n`);
  console.log(`go-data ${PIN.slice(0, 7)} → ${out}`);
}
