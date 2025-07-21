import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineNuxtConfig({
  nitro: {
    experimental: {
      asyncContext: true,
    },
    routeRules: {
      "/app/**": {
        ssr: false,
      },
    },
    alias: {
      "#framework": join(__dirname, "../src/framework"),
    },
  },
  runtimeConfig: {
    public: {
      auth: {
        redirectUserTo: "/app/user",
        redirectGuestTo: "/",
      },
    },
  },
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  colorMode: {
    classSuffix: "",
  },
  build: {
    transpile: ["vee-validate", "vue-sonner"],
  },
  css: ["~/assets/css/tailwind.css", "vue-sonner/style.css"],
  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ["devel.fmhy.net"],
    },
  },
  modules: [
    "@nuxt/fonts",
    "@nuxt/icon",
    "@nuxt/scripts",
    "@nuxt/image",
    "@nuxt/devtools",
    "@pinia/nuxt",
    "@vueuse/nuxt",
    "reka-ui/nuxt",
    "shadcn-nuxt",
    "@nuxtjs/color-mode",
  ],
  components: true,
  imports: {
    autoImport: true,
    dirs: ["~/components", "~/pages", "~/stores", "~/types", "~/utils"],
  },
  shadcn: {
    prefix: "",
    componentDir: "./app/components/ui",
  },
});