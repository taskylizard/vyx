<script setup lang="ts">
definePageMeta({
  layout: "dashboard",
  middleware: "admin",
});

const { user } = useAuth();

// Bot data
interface BotStatus {
  status: string;
  username: string;
  guilds: number;
  uptime: number;
}

interface BotStats {
  totalUsers: number;
  totalGuilds: number;
  memoryUsage: {
    heapUsed: number;
  };
  nodeVersion: string;
}

const botStatus = ref<BotStatus | null>(null);
const botStats = ref<BotStats | null>(null);
const botGuilds = ref<any[] | null>(null);

// Fetch bot data on mount
onMounted(async () => {
  try {
    botStatus.value = await $fetch<BotStatus>("/api/bot/status");
  } catch (error) {
    console.error("Failed to fetch bot status:", error);
  }

  try {
    botStats.value = await $fetch<BotStats>("/api/bot/stats");
  } catch (error) {
    console.error("Failed to fetch bot stats:", error);
  }

  try {
    botGuilds.value = await $fetch<any[]>("/api/bot/guilds");
  } catch (error) {
    console.error("Failed to fetch bot guilds:", error);
  }
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-neutral-12 text-3xl font-bold">Admin</h1>
      <p class="text-neutral-11">Bot administration and statistics</p>
    </div>

    <!-- Bot Status Section -->
    <div class="mb-6">
      <h2 class="text-neutral-12 text-xl font-semibold mb-2">Bot Status</h2>
      <p class="text-neutral-11 text-sm mb-4">
        Current status and statistics for the bot
      </p>

      <!-- Bot Status Card -->
      <Card class="mb-4">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full" :class="botStatus?.status === 'connected'
                ? 'bg-green-500'
                : 'bg-red-500'
              "></div>
            Bot Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="botStatus" class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p class="text-sm text-muted-foreground">Username</p>
              <p class="font-medium">
                {{ botStatus.username || "Loading..." }}
              </p>
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Status</p>
              <p class="font-medium capitalize">
                {{ botStatus.status || "Unknown" }}
              </p>
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Guilds</p>
              <p class="font-medium">{{ botStatus.guilds || 0 }}</p>
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Uptime</p>
              <p class="font-medium">
                {{ Math.floor((botStatus.uptime || 0) / 1000 / 60) }}m
              </p>
            </div>
          </div>
          <div v-else class="text-muted-foreground">Bot status unavailable</div>
        </CardContent>
      </Card>

      <!-- Bot Statistics -->
      <Card v-if="botStats" class="mb-4">
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p class="text-sm text-muted-foreground">Total Users</p>
              <p class="font-medium text-xl">
                {{ botStats.totalUsers?.toLocaleString() || "N/A" }}
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
                    (botStats.memoryUsage?.heapUsed || 0) / 1024 / 1024,
                  )
                }}MB
              </p>
            </div>
            <div>
              <p class="text-sm text-muted-foreground">Node Version</p>
              <p class="font-medium">{{ botStats.nodeVersion || "Unknown" }}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>