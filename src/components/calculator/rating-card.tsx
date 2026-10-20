import { GameIcon } from '#/components/game-icon'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { focusRow, type Build, type HitResult } from '#/engine/calc'
import { family, type Rating } from '#/engine/rating'
import { SUB_ROLL, type SubKey } from '#/engine/tables'
import type { ArtifactSetData, CharacterData } from '#/engine/types'
import { useT } from '#/lib/i18n'
import { cn } from '#/lib/utils'
import { useMainLabel } from './optimizer-card'
import { isPctStat, pct, useFmt } from './results'

/** Ysin's score colours, one per 25 points: grey, green, blue, purple, gold. */
const BANDS = [
  'rgb(125,127,131)',
  'rgb(108,168,139)',
  'rgb(86,155,175)',
  'rgb(177,135,195)',
  'rgb(211,159,81)',
]
// banded on the rounded score, as Ysin does
const band = (score: number) => BANDS[Math.min(Math.max(Math.floor(Math.round(score) / 25), 0), 4)]

const key = (g: Rating['gains'][number]) =>
  g.type === 'main' ? g.slot : g.type === 'talent' ? g.index : g.type
const rollsText = (n: number) => String(+n.toFixed(1))
const gainText = (g: number) => `+${(g * 100).toFixed(2)}%`

function useStatValue() {
  const fmt = useFmt()
  return (k: string, v: number) => (isPctStat(k) ? pct(v) : fmt.format(v))
}

type Props = {
  char: CharacterData
  build: Build
  rows: (HitResult & { talent: string })[]
  rating: Rating
}

