<script setup lang="ts">
import { toast } from "vue-sonner";

definePageMeta({
  layout: "dashboard",
  middleware: "auth",
});

const route = useRoute();
const guildId = route.params.guildId as string;

interface GuildConfig {
  data: {
    modules: string[];
    reportsChannel: string | null;
    currency: string;
  };
}

interface Guild {
  guild: {
    id: string;
    name: string;
    icon: string | null;
  };
}

interface Channel {
  id: string;
  name: string;
  type: number;
}

interface ChannelsResponse {
  data: Channel[];
}

const { data: guild, error: guildError } = await useAsyncData<Guild>(
  `guild-${guildId}`,
  () => $fetch<Guild>(`/api/bot/guilds/${guildId}`),
);

const {
  data: config,
  pending,
  error,
  refresh,
} = await useAsyncData<GuildConfig>(`guild-config-${guildId}`, () =>
  $fetch<GuildConfig>(`/api/bot/guilds/${guildId}/config`),
);

const { data: channels } = await useAsyncData<ChannelsResponse>(`guild-channels-${guildId}`, () =>
  $fetch<ChannelsResponse>(`/api/bot/guilds/${guildId}/channels`),
);

if (guildError.value) {
  throw createError({
    statusCode: 404,
    statusMessage: "Guild not found",
  });
}

const moduleChoices = [
  { name: "📮 Report", value: "REPORT" },
  { name: "🍣 Economy", value: "ECONOMY" },
];

const enabledModules = computed(() => config.value?.data?.modules || []);
const reportsChannel = ref(config.value?.data?.reportsChannel || null);
const originalReportsChannel = ref(config.value?.data?.reportsChannel || null);
const currency = ref(config.value?.data?.currency || "🍣");
const originalCurrency = ref(config.value?.data?.currency || "🍣");

// Track unsaved changes
const hasUnsavedReportsChanges = computed(
  () => reportsChannel.value !== originalReportsChannel.value,
);
const hasUnsavedCurrencyChanges = computed(
  () => currency.value !== originalCurrency.value,
);

const isLoading = ref(false);

async function toggleModule(moduleValue: string, enabled: boolean) {
  isLoading.value = true;
  try {
    await $fetch(`/api/bot/guilds/${guildId}/config`, {
      method: "PUT",
      body: {
        action: "toggle_module",
        module: moduleValue,
        enabled,
      },
    });

    // Refresh the config data to get updated modules
    await refresh();
    toast("Module updated", {
      description: `${moduleChoices.find((m) => m.value === moduleValue)?.name} has been ${enabled ? "enabled" : "disabled"}`,
    });
  } catch (error) {
    console.error("Failed to toggle module:", error);
    toast("Failed to update module", {
      description: "Please try again",
    });
  } finally {
    isLoading.value = false;
  }
}

async function saveReportsChannel() {
  isLoading.value = true;
  try {
    await $fetch(`/api/bot/guilds/${guildId}/config`, {
      method: "PUT",
      body: {
        action: "update_reports_channel",
        channelId: reportsChannel.value,
      },
    });
    originalReportsChannel.value = reportsChannel.value;
    toast("Reports channel updated", {
      description: reportsChannel.value
        ? `Reports will now be sent to #${textChannels.value.find((c: Channel) => c.id === reportsChannel.value)?.name || "selected channel"}`
        : "Reporting has been disabled",
    });
  } catch (error) {
    console.error("Failed to update reports channel:", error);
    toast("Failed to update reports channel", {
      description: "Please try again",
    });
  } finally {
    isLoading.value = false;
  }
}

async function saveCurrency() {
  isLoading.value = true;
  try {
    await $fetch(`/api/bot/guilds/${guildId}/config`, {
      method: "PUT",
      body: {
        action: "update_currency",
        currency: currency.value,
      },
    });
    originalCurrency.value = currency.value;
    toast("Currency updated", {
      description: `Server currency is now ${currency.value}`,
    });
  } catch (error) {
    console.error("Failed to update currency:", error);
    toast("Failed to update currency", {
      description: "Please try again",
    });
  } finally {
    isLoading.value = false;
  }
}

const textChannels = computed(
  () => channels.value?.data?.filter((c: Channel) => c.type === 0) || [],
);

