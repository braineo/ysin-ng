// Exports Genshin Optimizer's data (MIT, frzyc/genshin-optimizer) as JSON: passives.json (formulas,
// damage rows, toggles) and data.json (roster, stats, names, texts, icons, game ids).
// Runs in .github/workflows/go-data.yml against a GO checkout with GO's own dependencies installed:
//
//   git clone --depth 1 https://github.com/frzyc/genshin-optimizer.git go && (cd go && yarn install --immutable)
//   bun scripts/go-data.ts go out
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  keepPath,
  type GoLabel,
  type GoMove,
  type GoNode,
  type GoSheet,
  type GoText,
} from "../src/engine/passives";
import { LEVEL_KEYS, WEAPON_LEVEL_KEYS } from "../src/engine/tables";
import type { GoData } from "../src/server/go-types";

const [GO, OUT] = [resolve(process.argv[2] ?? "go"), resolve(process.argv[3] ?? "out")];

const slim = (n: GoNode): GoNode => {
  const { operation, operands, path, value, list, table } = n;
  return {
    operation,
    operands: operands.map(slim),
    ...(path && { path }),
    ...(value !== undefined && { value }),
    ...(list && { list }),
    ...(table && {
      table: Object.fromEntries(Object.entries(table).map(([k, v]) => [k, slim(v)])),
    }),
  };
};

// every path a formula reads
const reads = (n: GoNode, out: Set<string>) => {
  if (n.operation === "read") out.add(n.path!.join("."));
  n.operands.forEach((o) => reads(o, out));
  for (const t of Object.values(n.table ?? {})) reads(t, out);
  return out;
};

// tally (element / region counts) is read by other members' and resonance formulas, so it always stays
const helper = (p: string) => /^(teamBuff\.)?nonStacking\./.test(p);
const isCond = (x?: GoNode) => x?.operation === "read" && x.path![0] === "conditional";

/**
 * Keep only what the evaluator reads; GO's ascension / weapon substat reads are exported separately (data.json).
 * `rows` are the character's damage-row formulas, which may read helper paths and toggles too.
 */
function prune(data: Record<string, unknown>, rows: GoNode[] = []): GoSheet {
  const nodes: Record<string, GoNode> = {};
  const conds: Record<string, Set<string>> = {};
  const visit = (obj: unknown, prefix: string) => {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix + k;
      if ((v as GoNode)?.operation) {
        const n = v as GoNode;
        const skip =
          n.operation === "read" &&
          ["special", "weapon.sub", "weapon.main"].includes(n.path!.join("."));
        if (keepPath(path) && !skip) nodes[path] = slim(n);
      } else if (
        v &&
        typeof v === "object" &&
        ["premod", "total", "teamBuff", "nonStacking", "infusion", "tally", "flags"].includes(k)
      )
        visit(v, `${path}.`);
    }
  };
  visit(data, "");
  // nonStacking paths only matter when a stat node reads them, e.g. lunar-only ones don't
  const needed = new Set<string>();
  const queue = Object.keys(nodes).filter((p) => !helper(p));
  const follow = (n: GoNode) => {
    for (const r of reads(n, new Set()))
      for (const q of [r, `teamBuff.${r}`]) if (nodes[q] && !needed.has(q)) queue.push(q);
  };
  rows.forEach(follow);
  while (queue.length) {
    const p = queue.pop()!;
    if (needed.has(p)) continue;
    needed.add(p);
    follow(nodes[p]);
  }
  for (const p of Object.keys(nodes)) if (!needed.has(p)) delete nodes[p];
  for (const n of [...Object.values(nodes), ...rows])
    for (const r of reads(n, new Set()))
      if (r.startsWith("conditional.")) conds[r.slice(12)] ??= new Set();
  // a toggle's states are the strings it is compared against (match) or looked up by (lookup)
  const states = (n: GoNode) => {
    if (n.operation === "match") {
      const [a, b] = n.operands;
      if (isCond(a) && b.operation === "const")
        conds[a.path!.slice(1).join(".")].add(String(b.value));
      if (isCond(b) && a.operation === "const")
        conds[b.path!.slice(1).join(".")].add(String(a.value));
    }
    if (n.operation === "lookup" && isCond(n.operands[0]))
      for (const k of Object.keys(n.table!)) conds[n.operands[0].path!.slice(1).join(".")].add(k);
    n.operands.forEach(states);
    for (const t of Object.values(n.table ?? {})) states(t);
  };
  for (const n of [...Object.values(nodes), ...rows]) states(n);
  return {
    nodes,
    // a toggle without states is only compared against other toggles (e.g. "same as the absorbed element")
    conds: Object.fromEntries(
      Object.entries(conds)
        .filter(([, v]) => v.size)
        .map(([k, v]) => [k, [...v]]),
    ),
  };
}

