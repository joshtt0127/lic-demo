import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/lic-demo/' : '/',
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5174,
    strictPort: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    rollupOptions: {
      output: {
        /**
         * Séparer le socle du code de l'app.
         *
         * Ça ne réduit pas le premier chargement — ces bibliothèques sont
         * nécessaires dès le premier écran. Ça change ce qui se recharge
         * **ensuite** : aujourd'hui, un déploiement qui touche une ligne de
         * l'app invalide 772 Ko d'un bloc, socle compris. Découpé, le
         * navigateur garde React, Supabase et l'animation en cache d'une
         * version à l'autre, et ne retélécharge que ce qui a bougé.
         *
         * `recharts` n'est pas listé : il est déjà chargé à la demande, avec les
         * deux écrans qui affichent des graphiques (368 Ko qui ne partent pas
         * au premier écran).
         */
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          motion: ['framer-motion'],
        },
      },
    },
  },
})
