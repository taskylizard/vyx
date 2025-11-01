import tailwindcss from '@tailwindcss/vite'
import { defineNuxtConfig } from 'nuxt/config'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const oauthProxy =
  process.env.NODE_ENV === 'development' && process.env.OAUTH_PROXY
    ? { server: { allowedHosts: [new URL(process.env.OAUTH_PROXY).host] } }
    : {}

if ('server' in oauthProxy) {
  console.log('Running in development mode, using OAUTH_PROXY:', oauthProxy)
}

export default defineNuxtConfig({
  nitro: {
    preset: 'bun',
    experimental: {
      asyncContext: true,
      wasm: true
    },
    routeRules: {
      '/app/**': {
        ssr: false
      }
    },
    alias: {
      '#framework': join(__dirname, '../bot/src/framework/index.ts')
    }
  },
  runtimeConfig: {
    public: {
      auth: {
        redirectUserTo: '/app',
        redirectGuestTo: '/'
      },
      links: {
        docs: process.env.NUXT_PUBLIC_DOCS_URL ||
          'https://github.com/taskylizard/vyx#readme',
        support: process.env.NUXT_PUBLIC_SUPPORT_URL ||
          'https://discord.gg/taskylizard',
        invite: process.env.NUXT_PUBLIC_INVITE_URL ||
          'https://discord.com/oauth2/authorize'
      }
    }
  },
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  colorMode: {
    classSuffix: ''
  },
  build: {
    transpile: ['vee-validate', 'vue-sonner']
  },
  css: ['~/assets/css/tailwind.css', 'vue-sonner/style.css'],
  vite: {
    plugins: [tailwindcss()],
    ...oauthProxy
  },
  modules: [
    '@nuxt/fonts',
    '@nuxt/icon',
    '@nuxt/scripts',
    '@nuxt/image',
    '@nuxt/devtools',
    '@pinia/nuxt',
    '@vueuse/nuxt',
    'reka-ui/nuxt',
    'shadcn-nuxt',
    '@nuxtjs/color-mode'
  ],
  components: true,
  imports: {
    presets: [
      {
        from: 'vue-sonner',
        imports: ['toast']
      }
    ],
    autoImport: true,
    dirs: ['~/components', '~/pages', '~/stores', '~/types', '~/utils']
  },
  shadcn: {
    prefix: '',
    componentDir: './app/components/ui'
  }
})