useSeoMeta({
  title: `${guild.value?.guild.name} - Server Configuration`,
});
</script>

<template>
  <div class="container mx-auto p-6 space-y-6">
    <div class="flex items-center gap-4">
      <img v-if="guild?.guild?.icon" :src="`https://cdn.discordapp.com/icons/${guild.guild.id}/${guild.guild.icon}.png`"
        :alt="guild.guild.name" class="w-12 h-12 rounded-full" />
      <div v-else class="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white font-bold">
        {{ guild?.guild?.name?.charAt(0).toUpperCase() }}
      </div>
      <div>
        <h1 class="text-3xl font-bold">{{ guild?.guild?.name }}</h1>
        <p class="text-muted-foreground">Server Configuration</p>
      </div>
    </div>

    <div class="grid gap-6">
      <!-- Modules Configuration -->
      <Card>
        <CardHeader>
          <CardTitle>Modules</CardTitle>
          <CardDescription>
            Enable or disable bot modules for this server
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div v-for="module in moduleChoices" :key="module.value" class="flex items-center justify-between">
            <div class="space-y-0.5">
              <div class="text-base">{{ module.name }}</div>
              <div class="text-sm text-muted-foreground">
                <span v-if="module.value === 'REPORT'">Allow users to report issues to moderators</span>
                <span v-else-if="module.value === 'ECONOMY'">Virtual currency and shop system</span>
              </div>
            </div>
            <Switch :checked="enabledModules.includes(module.value)" :disabled="isLoading" @click="
              () => {
                const newState = !enabledModules.includes(module.value);
                toggleModule(module.value, newState);
              }
            " />
          </div>
        </CardContent>
      </Card>

      <!-- Reports Configuration -->
      <Card v-if="enabledModules.includes('REPORT')">
        <CardHeader>
          <CardTitle>Reports Configuration</CardTitle>
          <CardDescription>
            Configure where user reports are sent
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-2">
            <Label for="reports-channel">Reports Channel</Label>
            <div class="flex gap-2">
              <Select v-model="reportsChannel" :disabled="isLoading" class="flex-1">
                <SelectTrigger>
                  <SelectValue placeholder="Select a channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="null">Disable reporting</SelectItem>
                  <SelectItem v-for="channel in textChannels" :key="channel.id" :value="channel.id">
                    # {{ channel.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button @click="saveReportsChannel" :disabled="isLoading || !hasUnsavedReportsChanges" size="default">
                <Icon name="lucide:save" size="1.25rem" />
                Save
              </Button>
            </div>
            <p class="text-sm text-muted-foreground">
              Choose a channel where reports will be sent, or disable reporting
              entirely.
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- Economy Configuration -->
      <Card v-if="enabledModules.includes('ECONOMY')">
        <CardHeader>
          <CardTitle>Economy Configuration</CardTitle>
          <CardDescription>
            Configure the virtual economy settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-4">
            <div class="space-y-2">
              <Label for="currency">Currency Symbol</Label>
              <div class="flex gap-2">
                <Input id="currency" v-model="currency" :disabled="isLoading" placeholder="🍣" class="w-20"
                  maxlength="2" />
                <Button @click="saveCurrency" :disabled="isLoading || !hasUnsavedCurrencyChanges" size="default">
                  <Icon name="lucide:save" size="1.25rem" />
                  Save
                </Button>
              </div>
              <p class="text-sm text-muted-foreground">
                The emoji or symbol used for your server's currency.
              </p>
            </div>

            <div class="space-y-2">
              <Label>Shop Management</Label>
              <div class="flex gap-2">
                <Button variant="outline" size="sm">
                  <Icon name="lucide:plus" size="1.25rem" />
                  Create Item
                </Button>
                <Button variant="outline" size="sm">
                  <Icon name="lucide:list" size="1.25rem" />
                  View Items
                </Button>
              </div>
              <p class="text-sm text-muted-foreground">
                Manage shop items that users can purchase with server currency.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Status -->
      <Card v-if="error">
        <CardContent class="pt-6">
          <Alert variant="destructive">
            <Icon name="lucide:alert-circle" size="1.25rem" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Failed to load server configuration. Please try refreshing the
              page.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  </div>
</template>