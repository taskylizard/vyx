<script setup lang="ts">
import type { Server, ServersResponse } from '~/types/server'

const { user, client } = useAuth()
const colorMode = useColorMode()

const toggleColorMode = () => {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const colorModeLabel = computed(() =>
  colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
)

const colorModeIcon = computed(() =>
  colorMode.value === 'dark' ? 'ph:sun-duotone' : 'ph:moon-stars-duotone'
)

const signOut = async () => {
  client.signOut()
  await navigateTo('/')
}

// Use useAsyncData for proper SSR support with caching
const {
  data: serversData,
  pending: serversPending,
  error: serversError
} = await useAsyncData<ServersResponse>(
  'discord-servers',
  () => $fetch<ServersResponse>('/api/discord/servers'),
  {
    default: () => ({ guilds: [] }),
    server: true,
    lazy: false
  }
)

const servers = computed<Server[]>(() => serversData.value?.guilds || [])

// Provide servers data to child components
provide('servers', servers)
provide('serversLoading', serversPending)
provide('serversError', serversError)
</script>

<template>
  <div class="min-h-screen bg-neutral-1 flex flex-col">
    <header class="border-b px-4 md:px-6">
      <div class="flex flex-col gap-3 py-3 md:grid md:min-h-16 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-6">
        <!-- mobile: server picker left, profile right -->
        <div class="flex w-full items-center justify-between md:hidden">
          <AppServerPicker class="max-w-[60%]" />

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" class="h-10 w-10 p-0 rounded-full">
                <Avatar class="h-8 w-8">
                  <AvatarImage :src="user?.image!" :alt="user?.name" />
                  <AvatarFallback class="bg-neutral-5 text-neutral-12">
                    {{
                      user?.name?.charAt(0)
                      .toUpperCase() || 'U'
                    }}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-56">
              <DropdownMenuLabel class="font-normal">
                <div class="flex flex-col space-y-1">
                  <p class="text-sm font-medium leading-none">
                    {{ user?.name || 'Unknown User' }}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                class="cursor-pointer"
                @click="navigateTo('/app/user')"
              >
                <Icon name="lucide:sparkle" class="h-4 w-4" />
                <span>Your dashboard</span>
              </DropdownMenuItem>
              <DropdownMenuItem class="cursor-pointer" @click="toggleColorMode">
                <Icon :name="colorModeIcon" class="h-4 w-4" />
                <span>{{ colorModeLabel }}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                v-if="(user as any)?.role === 'admin'"
                @click="navigateTo('/app/admin')"
                class="cursor-pointer"
              >
                <Icon name="lucide:shield" class="mr-2 h-4 w-4" />
                <span>Admin</span>
              </DropdownMenuItem>
              <DropdownMenuItem @click="signOut" class="cursor-pointer">
                <Icon name="lucide:log-out" class="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <!-- desktop layout -->
        <AppServerPicker
          class="hidden md:block order-2 md:max-w-max lg:max-w-md"
        />

        <div class="hidden md:flex items-center justify-end gap-2 order-3">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" class="h-10 w-10 p-0 rounded-full">
                <Avatar class="h-8 w-8">
                  <AvatarImage :src="user?.image!" :alt="user?.name" />
                  <AvatarFallback class="bg-neutral-5 text-neutral-12">
                    {{
                      user?.name?.charAt(0)
                      .toUpperCase() || 'U'
                    }}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-56">
              <DropdownMenuLabel class="font-normal">
                <div class="flex flex-col space-y-1">
                  <p class="text-sm font-medium leading-none">
                    {{ user?.name || 'Unknown User' }} · @{{
                      (user as any)?.username ||
                      'unknown'
                    }}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                class="cursor-pointer"
                @click="navigateTo('/app/user')"
              >
                <Icon name="lucide:sparkle" class="h-4 w-4" />
                <span>Your dashboard</span>
              </DropdownMenuItem>
              <DropdownMenuItem class="cursor-pointer" @click="toggleColorMode">
                <Icon :name="colorModeIcon" class="h-4 w-4" />
                <span>{{ colorModeLabel }}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                v-if="(user as any)?.role === 'admin'"
                @click="navigateTo('/app/admin')"
                class="cursor-pointer"
              >
                <Icon name="lucide:shield" class="mr-2 h-4 w-4" />
                <span>Admin</span>
              </DropdownMenuItem>
              <DropdownMenuItem @click="signOut" class="cursor-pointer">
                <Icon name="lucide:log-out" class="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 p-4">
      <div class="max-w-7xl mx-auto">
        <slot />
      </div>
    </main>

    <!-- Footer -->
    <footer class="bg-background border-t border-neutral-6 px-4 py-4">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <p class="text-muted-foreground text-sm">© 2025 taskylizard</p>
        <a
          href="https://github.com/taskylizard/vyx"
          target="_blank"
          rel="noopener noreferrer"
          class="text-foreground"
          aria-label="GitHub Repository"
        >
          <Icon name="lucide:github" size="1.25rem" />
        </a>
      </div>
    </footer>
  </div>
</template>