const sheets = await import(join(GO, "libs/gi/sheets/src/index.ts"));
const consts = await import(join(GO, "libs/gi/consts/src/index.ts"));
// GO's own React and i18n instance, so its <Translate> label elements render exactly as on its site
const { renderToStaticMarkup } = await import(join(GO, "node_modules/react-dom/server.js"));
const { i18n } = await import(join(GO, "libs/gi/i18n/src/index.ts"));
// field names live in a registry keyed by the node's info path (see infoMut in libs/gi/wr)
const { infoManager } = await import(join(GO, "libs/gi/wr/src/index.ts"));
const { transformativeReactions } = await import(join(GO, "libs/gi/keymap/src/index.ts"));
const LANGS = { en: "en", zh: "chs" } as const;
for (const lng of Object.values(LANGS))
  for (const lib of ["common/localization", "gi/localization", "gi/dm-localization"]) {
    const dir = join(GO, "libs", lib, "assets/locales", lng);
    if (existsSync(dir))
      for (const f of readdirSync(dir))
        if (f.endsWith(".json"))
          i18n.addResourceBundle(
            lng,
            f.slice(0, -5),
            JSON.parse(readFileSync(join(dir, f), "utf8")),
            true,
            true,
          );
  }
i18n.options.react = { ...i18n.options.react, useSuspense: false };

