import { BuffEditor } from '#/components/buff-editor'
import { Field, SelectField, numOptions, type Option } from '#/components/field'
import { GameIcon, IconLabel } from '#/components/game-icon'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { talentLevel, type Build } from '#/engine/calc'
import {
  CIRCLET,
  DMG_REACTIONS,
  GOBLET,
  LEVEL_KEYS,
  SANDS,
  SUB_KEYS,
  WEAPON_LEVEL_KEYS,
  type MainKey,
} from '#/engine/tables'
import type { ArtifactSetData, CharacterData, WeaponData } from '#/engine/types'
import { useT } from '#/lib/i18n'
import { cn } from '#/lib/utils'

type Props = {
  char: CharacterData
  weapons: WeaponData[]
  sets: ArtifactSetData[]
  build: Build
  weapon: WeaponData | null
  onBuild: (patch: Partial<Build>) => void
  onWeapon: (id: number) => void
}

const levelLabel = (k: string) => `Lv. ${k}`

export function BuildForm({ char, weapons, sets, build, weapon, onBuild, onWeapon }: Props) {
  const t = useT()
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
  const totalRolls = SUB_KEYS.reduce((s, k) => s + build.rolls[k], 0)

  return (
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
              onChange={(level) => onBuild({ level })}
              options={LEVEL_KEYS.filter((k) => char.stats[k]).map((k) => ({
                value: k,
                label: levelLabel(k),
              }))}
            />
            <SelectField
              id="cons"
              label={t('constellation')}
              value={String(build.cons)}
              onChange={(v) => onBuild({ cons: Number(v) })}
              options={numOptions(0, 6, 'C')}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {char.talents.map((tal, i) => {
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
                      {talentLevel(char, build, tal.key) > lv && (
                        <span className="text-primary">+3</span>
                      )}
                    </span>
                  }
                  value={String(lv)}
                  onChange={(v) => {
                    const talents = [...build.talents] as Build['talents']
                    talents[i] = Number(v)
                    onBuild({ talents })
                  }}
                  options={numOptions(1, 10)}
                />
              )
            })}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3">
            <SelectField
              id="weapon"
              label={t('weapon')}
              value={String(weapon?.id ?? '')}
              onChange={(v) => onWeapon(Number(v))}
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
              onChange={(weaponLevel) => onBuild({ weaponLevel })}
              options={WEAPON_LEVEL_KEYS.map((k) => ({ value: k, label: k }))}
            />
            <SelectField
              id="refine"
              label={t('refinement')}
              value={String(build.refine)}
              onChange={(v) => onBuild({ refine: Number(v) })}
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
                    onClick={() => onBuild({ fourPc: four })}
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
                    onBuild({ sets: next })
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
                  onChange={(v) =>
                    onBuild({
                      mains: { ...build.mains, [slot]: v as MainKey },
                      // a different main stat means a different piece: drop the imported exact value
                      mainValues: build.mainValues && { ...build.mainValues, [slot]: undefined },
                    })
                  }
                  options={mainOptions(keys)}
                />
              ))}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {t('substats')} · {+totalRolls.toFixed(1)} — {t('rollHint')}
              </p>
              <div className="mt-2 grid grid-cols-5 gap-2 max-sm:grid-cols-3">
                {SUB_KEYS.map((k) => (
                  <Field key={k} id={`roll-${k}`} label={t(`buff.${k}`)}>
                    <Input
                      id={`roll-${k}`}
                      type="number"
                      min={0}
                      max={40}
                      step="any"
                      value={build.rolls[k]}
                      onChange={(e) =>
                        onBuild({
                          rolls: { ...build.rolls, [k]: Math.max(0, Number(e.target.value) || 0) },
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
              onChange={(v) => onBuild({ reaction: v as Build['reaction'] })}
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
                onChange={(e) => onBuild({ enemyLevel: Number(e.target.value) || 1 })}
              />
            </Field>
            <Field id="enemy-res" label={t('enemyRes')}>
              <Input
                id="enemy-res"
                type="number"
                step={5}
                value={Math.round(build.enemyRes * 100)}
                onChange={(e) => onBuild({ enemyRes: (Number(e.target.value) || 0) / 100 })}
              />
            </Field>
          </div>
          {char.weapon !== 'catalyst' && (
            <label className="flex items-center gap-2 text-sm">
              <input
                id="infusion"
                type="checkbox"
                checked={build.infusion}
                onChange={(e) => onBuild({ infusion: e.target.checked })}
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
          <BuffEditor buffs={build.custom} onChange={(custom) => onBuild({ custom })} />
        </CardContent>
      </Card>
    </div>
  )
}
