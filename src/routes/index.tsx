import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ELEMENT_BG, GameIcon } from "#/components/game-icon";
import { Input } from "#/components/ui/input";
import { ELEMENTS } from "#/engine/tables";
import type { Element } from "#/engine/types";
import { useT } from "#/lib/i18n";
import { cn } from "#/lib/utils";
import { getRoster } from "#/server/fns";

export const Route = createFileRoute("/")({
  loaderDeps: ({ search }) => ({ lang: search.lang ?? ("en" as const) }),
  loader: ({ deps }) => getRoster({ data: { lang: deps.lang } }),
  component: Roster,
});

function Roster() {
  const roster = Route.useLoaderData();
  const t = useT();
  const [q, setQ] = useState("");
  const [element, setElement] = useState<Element | null>(null);

  const list = roster
    .filter((c) => !element || c.element === element)
    .filter((c) => !q || `${c.name} ${c.slug}`.toLowerCase().includes(q.trim().toLowerCase()))
    .toSorted((a, b) => b.id - a.id || b.rarity - a.rarity);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 font-display text-2xl font-bold">{t("characters")}</h1>
        <Input
          id="roster-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          className="w-full max-w-xs"
        />
        <fieldset className="flex flex-wrap gap-1">
          <legend className="sr-only">Element</legend>
          {ELEMENTS.filter((e) => e !== "physical").map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={element === e}
              onClick={() => setElement(element === e ? null : e)}
              className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
            >
              <span className={cn("size-2 rounded-full", ELEMENT_BG[e])} />
              {t(e)}
            </button>
          ))}
        </fieldset>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {list.length} / {roster.length}
        </span>
      </div>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3">
        {list.map((c) => (
          <li key={c.slug}>
            <Link
              to="/c/$slug"
              params={{ slug: c.slug }}
              className="group block overflow-hidden rounded-lg border bg-card text-center transition hover:-translate-y-0.5 hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div
                className={cn(
                  "relative aspect-square",
                  c.rarity === 5
                    ? "bg-gradient-to-b from-star5/50 to-star5/10"
                    : "bg-gradient-to-b from-star4/40 to-star4/10",
                )}
              >
                <GameIcon src={c.icon} fallback={c.iconFallback} alt="" className="size-full" />
                <span
                  className={cn(
                    "absolute right-1.5 top-1.5 size-2.5 rounded-full ring-2 ring-card",
                    ELEMENT_BG[c.element],
                  )}
                />
              </div>
              <div className="truncate px-1.5 py-1.5 text-sm font-medium">{c.name}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
