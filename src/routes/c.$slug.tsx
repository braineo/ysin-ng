import { Link, createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { BuildForm } from '#/components/calculator/build-form'
import { OptimizerCard } from '#/components/calculator/optimizer-card'
import { PiecesCard, RatingCard } from '#/components/calculator/rating-card'
import { Results } from '#/components/calculator/results'
import { SaveBar } from '#/components/calculator/save-bar'
import { ELEMENT_BG, GameIcon } from '#/components/game-icon'
import { Badge } from '#/components/ui/badge'
import { calculate, defaultLoadout, focusRow, type Build } from '#/engine/calc'
import { rate } from '#/engine/rating'
import type { ArtifactSetData, CharacterData, WeaponData } from '#/engine/types'
import { useLang, useT } from '#/lib/i18n'
import {
  clearDraft,
  getBuilds,
  readDraft,
  saveBuild,
  useBuilds,
  writeDraft,
  type Draft,
  type SavedBuild,
} from '#/lib/store'
import { useTeam } from '#/lib/team'
import { cn } from '#/lib/utils'
import { getCalculatorData, getRoster } from '#/server/fns'

export const Route = createFileRoute('/c/$slug')({
  validateSearch: (s: Record<string, unknown>): { build?: string } =>
    typeof s.build === 'string' ? { build: s.build } : {},
  loaderDeps: ({ search }) => ({ lang: search.lang ?? ('en' as const) }),
  loader: async ({ params, deps }) => {
    const [data, roster] = await Promise.all([
      getCalculatorData({ data: { slug: params.slug, lang: deps.lang } }),
      getRoster({ data: { lang: deps.lang } }),
    ])
    if (!data) throw notFound()
    return { ...data, roster }
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

function defaults(
  char: CharacterData,
  weapons: WeaponData[],
  sets: ArtifactSetData[],
  name: string,
): Draft {
  const { build, weapon } = defaultLoadout(char, weapons, sets)
  return { build, weaponId: weapon?.id ?? null, name }
}

function Calculator() {
  const { char, weapons, sets, roster } = Route.useLoaderData()
  const lang = useLang()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const t = useT()
  const defaultName = t('buildOf', { name: char.name })
  const init = useMemo(
    () => defaults(char, weapons, sets, defaultName),
    [char, weapons, sets, defaultName],
  )
  const [state, setState] = useState<Draft>(init)
  const [loaded, setLoaded] = useState(false)
  const builds = useBuilds()

  // older saves may miss newer Build fields: fill them from the defaults
  const fromSaved = (b: SavedBuild): Draft => ({
    build: { ...init.build, ...b.build },
    weaponId: b.weaponId,
    name: b.name,
    savedId: b.id,
    game: b.game,
  })

  // local storage is client-only: restore after hydration (an explicit ?build= wins over the draft)
  useEffect(() => {
    const saved = search.build ? getBuilds().find((b) => b.id === search.build) : undefined
    if (saved) {
      setState(fromSaved(saved))
      void navigate({ to: '.', search: (s) => ({ ...s, build: undefined }), replace: true })
    } else {
      const draft = readDraft(char.slug)
      if (draft) setState({ ...init, ...draft, build: { ...init.build, ...draft.build } })
    }
    setLoaded(true)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- run once per character mount
  }, [])

  useEffect(() => {
    if (loaded) writeDraft(char.slug, state)
  }, [char.slug, loaded, state])

  // the saved build being edited was deleted (here or in another tab): keep editing as a new build
  useEffect(() => {
    if (loaded && state.savedId && !builds.some((b) => b.id === state.savedId))
      setState((s) => ({ ...s, savedId: undefined }))
  }, [builds, loaded, state.savedId])

  const { build } = state
  const weapon = weapons.find((w) => w.id === state.weaponId) ?? null
  const team = useTeam(build.team, lang)
  const result = useMemo(
    () => calculate(char, weapon, sets, build, team),
    [char, weapon, sets, build, team],
  )
  const rating = useMemo(
    () => rate(char, weapon, sets, build, team),
    [char, weapon, sets, build, team],
  )
  const patch = (p: Partial<Build>) => setState((s) => ({ ...s, build: { ...s.build, ...p } }))

  function save(asNew: boolean) {
    const focus = focusRow(result.rows, build.focus)
    const existing = asNew ? undefined : builds.find((b) => b.id === state.savedId)
    const setNames = build.sets.map((id) => sets.find((s) => s.id === id)?.name).filter(Boolean)
    const saved = saveBuild({
      id: existing?.id,
      name: state.name.trim() || init.name,
      slug: char.slug,
      weaponId: state.weaponId,
      build,
      source: existing?.source,
      // the in-game panel describes the imported gear only, not a new variant of it
      game: asNew ? undefined : state.game,
      summary: {
        weapon: weapon ? `${weapon.name} R${build.refine}` : '',
        weaponIcon: weapon?.icon ?? '',
        sets: build.fourPc
          ? `${setNames[0] ?? ''} 4pc`
          : setNames.map((n) => `${n} 2pc`).join(' + '),
        focusLabel: focus?.label ?? '',
        focusValue: focus?.avg ?? 0,
      },
    })
    setState((s) => ({ ...s, savedId: saved.id, game: saved.game }))
  }

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

      <SaveBar
        slug={char.slug}
        savedId={state.savedId}
        name={state.name}
        onName={(name) => setState((s) => ({ ...s, name }))}
        onSave={save}
        onLoad={(b) => setState(fromSaved(b))}
        onReset={() => {
          clearDraft(char.slug)
          setState(init)
        }}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="space-y-5">
          <BuildForm
            char={char}
            weapons={weapons}
            sets={sets}
            build={build}
            weapon={weapon}
            passives={result.passives}
            roster={roster}
            onBuild={patch}
            onWeapon={(weaponId) => setState((s) => ({ ...s, weaponId }))}
          />
          <OptimizerCard
            char={char}
            weapon={weapon}
            sets={sets}
            build={build}
            rows={result.rows}
            team={team}
            onApply={patch}
          />
        </div>
        <div className="min-w-0 space-y-5">
          {rating && (
            <>
              <RatingCard char={char} build={build} rows={result.rows} rating={rating} />
              <PiecesCard char={char} sets={sets} build={build} rating={rating} />
            </>
          )}
          <Results
            char={char}
            build={build}
            result={result}
            game={state.game}
            onFocus={(focus) => patch({ focus })}
          />
        </div>
      </div>
    </div>
  )
}