const locale = (lng: string, ns: string) => {
  const f = join(GO, "libs/gi/dm-localization/assets/locales", lng, `${ns}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
};
// GO's game text marks up colors and emphasis (<cryo>20%</cryo>, <strong>…</strong>): keep the words
const plain = (t: unknown) => (typeof t === "string" ? t.replace(/<[^>]+>/g, "").trim() : "");
const both = (get: (lng: string) => unknown): GoText => ({
  en: plain(get("en")),
  zh: plain(get("chs")),
});

type Doc = {
  path?: unknown;
  states?: Record<string, { name?: unknown }>;
  name?: unknown;
  value?: GoNode;
  /** character sheets: the talent section the toggle sits in (passive1, constellation2, ...) */
  section?: string;
};
/** every conditional field in a sheet's UI description: { path: [sheet, cond], name, states } */
function condDocs(root: unknown) {
  const out: Doc[] = [];
  const seen = new Set<unknown>();
  const walk = (o: unknown, section?: string) => {
    if (!o || typeof o !== "object" || seen.has(o) || "$$typeof" in o || "operation" in o) return;
    seen.add(o);
    const d = o as Doc;
    if (Array.isArray(d.path) && d.states && d.value?.operation === "read")
      out.push({ ...d, section });
    for (const v of Array.isArray(o) ? o : Object.values(o)) walk(v, section);
  };
  const talents = (root as { sheet?: Record<string, unknown> }).sheet;
  if (talents) for (const [k, v] of Object.entries(talents)) walk(v, k);
  walk(root);
  return out;
}
const text = (el: unknown): string | undefined => {
  if (el === undefined || el === null || el === false) return undefined;
  if (typeof el === "string" || typeof el === "number") return String(el);
  const html: string = renderToStaticMarkup(el);
  const words = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return words || undefined;
};
/** GO falls back to English where its Chinese translation is missing; so do we, unless a game name fits */
const untranslated = (zh?: string, en?: string) => !zh || (zh === en && /[A-Za-z]{3}/.test(zh));

async function labels(
  sheet: unknown,
  conds: GoSheet["conds"],
  sectionName: (s?: string) => GoText,
) {
  const docs = condDocs(sheet).filter((d) => (d.path as string[]).join(".") in conds);
  const out: GoSheet["labels"] = { en: {}, zh: {} };
  for (const [lang, lng] of Object.entries(LANGS) as [keyof typeof LANGS, string][]) {
    await i18n.changeLanguage(lng);
    for (const d of docs) {
      const id = (d.path as string[]).join(".");
      const label: GoLabel = { name: text(d.name) };
      const states = Object.fromEntries(
        Object.entries(d.states!).flatMap(([k, v]) => {
          const t = text(v?.name);
          return t ? [[k, t]] : [];
        }),
      );
      if (Object.keys(states).length) label.states = states;
      out[lang][id] ??= label;
    }
  }
  // no Chinese label in GO: name the toggle after its talent / weapon passive / set, from game text
  for (const d of docs) {
    const id = (d.path as string[]).join(".");
    const zh = out.zh[id];
    if (zh && untranslated(zh.name, out.en[id]?.name))
      zh.name = sectionName(d.section).zh ?? zh.name;
  }
  return out;
}

type Field = {
  node?: GoNode & {
    data?: object;
    info?: { path?: string; variant?: string; subVariant?: string };
  };
  text?: unknown;
};
type CharSheet = {
  data: { display: Record<string, unknown> };
  sheet: Record<
    string,
    { sections?: { fields?: Field[]; states?: Record<string, { fields?: Field[] }> }[] }
  >;
};

function moveKind(n: NonNullable<Field["node"]>): GoMove["kind"] | null {
  if (n.operation === "data" && n.operands[0]?.path?.join(".") === "hit.dmg") return "damage";
  const r = reads(n, new Set());
  // GO's specialReactionDmgNode (lunar / Stellar Glimmer) picks its crit by hit mode; lunar-tagged
  // fields without one are stat displays (e.g. a base DMG bonus), not damage
  if (r.has("hit.hitMode")) return "special";
  // GO's customHealNode / customShieldNode: heals add total.healInc, shields scale by total.shield_
  return r.has("total.healInc") ? "heal" : r.has("total.shield_") ? "shield" : null;
}
/** a special row's formula and its own data (per-hit bonuses), like a damage row's */
const special = (n: GoNode & { data?: object }) =>
  n.operation === "data"
    ? { value: slim(n.operands[0]), ...flatten(n.data ?? {}) }
    : { value: slim(n) };
const specialInfo = (variant: string, sub?: string) => ({
  reaction: variant,
  element: sub ?? transformativeReactions[variant]?.resist,
});
const flatten = (o: object, prefix = ""): Record<string, GoNode> =>
  Object.fromEntries(
    Object.entries(o).flatMap(([k, v]) =>
      (v as GoNode)?.operation
        ? [[prefix + k, slim(v as GoNode)]]
        : v && typeof v === "object"
          ? Object.entries(flatten(v, `${prefix}${k}.`))
          : [],
    ),
  );

/** the damage / heal / shield fields of a character sheet, with their (unrendered) names */
function moveFields(cs: CharSheet) {
  const where = new Map<object, string>();
  const index = (o: Record<string, unknown>, p: string) => {
    for (const [k, v] of Object.entries(o ?? {}))
      if ((v as GoNode)?.operation) where.set(v as object, p + k);
      else if (v && typeof v === "object") index(v as Record<string, unknown>, `${p}${k}.`);
  };
  index(cs.data.display, "");
  const out: { move: GoMove; label: unknown; suffix?: string; reaction?: string }[] = [];
  const seen = new Set<string>();
  for (const [talent, t] of Object.entries(cs.sheet))
    for (const s of t?.sections ?? [])
      for (const f of [
        ...(s.fields ?? []),
        ...Object.values(s.states ?? {}).flatMap((st) => st?.fields ?? []),
      ]) {
        const n = f?.node;
        const id = n && where.get(n);
        if (!n || !id || seen.has(id) || /^(basic|reaction)\./.test(id)) continue;
        const kind = moveKind(n);
        if (!kind) continue;
        seen.add(id);
        const data =
          kind === "damage"
            ? flatten(n.data ?? {})
            : kind === "special"
              ? special(n)
              : { value: slim(n) };
        const info = n.info?.path ? infoManager[n.info.path] : undefined;
        const extra =
          kind === "special" ? specialInfo(n.info?.variant ?? "", n.info?.subVariant) : {};
        out.push({
          move: { id, talent, kind, name: {}, data, ...extra },
          label: info?.name ?? f.text,
          suffix: info?.textSuffix,
        });
      }
  // reactions the character triggers that deal lunar / Stellar Glimmer DMG; GO gates them by element
  for (const [k, n] of Object.entries(cs.data.display.reaction ?? {}) as [
    string,
    NonNullable<Field["node"]>,
  ][]) {
    const variant = k.replace(/_vortex\d$/, "");
    if (!/^(lunar|stellar)/.test(variant)) continue;
    const sub = (n.info?.subVariant ?? (n.operands?.[2] as Field["node"])?.info?.subVariant) as
      | string
      | undefined;
    const vortex = k.match(/_vortex(\d)$/)?.[1];
    out.push({
      move: {
        id: `reaction.${k}`,
        talent: "reaction",
        kind: "special",
        name: {},
        data: { value: slim(n) },
        ...specialInfo(variant, sub),
      },
      label: undefined,
      suffix: vortex && `(${vortex})`,
      reaction: variant,
    });
  }
  return out;
}

/** reaction names: GO's game text has the Stellar Glimmer ones, not the lunar ones */
const LUNAR_NAMES: Record<string, GoText> = {
  lunarcharged: { en: "Lunar-Charged", zh: "月感电" },
  lunarbloom: { en: "Lunar-Bloom", zh: "月绽放" },
  lunarcrystallize: { en: "Lunar-Crystallize", zh: "月结晶" },
};
const reactionName = (v: string): GoText =>
  LUNAR_NAMES[v] ?? both((l) => locale(l, "sheet_gen").reaction?.[v]);

/** talent names from GO's datamined text (char_<key>_gen.json) */
function talentNames(key: string) {
  const out: Record<string, GoText> = {};
  for (const [lang, lng] of Object.entries(LANGS) as [keyof GoText, string][]) {
    const f = join(GO, "libs/gi/dm-localization/assets/locales", lng, `char_${key}_gen.json`);
    if (!existsSync(f)) continue;
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(f, "utf8"))))
      if ((v as { name?: string })?.name) (out[k] ??= {})[lang] = (v as { name: string }).name;
  }
  return out;
}

async function collect(
  keys: string[],
  get: (k: string) => { data: Record<string, unknown> },
  kind: "char" | "weapon" | "set",
) {
  const out: Record<string, GoSheet> = {};
  for (const k of keys) {
    const sheet = get(k);
    const moves = kind === "char" ? moveFields(sheet as unknown as CharSheet) : [];
    const s = prune(
      sheet.data,
      moves.flatMap((m) => Object.values(m.move.data)),
    );
    if (!Object.keys(s.nodes).length && !moves.length) continue;
    const talents = kind === "char" ? talentNames(k) : {};
    const sectionName = (section?: string): GoText =>
      kind === "char"
        ? (talents[section ?? ""] ?? {})
        : kind === "weapon"
          ? both((l) => locale(l, `weapon_${k}_gen`).passiveName)
          : both((l) => locale(l, `artifact_${k}_gen`).setName);
    if (Object.keys(s.conds).length) s.labels = await labels(sheet, s.conds, sectionName);
    if (moves.length) {
      for (const [lang, lng] of Object.entries(LANGS) as [keyof GoText, string][]) {
        await i18n.changeLanguage(lng);
        for (const m of moves) {
          const name = m.reaction ? reactionName(m.reaction)[lang] : text(m.label);
          m.move.name[lang] = name && m.suffix ? `${name} ${m.suffix}` : name;
        }
      }
      for (const { move } of moves) {
        const section = talents[move.talent] ?? {};
        move.name.en ??= section.en;
        if (untranslated(move.name.zh, move.name.en)) move.name.zh = section.zh ?? move.name.zh;
      }
      s.moves = moves.map((m) => m.move);
      s.talents = talents;
    }
    out[k] = s;
  }
  return out;
}
/** elemental resonance: team buffs of a full party, toggles labelled from GO's resonance sheets */
async function resonance() {
  const s = prune(sheets.resonanceData);
  s.labels = await labels(sheets.resonanceSheets, s.conds, () => ({}));
  return s;
}

const sha = execFileSync("git", ["-C", GO, "rev-parse", "HEAD"]).toString().trim();
const out = {
  source: `https://github.com/frzyc/genshin-optimizer/tree/${sha}`,
  license: readFileSync(join(GO, "LICENSE"), "utf8"),
  chars: await collect(consts.allCharacterKeys, (k) => sheets.getCharSheet(k, "F"), "char"),
  weapons: await collect(consts.allWeaponKeys, (k) => sheets.getWeaponSheet(k), "weapon"),
  sets: await collect(consts.allArtifactSetKeys, (k) => sheets.getArtSheet(k), "set"),
  resonance: await resonance(),
};
// --- data.json --------------------------------------------------------------------------------
const { allStats } = await import(join(GO, "libs/gi/stats/src/index.ts"));
const { artifactIdMap } = await import(join(GO, "libs/gi/dm/src/mapping/artifact.ts"));
const json = (...p: string[]) => JSON.parse(readFileSync(join(GO, ...p), "utf8"));
const ASSETS = json("libs/gi/assets-data/src/AssetsData_gen.json");
const DM = "libs/gi/dm/src/dm";
const paragraphs = (o: unknown) =>
  Object.values((o as Record<string, string>) ?? {})
    .map(plain)
    .join("\n");
/** game id → GO key maps, inverted (the first id wins, e.g. both traveler ids) */
const idOf = (file: string) => {
  const ids: Record<string, number> = {};
  for (const [id, key] of Object.entries(json(DM, file)))
    if (typeof key === "string" && key) ids[key] ??= Number(id);
  return ids;
};
/** level key → [level, ascension phase]: "80" is before ascending at 80, "80+" after */
const levelAsc = (k: string): [number, number] => {
  const lv = Number.parseInt(k);
  const caps = [20, 40, 50, 60, 70, 80];
  const asc = caps.filter((c) => c < lv || (c === lv && k.endsWith("+"))).length;
  return [lv, asc];
};
const curve = (c: Record<string, number[]>, name: string, lv: number) => c[name]?.[lv] ?? 0;
const boostOf = (n?: GoNode) =>
  n?.operation === "threshold" ? Number(n.operands[1]?.value ?? 0) : 0;
const AUTO_ICON: Record<string, string> = {
  sword: "Skill_A_01",
  bow: "Skill_A_02",
  polearm: "Skill_A_03",
  claymore: "Skill_A_04",
  catalyst: "Skill_A_Catalyst_MD",
};

const charIds = idOf("character/AvatarExcelConfigData_idmap_gen.json");
const charNames = { en: locale("en", "charNames_gen"), zh: locale("chs", "charNames_gen") };
const data: GoData = {
  source: out.source,
  license: out.license,
  assets: `https://cdn.jsdelivr.net/gh/frzyc/genshin-optimizer@${sha}/libs/gi/assets/src/gen`,
  chars: {},
  weapons: {},
  sets: {},
};
for (const k of consts.allCharacterKeys as string[]) {
  const c = allStats.char.data[k];
  if (!c || k.startsWith("Traveler") || !charIds[k]) continue;
  const spec = Object.keys(c.ascensionBonus).find((s) => !["hp", "atk", "def"].includes(s)) ?? null;
  const stats: GoData["chars"][string]["stats"] = {};
  for (const key of LEVEL_KEYS) {
    const [lv, asc] = levelAsc(key);
    const v = (s: string) => {
      const lc = c.lvlCurves.find((x: { key: string }) => x.key === s);
      return (
        (lc ? lc.base * curve(allStats.char.expCurve, lc.curve, lv) : 0) +
        (c.ascensionBonus[s]?.[asc] ?? 0)
      );
    };
    stats[key] = {
      hp: v("hp"),
      atk: v("atk"),
      def: v("def"),
      spec: spec ? c.ascensionBonus[spec][asc] : 0,
    };
  }
  const premod =
    (sheets.getCharSheet(k, "F").data as { premod?: Record<string, GoNode> }).premod ?? {};
  const icons = ASSETS.chars[k] ?? {};
  data.chars[k] = {
    id: charIds[k],
    name: { en: charNames.en[k] ?? k, zh: charNames.zh[k] ?? charNames.en[k] ?? k },
    rarity: c.rarity,
    element: c.ele,
    weapon: c.weaponType,
    spec,
    stats,
    boost: { skill: boostOf(premod.skillBoost), burst: boostOf(premod.burstBoost) },
    icons: {
      icon: icons.icon ?? "",
      auto: AUTO_ICON[c.weaponType] ?? "",
      skill: icons.skill ?? "",
      burst: icons.burst ?? "",
    },
  };
}
const weaponIds = idOf("weapon/WeaponExcelConfigData_idmap_gen.json");
const weaponNames = { en: locale("en", "weaponNames_gen"), zh: locale("chs", "weaponNames_gen") };
for (const k of consts.allWeaponKeys as string[]) {
  const w = allStats.weapon.data[k];
  if (!w || !weaponIds[k]) continue;
  const stats: GoData["weapons"][string]["stats"] = {};
  for (const key of WEAPON_LEVEL_KEYS) {
    const [lv, asc] = levelAsc(key);
    const atk = w.mainStat.base * curve(allStats.weapon.expCurve, w.mainStat.curve, lv);
    stats[key] = {
      atk: atk + (w.ascensionBonus.atk?.[asc] ?? 0),
      spec: w.subStat ? w.subStat.base * curve(allStats.weapon.expCurve, w.subStat.curve, lv) : 0,
    };
  }
  const wt = { en: locale("en", `weapon_${k}_gen`), zh: locale("chs", `weapon_${k}_gen`) };
  const refinements = (t: { passiveDescription?: Record<string, unknown> }) =>
    [0, 1, 2, 3, 4].map((r) => paragraphs(t.passiveDescription?.[r]));
  data.weapons[k] = {
    id: weaponIds[k],
    name: { en: weaponNames.en[k] ?? k, zh: weaponNames.zh[k] ?? weaponNames.en[k] ?? k },
    rarity: w.rarity,
    type: w.weaponType,
    spec: w.subStat?.type ?? null,
    stats,
    passiveName: { en: plain(wt.en.passiveName), zh: plain(wt.zh.passiveName) },
    passive: { en: refinements(wt.en), zh: refinements(wt.zh) },
    icon: ASSETS.weapons[k]?.icon ?? "",
  };
}
for (const [id, k] of Object.entries(artifactIdMap as Record<string, string>)) {
  const a = allStats.art.data[k];
  if (!a || data.sets[k]) continue;
  const t = (lng: string) => locale(lng, `artifact_${k}_gen`);
  data.sets[k] = {
    id: Number(id),
    name: both((l) => t(l).setName),
    rarity: Math.max(...a.rarities),
    twoPc: both((l) => t(l).setEffects?.["2"]),
    fourPc: both((l) => t(l).setEffects?.["4"]),
    icon: ASSETS.artifacts[k]?.flower ?? "",
  };
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "passives.json"), `${JSON.stringify(out)}\n`);
writeFileSync(join(OUT, "data.json"), `${JSON.stringify(data)}\n`);
const count = (o: object) => Object.keys(o).length;
console.log(
  `passives: chars ${count(out.chars)} weapons ${count(out.weapons)} sets ${count(out.sets)}; ` +
    `data: chars ${count(data.chars)} weapons ${count(data.weapons)} sets ${count(data.sets)} → ${OUT}`,
);
process.exit(0); // GO's i18n setup keeps the event loop alive
