import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Download, Info, Loader2, RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { pct, useFmt } from '#/components/calculator/results'
import { ELEMENT_BG, GameIcon } from '#/components/game-icon'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { useLang, useT } from '#/lib/i18n'
import { forgetUid, rememberUid, saveBuild, useBuilds, useRecentUids } from '#/lib/store'
import { cn } from '#/lib/utils'
import type { ImportResult } from '#/server/enka.server'
import { importUid } from '#/server/fns'

export const Route = createFileRoute('/import')({
  // numeric so the URL stays ?uid=123456789 (the router would quote a numeric-looking string)
  validateSearch: (s: Record<string, unknown>): { uid?: number } => {
    const uid = Number(s.uid)
    return Number.isSafeInteger(uid) && uid > 0 ? { uid } : {}
  },
  head: () => ({ meta: [{ title: 'Import · Ysin NG' }] }),
  component: Import,
})

const UID = /^\d{9,10}$/
type Ok = Extract<ImportResult, { ok: true }>

function Import() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const t = useT()
  const lang = useLang()
  const fmt = useFmt()
  const recent = useRecentUids()
  const builds = useBuilds()
  const [uid, setUid] = useState(search.uid ? String(search.uid) : '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Extract<ImportResult, { ok: false }> | null>(null)
  const [data, setData] = useState<Ok | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [savedIds, setSavedIds] = useState<Record<string, string>>({})
  const [now, setNow] = useState(() => Date.now())

  async function run(value: string) {
    const v = value.trim()
    setUid(v)
    setError(null)
    if (!UID.test(v)) return setError({ ok: false, error: 'invalid_uid' })
    setLoading(true)
    try {
      const res = await importUid({ data: { uid: v, lang } })
      if (!res.ok) return setError(res)
      setData(res)
      setSavedIds({})
      setSelected(new Set(res.characters.map((c) => c.slug)))
      rememberUid({ uid: v, nickname: res.player.nickname, at: Date.now() })
      if (String(search.uid) !== v)
        void navigate({ to: '.', search: (s) => ({ ...s, uid: Number(v) }), replace: true })
    } catch {
      setError({ ok: false, error: 'unavailable' })
    } finally {
      setLoading(false)
    }
  }

  // a shared ?uid= link fetches right away; switching language refetches for localized names
  useEffect(() => {
    if (search.uid) void run(String(search.uid))
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only on mount and language change
  }, [lang])

  const wait = data ? Math.max(0, Math.ceil((data.expiresAt - now) / 1000)) : 0
  useEffect(() => {
    if (wait <= 0) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [wait])

  const existing = (slug: string) =>
    builds.find((b) => b.source?.uid === data?.uid && b.slug === slug)

  function saveSelected() {
    if (!data) return
    const ids: Record<string, string> = {}
    for (const c of data.characters.filter((x) => selected.has(x.slug))) {
      const prev = existing(c.slug)
      ids[c.slug] = saveBuild({
        id: prev?.id,
        name: prev?.name ?? `${c.name} · ${data.player.nickname}`,
        slug: c.slug,
        weaponId: c.weaponId,
        build: c.build,
        source: { uid: data.uid, nickname: data.player.nickname },
        game: c.game,
        summary: c.summary,
      }).id
    }
    setSavedIds(ids)
  }

  const toggle = (slug: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">{t('importTitle')}</h1>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          {t('importHint')}
        </p>
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void run(uid)
        }}
      >
        <Input
          id="uid"
          inputMode="numeric"
          autoComplete="off"
          placeholder="UID"
          aria-label="UID"
          aria-invalid={error?.error === 'invalid_uid'}
          value={uid}
          onChange={(e) => setUid(e.target.value.replace(/\D/g, '').slice(0, 10))}
          className="w-48 font-mono tabular-nums"
        />
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <Download />}
          {loading ? t('fetching') : t('fetchProfile')}
        </Button>
      </form>

      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">{t('recent')}</span>
          {recent.map((r) => (
            <span key={r.uid} className="flex items-center rounded-full border pl-3 text-xs">
              <button
                type="button"
                onClick={() => void run(r.uid)}
                className="py-1 hover:text-primary"
              >
                {r.nickname} <span className="font-mono text-muted-foreground">{r.uid}</span>
              </button>
              <button
                type="button"
                aria-label={t('forget')}
                onClick={() => forgetUid(r.uid)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4 text-sm">
            <span className="text-destructive">
              {t(`err.${error.error}`)}
              {error.retryAfter ? ` (${error.retryAfter}s)` : ''}
            </span>
            {error.error !== 'invalid_uid' && error.error !== 'not_found' && (
              <Button variant="outline" size="sm" onClick={() => void run(uid)} disabled={loading}>
                <RefreshCw /> {t('fetchProfile')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {data && !error && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-4 py-4">
              {data.player.avatar && (
                <GameIcon
                  src={data.player.avatar.icon}
                  fallback={data.player.avatar.iconFallback}
                  alt=""
                  className="size-14 rounded-full bg-muted"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold">
                  {data.player.nickname}{' '}
                  <span className="font-mono text-sm text-muted-foreground">{data.uid}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('arWl', { ar: data.player.level, wl: data.player.worldLevel })}
                </p>
                {data.player.signature && (
                  <p className="truncate text-sm italic text-muted-foreground">
                    “{data.player.signature}”
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {wait > 0 ? t('refreshIn', { s: wait }) : null}
              </p>
            </CardContent>
          </Card>

          {(data.hidden > 0 || data.skipped.length > 0) && (
            <div className="space-y-1 text-sm text-muted-foreground">
              {data.hidden > 0 && (
                <p>
                  {t('hiddenN', { n: data.hidden })} {t('importHint')}
                </p>
              )}
              {data.skipped.length > 0 && <p>{t('skippedN', { n: data.skipped.length })}</p>}
            </div>
          )}

          {data.characters.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">{t('noShowcase')}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={selected.size === data.characters.length}
                    onChange={(e) =>
                      setSelected(
                        new Set(e.target.checked ? data.characters.map((c) => c.slug) : []),
                      )
                    }
                  />
                  {t('selectAll')}
                </label>
                <div className="flex items-center gap-3">
                  {Object.keys(savedIds).length > 0 && (
                    <Link to="/builds" className="text-sm text-primary underline">
                      {t('savedN', { n: Object.keys(savedIds).length })}
                    </Link>
                  )}
                  <Button onClick={saveSelected} disabled={selected.size === 0}>
                    {t('saveN', { n: selected.size })}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t('reimportNote')}</p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {data.characters.map((c) => {
                  const prev = existing(c.slug)
                  const savedId = savedIds[c.slug]
                  return (
                    <li key={c.slug}>
                      <label
                        className={cn(
                          'flex cursor-pointer gap-3 rounded-lg border bg-card p-3 transition-colors',
                          selected.has(c.slug) && 'border-primary ring-1 ring-primary',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(c.slug)}
                          onChange={() => toggle(c.slug)}
                          className="mt-1 size-4 shrink-0 accent-primary"
                        />
                        <div
                          className={cn(
                            'relative size-14 shrink-0 overflow-hidden rounded-lg',
                            c.rarity === 5 ? 'bg-star5/30' : 'bg-star4/30',
                          )}
                        >
                          <GameIcon
                            src={c.icon}
                            fallback={c.iconFallback}
                            alt=""
                            className="size-full"
                          />
                          <span
                            className={cn(
                              'absolute right-1 top-1 size-2 rounded-full',
                              ELEMENT_BG[c.element],
                            )}
                          />
                        </div>
                        <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                          <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                            {c.name}
                            <span className="text-xs font-normal text-muted-foreground">
                              Lv. {c.level} · C{c.cons}
                            </span>
                            {prev && !savedId && <Badge variant="outline">{t('willUpdate')}</Badge>}
                          </p>
                          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            {c.weaponIcon && (
                              <GameIcon src={c.weaponIcon} alt="" className="size-4" />
                            )}
                            {c.summary.weapon}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{c.summary.sets}</p>
                          <p className="text-xs tabular-nums">
                            {t('atk')} {fmt.format(c.game.atk)} · {t('cr')} {pct(c.game.cr)} ·{' '}
                            {t('cd')} {pct(c.game.cd)}
                          </p>
                        </div>
                        {savedId && (
                          <Link
                            to="/c/$slug"
                            params={{ slug: c.slug }}
                            search={(s) => ({ ...s, build: savedId, uid: undefined })}
                            className="self-center text-sm text-primary underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {t('open')}
                          </Link>
                        )}
                      </label>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}
