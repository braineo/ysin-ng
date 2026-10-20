import { expect, test } from "bun:test";
import { calculate } from "#/engine/calc";
import fixture from "./__fixtures__/enka-profile.json";
import { levelKey, toBuild } from "./enka.server";
import { artifactSets, character, slugById, weapons } from "./data.server";
import { LEVEL_KEYS, SUB_ROLL } from "#/engine/tables";

// Real showcase data (enka.network's documented sample UID), trimmed to two characters.
const sets = artifactSets("en");
const setIds = new Set(sets.map((s) => s.id));

test.each([
  // [avatarId, stats known to differ because they come from text-only passives]
  [10000037, []], // Ganyu
  [10000025, ["dmg"]], // Xingqiu: A4 passive adds +20% Hydro DMG on the in-game panel
] as const)("imported panel matches the in-game panel (%i)", (id, skip) => {
  const avatar = fixture.avatarInfoList.find((a) => a.avatarId === id)!;
  const char = character(`${slugById("").get(id)}|en`)!;
  const order = (fixture.skillOrder as Record<string, number[]>)[id];
  const { build, weaponId, game } = toBuild(avatar, char, order, setIds);
  const weapon = weapons(`${char.weapon}|en`).find((w) => w.id === weaponId) ?? null;
  const p = calculate(char, weapon, sets, build).panel;
  const dmg = p.buffs
    .filter((b) => b.key === "dmg" && (!b.on || b.on === char.element))
    .reduce((s, b) => s + b.value, 0);
  const ours = { hp: p.hp, atk: p.atk, def: p.def, em: p.em, cr: p.cr, cd: p.cd, er: p.er, dmg };
  for (const k of Object.keys(game) as (keyof typeof game)[]) {
    if ((skip as readonly string[]).includes(k)) continue;
    expect(Math.abs(ours[k] - game[k])).toBeLessThanOrEqual(Math.max(game[k] * 0.005, 0.5)); // EM substats are shown rounded in-game
  }
});

test("level keys follow the ascension phase", () => {
  expect(levelKey(LEVEL_KEYS, 80, 5)).toBe("80");
  expect(levelKey(LEVEL_KEYS, 80, 6)).toBe("80+");
  expect(levelKey(LEVEL_KEYS, 90, 6)).toBe("90");
  expect(levelKey(LEVEL_KEYS, 85, 6)).toBe("80+");
});

test("pieces keep their substats and add up to the build rolls", () => {
  const avatar = fixture.avatarInfoList.find((a) => a.avatarId === 10000037)!;
  const char = character(`${slugById("").get(10000037)}|en`)!;
  const { build } = toBuild(avatar, char, undefined, setIds);
  const flower = build.pieces!.flower!;
  expect(flower.level).toBe(20);
  expect(flower.main).toBe("hp");
  expect(flower.subs.map((s) => s.key)).toEqual(["cd", "em", "cr", "er"]);
  expect(flower.subs[0].value).toBeCloseTo(0.187, 6);
  expect(Object.keys(build.pieces!)).toHaveLength(5);
  const cd = Object.values(build.pieces!).flatMap((p) => p.subs.filter((s) => s.key === "cd"));
  expect(cd.reduce((n, s) => n + s.value / SUB_ROLL.cd, 0)).toBeCloseTo(build.rolls.cd, 1);
});
