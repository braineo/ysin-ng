import { Star } from 'lucide-react'
import { ELEMENT_TEXT } from '#/components/game-icon'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { calculate, focusRow, talentLevel, type Build, type Panel } from '#/engine/calc'
import type { CharacterData } from '#/engine/types'
import { useLang, useT } from '#/lib/i18n'
import type { GamePanel } from '#/lib/store'
import { cn } from '#/lib/utils'

export const pct = (v: number) => `${(v * 100).toFixed(1)}%`
export const useFmt = () =>
  new Intl.NumberFormat(useLang() === 'zh' ? 'zh-CN' : 'en', { maximumFractionDigits: 0 })

/** Panel stats as comparable numbers, in display order. */
export function panelStats(p: Panel, element: string): GamePanel & Record<string, number> {
  const dmg = p.buffs.reduce(
    (s, b) => (b.key === 'dmg' && (!b.on || b.on === element) ? s + b.value : s),
    0,
  )
  return {
    hp: p.hp,
    atk: p.atk,
    def: p.def,
    em: p.em,
    cr: p.cr,
    cd: p.cd,
    er: p.er,
    dmg,
    heal: p.heal,
  }
}
/** GO sheet sections that have a talent level */
const LEVELED: Partial<Record<string, 'normal' | 'skill' | 'burst'>> = {
  auto: 'normal',
  skill: 'skill',
  burst: 'burst',
}
export const STAT_ROWS = ['hp', 'atk', 'def', 'em', 'cr', 'cd', 'er', 'dmg', 'heal'] as const
export const isPctStat = (k: string) => k !== 'hp' && k !== 'atk' && k !== 'def' && k !== 'em'

type Props = {
  char: CharacterData
  build: Build
  result: ReturnType<typeof calculate>
  game?: GamePanel
  onFocus: (id: string) => void
}

export function Results({ char, build, result, game, onFocus }: Props) {
  const t = useT()
  const lang = useLang()
  const fmt = useFmt()
  const stats = panelStats(result.panel, char.element)
  const focus = focusRow(result.rows, build.focus)
  const label = (k: string) =>
    k === 'dmg' ? `${t(char.element)} ${t('dmgBonus')}` : k === 'heal' ? t('healBonus') : t(k)
  // the engine writes "128% ATK"; EM stays short in English, the rest reads as the panel labels
  const statShort = (m: string) => (m === 'EM' && lang === 'en' ? m : t(m.toLowerCase()))
  const show = (k: string, v: number) => (isPctStat(k) ? pct(v) : fmt.format(v))

  return (
    <div className="min-w-0 space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{t('stats')}</CardTitle>
          {game && <p className="text-xs text-muted-foreground">{t('gameHint')}</p>}
        </CardHeader>
        <CardContent>
          {game ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead className="text-right">{t('calculator')}</TableHead>
                  <TableHead className="text-right">{t('inGame')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {STAT_ROWS.filter((k) => k !== 'heal').map((k) => {
                  const off =
                    Math.abs(stats[k] - game[k]) >
                    Math.max(Math.abs(game[k]) * 0.005, isPctStat(k) ? 0.001 : 1)
                  return (
                    <TableRow key={k}>
                      <TableCell className="text-muted-foreground">{label(k)}</TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums',
                          off && 'font-semibold text-primary',
                        )}
                      >
                        {show(k, stats[k])}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{show(k, game[k])}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              {STAT_ROWS.map((k) => (
                <div key={k} className="flex justify-between gap-2 border-b border-dashed pb-1">
                  <dt className="text-muted-foreground">{label(k)}</dt>
                  <dd className="font-medium tabular-nums">{show(k, stats[k])}</dd>
                </div>
              ))}
            </dl>
          )}
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
                <TableHead className="w-8">
                  <span className="sr-only">{t('focus')}</span>
                </TableHead>
                <TableHead>{t('talents')}</TableHead>
                <TableHead>{t('formula')}</TableHead>
                <TableHead className="text-right">{t('nonCrit')}</TableHead>
                <TableHead className="text-right">{t('crit')}</TableHead>
                <TableHead className="text-right">{t('average')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...new Set(result.rows.map((r) => r.talent))].map((talent) => {
                const rows = result.rows.filter((r) => r.talent === talent)
                const lv = LEVELED[talent]
                return [
                  <TableRow key={talent} className="bg-muted/50 hover:bg-muted/50">
                    <TableCell colSpan={6} className="font-semibold">
                      {rows[0].group}{' '}
                      {lv && (
                        <span className="font-normal text-muted-foreground">
                          · Lv. {talentLevel(char, build, lv)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>,
                  ...rows.map((r) => {
                    const isFocus = focus?.id === r.id
                    return (
                      <TableRow key={r.id} data-state={isFocus ? 'selected' : undefined}>
                        <TableCell className="px-1">
                          {r.kind !== 'lunar' && (
                            <button
                              type="button"
                              title={t('focus')}
                              aria-label={t('focus')}
                              aria-pressed={isFocus}
                              onClick={() => onFocus(r.id)}
                              className="grid size-7 place-items-center rounded text-muted-foreground hover:text-primary aria-pressed:text-primary"
                            >
                              <Star className={cn('size-4', isFocus && 'fill-current')} />
                            </button>
                          )}
                        </TableCell>
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
                          {r.formula.replace(/\b(ATK|HP|DEF|EM)\b/g, (m) => statShort(m))}
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
                          <TableCell colSpan={3} className="text-right font-semibold tabular-nums">
                            {r.kind === 'lunar' ? '—' : fmt.format(r.avg)}
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  }),
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
                  <div key={`${r.reaction}.${r.element}`} className="flex justify-between">
                    <dt className="text-muted-foreground">
                      {t(r.reaction)}
                      {r.reaction === 'swirl' && ` · ${t(r.element)}`}
                    </dt>
                    <dd className="font-medium tabular-nums">{fmt.format(r.damage)}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
