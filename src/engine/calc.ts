import {
  buffOf,
  evalNode,
  evaluateTeam,
  teamConds,
  type GoLabel,
  type GoMove,
  type GoNode,
  type GoSheet,
  type Member,
  type Reader,
} from "./passives";
import {
  DMG_REACTIONS,
  MAIN_STAT,
  SUB_KEYS,
  LEVEL_KEYS,
  SUB_ROLL,
  TRANS,
  TRANS_BY_ELEMENT,
  levelMult,
  type MainKey,
  type SubKey,
} from "./tables";
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
  TransReaction,
  WeaponData,
} from "./types";

export type Build = {
  level: string;
  talents: [number, number, number];
  cons: number;
  weaponLevel: string;
  refine: number;
  /** two set ids; the same id twice (or a lone first id) = 4-piece */
  sets: [number | null, number | null];
  fourPc: boolean;
  mains: { sands: MainKey; goblet: MainKey; circlet: MainKey };
  rolls: Record<SubKey, number>;
  reaction: Reaction | "none";
  infusion: boolean;
  enemyLevel: number;
  enemyRes: number;
  custom: Buff[];
  /** teammates (up to 3): a saved build of theirs, or their default build */
  team?: { slug: string; savedId?: string }[];
  /** passive toggles by GO id ("HuTao.SanguineRouge") → state; unset or '' = off, as in GO */
  conds?: Record<string, string>;
  /** id of the result row the optimizer and comparison target (default: highest average damage) */
  focus?: string;
  /** exact main-stat values from an imported build; default is the 5★ +20 value */
  mainValues?: Partial<Record<ArtifactSlot, number>>;
  /** the imported pieces, for per-piece detail; `rolls` and `mains` stay the source of truth */
  pieces?: Partial<Record<ArtifactSlot, ArtifactPiece>>;
};

export type ArtifactSlot = "flower" | "plume" | "sands" | "goblet" | "circlet";

export type ArtifactPiece = {
  setId: number;
  icon: string;
  rarity: number;
  level: number;
  /** null = a main stat the calculator ignores, e.g. another element's DMG goblet */
  main: MainKey | null;
  mainValue: number;
  /** in display order */
  subs: { key: SubKey; value: number }[];
};

export type Panel = {
  base: { hp: number; atk: number; def: number };
  hp: number;
  atk: number;
  def: number;
  em: number;
  er: number;
  cr: number;
  cd: number;
  heal: number;
  shield: number;
  buffs: Buff[];
};

const sum = (buffs: Buff[], key: BuffKey, on?: string) =>
  buffs.reduce((s, b) => (b.key === key && b.on === on ? s + b.value : s), 0);

function mainBuff(
  key: MainKey,
  element: Element,
  source: string,
  value: number = MAIN_STAT[key],
): Buff {
  if (key === "dmg") return { key: "dmg", value, on: element, source };
  if (key === "physical") return { key: "dmg", value, on: "physical", source };
  return { key, value, source };
}

/** Ascension / weapon secondary stat: EM as a number, the rest as fractions. */
function specBuff(
  stat: StatKey | "dmg" | null,
  value: number,
  element: Element,
  source: string,
): Buff[] {
  if (!stat || !value) return [];
  return [{ key: stat, value, on: stat === "dmg" ? element : undefined, source }];
}

export function defaultBuild(char: CharacterData): Build {
  const main = scalingStat(char);
  return {
    level: "90",
    talents: [9, 9, 9],
    cons: 0,
    weaponLevel: "90",
    refine: 1,
    sets: [null, null],
    fourPc: true,
    mains: {
      sands: main === "em" ? "em" : (`${main}%` as MainKey),
      goblet: char.element === "physical" ? "physical" : "dmg",
      circlet: "cr",
    },
    rolls: {
      ...Object.fromEntries(SUB_KEYS.map((k) => [k, 0])),
      cr: 9,
      cd: 9,
      [main === "em" ? "em" : `${main}%`]: 4,
      er: 3,
    } as Record<SubKey, number>,
    reaction: "none",
    infusion: false,
    enemyLevel: 90,
    enemyRes: 0.1,
    custom: [],
  };
}

