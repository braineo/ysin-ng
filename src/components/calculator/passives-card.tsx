import { isPercent } from "#/components/buff-editor";
import { SelectField } from "#/components/field";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import type { Build, PassiveSource, Toggle } from "#/engine/calc";
import { ELEMENTS } from "#/engine/tables";
import type { Buff, Element } from "#/engine/types";
import { useLang, useT } from "#/lib/i18n";
import { pct, useFmt } from "./results";

/** fallback when GO has no label: "HuTao.SanguineRouge" → "Sanguine Rouge" */
const humanize = (id: string) =>
  id
    .slice(id.indexOf(".") + 1)
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());

type Props = {
  passives: PassiveSource[];
  build: Build;
  onBuild: (patch: Partial<Build>) => void;
};

export function PassivesCard({ passives, build, onBuild }: Props) {
  const t = useT();
  const lang = useLang();
  const fmt = useFmt();
  // GO's per-element pickers (VV, Kazuha, …) have no label of their own: name the element
  const label = (c: Toggle) =>
    c.labels[lang]?.name ??
    c.labels.en?.name ??
    (c.states.length === 1 && ELEMENTS.includes(c.states[0] as Element)
      ? t(c.states[0] as Element)
      : humanize(c.id));
  const stateLabel = (c: Toggle, s: string) =>
    c.labels[lang]?.states?.[s] ?? c.labels.en?.states?.[s] ?? s;
  const setCond = (id: string, value: string) =>
    onBuild({ conds: { ...build.conds, [id]: value } });
  const buffText = (b: Buff) =>
    `${t(`buff.${b.key}`)}${b.on ? ` · ${t(b.on)}` : ""} +${isPercent(b) ? pct(b.value) : fmt.format(b.value)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("passives")}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("passivesHint")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {passives.map((p) => (
          <section key={p.source} className="space-y-2">
            <h3 className="text-sm font-medium">{p.source}</h3>
            {p.note && <p className="text-xs leading-relaxed text-muted-foreground">{p.note}</p>}
            {p.toggles.length > 0 && (
              <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                {p.toggles.map((c) =>
                  c.states.length === 1 ? (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={c.value !== ""}
                        onChange={(e) => setCond(c.id, e.target.checked ? c.states[0] : "")}
                        className="size-4 accent-primary"
                      />
                      {label(c)}
                    </label>
                  ) : (
                    <SelectField
                      key={c.id}
                      id={`cond-${c.id}`}
                      label={label(c)}
                      value={c.value || "_off"}
                      options={[
                        { value: "_off", label: t("off") },
                        ...c.states.map((s) => ({ value: s, label: stateLabel(c, s) })),
                      ]}
                      onChange={(v) => setCond(c.id, v === "_off" ? "" : v)}
                    />
                  ),
                )}
              </div>
            )}
            <p className="text-xs">
              {p.buffs.length ? p.buffs.map(buffText).join(" · ") : t("noPassiveBuffs")}
            </p>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
