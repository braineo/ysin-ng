import { Check, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { useT } from '#/lib/i18n'
import { deleteBuild, useBuilds, type SavedBuild } from '#/lib/store'
import { cn } from '#/lib/utils'
import { useFmt } from './results'

type Props = {
  slug: string
  savedId?: string
  name: string
  onName: (name: string) => void
  onSave: (asNew: boolean) => void
  onLoad: (b: SavedBuild) => void
  onReset: () => void
}

export function SaveBar({ slug, savedId, name, onName, onSave, onLoad, onReset }: Props) {
  const t = useT()
  const fmt = useFmt()
  const mine = useBuilds().filter((b) => b.slug === slug)
  const [flash, setFlash] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)

  const save = (asNew: boolean) => {
    onSave(asNew)
    setFlash(true)
    setTimeout(() => setFlash(false), 1500)
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-48 flex-1 gap-1.5">
            <label htmlFor="build-name" className="text-xs text-muted-foreground">
              {savedId ? t('editing') : t('buildName')}
            </label>
            <Input id="build-name" value={name} onChange={(e) => onName(e.target.value)} />
          </div>
          <Button onClick={() => save(false)}>
            {flash ? <Check /> : <Save />}
            {flash ? t('saved') : t('save')}
          </Button>
          {savedId && (
            <Button variant="outline" onClick={() => save(true)}>
              {t('saveAsNew')}
            </Button>
          )}
          <Button variant="ghost" onClick={onReset} title={t('reset')}>
            <RotateCcw />
            <span className="max-sm:sr-only">{t('reset')}</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('draftNote')}</p>

        {mine.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-muted-foreground">{t('savedBuilds')}</h3>
            <ul className="flex flex-wrap gap-2">
              {mine.map((b) => (
                <li
                  key={b.id}
                  className={cn(
                    'flex items-center gap-1 rounded-md border py-0.5 pl-2.5 pr-0.5 text-sm',
                    b.id === savedId && 'border-primary bg-accent',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onLoad(b)}
                    className="flex items-baseline gap-2 text-left"
                    title={t('load')}
                  >
                    <span className="font-medium">{b.name}</span>
                    {b.summary && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {fmt.format(b.summary.focusValue)}
                      </span>
                    )}
                  </button>
                  {confirm === b.id ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        deleteBuild(b.id)
                        setConfirm(null)
                      }}
                    >
                      {t('confirmDelete')}
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={t('delete')}
                      onClick={() => setConfirm(b.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