/** Sensible starting gear: a crit-stat 5★ weapon and a generic DPS 4-piece. */
export function defaultLoadout(
  char: CharacterData,
  weapons: WeaponData[],
  sets: ArtifactSetData[],
) {
  const weapon =
    weapons.find((w) => w.rarity === 5 && (w.mainStat === "cr" || w.mainStat === "cd")) ??
    weapons[0] ??
    null;
  const melee = char.weapon !== "bow" && char.weapon !== "catalyst";
  const set = sets.find((s) => s.goKey === (melee ? "GladiatorsFinale" : "WanderersTroupe"));
  const build = defaultBuild(char);
  build.sets = [set?.id ?? null, null];
  return { build, weapon };
}

/** Most common scaling stat across skill and burst damage rows. */
export function scalingStat(char: CharacterData): ScalingStat {
  const count: Record<ScalingStat, number> = { atk: 0, hp: 0, def: 0, em: 0 };
  const walk = (n: GoNode) => {
    const stat = n.operation === "read" && GO_STAT[n.path!.slice(1).join(".")];
    if (stat) count[stat]++;
    n.operands.forEach(walk);
  };
  for (const m of char.moves)
    if (m.kind === "damage" && (m.talent === "skill" || m.talent === "burst") && m.data["hit.base"])
      walk(m.data["hit.base"]);
  return (Object.entries(count).toSorted((a, b) => b[1] - a[1])[0][0] as ScalingStat) ?? "atk";
}
const GO_STAT: Partial<Record<string, ScalingStat>> = {
  atk: "atk",
  hp: "hp",
  def: "def",
  eleMas: "em",
};

/** Equipped sets: the same id twice (or a lone first id with `fourPc`) = 4-piece. */
function equippedSets(sets: ArtifactSetData[], build: Build) {
  const [a, b] = build.sets.map((id) => sets.find((s) => s.id === id));
  if (a && build.fourPc) return [{ set: a, pieces: 4 as const }];
  return [a, b].filter((s) => !!s).map((set) => ({ set, pieces: 2 as const }));
}

/** A toggle in play: GO id, states and labels; `value` is the state used now. */
export type Toggle = {
  id: string;
  states: string[];
  value: string;
  labels: { en?: GoLabel; zh?: GoLabel };
};
/** One sheet in play (character, weapon, set) with its toggles and the buffs it adds now. */
export type PassiveSource = { source: string; note: string; toggles: Toggle[]; buffs: Buff[] };

function baseStats(char: CharacterData, weapon: WeaponData | null, build: Build) {
  const st = char.stats[build.level] ?? char.stats["90"];
  const wAtk = weapon ? (weapon.stats[build.weaponLevel] ?? weapon.stats["90"]).atk : 0;
  return { hp: st.hp, atk: st.atk + wAtk, def: st.def };
}

/** A teammate as the engine sees it: character, weapon and build. */
export type TeamMate = { char: CharacterData; weapon: WeaponData | null; build: Build };
type Sheet = { source: string; note: string; sheet: GoSheet };

