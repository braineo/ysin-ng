export type Lang = 'en' | 'zh'

/** Images are hotlinked, never bundled: enka.network's UI mirror first, the official miHoYo CDN as fallback. */
export const ENKA_UI = 'https://enka.network/ui'

export function iconUrl(filename?: string, fallback?: string) {
  return {
    icon: filename ? `${ENKA_UI}/${filename}.png` : (fallback ?? ''),
    iconFallback: fallback ?? '',
  }
}
