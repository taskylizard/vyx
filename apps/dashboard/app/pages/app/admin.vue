<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
  middleware: 'admin'
})

const { user } = useAuth()

interface BotStatus {
  status: string
  username: string
  guilds: number
  uptime: number
}

interface BotStats {
  totalUsers: number
  totalGuilds: number
  memoryUsage: {
    heapUsed: number
  }
  nodeVersion: string
}

interface BotGuild {
  id: string
  name: string
  icon: string | null
  memberCount: number
  ownerId: string
  features: string[]
}

const botStatus = ref<BotStatus | null>(null)
const botStats = ref<BotStats | null>(null)
const botGuilds = ref<BotGuild[]>([])

const botStatusLoading = ref(true)
const botStatsLoading = ref(true)
const botGuildsLoading = ref(true)
const botStatusError = ref<Error | null>(null)
const botStatsError = ref<Error | null>(null)
const botGuildsError = ref<Error | null>(null)

const isRefreshing = computed(
  () =>
    botStatusLoading.value ||
    botStatsLoading.value ||
    botGuildsLoading.value
)

const fetchBotStatus = async () => {
  botStatusLoading.value = true
  botStatusError.value = null
  try {
    botStatus.value = await $fetch<BotStatus>('/api/bot/status')
  } catch (error) {
    botStatusError.value = error as Error
    console.error('Failed to fetch bot status:', error)
  } finally {
    botStatusLoading.value = false
  }
}

const fetchBotStats = async () => {
  botStatsLoading.value = true
  botStatsError.value = null
  try {
    botStats.value = await $fetch<BotStats>('/api/bot/stats')
  } catch (error) {
    botStatsError.value = error as Error
    console.error('Failed to fetch bot stats:', error)
  } finally {
    botStatsLoading.value = false
  }
}

const fetchBotGuilds = async () => {
  botGuildsLoading.value = true
  botGuildsError.value = null
  try {
    const response = await $fetch<{ guilds: BotGuild[] }>('/api/bot/guilds')
    botGuilds.value = response.guilds || []
  } catch (error) {
    botGuildsError.value = error as Error
    console.error('Failed to fetch bot guilds:', error)
  } finally {
    botGuildsLoading.value = false
  }
}

const refreshAdminData = async () => {
  await Promise.all([fetchBotStatus(), fetchBotStats(), fetchBotGuilds()])
}

onMounted(() => {
  refreshAdminData()
})

const topGuilds = computed(() => botGuilds.value.slice(0, 8))

