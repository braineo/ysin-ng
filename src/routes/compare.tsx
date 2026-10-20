import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { STAT_ROWS, isPctStat, panelStats, pct, useFmt } from '#/components/calculator/results'
import { ELEMENT_TEXT, GameIcon } from '#/components/game-icon'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { calculate, defaultBuild, focusRow } from '#/engine/calc'
import { useT } from '#/lib/i18n'
import { getBuilds } from '#/lib/store'
import { cn } from '#/lib/utils'
import { getCalculatorData } from '#/server/fns'

export const Route = createFileRoute('/compare')({
  validateSearch: (s: Record<string, unknown>): { ids?: string } =>
    typeof s.ids === 'string' ? { ids: s.ids } : {},
  // saved builds live in this browser's storage, so this page renders client-side only
  ssr: false,
  loaderDeps: ({ search }) => ({ ids: search.ids ?? '', lang: search.lang ?? ('en' as const) }),
  loader: async ({ deps }) => {
    const ids = deps.ids.split(',').filter(Boolean)
    const all = getBuilds()
    const builds = ids.map((id) => all.find((b) => b.id === id)).filter((b) => b !== undefined)
    const slugs = [...new Set(builds.map((b) => b.slug))]
    const data = await Promise.all(
      slugs.map((slug) => getCalculatorData({ data: { slug, lang: deps.lang } })),
    )
    const bySlug = new Map(slugs.map((s, i) => [s, data[i]]))
    const entries = builds.flatMap((saved) => {
      const d = bySlug.get(saved.slug)
      if (!d) return []
      const build = { ...defaultBuild(d.char), ...saved.build }
      const weapon = d.weapons.find((w) => w.id === saved.weaponId) ?? null
      const names = build.sets.map((id) => d.sets.find((x) => x.id === id)?.name).filter(Boolean)
      const sets = build.fourPc ? `${names[0] ?? ''} 4pc` : names.map((n) => `${n} 2pc`).join(' + ')
      return [
        {
          saved,
          char: d.char,
          weapon,
          sets,
          result: calculate(d.char, weapon, d.sets, build),
          build,
        },
      ]
    })
    return { entries, missing: ids.length - entries.length }
  },
  head: () => ({ meta: [{ title: 'Compare · Ysin NG' }] }),
  component: Compare,
})

function Diff({ value, base, pctStat }: { value: number; base: number; pctStat?: boolean }) {
  if (!base && !value) return null
  // percentage stats compare in points, everything else relative
  const d = pctStat ? (value - base) * 100 : base ? (value / base - 1) * 100 : 0
  if (Math.abs(d) < 0.05) return null
  return (
    <span className={cn('ml-1.5 text-xs tabular-nums', d > 0 ? 'text-anemo' : 'text-destructive')}>
      {d > 0 ? '+' : ''}
      {d.toFixed(1)}
      {pctStat ? 'pt' : '%'}
    </span>
  )
}

