import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  // Caminhos relativos: o app funciona hospedado em qualquer pasta (ex.: GitHub Pages).
  base: './',
  // Número da versão (de package.json) disponível nas telas.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    // Torna o app instalável no celular e utilizável sem internet.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        // Identidade do app instalado (igual à que o Chrome já calculava pelo endereço publicado): fixa, para nunca se
        // confundir com o app de gastos, que mora no mesmo site (graraujo90.github.io).
        id: '/controle-viagem/',
        name: 'Controle de Viagem',
        short_name: 'Viagem',
        description: 'Gastos de viagem, câmbio e divisão de despesas',
        lang: 'pt-BR',
        display: 'standalone',
        start_url: './',
        scope: './',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png}'] },
    }),
  ],
  server: { port: 5174 },
  test: { include: ['src/**/*.test.ts'] },
})