export function RatingCard({ char, build, rows, rating }: Props) {
  const t = useT()
  const fmt = useFmt()
  const show = useStatValue()
  const mainLabel = useMainLabel(char.element)
  const target = focusRow(rows, build.focus) as (typeof rows)[number] | undefined

  const label = (g: Rating['gains'][number]) => {
    switch (g.type) {
      case 'main':
        return t('gain.main', {
          slot: t(g.slot),
          from: mainLabel(build.mains[g.slot]),
          to: mainLabel(g.key),
        })
      case 'talent':
        return t('gain.talent', {
          talent: char.talents[g.index].name,
          from: build.talents[g.index],
          to: build.talents[g.index] + 1,
        })
      case 'dmg':
        return t('gain.dmg')
    }
  }
  const tiles = [
    { k: 'subScore', v: rating.subScore, hint: t('subScoreHint') },
    { k: 'dataScore', v: rating.score, hint: t('dataScoreHint') },
    ...(rating.ceiling
      ? [
          {
            k: 'ceiling',
            v: rating.ceiling.score,
            hint: t('ceilingHint', {
              p: (rating.ceiling.progress * 100).toFixed(0),
              n: rating.ceiling.rolls,
            }),
          },
        ]
      : []),
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('rating')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {target && t('ratingTarget', { target: `${target.group} · ${target.label}` })} ·{' '}
          {t('ratingHint')}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map(({ k, v, hint }) => (
            <div key={k} className="rounded-md border p-3">
              <div
                className="font-display text-4xl font-bold tabular-nums"
                style={{ color: band(v) }}
              >
                {v.toFixed(0)}
              </div>
              <div className="text-sm font-medium">{t(k)}</div>
              <div className="text-xs text-muted-foreground">{hint}</div>
            </div>
          ))}
        </div>

        {rating.critLoss !== null && rating.critLoss >= 0.1 && (
          <p className="text-sm">{t('critLoss', { n: rating.critLoss.toFixed(1) })}</p>
        )}

        <div>
          <h3 className="text-sm font-semibold">{t('subStats')}</h3>
          <p className="text-xs text-muted-foreground">{t('subStatsHint')}</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead className="text-right">{t('value')}</TableHead>
                <TableHead className="text-right">{t('rolls')}</TableHead>
                <TableHead className="text-right">{t('perRoll')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rating.subs.map((s) => (
                <TableRow key={s.key} className={cn(!s.useful && 'text-muted-foreground')}>
                  <TableCell>
                    {t(`buff.${s.key}`)}{' '}
                    <span className="text-xs text-muted-foreground">
                      {show(s.key, SUB_ROLL[s.key])}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {show(s.key, s.value)}
                    {s.flat > 0 && ` + ${fmt.format(s.flat)}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{rollsText(s.rolls)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.useful ? (
                      <>
                        <span className="font-semibold">{gainText(s.gain)}</span>{' '}
                        <span className="text-muted-foreground">
                          +{fmt.format(s.gain * rating.value)}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>{t('total')}</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">
                  {rollsText(rating.totalRolls)}
                </TableCell>
                <TableCell className="text-right text-xs font-normal text-muted-foreground">
                  {t('usefulRolls', { n: rollsText(rating.usefulRolls) })}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        {rating.gains.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold">{t('gains')}</h3>
            <p className="mb-1 text-xs text-muted-foreground">{t('gainsHint')}</p>
            <ul className="divide-y divide-dashed text-sm">
              {rating.gains.map((g) => (
                <li key={`${g.type}.${key(g)}`} className="flex justify-between gap-3 py-1.5">
                  <span className="min-w-0">{label(g)}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold">{gainText(g.gain)}</span>{' '}
                    <span className="text-muted-foreground">
                      +{fmt.format(g.gain * rating.value)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const SLOTS = ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const

/** Each imported piece with its substats, exact roll counts and Ysin-style piece score. */
export function PiecesCard({
  char,
  sets,
  build,
  rating,
}: {
  char: CharacterData
  sets: ArtifactSetData[]
  build: Build
  rating: Rating
}) {
  const t = useT()
  const show = useStatValue()
  const mainLabel = useMainLabel(char.element)
  if (!build.pieces) return null
  const useful = new Set<SubKey>(rating.subs.filter((s) => s.useful).map((s) => s.key))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('artifacts')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {rating.pieces ? t('piecesHint') : t('piecesStale')}
        </p>
      </CardHeader>
      {rating.pieces && (
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SLOTS.map((slot) => {
            const piece = build.pieces![slot]
            const score = rating.pieces![slot]
            if (!piece || !score) return null
            const set = sets.find((s) => s.id === piece.setId)
            const left = Math.floor((piece.rarity * 4 - piece.level) / 4)
            return (
              <div key={slot} className="space-y-2 rounded-md border p-3 text-sm">
                <div className="flex items-start gap-2">
                  <GameIcon
                    src={piece.icon}
                    fallback={set?.iconFallback}
                    alt=""
                    className={cn(
                      'size-11 shrink-0 rounded-md',
                      piece.rarity === 5 ? 'bg-star5/30' : 'bg-star4/30',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">
                        {t(slot)} <span className="text-muted-foreground">+{piece.level}</span>
                      </span>
                      <span className="font-semibold tabular-nums" title={t('pieceScore')}>
                        {gainText(score.gain)}
                      </span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{set?.name}</div>
                  </div>
                </div>
                <div className="flex justify-between gap-2 font-medium">
                  <span>{piece.main ? mainLabel(piece.main) : t('otherMain')}</span>
                  <span className="tabular-nums">
                    {piece.main ? show(piece.main, piece.mainValue) : '—'}
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {piece.subs.map((s) => (
                    <li
                      key={s.key}
                      className={cn(
                        'flex justify-between gap-2',
                        !useful.has(family(s.key)) && 'text-muted-foreground',
                      )}
                    >
                      <span>{t(`buff.${s.key}`)}</span>
                      <span className="tabular-nums">
                        {show(s.key, s.value)}{' '}
                        <span className="inline-block w-7 text-right text-xs text-muted-foreground">
                          {score.rolls[s.key].toFixed(1)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between gap-2 border-t pt-1.5 text-xs text-muted-foreground">
                  <span>{t('usefulRolls', { n: rollsText(score.usefulRolls) })}</span>
                  {left > 0 && <span>{t('upgradesLeft', { n: left })}</span>}
                </div>
              </div>
            )
          })}
        </CardContent>
      )}
    </Card>
  )
}