function Compare() {
  const { entries, missing } = Route.useLoaderData()
  const t = useT()
  const fmt = useFmt()
  const [baseIdx, setBaseIdx] = useState(0)

  if (entries.length === 0)
    return (
      <p className="py-16 text-center text-muted-foreground">
        {t('compareEmpty')}{' '}
        <Link to="/builds" className="text-primary underline">
          {t('myBuilds')}
        </Link>
      </p>
    )

  const base = entries[Math.min(baseIdx, entries.length - 1)]
  const sameChar = entries.every((e) => e.char.slug === entries[0].char.slug)
  const stats = entries.map((e) => panelStats(e.result.panel, e.char.element))
  const baseStats = stats[entries.indexOf(base)]
  const focus = entries.map((e) => focusRow(e.result.rows, e.build.focus))
  const baseFocus = focus[entries.indexOf(base)]
  const label = (k: string, el: string) =>
    k === 'dmg' ? `${t(el)} ${t('dmgBonus')}` : k === 'heal' ? t('healBonus') : t(k)
  const show = (k: string, v: number) => (isPctStat(k) ? pct(v) : fmt.format(v))
  const cols = `minmax(9rem,1fr) repeat(${entries.length}, minmax(9rem,1fr))`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="font-display text-2xl font-bold">{t('compare')}</h1>
        <Link to="/builds" className="text-sm text-muted-foreground hover:text-foreground">
          {t('myBuilds')}
        </Link>
      </div>
      {missing > 0 && <p className="text-sm text-destructive">{t('missingBuild')}</p>}
      {!sameChar && <p className="text-sm text-muted-foreground">{t('differentChars')}</p>}

      <div className="overflow-x-auto">
        <div className="grid gap-3" style={{ gridTemplateColumns: cols }}>
          <div />
          {entries.map((e, i) => (
            <Card
              key={e.saved.id}
              className={cn('gap-2 py-4', e === base && 'border-primary ring-1 ring-primary')}
            >
              <CardContent className="space-y-1.5 px-4 text-sm">
                <div className="flex items-center gap-2">
                  <GameIcon
                    src={e.char.icon}
                    fallback={e.char.iconFallback}
                    alt=""
                    className="size-9 rounded-full bg-muted"
                  />
                  <div className="min-w-0">
                    <Link
                      to="/c/$slug"
                      params={{ slug: e.char.slug }}
                      search={(s) => ({ ...s, build: e.saved.id })}
                      className="block truncate font-semibold hover:text-primary"
                    >
                      {e.saved.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {e.char.name} · C{e.build.cons}
                    </p>
                  </div>
                </div>
                {e.weapon && (
                  <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <GameIcon
                      src={e.weapon.icon}
                      fallback={e.weapon.iconFallback}
                      alt=""
                      className="size-4"
                    />
                    {e.weapon.name} R{e.build.refine}
                  </p>
                )}
                {e.sets && <p className="truncate text-xs text-muted-foreground">{e.sets}</p>}
                {e === base ? (
                  <Badge>{t('baseline')}</Badge>
                ) : (
                  <Button size="sm" variant="outline" className="h-7" onClick={() => setBaseIdx(i)}>
                    {t('setBaseline')}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('targetDamage')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="grid items-end gap-3" style={{ gridTemplateColumns: cols }}>
            <div />
            {entries.map((e, i) => (
              <div key={e.saved.id}>
                <p className="truncate text-xs text-muted-foreground">{focus[i]?.label}</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {fmt.format(focus[i]?.avg ?? 0)}
                  <Diff value={focus[i]?.avg ?? 0} base={baseFocus?.avg ?? 0} />
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('stats')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableBody>
              {STAT_ROWS.map((k) => (
                <TableRow key={k}>
                  <TableCell className="text-muted-foreground">
                    {label(k, entries[0].char.element)}
                  </TableCell>
                  {entries.map((e, i) => (
                    <TableCell key={e.saved.id} className="text-right tabular-nums">
                      {show(k, stats[i][k])}
                      <Diff value={stats[i][k]} base={baseStats[k]} pctStat={isPctStat(k)} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {sameChar && (
        <Card>
          <CardHeader>
            <CardTitle>{t('damage')}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('talents')}</TableHead>
                  {entries.map((e) => (
                    <TableHead key={e.saved.id} className="text-right">
                      {e.saved.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {base.result.rows
                  .filter((r) => r.kind !== 'lunar')
                  .map((r) => {
                    const baseVal = r.avg
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-normal">
                          <span className={ELEMENT_TEXT[r.element]}>●</span> {r.label}
                          <span className="ml-1 text-xs text-muted-foreground">{r.group}</span>
                        </TableCell>
                        {entries.map((e) => {
                          const v = e.result.rows.find((x) => x.id === r.id)?.avg ?? 0
                          return (
                            <TableCell key={e.saved.id} className="text-right tabular-nums">
                              {fmt.format(v)}
                              <Diff value={v} base={baseVal} />
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
