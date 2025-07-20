<script setup lang="ts">
import { toast } from "vue-sonner";
import type { Server } from "~/types/server";

definePageMeta({
  layout: "dashboard",
});

const { user, session, client } = useAuth();

const error = useRoute().query?.error;
onMounted(() => {
  if (error) {
    toast("Error", {
      description: `Error: ${error}`,
    });
  }
});

// Use injected servers data from layout
const servers = inject<Ref<Server[]>>("servers", ref([]));
const serversPending = inject<Ref<boolean>>("serversLoading", ref(false));

const { data } = useAsyncData("user", () => client.getSession());
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-neutral-12 text-3xl font-bold">
        Welcome back, {{ user?.name || "User" }}!
      </h2>
    </div>

    <div class="space-y-8">
      <!-- Header Section -->
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <Icon name="lucide:server" class="h-5 w-5 text-neutral-11" />
          <h2 class="text-neutral-12 text-2xl font-semibold tracking-tight">
            Your Servers
          </h2>
        </div>
        <p class="text-neutral-11 text-base leading-relaxed">
          Manage Discord servers where the bot is installed and you have
          administrative permissions.
        </p>
      </div>

      <!-- Loading State -->
      <div v-if="serversPending" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div v-for="i in 6" :key="`skeleton-${i}`"
            class="rounded-xl border border-neutral-6 bg-neutral-2 p-6 animate-pulse">
            <div class="flex flex-col items-center space-y-4">
              <div class="w-16 h-16 bg-neutral-4 rounded-full" />
              <div class="space-y-2 w-full">
                <div class="h-4 bg-neutral-4 rounded w-3/4 mx-auto" />
                <div class="h-3 bg-neutral-4 rounded w-1/2 mx-auto" />
              </div>
              <div class="h-8 bg-neutral-4 rounded w-full" />
            </div>
          </div>
        </div>
        <div class="flex items-center justify-center text-neutral-11 text-sm">
          <Icon name="lucide:loader-2" class="h-4 w-4 animate-spin mr-2" />
          Loading your Discord servers...
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="!servers.length" class="text-center py-16">
        <div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-neutral-3 mb-6">
          <Icon name="lucide:server-off" class="h-10 w-10 text-neutral-8" />
        </div>
        <h3 class="text-neutral-12 text-lg font-semibold mb-2">
          No servers found
        </h3>
        <p class="text-neutral-11 text-sm leading-relaxed max-w-md mx-auto mb-6">
          We couldn't find any Discord servers where you have management
          permissions and the bot is installed.
        </p>
        <div class="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="outline" size="sm" class="gap-2">
            <Icon name="lucide:external-link" class="h-4 w-4" />
            Invite Bot to Server
          </Button>
          <Button variant="ghost" size="sm" class="gap-2">
            <Icon name="lucide:refresh-cw" class="h-4 w-4" />
            Refresh List
          </Button>
        </div>
      </div>

      <!-- Server Grid -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <Card v-for="server in servers" :key="server.id"
          class="group relative overflow-hidden border-neutral-6 bg-neutral-1 hover:bg-neutral-2 hover:border-neutral-7 transition-all duration-200 hover:shadow-lg hover:shadow-neutral-12/5">
          <CardContent class="p-6">
            <div class="flex flex-col items-center space-y-4">
              <!-- Server Avatar -->
              <div class="relative">
                <Avatar class="w-16 h-16 ring-2 ring-neutral-6 group-hover:ring-neutral-7 transition-all duration-200">
                  <AvatarImage :src="server.icon
                      ? `https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png?size=128`
                      : server.name
                    " :alt="server.name" class="object-cover" />
                  <AvatarFallback
                    class="bg-gradient-to-br from-neutral-5 to-neutral-6 text-neutral-12 text-lg font-semibold">
                    {{ server.name.charAt(0).toUpperCase() }}
                  </AvatarFallback>
                </Avatar>
              </div>

              <!-- Server Info -->
              <div class="flex-1 min-w-0 w-full text-center space-y-2">
                <h3 class="text-neutral-12 font-semibold text-base leading-tight truncate" :title="server.name">
                  {{ server.name }}
                </h3>
                <p class="text-neutral-11 text-xs font-mono bg-neutral-3 px-2 py-1 rounded-md inline-block">
                  {{ server.id }}
                </p>
              </div>

              <!-- Action Button -->
              <NuxtLink :to="`/app/server/${server.id}`" class="w-full">
                <Button
                  class="w-full group-hover:bg-neutral-12 group-hover:text-neutral-1 transition-all duration-200 gap-2 shadow-sm"
                  size="sm">
                  <Icon name="lucide:settings" class="h-4 w-4" />
                  Configure Server
                  <Icon name="lucide:arrow-right"
                    class="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                </Button>
              </NuxtLink>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Server Count -->
      <div v-if="servers.length > 0" class="flex items-center justify-center text-neutral-11 text-sm">
        <Icon name="lucide:server" class="h-4 w-4 mr-2" />
        Managing {{ servers.length }} server{{
          servers.length === 1 ? "" : "s"
        }}
      </div>
    </div>
  </div>
</template>