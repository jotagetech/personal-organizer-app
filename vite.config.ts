import { fileURLToPath } from 'node:url'

import { sentryVitePlugin } from '@sentry/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Os source maps só são gerados e enviados ao Sentry no build da Vercel, onde
// o token existe; depois do envio eles são apagados de dist/, para o código
// original não ficar público.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN
const sentryPlugins = sentryAuthToken
    ? [
          sentryVitePlugin({
              authToken: sentryAuthToken,
              org: process.env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT,
              sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
          }),
      ]
    : []

export default defineConfig({
    plugins: [react(), ...sentryPlugins],
    build: {
        sourcemap: sentryAuthToken ? 'hidden' : false,
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
    },
})