/** One character's own buffs, GO sheets and GO inputs; `conds` are the team-wide toggles. */
function memberOf(
  char: CharacterData,
  weapon: WeaponData | null,
  sets: ArtifactSetData[],
  build: Build,
  conds: Build["conds"],
  active: CharacterData,
) {
  const st = char.stats[build.level] ?? char.stats["90"];
  const buffs: Buff[] = [
    ...specBuff(char.ascensionStat, st.spec, char.ascensionElement ?? char.element, "Ascension"),
    { key: "hp", value: build.mainValues?.flower ?? MAIN_STAT.hp, source: "Flower" },
    { key: "atk", value: build.mainValues?.plume ?? MAIN_STAT.atk, source: "Feather" },
    mainBuff(build.mains.sands, char.element, "Sands", build.mainValues?.sands),
    mainBuff(build.mains.goblet, char.element, "Goblet", build.mainValues?.goblet),
    mainBuff(build.mains.circlet, char.element, "Circlet", build.mainValues?.circlet),
    ...SUB_KEYS.filter((k) => build.rolls[k]).map((k): Buff => ({
      key: k,
      value: SUB_ROLL[k] * build.rolls[k],
      source: "Substats",
    })),
    ...build.custom,
  ];
  if (weapon) {
    const ws = weapon.stats[build.weaponLevel] ?? weapon.stats["90"];
    buffs.push(
      ...specBuff(weapon.mainStat, ws.spec, weapon.mainElement ?? char.element, weapon.name),
    );
  }
  const equipped = equippedSets(sets, build);
  const sheets = [
    { source: char.name, note: "", sheet: char.passives },
    { source: weapon?.name ?? "", note: "", sheet: weapon?.passives }, // text is in the build form
    ...equipped.map((e) => ({
      source: e.set.name,
      note: e.pieces === 4 ? `${e.set.twoPc} ${e.set.fourPc}` : e.set.twoPc,
      sheet: e.set.passives,
    })),
  ].filter((s): s is Sheet => !!s.sheet);
  const talent = (t: "normal" | "skill" | "burst") => talentLevel(char, build, t) - 1;
  const plain = buffs.filter((b) => !b.from);
  const member = (list: Sheet[]): Member => ({
    sheets: list,
    inputs: {
      charKey: char.goKey,
      charEle: char.element,
      weaponType: char.weapon,
      activeCharKey: active.goKey,
      lvl: Number.parseInt(build.level),
      asc: Math.min(Math.floor(LEVEL_KEYS.indexOf(build.level) / 2), 6),
      constellation: build.cons,
      "weapon.key": weapon?.goKey,
      "weapon.refinement": build.refine,
      "total.autoIndex": talent("normal"),
      "total.skillIndex": talent("skill"),
      "total.burstIndex": talent("burst"),
      ...Object.fromEntries(equipped.map((e) => [`artSet.${e.set.goKey}`, e.pieces])),
      ...Object.fromEntries(
        Object.entries(conds ?? {}).map(([id, v]) => [`conditional.${id}`, v || undefined]),
      ),
    },
    base: baseStats(char, weapon, build),
    own: (k) => {
      const b = buffOf(k);
      return b ? sum(plain, b.key, b.on) : 0;
    },
  });
  return { buffs, sheets, member };
}

const toggle =
  (sheet: GoSheet, conds: Build["conds"]) =>
  ([id, states]: [string, string[]]): Toggle => ({
    id,
    states,
    value: conds?.[id] ?? "",
    labels: { en: sheet.labels?.en[id], zh: sheet.labels?.zh[id] },
  });

export function collectBuffs(
  char: CharacterData,
  weapon: WeaponData | null,
  sets: ArtifactSetData[],
  build: Build,
  team: TeamMate[] = [],
) {
  const own = memberOf(char, weapon, sets, build, build.conds, char);
  // resonance needs a full party; its formulas check the team size themselves
  const resonance: Sheet[] =
    char.resonance && team.length === 3
      ? [{ source: char.resonance.name, note: "", sheet: char.resonance.sheet }]
      : [];
  // teammates' sheet names are prefixed, so two members with the same weapon or set stay apart
  const mates = team.map((m) => {
    const x = memberOf(m.char, m.weapon, sets, m.build, build.conds, char);
    const sheets = x.sheets.map((s) => ({
      ...s,
      source: s.source === m.char.name ? s.source : `${m.char.name} · ${s.source}`,
    }));
    return { sheets, member: x.member(sheets) };
  });
  const go = evaluateTeam(
    own.member([...own.sheets, ...resonance]),
    mates.map((m) => m.member),
  );
  const sources = (list: Sheet[], filter?: (id: string, sheet: GoSheet) => boolean) =>
    list.map(({ source, note, sheet }): PassiveSource => ({
      source,
      note,
      toggles: Object.entries(sheet.conds)
        .filter(([id]) => !filter || filter(id, sheet))
        .map(toggle(sheet, build.conds)),
      buffs: go.buffs.filter((b) => b.source === source),
    }));
  const passives = [
    ...sources([...own.sheets, ...resonance]),
    // a teammate's toggles only matter where they drive a team buff
    ...mates.flatMap((m) => sources(m.sheets, (id, sheet) => teamConds(sheet).has(id))),
  ];
  return { buffs: [...own.buffs, ...go.buffs], passives, infusion: go.infusion, read: go.read };
}

