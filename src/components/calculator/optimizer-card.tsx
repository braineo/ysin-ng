import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Field, SelectField } from '#/components/field'
import { Button } from '#/components/ui/button'
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
import { focusRow, type Build, type HitResult, type TeamMate } from '#/engine/calc'
import { optimize, type OptimizeResult } from '#/engine/optimize'
import { SUB_KEYS } from '#/engine/tables'
import type { ArtifactSetData, CharacterData, Element, WeaponData } from '#/engine/types'
import { useT } from '#/lib/i18n'
import { useFmt } from './results'

export function useMainLabel(element: Element) {
  const t = useT()
  return (k: string) =>
    k === 'dmg'
      ? `${t(element)} ${t('main.dmg')}`
      : t(k === 'physical' ? 'main.physical' : `buff.${k}`)
}

type Props = {
  char: CharacterData
  weapon: WeaponData | null
  sets: ArtifactSetData[]
  build: Build
  rows: (HitResult & { talent: string })[]
  team: TeamMate[]
  onApply: (patch: Partial<Build>) => void
}

export function OptimizerCard({ char, weapon, sets, build, rows, team, onApply }: Props) {
  const t = useT()
  const fmt = useFmt()
  const currentTotal = Math.round(SUB_KEYS.reduce((s, k) => s + build.rolls[k], 0))
  const [total, setTotal] = useState(currentTotal || 25)
  const [minEr, setMinEr] = useState(100)
  const [tryMains, setTryMains] = useState(false)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [result, setResult] = useState<OptimizeResult | 'none' | null>(null)
  const targets = rows.filter((r) => !Number.isNaN(r.avg))
  const target = focusRow(rows, build.focus)

  async function run() {
    setResult(null)
    setProgress([0, 1])
    const found = await optimize(
      char,
      weapon,
      sets,
      build,
      { total, minEr: minEr / 100, tryMains },
      (done, all) => setProgress([done, all]),
      team,
    )
    setProgress(null)
    setResult(found ?? 'none')
  }

  const mainLabel = useMainLabel(char.element)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('optimizer')}</CardTitle>
        <p className="text-xs text-muted-foreground">{t('optimizerHint')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <SelectField
          id="opt-target"
          label={t('optTarget')}
          value={target?.id ?? ''}
          onChange={(focus) => {
            onApply({ focus })
            setResult(null)
          }}
          options={targets.map((r) => ({ value: r.id, label: `${r.group} · ${r.label}` }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field id="opt-total" label={t('totalRolls')}>
            <Input
              id="opt-total"
              type="number"
              min={1}
              max={45}
              value={total}
              onChange={(e) => setTotal(Math.min(45, Math.max(1, Number(e.target.value) || 1)))}
            />
          </Field>
          <Field id="opt-er" label={t('minEr')}>
            <Input
              id="opt-er"
              type="number"
              min={100}
              max={350}
              step={5}
              value={minEr}
              onChange={(e) => setMinEr(Number(e.target.value) || 100)}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            id="opt-mains"
            type="checkbox"
            checked={tryMains}
            onChange={(e) => setTryMains(e.target.checked)}
            className="size-4 accent-primary"
          />
          {t('tryMains')}
        </label>
        <Button onClick={run} disabled={!!progress || !target} className="w-full">
          <Sparkles />
          {progress ? t('optimizing', { done: progress[0], total: progress[1] }) : t('optimize')}
        </Button>

        {result === 'none' && <p className="text-sm text-destructive">{t('noSolution')}</p>}
        {result && result !== 'none' && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between rounded-md bg-accent p-3 text-accent-foreground">
              <span className="text-sm">
                {fmt.format(result.before)} →{' '}
                <span className="font-semibold">{fmt.format(result.value)}</span>
              </span>
              <span className="font-semibold tabular-nums">
                {result.value >= result.before ? '+' : ''}
                {((result.value / result.before - 1) * 100).toFixed(1)}%
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead className="text-right">{t('current')}</TableHead>
                  <TableHead className="text-right">{t('optimized')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(['sands', 'goblet', 'circlet'] as const)
                  .filter((s) => result.build.mains[s] !== build.mains[s])
                  .map((s) => (
                    <TableRow key={s}>
                      <TableCell>{t(s)}</TableCell>
                      <TableCell className="text-right">{mainLabel(build.mains[s])}</TableCell>
                      <TableCell className="text-right font-medium">
                        {mainLabel(result.build.mains[s])}
                      </TableCell>
                    </TableRow>
                  ))}
                {SUB_KEYS.filter((k) => build.rolls[k] || result.build.rolls[k]).map((k) => (
                  <TableRow key={k}>
                    <TableCell>{t(`buff.${k}`)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {+build.rolls[k].toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {result.build.rolls[k]}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {t('evaluated', { n: fmt.format(result.evaluated) })}
              </span>
              <Button
                variant="outline"
                onClick={() => {
                  onApply({
                    rolls: result.build.rolls,
                    mains: result.build.mains,
                    mainValues: result.build.mainValues,
                    focus: result.build.focus,
                  })
                  setResult(null)
                }}
              >
                {t('apply')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
