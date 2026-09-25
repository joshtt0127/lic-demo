/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        paper: '#F6F5F1', // warm off-white global background
        card: '#FFFFFF',
        line: '#ECEAE4', // very light card border

        // Text
        ink: '#15140F', // primary, near-black
        // Assombri d'un cheveu : sur les surfaces crème, l'ancien gris donnait
        // 4,48:1 pour 4,5 exigés. Mesuré, pas ressenti.
        muted: '#67635A', // secondary, warm grey

        // Premium / brand accents
        cream: '#F1E4C3', // premium CTA background (Snap apply, Self Tape)
        gold: '#F2C200', // vivid gold — match badges, lightning

        // Signal / rating system
        signal: {
          // Assombri : sur blanc, l'ancien rouge donnait 4,06:1 pour 4,5 exigés.
          // C'est la couleur des messages d'erreur — celle qu'il faut pouvoir
          // lire quand quelque chose ne va pas.
          // Encore un cran : sur les fonds teintés de rouge pâle (une alerte
          // posée sur son propre fond), 4,42:1 restait sous la barre.
          no: '#B32D23', // No go
          maybe: '#F4B400', // Maybe
          // Assombri : sur `good-bg`, l'ancien vert donnait 2,6:1 pour 4,5 exigés
          // (mesuré par axe). Même couleur, lisible.
          good: '#176B45', // Good match
          'good-bg': '#E7F6EE', // selected good-match background
        },

        // Match score + links
        match: '#16A34A',
        link: '#2563EB',

        // Brand mark squares
        brand: {
          yellow: '#F2C200',
          blue: '#2563EB',
          red: '#E0483D',
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        // Display face of the brand — headlines, wordmark, step titles.
        display: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        // Softer, more current geometry. These four tokens carry the whole app,
        // so the scale is tuned here rather than screen by screen.
        card: '24px',
        btn: '16px',
        panel: '36px',
        field: '18px',
        /** Inner element of a rounded container (segmented controls, toggles). */
        inner: '12px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(21,20,15,0.04), 0 6px 20px rgba(21,20,15,0.05)',
        panel: '0 1px 3px rgba(21,20,15,0.04), 0 24px 60px -12px rgba(21,20,15,0.12)',
        'card-hover': '0 2px 4px rgba(21,20,15,0.06), 0 12px 32px rgba(21,20,15,0.09)',
        phone: '0 30px 80px rgba(21,20,15,0.22), 0 8px 24px rgba(21,20,15,0.12)',
      },
      letterSpacing: {
        label: '0.12em', // uppercase technical labels
      },
      fontSize: {
        label: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.12em' }],
      },
    },
  },
  plugins: [],
}