export function buildPanel(
  char: CharacterData,
  weapon: WeaponData | null,
  buffs: Buff[],
  build: Build,
): Panel {
  const base = baseStats(char, weapon, build);
  const plain = buffs.filter((x) => !x.from);
  if (plain.length === buffs.length) return panelOf(base, buffs);
  // conversions read the panel before any conversion is applied, so they don't feed each other
  const pre = panelOf(base, plain);
  // keep `from` on converted entries so the UI can show where the value came from
  return panelOf(
    base,
    buffs.map((x) => (x.from ? { ...x, value: x.value * pre[x.from] } : x)),
  );
}

function panelOf(base: Panel["base"], buffs: Buff[]): Panel {
  return {
    base,
    hp: base.hp * (1 + sum(buffs, "hp%")) + sum(buffs, "hp"),
    atk: base.atk * (1 + sum(buffs, "atk%")) + sum(buffs, "atk"),
    def: base.def * (1 + sum(buffs, "def%")) + sum(buffs, "def"),
    em: sum(buffs, "em"),
    er: 1 + sum(buffs, "er"),
    cr: 0.05 + sum(buffs, "cr"),
    cd: 0.5 + sum(buffs, "cd"),
    heal: sum(buffs, "heal"),
    shield: sum(buffs, "shield"),
    buffs,
  };
}

/** Enemy RES multiplier. Ysin used 1/(1+3r) above 75%; the game uses 1/(1+4r). */
export function resMult(res: number) {
  if (res < 0) return 1 - res / 2;
  if (res < 0.75) return 1 - res;
  return 1 / (1 + 4 * res);
}

export function defMult(charLevel: number, enemyLevel: number, shred: number, ignore: number) {
  const c = charLevel + 100;
  return c / (c + (enemyLevel + 100) * Math.max(1 - shred, 0) * (1 - ignore));
}

export type HitResult = {
  /** GO's row id, stable across languages, e.g. "charged.frostflake" */
  id: string;
  label: string;
  /** GO sheet section (auto, skill, burst, passive1, constellation2, ...) and its name */
  talent: string;
  group: string;
  attack: AttackKey;
  element: Element;
  kind: GoMove["kind"];
  formula: string;
  reaction?: Reaction;
  /** heal / shield amount, or damage without crit */
  nonCrit: number;
  crit: number;
  avg: number;
};

const STAT_LABEL: Record<ScalingStat, string> = { atk: "ATK", hp: "HP", def: "DEF", em: "EM" };
const pct = (v: number) => `${+(v * 100).toFixed(2)}%`;
const MOVE: Record<string, AttackKey> = {
  normal: "normal",
  charged: "charged",
  plunging: "plunge",
  plunging_collision: "plunge",
  plunging_impact: "plunge",
  skill: "skill",
  burst: "burst",
};
const PANEL_STAT: Partial<Record<string, keyof Panel>> = {
  hp: "hp",
  atk: "atk",
  def: "def",
  eleMas: "em",
  enerRech_: "er",
  critRate_: "cr",
  critDMG_: "cd",
  heal_: "heal",
  shield_: "shield",
};

export function talentLevel(
  char: CharacterData,
  build: Build,
  talent: "normal" | "skill" | "burst",
) {
  if (talent === "normal") return build.talents[0];
  const lv = build.talents[talent === "skill" ? 1 : 2];
  const c = char.boost[talent];
  return lv + (c && build.cons >= c ? 3 : 0);
}