const formatFeature = (feature: string): string =>
  feature.replace(/_/g, ' ').toLowerCase()
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-neutral-12 text-3xl font-bold">Admin</h1>
        <p class="text-neutral-11">Bot administration and statistics</p>
      </div>
      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          class="gap-2"
          :disabled="isRefreshing"
          @click="refreshAdminData"
        >
          <Icon
            v-if="isRefreshing"
            name="lucide:loader-2"
            class="h-4 w-4 animate-spin"
          />
          <Icon v-else name="lucide:refresh-ccw" class="h-4 w-4" />
          Refresh
        </Button>
      </div>
    </div>

    <div class="space-y-6">
      <div class="space-y-2">
        <h2 class="text-neutral-12 text-xl font-semibold">Bot Status</h2>
        <p class="text-neutral-11 text-sm">
          Current status and statistics for the bot
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <div
              class="w-3 h-3 rounded-full"
              :class="botStatus?.status === 'connected'
              ? 'bg-emerald-500'
              : 'bg-red-500'"
            >
            </div>
            Bot Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            v-if="botStatusLoading"
            class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4"
          >
            <Skeleton
              v-for="index in 4"
              :key="`status-skeleton-${index}`"
              class="h-16 rounded-lg"
            />
          </div>
          <div
            v-else-if="botStatus"
            class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4"
          >
            <div>
              <p class="text-sm text-muted-foreground">Username</p>
              <p class="font-medium">
                {{ botStatus.username || 'Unknown' }}
              </p>
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Status</p>
              <p class="font-medium capitalize">
                {{ botStatus.status || 'Unknown' }}
              </p>
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Guilds</p>
              <p class="font-medium">{{ botStatus.guilds || 0 }}</p>
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Uptime</p>
              <p class="font-medium">
                {{
                  Math.floor(
                    (botStatus.uptime || 0) / 1000 / 60
                  )
                }}m
              </p>
            </div>
          </div>
          <Alert v-else-if="botStatusError" variant="destructive">
            <Icon name="lucide:alert-circle" size="1.25rem" />
            <AlertTitle>Status unavailable</AlertTitle>
            <AlertDescription>
              Unable to load bot status. Try refreshing.
            </AlertDescription>
          </Alert>
          <div v-else class="text-muted-foreground text-sm">
            Bot status unavailable
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            v-if="botStatsLoading"
            class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4"
          >
            <Skeleton
              v-for="index in 4"
              :key="`stats-skeleton-${index}`"
              class="h-20 rounded-lg"
            />
          </div>
          <div
            v-else-if="botStats"
            class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4"
          >
            <div>
              <p class="text-sm text-muted-foreground">Total Users</p>
              <p class="font-medium text-xl">
                {{
                  botStats.totalUsers?.toLocaleString() ||
                  '0'
                }}
              </p>
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Total Guilds</p>
              <p class="font-medium text-xl">{{ botStats.totalGuilds || 0 }}</p>
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Memory Usage</p>
              <p class="font-medium text-xl">
                {{
                  Math.round(
                    (botStats.memoryUsage?.heapUsed || 0) /
                      1024 / 1024
                  )
                }}MB
              </p>
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Node Version</p>
              <p class="font-medium">{{ botStats.nodeVersion || 'Unknown' }}</p>
            </div>
          </div>
          <Alert v-else-if="botStatsError" variant="destructive">
            <Icon name="lucide:alert-circle" size="1.25rem" />
            <AlertTitle>Statistics unavailable</AlertTitle>
            <AlertDescription>
              We could not fetch the bot statistics. Try again later.
            </AlertDescription>
          </Alert>
          <div v-else class="text-muted-foreground text-sm">
            Bot statistics unavailable
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Managed Guilds</CardTitle>
          <CardDescription>
            A quick look at where the bot is currently active
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div v-if="botGuildsLoading" class="space-y-3">
            <Skeleton
              v-for="index in 5"
              :key="`guild-skeleton-${index}`"
              class="h-14 rounded-lg"
            />
          </div>
          <Alert v-else-if="botGuildsError" variant="destructive">
            <Icon name="lucide:alert-circle" size="1.25rem" />
            <AlertTitle>Guild list unavailable</AlertTitle>
            <AlertDescription>
              Failed to load guild information. Refresh to try again.
            </AlertDescription>
          </Alert>
          <div v-else-if="topGuilds.length" class="space-y-3">
            <div
              v-for="guild in topGuilds"
              :key="guild.id"
              class="flex items-center justify-between rounded-lg border border-neutral-6 bg-neutral-2 px-3 py-2"
            >
              <div class="flex flex-col">
                <span class="text-sm font-medium text-neutral-12">{{
                  guild.name
                }}</span>
                <span class="text-xs text-neutral-10">
                  {{ guild.memberCount.toLocaleString() }} members · {{
                    guild.features.slice(0, 2).map(
                      formatFeature
                    ).join(', ') || 'no special features'
                  }}
                </span>
              </div>
              <span class="text-xs text-neutral-9">ID {{ guild.id }}</span>
            </div>
            <p class="text-xs text-neutral-9">
              Showing {{ topGuilds.length }} of {{ botGuilds.length }} guilds
              synced from the bot cache.
            </p>
          </div>
          <div v-else class="text-sm text-muted-foreground">
            No guild data available yet.
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
