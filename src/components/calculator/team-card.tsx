import { SelectField } from '#/components/field'
import { IconLabel } from '#/components/game-icon'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import type { Build } from '#/engine/calc'
import { useT } from '#/lib/i18n'
import { useBuilds } from '#/lib/store'
import type { getRoster } from '#/server/fns'

type Roster = Awaited<ReturnType<typeof getRoster>>
type Props = {
  slug: string
  roster: Roster
  build: Build
  onBuild: (patch: Partial<Build>) => void
}

const SLOTS = [0, 1, 2]

/** Up to three teammates, each with one of their saved builds or a default build. */
export function TeamCard({ slug, roster, build, onBuild }: Props) {
  const t = useT()
  const saved = useBuilds()
  const team = build.team ?? []
  const set = (i: number, slot: { slug: string; savedId?: string } | null) => {
    const next = SLOTS.map((j) => (j === i ? slot : team[j])).filter((s) => !!s)
    onBuild({ team: next })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('team')}</CardTitle>
        <p className="text-xs text-muted-foreground">{t('teamHint')}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {SLOTS.slice(0, team.length + 1).map((i) => {
          const slot = team[i]
          const taken = new Set([slug, ...team.filter((_, j) => j !== i).map((s) => s.slug)])
          const builds = slot ? saved.filter((b) => b.slug === slot.slug) : []
          return (
            <div key={i} className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
              <SelectField
                id={`team-${i}`}
                label={`${t('teammate')} ${i + 1}`}
                value={slot?.slug ?? '_none'}
                options={[
                  { value: '_none', label: t('none') },
                  ...roster
                    .filter((c) => !taken.has(c.slug))
                    .toSorted((a, b) => a.name.localeCompare(b.name))
                    .map((c) => ({
                      value: c.slug,
                      label: <IconLabel src={c.icon} fallback={c.iconFallback} text={c.name} />,
                    })),
                ]}
                onChange={(v) => set(i, v === '_none' ? null : { slug: v })}
              />
              {slot && (
                <SelectField
                  id={`team-build-${i}`}
                  label={t('teammateBuild')}
                  value={slot.savedId ?? '_default'}
                  options={[
                    { value: '_default', label: t('defaultBuild') },
                    ...builds.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                  onChange={(v) =>
                    set(i, { slug: slot.slug, savedId: v === '_default' ? undefined : v })
                  }
                />
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