/** "128% ATK + 40% EM" for a GO base-damage formula; '' when it is not a plain sum of stat multiples */
function formulaText(n: GoNode, read: Reader): string {
  if (n.operation === "add")
    return n.operands
      .map((o) => formulaText(o, read))
      .filter(Boolean)
      .join(" + ");
  if (n.operation !== "mul") return "";
  const stat = n.operands.find((o) => o.operation === "read" && GO_STAT[o.path![1]]);
  if (!stat) return "";
  const k = n.operands.reduce((s, o) => (o === stat ? s : s * Number(evalNode(o, read) ?? 0)), 1);
  return `${pct(k)} ${STAT_LABEL[GO_STAT[stat.path![1]]!]}`;
}

/** One row per GO damage / heal / shield field, computed with Ysin's damage formula. */
export function calcRows(
  char: CharacterData,
  panel: Panel,
  build: Build,
  read: Reader,
): HitResult[] {
  const charLevel = Number.parseInt(build.level);
  const ampEntry =
    build.reaction === "none"
      ? undefined
      : DMG_REACTIONS[char.element]?.find((r) => r.reaction === build.reaction);
  // stat reads inside a row's formulas come from the (row's) panel; everything else from the build
  const reader = (p: Panel, data: GoMove["data"], hitMode?: string): Reader => {
    const self: Reader = (path) => {
      const key = path.join(".");
      if (key === "hit.hitMode") return hitMode;
      if (key in data && !key.startsWith("premod.")) return evalNode(data[key], self);
      if (path.length === 2 && path[0] === "base") return p.base[path[1] as keyof Panel["base"]];
      if (path.length === 2 && (path[0] === "total" || path[0] === "premod")) {
        const f = PANEL_STAT[path[1]];
        if (f) return p[f] as number;
        const b = buffOf(path[1]);
        if (b) return sum(p.buffs, b.key, b.on);
      }
      if (path[0] === "enemy") {
        // lunar / Stellar Glimmer DMG ignores DEF in practice (GO: 99999999 / (99999999 + …))
        if (path[1] === "transDef") return 1;
        const el = path[1]?.match(/^(\w+)_resMulti_$/)?.[1];
        if (el) return resMult(build.enemyRes - sum(p.buffs, "res", el));
      }
      return read(path); // talent levels (total.skillIndex), toggles, infusion, ...
    };
    return self;
  };
  const rows = char.moves.map((m): HitResult => {
    const common = { id: m.id, label: m.label, talent: m.talent, group: m.group, kind: m.kind };
    const base0 = reader(panel, m.data);
    if (m.kind === "heal" || m.kind === "shield") {
      const amount = Number(evalNode(m.data.value, base0) ?? 0);
      return {
        ...common,
        attack: "skill",
        element: char.element,
        formula: "",
        nonCrit: amount,
        crit: amount,
        avg: amount,
      };
    }
    // the hit's own bonuses (e.g. Ganyu A1: Frostflake CRIT Rate) apply to this row only
    const own = Object.entries(m.data).flatMap(([path, node]): Buff[] => {
      const b = path.startsWith("premod.") && buffOf(path.slice(7));
      const v = b ? Number(evalNode(node, base0) ?? 0) : 0;
      return b && v ? [{ key: b.key, on: b.on, value: b.sign ? -v : v, source: m.label }] : [];
    });
    const p = own.length ? panelOf(panel.base, [...panel.buffs, ...own]) : panel;
    if (m.kind === "special") {
      // GO's own lunar / Stellar Glimmer formula: base, bonuses, crit and RES in one, per hit mode
      const at = (mode: string) =>
        Number(evalNode(m.data.value, reader(p, m.data, mode)) ?? 0) || 0;
      return {
        ...common,
        attack: "skill",
        element: (m.element as Element | undefined) ?? char.element,
        formula: "",
        reaction: m.reaction as Reaction | undefined,
        nonCrit: at("hit"),
        crit: at("critHit"),
        avg: at("avgHit"),
      };
    }
    const r = reader(p, m.data);
    const b = p.buffs;
    const attack = MOVE[String(evalNode(m.data["hit.move"], r))] ?? "normal";
    let element = (evalNode(m.data["hit.ele"], r) as Element | undefined) ?? "physical";
    if (build.infusion && element === "physical" && attack !== "skill" && attack !== "burst")
      element = char.element;
    let base = Number(evalNode(m.data["hit.base"], r) ?? 0);
    base += sum(b, "flat") + sum(b, "flat", attack) + sum(b, "flat", element);

    let amp = 1;
    let reaction: Reaction | undefined;
    // GO marks hits that cannot trigger a reaction with an empty hit.reaction
    const canReact = !m.data["hit.reaction"] || evalNode(m.data["hit.reaction"], r) !== "";
    if (ampEntry && canReact && element === char.element) {
      reaction = ampEntry.reaction;
      const em = p.em;
      if (reaction === "aggravate" || reaction === "spread") {
        base +=
          levelMult(charLevel) *
          ampEntry.mult *
          (1 + (5 * em) / (em + 1200) + sum(b, "react", reaction));
      } else {
        amp = ampEntry.mult * (1 + (2.78 * em) / (em + 1400) + sum(b, "react", reaction));
      }
    }
    const dmg = 1 + sum(b, "dmg") + sum(b, "dmg", element) + sum(b, "dmg", attack);
    const def = defMult(
      charLevel,
      build.enemyLevel,
      sum(b, "defShred"),
      sum(b, "defIgnore") + sum(b, "defIgnore", attack),
    );
    const res = resMult(build.enemyRes - sum(b, "res", element));
    const cr = Math.min(Math.max(p.cr + sum(b, "cr", element) + sum(b, "cr", attack), 0), 1);
    const cd = cr === 0 ? 0 : p.cd + sum(b, "cd", element) + sum(b, "cd", attack);
    const nonCrit = base * dmg * def * res * amp;
    return {
      ...common,
      attack,
      element,
      formula: formulaText(m.data["hit.base"], r),
      reaction,
      nonCrit,
      crit: nonCrit * (1 + cd),
      avg: nonCrit * (1 + cr * cd),
    };
  });
  // reaction rows (Lunar-Charged, Stellar Swirl, ...) the character cannot trigger come out as 0
  return rows.filter((r) => r.talent !== "reaction" || r.avg > 0);
}

