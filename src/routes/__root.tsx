import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
  retainSearchParams,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { useLang, useT } from '#/lib/i18n'

import appCss from '../styles.css?url'

type RootSearch = { lang?: 'zh' }

export const Route = createRootRoute({
  validateSearch: (s: Record<string, unknown>): RootSearch =>
    s.lang === 'zh' ? { lang: 'zh' } : {},
  search: { middlewares: [retainSearchParams(['lang'])] },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Ysin NG' },
      { name: 'referrer', content: 'no-referrer' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const lang = useLang()
  const t = useT()
  return (
    <html lang={lang === 'zh' ? 'zh-CN' : 'en'}>
      <head>
        <HeadContent />
      </head>
      <body>
        <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
            <Link to="/" className="flex items-baseline gap-2 no-underline">
              <span className="font-display text-xl font-bold text-primary">{t('appName')}</span>
              <span className="hidden text-sm text-muted-foreground sm:inline">{t('tagline')}</span>
            </Link>
            <nav className="ml-auto flex items-center gap-1 text-sm" aria-label="Language">
              {(['en', 'zh'] as const).map((l) => (
                <Link
                  key={l}
                  to="."
                  search={(s: RootSearch): RootSearch => ({
                    ...s,
                    lang: l === 'zh' ? 'zh' : undefined,
                  })}
                  aria-current={lang === l ? 'true' : undefined}
                  className="rounded-md px-2.5 py-1 text-muted-foreground aria-[current]:bg-secondary aria-[current]:font-semibold aria-[current]:text-foreground"
                >
                  {l === 'en' ? 'EN' : '中文'}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-muted-foreground">
          {t('imagesNote')}
        </footer>
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[{ name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> }]}
        />
        <Scripts />
      </body>
    </html>
  )
}
