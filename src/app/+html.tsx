// Niestandardowy dokument HTML dla wersji webowej (Expo Router static rendering).
// UWAGA: ten plik działa TYLKO gdy app.json ma `web.output: "static"` albo
// `"server"`. Nasz projekt ma `web.output: "single"` (SPA) — w tym trybie
// bazowy szablon HTML bierze się z public/index.html (patrz ten plik: TAM są
// realne meta tagi iOS/Safari). Zostawiamy ten plik gotowy na wypadek zmiany
// web.output w przyszłości — bez dostępu do DOM/window (działa w Node.js
// podczas builda), więc celowo bez importów z reszty appki.
// Więcej: https://docs.expo.dev/router/reference/static-rendering/#root-html

import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';

const THEME_COLOR = '#1f6bff';

export default function Root({ children }: { children: React.ReactNode }) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } = useServerDocumentContext();

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover: bez tego env(safe-area-inset-*) zawsze zwraca 0 na
            iPhone z wcięciem/paskiem gestów — react-native-safe-area-context na
            webie liczy na te zmienne CSS. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, shrink-to-fit=no"
        />
        <meta name="theme-color" content={THEME_COLOR} />

        {/* Uruchomienie z ekranu głównego iOS (Dodaj do ekranu głównego) jako
            samodzielna appka, bez paska adresu Safari. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="DUDIE DAY" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/*
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native.
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {headNodes}

        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
