import { Plus, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { ATTACK_KEYS, ELEMENTS, TRANS } from '#/engine/tables'
import type { Buff, BuffKey, Reaction, ScalingStat, TransReaction } from '#/engine/types'
import { useT } from '#/lib/i18n'

const KEYS: BuffKey[] = [
  'atk%',
  'atk',
  'hp%',
  'hp',
  'def%',
  'def',
  'em',
  'er',
  'cr',
  'cd',
  'dmg',
  'flat',
  'res',
  'defShred',
  'defIgnore',
  'react',
  'heal',
  'shield',
]
const FLAT_KEYS = new Set<BuffKey>(['atk', 'hp', 'def', 'em', 'flat'])
const FROM: ScalingStat[] = ['hp', 'atk', 'def', 'em']
const SPECIAL: Reaction[] = [
  'lunarcharged',
  'lunarbloom',
  'lunarcrystallize',
  'stellarconduct',
  'stellarswirl',
]
const REACTIONS: Reaction[] = [
  'vaporize',
  'melt',
  'aggravate',
  'spread',
  ...(Object.keys(TRANS) as TransReaction[]),
  ...SPECIAL,
]

/** Which `on` targets make sense for a key ('' = all). */
function targets(key: BuffKey): (NonNullable<Buff['on']> | '')[] | null {
  if (key === 'dmg' || key === 'cr' || key === 'cd') return ['', ...ELEMENTS, ...ATTACK_KEYS]
  if (key === 'flat' || key === 'defIgnore') return ['', ...ATTACK_KEYS]
  if (key === 'res') return ELEMENTS
  if (key === 'react') return REACTIONS
  return null
}

/** Flat values are typed as-is; ratios and percentages are typed in %. */
export const isPercent = (b: Pick<Buff, 'key' | 'from'>) => !!b.from || !FLAT_KEYS.has(b.key)

export function BuffEditor({ buffs, onChange }: { buffs: Buff[]; onChange: (b: Buff[]) => void }) {
  const t = useT()
  const set = (i: number, patch: Partial<Buff>) =>
    onChange(buffs.map((b, j) => (j === i ? { ...b, ...patch } : b)))

  return (
    <div className="space-y-2">
      {buffs.map((b, i) => {
        const tg = targets(b.key)
        return (
          <div
            key={i}
            className="grid grid-cols-[1fr_1fr_6rem_auto] items-center gap-1.5 max-sm:grid-cols-2"
          >
            <Select
              value={b.key}
              onValueChange={(key: BuffKey) =>
                set(i, { key, on: targets(key)?.[0] || undefined, from: undefined })
              }
            >
              <SelectTrigger aria-label={t('customBuffs')} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`buff.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tg ? (
              <Select
                value={b.on ?? '_all'}
                onValueChange={(v) => set(i, { on: v === '_all' ? undefined : (v as Buff['on']) })}
              >
                <SelectTrigger aria-label={t('target')} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tg.map((o) => (
                    <SelectItem key={o || '_all'} value={o || '_all'}>
                      {o ? t(o) : t('all')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : FLAT_KEYS.has(b.key) ? (
              <Select
                value={b.from ?? '_none'}
                onValueChange={(v) =>
                  set(i, { from: v === '_none' ? undefined : (v as ScalingStat) })
                }
              >
                <SelectTrigger aria-label={t('scalesFrom')} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">{t('none')}</SelectItem>
                  {FROM.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t('scalesFrom')} {t(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span />
            )}
            <div className="relative">
              <Input
                type="number"
                step="any"
                aria-label={t('value')}
                value={+(b.value * (isPercent(b) ? 100 : 1)).toFixed(4)}
                onChange={(e) =>
                  set(i, { value: (Number(e.target.value) || 0) / (isPercent(b) ? 100 : 1) })
                }
                className="pr-6 tabular-nums"
              />
              {isPercent(b) && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('remove')}
              onClick={() => onChange(buffs.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
          </div>
        )
      })}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange([...buffs, { key: 'atk%', value: 0.2, source: 'Custom' }])}
      >
        <Plus /> {t('addBuff')}
      </Button>
    </div>
  )
}
