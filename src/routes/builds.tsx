import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Download, GitCompareArrows, Pencil, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useFmt } from '#/components/calculator/results'
import { ELEMENT_BG, GameIcon } from '#/components/game-icon'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { useLang, useT } from '#/lib/i18n'
import {
  deleteBuild,
  getBuilds,
  importBuilds,
  renameBuild,
  useBuilds,
  type SavedBuild,
} from '#/lib/store'
import { cn } from '#/lib/utils'
import { getRoster } from '#/server/fns'

export const Route = createFileRoute('/builds')({
  loaderDeps: ({ search }) => ({ lang: search.lang ?? ('en' as const) }),
  loader: ({ deps }) => getRoster({ data: { lang: deps.lang } }),
  head: () => ({ meta: [{ title: 'My builds · Ysin NG' }] }),
  component: Builds,
})

const MAX_COMPARE = 4

function exportAll() {
  const blob = new Blob([JSON.stringify(getBuilds(), null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `ysin-ng-builds-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

function Builds() {
  const roster = Route.useLoaderData()
  const builds = useBuilds()
  const t = useT()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string[]>([])
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const people = new Map(roster.map((c) => [c.slug, c]))

  const groups = new Map<string, SavedBuild[]>()
  for (const b of builds) groups.set(b.slug, [...(groups.get(b.slug) ?? []), b])
  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : s.length < MAX_COMPARE ? [...s, id] : s,
    )

  async function importFile(f: File) {
    try {
      const n = importBuilds(JSON.parse(await f.text()))
      setNotice({ ok: true, text: t('importedN', { n }) })
    } catch {
      setNotice({ ok: false, text: t('importFailed') })
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto font-display text-2xl font-bold">{t('myBuilds')}</h1>
        <Button variant="outline" size="sm" onClick={exportAll} disabled={!builds.length}>
          <Download /> {t('exportJson')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => file.current?.click()}>
          <Upload /> {t('importJson')}
        </Button>
        <input
          ref={file}
          id="import-file"
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importFile(f)
            e.target.value = ''
          }}
        />
        <Button
          size="sm"
          disabled={selected.length < 2}
          onClick={() =>
            navigate({ to: '/compare', search: (s) => ({ ...s, ids: selected.join(',') }) })
          }
        >
          <GitCompareArrows /> {t('compareN', { n: selected.length })}
        </Button>
      </div>
      {notice && (
        <p className={cn('text-sm', notice.ok ? 'text-muted-foreground' : 'text-destructive')}>
          {notice.text}
        </p>
      )}
      {builds.length > 0 && <p className="text-xs text-muted-foreground">{t('selectToCompare')}</p>}

      {builds.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t('noBuilds')}{' '}
            <Link to="/import" className="text-primary underline">
              {t('import')}
            </Link>
          </CardContent>
        </Card>
      ) : (
        [...groups].map(([slug, list]) => {
          const c = people.get(slug)
          return (
            <section key={slug} className="space-y-2">
              <h2 className="flex items-center gap-2 font-semibold">
                {c && (
                  <GameIcon
                    src={c.icon}
                    fallback={c.iconFallback}
                    alt=""
                    className="size-8 rounded-full bg-muted"
                  />
                )}
                {c?.name ?? slug}
                {c && <span className={cn('size-2 rounded-full', ELEMENT_BG[c.element])} />}
              </h2>
              <ul className="grid gap-2 md:grid-cols-2">
                {list.map((b) => (
                  <BuildRow
                    key={b.id}
                    b={b}
                    checked={selected.includes(b.id)}
                    onToggle={() => toggle(b.id)}
                  />
                ))}
              </ul>
            </section>
          )
        })
      )}
    </div>
  )
}

function BuildRow({
  b,
  checked,
  onToggle,
}: {
  b: SavedBuild
  checked: boolean
  onToggle: () => void
}) {
  const t = useT()
  const fmt = useFmt()
  const lang = useLang()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(b.name)
  const [confirm, setConfirm] = useState(false)
  const date = new Date(b.updatedAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en')

  return (
    <li
      className={cn(
        'flex gap-3 rounded-lg border bg-card p-3',
        checked && 'border-primary ring-1 ring-primary',
      )}
    >
      <input
        type="checkbox"
        aria-label={b.name}
        checked={checked}
        onChange={onToggle}
        className="mt-1 size-4 shrink-0 accent-primary"
      />
      <div className="min-w-0 flex-1 space-y-1">
        {editing ? (
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) renameBuild(b.id, name.trim())
              setEditing(false)
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label={t('rename')}
              className="h-8"
            />
            <Button size="sm" type="submit">
              {t('save')}
            </Button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              to="/c/$slug"
              params={{ slug: b.slug }}
              search={(s) => ({ ...s, build: b.id })}
              className="truncate font-medium hover:text-primary"
            >
              {b.name}
            </Link>
            {b.source && <Badge variant="outline">{t('fromUid', { uid: b.source.uid })}</Badge>}
          </div>
        )}
        {b.summary && (
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5 truncate">
              {b.summary.weaponIcon && (
                <GameIcon src={b.summary.weaponIcon} alt="" className="size-4" />
              )}
              {b.summary.weapon}
              {b.summary.sets && ` · ${b.summary.sets}`}
            </p>
            {b.summary.focusValue > 0 && (
              <p>
                {b.summary.focusLabel}:{' '}
                <span className="font-semibold text-foreground tabular-nums">
                  {fmt.format(b.summary.focusValue)}
                </span>
              </p>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{date}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={t('rename')}
          onClick={() => setEditing((v) => !v)}
        >
          <Pencil className="size-3.5" />
        </Button>
        {confirm ? (
          <Button size="sm" variant="destructive" onClick={() => deleteBuild(b.id)}>
            {t('confirmDelete')}
          </Button>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={t('delete')}
            onClick={() => setConfirm(true)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </li>
  )
}
