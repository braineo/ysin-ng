import { createServerFn } from '@tanstack/react-start'
import type { WeaponType } from '#/engine/types'
import type { Lang } from '#/lib/assets'
import { artifactSets, character, roster, weapons } from './genshin.server'

const lang = (l: unknown): Lang => (l === 'zh' ? 'zh' : 'en')
const WEAPON_TYPES: WeaponType[] = ['sword', 'claymore', 'polearm', 'bow', 'catalyst']

export const getRoster = createServerFn({ method: 'GET' })
  .validator((d: { lang: Lang }) => ({ lang: lang(d.lang) }))
  .handler(({ data }) => roster(data.lang))

export const getCalculatorData = createServerFn({ method: 'GET' })
  .validator((d: { slug: string; lang: Lang }) => ({
    slug: String(d.slug).slice(0, 64),
    lang: lang(d.lang),
  }))
  .handler(({ data }) => {
    const char = character(`${data.slug}|${data.lang}`)
    if (!char) return null
    if (!WEAPON_TYPES.includes(char.weapon)) return null
    return {
      char,
      weapons: weapons(`${char.weapon}|${data.lang}`),
      sets: artifactSets(data.lang),
    }
  })
