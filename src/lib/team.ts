// Teammates for the engine: their character data from the server, their build from this browser's
// saved builds (or a default one).
import { useEffect, useState } from "react";
import { defaultBuild, defaultLoadout, type Build, type TeamMate } from "#/engine/calc";
import type { Lang } from "#/lib/assets";
import { getBuilds, useBuilds } from "#/lib/store";
import { getCalculatorData } from "#/server/fns";

type CalculatorData = Awaited<ReturnType<typeof getCalculatorData>>;
const cache = new Map<string, Promise<CalculatorData>>();

export function loadCharacter(slug: string, lang: Lang) {
  const key = `${slug}|${lang}`;
  if (!cache.has(key)) cache.set(key, getCalculatorData({ data: { slug, lang } }));
  return cache.get(key)!;
}

export async function loadTeam(
  team: Build["team"],
  lang: Lang,
  saved = getBuilds(),
): Promise<TeamMate[]> {
  const mates = await Promise.all(
    (team ?? []).map(async ({ slug, savedId }): Promise<TeamMate | null> => {
      const d = await loadCharacter(slug, lang);
      if (!d) return null;
      const s = savedId ? saved.find((b) => b.id === savedId) : undefined;
      if (!s) return { char: d.char, ...defaultLoadout(d.char, d.weapons, d.sets) };
      return {
        char: d.char,
        weapon: d.weapons.find((w) => w.id === s.weaponId) ?? null,
        // a teammate's own team is not part of this one
        build: { ...defaultBuild(d.char), ...s.build, team: undefined },
      };
    }),
  );
  return mates.filter((m) => m !== null);
}

const NONE: TeamMate[] = [];

/** The build's teammates, re-resolved when the team or the saved builds change. */
export function useTeam(team: Build["team"], lang: Lang) {
  const builds = useBuilds();
  const [mates, setMates] = useState(NONE);
  const key = JSON.stringify(team ?? []);
  useEffect(() => {
    let live = true;
    void loadTeam(JSON.parse(key), lang, builds).then((m) => live && setMates(m));
    return () => {
      live = false;
    };
  }, [key, lang, builds]);
  return team?.length ? mates : NONE;
}
