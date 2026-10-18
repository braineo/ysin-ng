import { cn } from '#/lib/utils'

/** Hotlinked game image: tries enka.network first, then the miHoYo CDN URL from genshin-db. */
export function GameIcon({
  src,
  fallback,
  alt,
  className,
}: {
  src: string
  fallback?: string
  alt: string
  className?: string
}) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={cn('object-contain', className)}
      onError={(e) => {
        const img = e.currentTarget
        if (fallback && img.src !== fallback) img.src = fallback
      }}
    />
  )
}

export const ELEMENT_TEXT = {
  pyro: 'text-pyro',
  hydro: 'text-hydro',
  electro: 'text-electro',
  cryo: 'text-cryo',
  anemo: 'text-anemo',
  geo: 'text-geo',
  dendro: 'text-dendro',
  physical: 'text-physical',
} as const

export const ELEMENT_BG = {
  pyro: 'bg-pyro',
  hydro: 'bg-hydro',
  electro: 'bg-electro',
  cryo: 'bg-cryo',
  anemo: 'bg-anemo',
  geo: 'bg-geo',
  dendro: 'bg-dendro',
  physical: 'bg-physical',
} as const

export function IconLabel({
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