/** Transformative reactions the character can trigger: no DEF, no crit. Swirl is listed per swirled element. */
export function calcTransformative(char: CharacterData, panel: Panel, build: Build) {
  const em = panel.em;
  const lv = levelMult(Number.parseInt(build.level));
  return (TRANS_BY_ELEMENT[char.element] ?? []).flatMap((r: TransReaction) => {
    const { coef, element } = TRANS[r];
    const bonus = 1 + (16 * em) / (em + 2000) + sum(panel.buffs, "react", r);
    const hit = (el: Element) => ({
      reaction: r,
      element: el,
      damage: lv * coef * bonus * resMult(build.enemyRes - sum(panel.buffs, "res", el)),
    });
    return r === "swirl" ? SWIRLED.map(hit) : [hit(element)];
  });
}

const SWIRLED: Element[] = ["hydro", "pyro", "cryo", "electro"];

export function calculate(
  char: CharacterData,
  weapon: WeaponData | null,
  sets: ArtifactSetData[],
  build: Build,
  team: TeamMate[] = [],
) {
  const { buffs, passives, read } = collectBuffs(char, weapon, sets, build, team);
  const panel = buildPanel(char, weapon, buffs, build);
  return {
    panel,
    passives,
    rows: calcRows(char, panel, build, read),
    transformative: calcTransformative(char, panel, build),
  };
}

/** The number a build is judged by: its focus row, else its highest-average damage row. */
export function focusRow(rows: HitResult[], focus?: string) {
  return (
    rows.find((r) => r.id === focus) ??
    rows
      .filter((r) => r.kind === "damage")
      .reduce<HitResult | undefined>((best, r) => (!best || r.avg > best.avg ? r : best), undefined)
  );
}
