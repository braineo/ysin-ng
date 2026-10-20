import { useSyncExternalStore } from "react";
import type { Build } from "#/engine/calc";

/** Local-only persistence (no cloud backup yet). Reads never throw: blocked storage = empty data. */
const PREFIX = "ysin-ng:";
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function read<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFIX + key);
  } catch {
    return fallback;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T; // stable reference for useSyncExternalStore
  let value = fallback;
  try {
    if (raw) value = JSON.parse(raw) as T;
  } catch {
    // corrupt entry: treat as empty rather than crash the page
  }
  cache.set(key, { raw, value });
  return value;
}

export function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.error("Could not save to local storage", e);
    return false;
  }
  for (const l of listeners) l();
  return true;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key?.startsWith(PREFIX) && cb(); // other tabs
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Server render and first client render see `fallback`; stored data appears right after hydration. */
export function useStored<T>(key: string, fallback: T): T {
  return useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );
}

// ---- saved builds ----

export type GamePanel = {
  hp: number;
  atk: number;
  def: number;
  em: number;
  cr: number;
  cd: number;
  er: number;
  dmg: number;
};

export type SavedBuild = {
  id: string;
  name: string;
  slug: string;
  weaponId: number | null;
  build: Build;
  createdAt: number;
  updatedAt: number;
  /** set when imported from a UID; re-importing the same UID + character updates this build */
  source?: { uid: string; nickname: string };
  /** the in-game stat panel at import time, to compare with the calculator's panel */
  game?: GamePanel;
  /** display-only snapshot taken at save time, so lists don't need game data */
  summary?: {
    weapon: string;
    weaponIcon: string;
    sets: string;
    focusLabel: string;
    focusValue: number;
  };
};

const BUILDS = "builds.v1";
const EMPTY: SavedBuild[] = [];

export const useBuilds = () => useStored<SavedBuild[]>(BUILDS, EMPTY);
export const getBuilds = () => read<SavedBuild[]>(BUILDS, EMPTY);

export function saveBuild(b: Omit<SavedBuild, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
  const all = getBuilds();
  const now = Date.now();
  const existing = b.id ? all.find((x) => x.id === b.id) : undefined;
  const saved: SavedBuild = {
    ...b,
    id: existing?.id ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  write(BUILDS, existing ? all.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...all]);
  return saved;
}

export const deleteBuild = (id: string) =>
  write(
    BUILDS,
    getBuilds().filter((b) => b.id !== id),
  );
export const renameBuild = (id: string, name: string) =>
  write(
    BUILDS,
    getBuilds().map((b) => (b.id === id ? { ...b, name, updatedAt: Date.now() } : b)),
  );

/** Merge builds from an exported file; same id = replace. Returns how many were imported. */
export function importBuilds(data: unknown) {
  if (!Array.isArray(data)) throw new Error("not a list of builds");
  const valid = data.filter(
    (b): b is SavedBuild =>
      !!b &&
      typeof b === "object" &&
      typeof b.id === "string" &&
      typeof b.slug === "string" &&
      typeof b.build === "object" &&
      b.build !== null,
  );
  const byId = new Map(getBuilds().map((b) => [b.id, b]));
  for (const b of valid) byId.set(b.id, { ...b, name: String(b.name ?? b.slug) });
  write(
    BUILDS,
    [...byId.values()].toSorted((a, b) => b.updatedAt - a.updatedAt),
  );
  return valid.length;
}

// ---- per-character working draft, so a reload keeps the current calculator state ----

export type Draft = {
  build: Build;
  weaponId: number | null;
  name: string;
  savedId?: string;
  game?: GamePanel;
};
export const readDraft = (slug: string) => read<Draft | null>(`draft.${slug}`, null);
export const writeDraft = (slug: string, d: Draft) => write(`draft.${slug}`, d);
export const clearDraft = (slug: string) => {
  try {
    localStorage.removeItem(`${PREFIX}draft.${slug}`);
  } catch {
    // nothing to clear
  }
};

// ---- recently imported UIDs ----

export type RecentUid = { uid: string; nickname: string; at: number };
const UIDS = "uids.v1";
const NO_UIDS: RecentUid[] = [];
export const useRecentUids = () => useStored<RecentUid[]>(UIDS, NO_UIDS);
export function rememberUid(r: RecentUid) {
  write(UIDS, [r, ...read<RecentUid[]>(UIDS, NO_UIDS).filter((x) => x.uid !== r.uid)].slice(0, 8));
}
export const forgetUid = (uid: string) =>
  write(
    UIDS,
    read<RecentUid[]>(UIDS, NO_UIDS).filter((x) => x.uid !== uid),
  );
