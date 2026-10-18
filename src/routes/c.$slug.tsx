import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BuffEditor } from '#/components/buff-editor'
import { Field, SelectField, numOptions, type Option } from '#/components/field'
import { ELEMENT_BG, ELEMENT_TEXT, GameIcon } from '#/components/game-icon'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { calculate, defaultBuild, talentLevel, type Build } from '#/engine/calc'
import { FOUR_PC } from '#/engine/sets'
import {
  CIRCLET,
  DMG_REACTIONS,
  GOBLET,
  SANDS,
  SUB_KEYS,
  type MainKey,
  type SubKey,
} from '#/engine/tables'
import type { CharacterData, WeaponData } from '#/engine/types'
import { useLang, useT } from '#/lib/i18n'
import { cn } from '#/lib/utils'
import { getCalculatorData } from '#/server/fns'

export const Route = createFileRoute('/c/$slug')({
  loaderDeps: ({ search }) => ({ lang: search.lang ?? ('en' as const) }),
  loader: async ({ params, deps }) => {
    const data = await getCalculatorData({ data: { slug: params.slug, lang: deps.lang } })
    if (!data) throw notFound()
    return data
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.char.name ?? ''} · Ysin NG` }] }),
  // remount per character so build state doesn't leak between characters
  component: () => <Calculator key={Route.useLoaderData().char.slug} />,
  notFoundComponent: () => <NotFound />,
})

function NotFound() {
  const t = useT()
  return (
    <p className="py-16 text-center text-muted-foreground">
      {t('notFound')} · <Link to="/">{t('back')}</Link>
    </p>
  )
}

/** Sensible starting gear: a crit-stat 5★ weapon and a generic DPS 4-piece. */
function defaults(char: CharacterData, weapons: WeaponData[], sets: { id: number; key: string }[]) {
  const weapon =
    weapons.find((w) => w.rarity === 5 && (w.mainStat === 'cr' || w.mainStat === 'cd')) ??
    weapons[0]
  const melee = char.weapon !== 'bow' && char.weapon !== 'catalyst'
  const set = sets.find((s) => s.key === (melee ? "Gladiator's Finale" : "Wanderer's Troupe"))
  const build = defaultBuild(char)
  build.sets = [set?.id ?? null, null]
  return { weaponId: weapon?.id ?? null, build }
}

function Calculator() {
  const { char, weapons, sets } = Route.useLoaderData()
  const t = useT()
  const lang = useLang()
  const init = useMemo(() => defaults(char, weapons, sets), [char, weapons, sets])
  const [build, setBuild] = useState<Build>(init.build)
  const [weaponId, setWeaponId] = useState(init.weaponId)
  const weapon = weapons.find((w) => w.id === weaponId) ?? null
  const result = useMemo(() => calculate(char, weapon, sets, build), [char, weapon, sets, build])
  const patch = (p: Partial<Build>) => setBuild((b) => ({ ...b, ...p }))

  const fmt = new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en', { maximumFractionDigits: 0 })
  const setOptions: Option[] = [
    { value: 'none', label: t('none') },
    ...sets.map((s) => ({
      value: String(s.id),
      label: <IconLabel src={s.icon} fallback={s.iconFallback} text={s.name} />,
    })),
  ]
  const mainOptions = (keys: MainKey[]): Option[] =>
    keys.map((k) => ({
      value: k,
      label:
        k === 'dmg'
          ? `${t(char.element)} ${t('main.dmg')}`
          : t(k === 'physical' ? 'main.physical' : `buff.${k}`),
    }))
  const reactions = DMG_REACTIONS[char.element] ?? []
  const p = result.panel
  const dmgBonus = (el: string) =>
    p.buffs.reduce((s, b) => (b.key === 'dmg' && (!b.on || b.on === el) ? s + b.value : s), 0)
  const fourPcSet = build.fourPc ? sets.find((s) => s.id === build.sets[0]) : undefined

  return (
    <div className="space-y-5">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t('back')}
      </Link>

      <section className="flex flex-wrap items-center gap-4">
        <div
          className={cn(
            'size-20 overflow-hidden rounded-xl',
            char.rarity === 5 ? 'bg-star5/30' : 'bg-star4/30',
          )}
        >
          <GameIcon
            src={char.icon}
            fallback={char.iconFallback}
            alt={char.name}
            className="size-full"
          />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold">{char.name}</h1>
          <p className="text-sm text-muted-foreground">{char.title}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="gap-1.5">
              <span className={cn('size-2 rounded-full', ELEMENT_BG[char.element])} />
              {t(char.element)}
            </Badge>
            <Badge variant="secondary">{t(char.weapon)}</Badge>
            <Badge variant="secondary" className={char.rarity === 5 ? 'text-star5' : 'text-star4'}>
              {'★'.repeat(char.rarity)}
            </Badge>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* Build */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{t('build')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  id="level"
                  label={t('level')}
                  value={build.level}
                  onChange={(level) => patch({ level })}
                  options={Object.keys(char.stats).map((l) => ({ value: l, label: `Lv. ${l}` }))}
                />
                <SelectField
                  id="cons"
                  label={t('constellation')}
                  value={String(build.cons)}
                  onChange={(v) => patch({ cons: Number(v) })}
                  options={numOptions(0, 6, 'C')}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {char.talents.map((tal, i) => {
                  const eff = talentLevel(char, build, tal.key)
                  const lv = build.talents[i]
                  return (
                    <SelectField
                      key={tal.key}
                      id={`talent-${tal.key}`}
                      label={
                        <span className="flex items-center gap-1 truncate" title={tal.name}>
                          <GameIcon
                            src={tal.icon}
                            alt=""
                            className="size-4 rounded-full bg-foreground/80"
                          />
                          {t(tal.key)}
                          {eff > lv && <span className="text-primary">+3</span>}
                        </span>
                      }
                      value={String(lv)}
                      onChange={(v) => {
                        const talents = [...build.talents] as Build['talents']
                        talents[i] = Number(v)
                        patch({ talents })
                      }}
                      options={numOptions(1, 10)}
                    />
                  )
                })}
              </div>

              <div className="grid grid-cols-[1fr_auto_auto] gap-3">
                <SelectField
                  id="weapon"
                  label={t('weapon')}
                  value={String(weaponId ?? '')}
                  onChange={(v) => setWeaponId(Number(v))}
                  options={weapons.map((w) => ({
                    value: String(w.id),
                    label: (
                      <IconLabel
                        src={w.icon}
                        fallback={w.iconFallback}
                        text={w.name}
                        stars={w.rarity}
                      />
                    ),
                  }))}
                />
                <SelectField
                  id="weapon-level"
                  label={t('level')}
                  value={build.weaponLevel}
                  onChange={(weaponLevel) => patch({ weaponLevel })}
                  options={Object.keys(weapon?.stats ?? { 90: 0 }).map((l) => ({
                    value: l,
                    label: l,
                  }))}
                />
                <SelectField
                  id="refine"
                  label={t('refinement')}
                  value={String(build.refine)}
                  onChange={(v) => patch({ refine: Number(v) })}
                  options={numOptions(1, 5, 'R')}
                />
              </div>
              {weapon?.passive[build.refine - 1] && (
                <p className="rounded-md bg-muted p-2.5 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">{weapon.passiveName}</span> ·{' '}
                  {weapon.passive[build.refine - 1]}
                </p>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{t('artifacts')}</h3>
                  <fieldset className="flex rounded-md border p-0.5 text-xs">
                    <legend className="sr-only">{t('artifacts')}</legend>
                    {[true, false].map((four) => (
                      <button
                        key={String(four)}
                        type="button"
                        aria-pressed={build.fourPc === four}
                        onClick={() => patch({ fourPc: four })}
                        className="rounded px-2 py-1 aria-pressed:bg-secondary aria-pressed:font-semibold"
                      >
                        {four ? t('fourPiece') : t('twoTwo')}
                      </button>
                    ))}
                  </fieldset>
                </div>
                <div className={cn('grid gap-3', build.fourPc ? 'grid-cols-1' : 'grid-cols-2')}>
                  {(build.fourPc ? [0] : [0, 1]).map((i) => (
                    <SelectField
                      key={i}
                      id={`set-${i}`}
                      label={build.fourPc ? t('fourPiece') : `2pc #${i + 1}`}
                      value={String(build.sets[i] ?? 'none')}
                      onChange={(v) => {
                        const next = [...build.sets] as Build['sets']
                        next[i] = v === 'none' ? null : Number(v)
                        patch({ sets: next })
                      }}
                      options={setOptions}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
                  {(
                    [
                      ['sands', SANDS],
                      ['goblet', GOBLET],
                      ['circlet', CIRCLET],
                    ] as const
                  ).map(([slot, keys]) => (
                    <SelectField
                      key={slot}
                      id={`main-${slot}`}
                      label={t(slot)}
                      value={build.mains[slot]}
                      onChange={(v) => patch({ mains: { ...build.mains, [slot]: v as MainKey } })}
                      options={mainOptions(keys)}
                    />
                  ))}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t('substats')} · {SUB_KEYS.reduce((s, k) => s + build.rolls[k], 0)} —{' '}
                    {t('rollHint')}
                  </p>
                  <div className="mt-2 grid grid-cols-5 gap-2 max-sm:grid-cols-3">
                    {SUB_KEYS.map((k: SubKey) => (
                      <Field key={k} id={`roll-${k}`} label={t(`buff.${k}`)}>
                        <Input
                          id={`roll-${k}`}
                          type="number"
                          min={0}
                          max={40}
                          value={build.rolls[k]}
                          onChange={(e) =>
                            patch({
                              rolls: {
                                ...build.rolls,
                                [k]: Math.max(0, Number(e.target.value) || 0),
                              },
                            })
                          }
                          className="tabular-nums"
                        />
                      </Field>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
                <SelectField
                  id="reaction"
                  label={t('reaction')}
                  value={build.reaction}
                  onChange={(v) => patch({ reaction: v as Build['reaction'] })}
                  options={[
                    { value: 'none', label: t('none') },
                    ...reactions.map((r) => ({
                      value: r.reaction,
                      label: `${t(r.reaction)} ×${r.mult}`,
                    })),
                  ]}
                />
                <Field id="enemy-level" label={t('enemyLevel')}>
                  <Input
                    id="enemy-level"
                    type="number"
                    min={1}
                    max={200}
                    value={build.enemyLevel}
                    onChange={(e) => patch({ enemyLevel: Number(e.target.value) || 1 })}
                  />
                </Field>
                <Field id="enemy-res" label={t('enemyRes')}>
                  <Input
                    id="enemy-res"
                    type="number"
                    step={5}
                    value={Math.round(build.enemyRes * 100)}
                    onChange={(e) => patch({ enemyRes: (Number(e.target.value) || 0) / 100 })}
                  />
                </Field>
              </div>
              {char.weapon !== 'catalyst' && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    id="infusion"
                    type="checkbox"
                    checked={build.infusion}
                    onChange={(e) => patch({ infusion: e.target.checked })}
                    className="size-4 accent-primary"
                  />
                  {t('infusion')}
                </label>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('customBuffs')}</CardTitle>
              <p className="text-xs text-muted-foreground">{t('customHint')}</p>
            </CardHeader>
            <CardContent>
              <BuffEditor buffs={build.custom} onChange={(custom) => patch({ custom })} />
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{t('stats')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                {[
                  [t('hp'), fmt.format(p.hp)],
                  [t('atk'), fmt.format(p.atk)],
                  [t('def'), fmt.format(p.def)],
                  [t('em'), fmt.format(p.em)],
                  [t('cr'), pct(p.cr)],
                  [t('cd'), pct(p.cd)],
                  [t('er'), pct(p.er)],
                  [`${t(char.element)} ${t('dmgBonus')}`, pct(dmgBonus(char.element))],
                  [t('healBonus'), pct(p.heal)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 border-b border-dashed pb-1">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('damage')}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('talents')}</TableHead>
                    <TableHead>{t('formula')}</TableHead>
                    <TableHead className="text-right">{t('nonCrit')}</TableHead>
                    <TableHead className="text-right">{t('crit')}</TableHead>
                    <TableHead className="text-right">{t('average')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {char.talents.map((tal) => {
                    const rows = result.rows.filter((r) => r.talent === tal.name)
                    if (!rows.length) return null
                    return [
                      <TableRow key={tal.key} className="bg-muted/50 hover:bg-muted/50">
                        <TableCell colSpan={5} className="font-semibold">
                          {tal.name}{' '}
                          <span className="font-normal text-muted-foreground">
                            · Lv. {talentLevel(char, build, tal.key)}
                          </span>
                        </TableCell>
                      </TableRow>,
                      ...rows.map((r, i) => (
                        <TableRow key={`${tal.key}-${i}`}>
                          <TableCell className="whitespace-normal">
                            <span className={ELEMENT_TEXT[r.element]}>●</span> {r.label}
                            {r.reaction && (
                              <Badge variant="outline" className="ml-1.5">
                                {t(r.reaction)}
                              </Badge>
                            )}
                            {r.kind !== 'damage' && (
                              <Badge variant="outline" className="ml-1.5">
                                {t(r.kind === 'lunar' ? 'lunarNote' : r.kind)}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.formula}
                          </TableCell>
                          {r.kind === 'damage' ? (
                            <>
                              <TableCell className="text-right tabular-nums">
                                {fmt.format(r.nonCrit)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {fmt.format(r.crit)}
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                {fmt.format(r.avg)}
                              </TableCell>
                            </>
                          ) : (
                            <TableCell
                              colSpan={3}
                              className="text-right font-semibold tabular-nums"
                            >
                              {r.kind === 'lunar' ? '—' : fmt.format(r.avg)}
                            </TableCell>
                          )}
                        </TableRow>
                      )),
                    ]
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            {result.transformative.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('transformative')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-1.5 text-sm">
                    {result.transformative.map((r) => (
                      <div key={r.reaction} className="flex justify-between">
                        <dt className="text-muted-foreground">{t(r.reaction)}</dt>
                        <dd className="font-medium tabular-nums">{fmt.format(r.damage)}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle>{t('appliedSets')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {result.effects.map((e) => (
                  <p key={`${e.name}${e.pieces}`}>
                    <span className="font-medium">
                      {e.name} {e.pieces}pc
                    </span>{' '}
                    <span className="text-muted-foreground">
                      ·{' '}
                      {e.pieces === 2
                        ? e.note
                        : !e.note
                          ? t('fourPcMissing')
                          : lang === 'en'
                            ? e.note
                            : t('fourPcApplied')}
                    </span>
                  </p>
                ))}
                {fourPcSet?.fourPc && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {fourPcSet.fourPc}
                    {!FOUR_PC[fourPcSet.key] && ` — ${t('fourPcMissing')}`}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="space-y-3 pt-6 text-sm">
              <TextList title={t('passives')} items={char.passives} />
              <TextList
                title={t('constellations')}
                items={char.constellations.map((c, i) => ({ ...c, name: `C${i + 1} · ${c.name}` }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`

function IconLabel({
  src,
  fallback,
  text,
  stars,
}: {
  src: string
  fallback?: string
  text: string
  stars?: number
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <GameIcon src={src} fallback={fallback} alt="" className="size-5 shrink-0" />
      <span className="truncate">{text}</span>
      {stars && (
        <span
          className={cn(
            'text-xs',
            stars === 5 ? 'text-star5' : stars === 4 ? 'text-star4' : 'text-muted-foreground',
          )}
        >
          {stars}★
        </span>
      )}
    </span>
  )
}

function TextList({ title, items }: { title: string; items: { name: string; text: string }[] }) {
  return (
    <details className="group">
      <summary className="cursor-pointer font-semibold">{title}</summary>
      <dl className="mt-2 space-y-2">
        {items.map((it) => (
          <div key={it.name}>
            <dt className="font-medium">{it.name}</dt>
            <dd className="whitespace-pre-line text-muted-foreground">{it.text}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
