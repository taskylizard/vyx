<script setup lang="ts">
import { toast } from 'vue-sonner'

definePageMeta({
  layout: 'dashboard',
  middleware: 'auth'
})

const route = useRoute()
const guildId = route.params.guildId as string

// Error handling for forms
const { formRef, addError, clearErrors, focusFirstError, hasError, getError } =
  useFormErrorHandling()

interface GuildConfig {
  data: {
    modules: string[]
    reportsChannel: string | null
    currency: string
    logsEnabled: boolean
    logsChannel: string | null
    logModerationActions: boolean
    logMessageEdits: boolean
    logMessageDeletes: boolean
  }
}

interface Guild {
  guild: {
    id: string
    name: string
    icon: string | null
  }
}

interface Channel {
  id: string
  name: string
  type: number
}

interface ChannelsResponse {
  data: Channel[]
}

interface AutomodRule {
  id: number
  guildId: string
  type: 'WORD' | 'REGEX'
  pattern: string
  enabled: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface AutomodRulesResponse {
  data: AutomodRule[]
}

const { data: guild, error: guildError } = await useAsyncData<Guild>(
  `guild-${guildId}`,
  () => $fetch<Guild>(`/api/bot/guilds/${guildId}`)
)

const {
  data: config,
  pending,
  error,
  refresh
} = await useAsyncData<GuildConfig>(
  `guild-config-${guildId}`,
  () => $fetch<GuildConfig>(`/api/bot/guilds/${guildId}/config`)
)

const { data: channels, pending: channelsPending } = await useAsyncData<
  ChannelsResponse
>(
  `guild-channels-${guildId}`,
  () => $fetch<ChannelsResponse>(`/api/bot/guilds/${guildId}/channels`)
)

const {
  data: automodRules,
  pending: automodPending,
  error: automodError,
  refresh: refreshAutomod
} = await useAsyncData<AutomodRulesResponse>(
  `guild-automod-${guildId}`,
  () => $fetch<AutomodRulesResponse>(`/api/bot/guilds/${guildId}/automod`)
)

if (guildError.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Guild not found'
  })
}

const moduleChoices = [
  { name: '📮 Report', value: 'REPORT' },
  { name: '🍣 Economy', value: 'ECONOMY' },
  { name: '🔨 Moderation', value: 'MODERATION' }
]

const settingsTabs = [
  { value: 'modules', label: 'Modules', icon: 'lucide:square-stack' },
  {
    value: 'moderation',
    label: 'Moderation',
    icon: 'lucide:shield',
    module: 'MODERATION'
  },
  {
    value: 'reports',
    label: 'Reports',
    icon: 'lucide:inbox',
    module: 'REPORT'
  },
  {
    value: 'economy',
    label: 'Economy',
    icon: 'lucide:wallet',
    module: 'ECONOMY'
  }
]

const activeTab = ref('modules')

const automodTypeOptions = [
  {
    label: 'Word',
    value: 'WORD',
    description: 'Match whole words exactly'
  },
  {
    label: 'Regex',
    value: 'REGEX',
    description: 'Use regular expressions'
  }
]

const enabledModules = computed(() => config.value?.data?.modules || [])
const reportsChannel = ref(config.value?.data?.reportsChannel || null)
const originalReportsChannel = ref(config.value?.data?.reportsChannel || null)
const currency = ref(config.value?.data?.currency || '🍣')
const originalCurrency = ref(config.value?.data?.currency || '🍣')

const mobileCardClass =
  'bg-transparent border-transparent shadow-none py-0 md:bg-card md:border md:border-neutral-6 md:shadow-sm md:py-6'
const mobileCardHeaderClass = 'px-3 py-2 md:px-6 md:py-4'
const mobileCardContentClass = 'px-3 py-2 md:px-6 md:py-4'

// Logging configuration
const logsChannel = ref(config.value?.data?.logsChannel || null)
const originalLogsChannel = ref(config.value?.data?.logsChannel || null)
const logModerationActions = ref(
  config.value?.data?.logModerationActions || false
)
const originalLogModerationActions = ref(
  config.value?.data?.logModerationActions || false
)
const logMessageEdits = ref(config.value?.data?.logMessageEdits || false)
const originalLogMessageEdits = ref(
  config.value?.data?.logMessageEdits || false
)
const logMessageDeletes = ref(config.value?.data?.logMessageDeletes || false)
const originalLogMessageDeletes = ref(
  config.value?.data?.logMessageDeletes || false
)

// Track unsaved changes
const hasUnsavedReportsChanges = computed(
  () => reportsChannel.value !== originalReportsChannel.value
)
const hasUnsavedCurrencyChanges = computed(
  () => currency.value !== originalCurrency.value
)
const hasUnsavedLoggingChanges = computed(
  () =>
    logsChannel.value !== originalLogsChannel.value ||
    logModerationActions.value !== originalLogModerationActions.value ||
    logMessageEdits.value !== originalLogMessageEdits.value ||
    logMessageDeletes.value !== originalLogMessageDeletes.value
)

// Unsaved changes warning
const hasAnyUnsavedChanges = computed(
  () =>
    hasUnsavedReportsChanges.value ||
    hasUnsavedCurrencyChanges.value ||
    hasUnsavedLoggingChanges.value
)
const { navigateWithConfirm } = useUnsavedChanges(hasAnyUnsavedChanges)

const moduleMutation = ref<string | null>(null)
const reportsSaving = ref(false)
const currencySaving = ref(false)
const loggingSaving = ref(false)
const showModerationChannelDialog = ref(false)
const pendingModerationChannel = ref<string | null>(null)

const newRuleType = ref<'WORD' | 'REGEX'>('WORD')
const newRulePattern = ref('')
const newRulePatternTrimmed = computed(() => newRulePattern.value.trim())
const automodCreating = ref(false)
const automodMutationId = ref<number | null>(null)
const automodRulesList = computed(() => automodRules.value?.data || [])
const isModerationEnabled = computed(() =>
  enabledModules.value.includes('MODERATION')
)

const configInitialLoading = computed(() => pending.value && !config.value)

const channelsInitialLoading = computed(
  () => channelsPending.value && !channels.value
)

const recentServersCookie = useCookie<Record<string, string>>(
  'vyx-recent-servers',
  {
    default: () => ({}),
    sameSite: 'lax'
  }
)

onMounted(() => {
  if (import.meta.client) {
    recentServersCookie.value = {
      ...recentServersCookie.value,
      [guildId]: new Date().toISOString()
    }
  }
})

async function toggleModule(
  moduleValue: string,
  enabled: boolean,
  channelId?: string
) {
  moduleMutation.value = moduleValue
  try {
    const body: any = {
      action: 'toggle_module',
      module: moduleValue,
      enabled
    }

    // Add channelId for MODERATION module when enabling
    if (moduleValue === 'MODERATION' && enabled && channelId) {
      body.channelId = channelId
    }

    await $fetch(`/api/bot/guilds/${guildId}/config`, {
      method: 'PUT',
      body
    })

    // Refresh the config data to get updated modules
    await refresh()
    toast('Module updated', {
      description: `${
        moduleChoices.find((m) => m.value === moduleValue)?.name
      } has been ${enabled ? 'enabled' : 'disabled'}`
    })
  } catch (error) {
    console.error('Failed to toggle module:', error)
    toast('Failed to update module', {
      description: 'Please try again'
    })
  } finally {
    moduleMutation.value = null
  }
}

function handleModerationToggle(enabled: boolean) {
  if (enabled) {
    // Show dialog to select channel
    showModerationChannelDialog.value = true
  } else {
    // Disable directly
    toggleModule('MODERATION', false)
  }
}

function confirmModerationChannel() {
  if (pendingModerationChannel.value) {
    toggleModule('MODERATION', true, pendingModerationChannel.value)
    showModerationChannelDialog.value = false
    pendingModerationChannel.value = null
  }
}

async function saveReportsChannel() {
  reportsSaving.value = true
  try {
    await $fetch(`/api/bot/guilds/${guildId}/config`, {
      method: 'PUT',
      body: {
        action: 'update_reports_channel',
        channelId: reportsChannel.value
      }
    })
    originalReportsChannel.value = reportsChannel.value
    toast('Reports channel updated', {
      description: reportsChannel.value
        ? `Reports will now be sent to #${
          textChannels.value.find(
            (c: Channel) => c.id === reportsChannel.value
          )?.name || 'selected channel'
        }`
        : 'Reporting has been disabled'
    })
  } catch (error) {
    console.error('Failed to update reports channel:', error)
    toast('Failed to update reports channel', {
      description: 'Please try again'
    })
  } finally {
    reportsSaving.value = false
  }
}

async function saveCurrency() {
  currencySaving.value = true
  try {
    await $fetch(`/api/bot/guilds/${guildId}/config`, {
      method: 'PUT',
      body: {
        action: 'update_currency',
        currency: currency.value
      }
    })
    originalCurrency.value = currency.value
    toast('Currency updated', {
      description: `Server currency is now ${currency.value}`
    })
  } catch (error) {
    console.error('Failed to update currency:', error)
    toast('Failed to update currency', {
      description: 'Please try again'
    })
  } finally {
    currencySaving.value = false
  }
}

async function saveLoggingSettings() {
  loggingSaving.value = true
  try {
    await $fetch(`/api/bot/guilds/${guildId}/config`, {
      method: 'PUT',
      body: {
        action: 'update_logging',
        logsChannel: logsChannel.value,
        logModerationActions: logModerationActions.value,
        logMessageEdits: logMessageEdits.value,
        logMessageDeletes: logMessageDeletes.value
      }
    })

    // Update original values
    originalLogsChannel.value = logsChannel.value
    originalLogModerationActions.value = logModerationActions.value
    originalLogMessageEdits.value = logMessageEdits.value
    originalLogMessageDeletes.value = logMessageDeletes.value

    toast('Logging settings updated', {
      description: 'Your logging configuration has been saved'
    })
  } catch (error) {
    console.error('Failed to update logging settings:', error)
    toast('Failed to update logging settings', {
      description: 'Please try again'
    })
  } finally {
    loggingSaving.value = false
  }
}

function getRuleTypeLabel(type: 'WORD' | 'REGEX'): string {
  return type === 'WORD' ? 'Word' : 'Regex'
}

function extractErrorMessage(error: unknown): string {
  const maybe = error as {
    data?: { statusMessage?: string }
    statusMessage?: string
  }
  if (maybe?.data?.statusMessage) {
    return maybe.data.statusMessage
  }
  if (maybe?.statusMessage) {
    return maybe.statusMessage
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Please try again'
}

async function createAutomodRule() {
  const pattern = newRulePatternTrimmed.value
  if (!pattern) {
    addError('automod-pattern', 'Pattern is required')
    focusFirstError()
    toast('Pattern required', {
      description: 'Enter a word or regex to block'
    })
    return
  }

  clearErrors()
  automodCreating.value = true
  try {
    await $fetch(`/api/bot/guilds/${guildId}/automod`, {
      method: 'POST',
      body: {
        type: newRuleType.value,
        pattern
      }
    })
    newRulePattern.value = ''
    toast('Automod rule added', {
      description: `Blocking ${getRuleTypeLabel(newRuleType.value)} rule`
    })
  } catch (error) {
    console.error('Failed to create automod rule:', error)
    addError('automod-pattern', extractErrorMessage(error))
    focusFirstError()
    toast('Failed to add rule', {
      description: extractErrorMessage(error)
    })
  } finally {
    automodCreating.value = false
    if (isModerationEnabled.value) {
      await refreshAutomod()
    }
  }
}

async function updateAutomodRule(ruleId: number, enabled: boolean) {
  automodMutationId.value = ruleId
  try {
    await $fetch(`/api/bot/guilds/${guildId}/automod/${ruleId}`, {
      method: 'PUT',
      body: {
        enabled
      }
    })
    toast('Automod rule updated', {
      description: `Rule #${ruleId} is now ${enabled ? 'enabled' : 'disabled'}`
    })
  } catch (error) {
    console.error('Failed to update automod rule:', error)
    toast('Failed to update rule', {
      description: extractErrorMessage(error)
    })
  } finally {
    automodMutationId.value = null
    if (isModerationEnabled.value) {
      await refreshAutomod()
    }
  }
}

async function deleteAutomodRule(ruleId: number) {
  automodMutationId.value = ruleId
  try {
    await $fetch(`/api/bot/guilds/${guildId}/automod/${ruleId}`, {
      method: 'DELETE'
    })
    toast('Automod rule removed', {
      description: `Removed rule #${ruleId}`
    })
  } catch (error) {
    console.error('Failed to delete automod rule:', error)
    toast('Failed to remove rule', {
      description: extractErrorMessage(error)
    })
  } finally {
    automodMutationId.value = null
    if (isModerationEnabled.value) {
      await refreshAutomod()
    }
  }
}

watch(isModerationEnabled, (enabledNow, wasEnabled) => {
  if (enabledNow && !wasEnabled) {
    refreshAutomod().catch((error) => {
      console.error('Failed to refresh automod rules:', error)
    })
  }
})

const textChannels = computed(
  () => channels.value?.data?.filter((c: Channel) => c.type === 0) || []
)

useSeoMeta({
  title: `${guild.value?.guild.name} - Server Configuration`
})
</script>

<template>
  <div class="container mx-auto p-6 space-y-6">
    <div class="flex items-center gap-4">
      <img
        v-if="guild?.guild?.icon"
        :src="`https://cdn.discordapp.com/icons/${guild.guild.id}/${guild.guild.icon}.png`"
        :alt="guild.guild.name"
        class="w-12 h-12 rounded-full"
      />
      <div
        v-else
        class="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white font-bold"
      >
        {{ guild?.guild?.name?.charAt(0).toUpperCase() }}
      </div>
      <div>
        <h1 class="text-3xl font-bold">{{ guild?.guild?.name }}</h1>
        <p class="text-muted-foreground">Server Configuration</p>
      </div>
    </div>

    <div v-if="configInitialLoading" class="space-y-4">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
        <Skeleton class="h-4 w-32" />
        <Skeleton class="h-10 w-full rounded-md md:max-w-sm lg:max-w-md" />
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <Skeleton class="h-48 rounded-lg" />
        <Skeleton class="h-48 rounded-lg" />
      </div>
    </div>

    <Tabs
      v-else
      :value="activeTab"
      @update:value="activeTab = $event"
      class="gap-6 md:grid md:grid-cols-[260px_minmax(0,1fr)] md:items-start md:gap-6"
    >
      <TabsList
        class="flex h-auto w-full flex-col gap-3 rounded-xl border border-neutral-6/60 bg-neutral-2/70 p-3 md:gap-2 md:overflow-visible md:p-4"
      >
        <TabsTrigger
          v-for="tab in settingsTabs"
          :key="tab.value"
          :value="tab.value"
          class="flex h-auto w-full flex-none items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium text-neutral-11 transition-colors data-[state=active]:bg-neutral-1 data-[state=active]:text-neutral-12 data-[state=active]:shadow-sm md:justify-start md:px-4 md:text-left"
        >
          <Icon :name="tab.icon" class="h-4 w-4" />
          <span>{{ tab.label }}</span>
          <span
            v-if="tab.module"
            class="ml-auto text-xs font-medium"
            :class="enabledModules.includes(tab.module)
            ? 'text-emerald-500'
            : 'text-neutral-9'"
          >
            {{
              enabledModules.includes(tab.module)
              ? 'Enabled'
              : 'Disabled'
            }}
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="modules" class="m-0">
        <Card :class="mobileCardClass">
          <CardHeader :class="mobileCardHeaderClass">
            <CardTitle>Modules</CardTitle>
            <CardDescription>
              Enable or disable bot modules for this server
            </CardDescription>
          </CardHeader>
          <CardContent :class="[mobileCardContentClass, 'space-y-4']">
            <div class="space-y-2">
              <div
                v-for="module in moduleChoices"
                :key="module.value"
                class="flex items-center justify-between py-2"
              >
                <div class="flex-1 min-w-0 pr-3">
                  <div class="text-sm font-medium">{{ module.name }}</div>
                  <div class="text-xs text-muted-foreground truncate">
                    <span v-if="module.value === 'REPORT'"
                    >User reports to moderators</span>
                    <span v-else-if="module.value === 'ECONOMY'"
                    >Virtual currency & shop</span>
                    <span v-else-if="module.value === 'MODERATION'"
                    >Moderation & logging</span>
                  </div>
                </div>
                <Switch
                  :checked="enabledModules.includes(module.value)"
                  :disabled="moduleMutation === module.value"
                  @click="() => {
                    const newState = !enabledModules.includes(
                      module.value
                    )
                    if (module.value === 'MODERATION') {
                      handleModerationToggle(newState)
                    } else {
                      toggleModule(module.value, newState)
                    }
                  }"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="moderation" class="m-0 space-y-6">
        <Card
          v-if="enabledModules.includes('MODERATION')"
          :class="mobileCardClass"
        >
          <CardHeader :class="mobileCardHeaderClass">
            <CardTitle>Moderation Configuration</CardTitle>
            <CardDescription>
              Configure moderation settings and logging
            </CardDescription>
          </CardHeader>
          <CardContent :class="[mobileCardContentClass, 'space-y-6']">
            <details open class="space-y-3">
              <summary class="cursor-pointer text-sm font-medium text-neutral-11 hover:text-neutral-12 transition-colors">
                <span class="inline-flex items-center gap-2">
                  <Icon
                    name="lucide:chevron-right"
                    class="h-3 w-3 chevron-icon"
                  />
                  Logging Settings
                </span>
              </summary>
              <div class="pl-1 space-y-3">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Label for="logs-channel" class="text-sm font-medium"
                  >Logs Channel</Label>
                  <div v-if="channelsInitialLoading" class="flex gap-2">
                    <Skeleton class="h-9 w-48 rounded-md" />
                    <Skeleton class="h-9 w-20 rounded-md" />
                  </div>
                  <div v-else class="flex gap-2">
                    <Select
                      v-model="logsChannel"
                      :disabled="loggingSaving"
                      class="w-48"
                    >
                      <SelectTrigger class="h-9">
                        <SelectValue placeholder="Select channel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="channel in textChannels"
                          :key="channel.id"
                          :value="channel.id"
                        >
                          # {{ channel.name }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      class="gap-1 px-2"
                      :disabled="loggingSaving"
                      @click="() => {
                        logsChannel = null
                        logModerationActions = false
                        logMessageEdits = false
                        logMessageDeletes = false
                      }"
                    >
                      <Icon name="lucide:shield-off" class="h-3 w-3" />
                      <span class="hidden sm:inline">Disable</span>
                    </Button>
                  </div>
                </div>

                <div class="space-y-2">
                  <div class="flex items-center justify-between py-1">
                    <div class="flex-1 min-w-0 pr-3">
                      <Label class="text-sm font-medium"
                      >Moderation Actions</Label>
                      <p class="text-xs text-muted-foreground">
                        Log bans, kicks, timeouts
                      </p>
                    </div>
                    <Switch
                      v-model="logModerationActions"
                      :disabled="loggingSaving || !logsChannel ||
                      channelsInitialLoading"
                    />
                  </div>

                  <div class="flex items-center justify-between py-1">
                    <div class="flex-1 min-w-0 pr-3">
                      <Label class="text-sm font-medium">Message Edits</Label>
                      <p class="text-xs text-muted-foreground">
                        Log message edits
                      </p>
                    </div>
                    <Switch
                      v-model="logMessageEdits"
                      :disabled="loggingSaving || !logsChannel ||
                      channelsInitialLoading"
                    />
                  </div>

                  <div class="flex items-center justify-between py-1">
                    <div class="flex-1 min-w-0 pr-3">
                      <Label class="text-sm font-medium">Message Deletes</Label>
                      <p class="text-xs text-muted-foreground">
                        Log message deletions
                      </p>
                    </div>
                    <Switch
                      v-model="logMessageDeletes"
                      :disabled="loggingSaving || !logsChannel ||
                      channelsInitialLoading"
                    />
                  </div>
                </div>

                <div class="flex justify-end">
                  <Button
                    @click="saveLoggingSettings"
                    :disabled="loggingSaving ||
                    !hasUnsavedLoggingChanges"
                    size="sm"
                  >
                    <Icon
                      v-if="loggingSaving"
                      name="lucide:loader-2"
                      class="h-4 w-4 animate-spin"
                    />
                    <Icon v-else name="lucide:save" class="h-4 w-4" />
                    Save
                  </Button>
                </div>
              </div>
            </details>

            <Separator />

            <details open class="space-y-3">
              <summary class="cursor-pointer text-sm font-medium text-neutral-11 hover:text-neutral-12 transition-colors">
                <span class="inline-flex items-center gap-2">
                  <Icon
                    name="lucide:chevron-right"
                    class="h-3 w-3 chevron-icon"
                  />
                  Automod Rules
                </span>
              </summary>
              <div class="pl-1">
                <p class="text-xs text-muted-foreground mb-3">
                  Block messages matching words or patterns
                </p>

                <div class="flex flex-col gap-2 md:flex-row md:items-end">
                  <div class="w-full md:w-28">
                    <Select
                      v-model="newRuleType"
                      :disabled="automodCreating"
                      id="automod-type"
                    >
                      <SelectTrigger class="h-9">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="option in automodTypeOptions"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div class="flex-1">
                    <Input
                      id="automod-pattern"
                      v-model="newRulePattern"
                      :disabled="automodCreating"
                      placeholder="word or pattern to block…"
                      autocomplete="off"
                      :spellcheck="false"
                      :aria-invalid="hasError('automod-pattern')
                      ? 'true'
                      : 'false'"
                      :aria-describedby="hasError('automod-pattern')
                      ? 'automod-pattern-error'
                      : undefined"
                      @keyup.enter="createAutomodRule"
                      class="h-9"
                    />
                    <p
                      v-if="hasError('automod-pattern')"
                      id="automod-pattern-error"
                      class="mt-1 text-xs text-destructive"
                      role="alert"
                    >
                      {{ getError('automod-pattern') }}
                    </p>
                  </div>

                  <Button
                    class="md:self-start"
                    @click="createAutomodRule"
                    :disabled="automodCreating ||
                    !newRulePatternTrimmed ||
                    automodPending"
                    size="sm"
                  >
                    <Icon name="lucide:plus" class="h-4 w-4" />
                    Add
                  </Button>
                </div>

                <div class="space-y-3">
                  <div
                    v-if="automodPending &&
                    !automodRulesList.length"
                    class="space-y-2"
                  >
                    <Skeleton class="h-16 w-full rounded-md" />
                    <Skeleton class="h-16 w-full rounded-md" />
                  </div>

                  <Alert v-else-if="automodError" variant="destructive">
                    <Icon name="lucide:alert-circle" size="1.25rem" />
                    <AlertTitle>Automod unavailable</AlertTitle>
                    <AlertDescription>
                      Failed to load automod rules. Try refreshing the page.
                    </AlertDescription>
                  </Alert>

                  <p
                    v-else-if="!automodRulesList.length"
                    class="text-sm text-muted-foreground"
                  >
                    No automod rules yet. Add your first rule to start blocking
                    messages.
                  </p>

                  <div v-else class="space-y-3">
                    <div
                      v-for="rule in automodRulesList"
                      :key="rule.id"
                      class="border border-border rounded-lg p-3 flex items-center justify-between"
                      :class="{ 'opacity-60': !rule.enabled }"
                    >
                      <div class="min-w-0 flex-1 pr-3">
                        <div class="flex items-center gap-2 text-xs font-medium mb-1">
                          <span>#{{ rule.id }}</span>
                          <span
                            class="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wide"
                          >
                            {{
                              getRuleTypeLabel(
                                rule.type
                              )
                            }}
                          </span>
                          <span
                            v-if="!rule.enabled"
                            class="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium"
                          >
                            Off
                          </span>
                        </div>
                        <p class="text-sm font-medium break-words line-clamp-2">
                          {{ rule.pattern }}
                        </p>
                      </div>
                      <div class="flex items-center gap-2">
                        <Switch
                          :checked="rule.enabled"
                          :disabled="automodMutationId ===
                            rule.id ||
                          automodPending"
                          @update:checked="(value: boolean) =>
                          updateAutomodRule(
                            rule.id,
                            value
                          )"
                          class="scale-75"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          :disabled="automodMutationId ===
                            rule.id ||
                          automodPending"
                          class="text-destructive hover:text-destructive h-8 w-8"
                          @click="deleteAutomodRule(rule.id)"
                        >
                          <Icon name="lucide:trash" class="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </details>
          </CardContent>
        </Card>
        <Card v-else :class="mobileCardClass">
          <CardHeader :class="mobileCardHeaderClass">
            <CardTitle>Moderation module disabled</CardTitle>
            <CardDescription>
              Enable moderation in the Modules tab to configure logging and
              automod.
            </CardDescription>
          </CardHeader>
          <CardContent
            :class="[
              mobileCardContentClass,
              'flex items-center justify-between gap-3'
            ]"
          >
            <p class="text-sm text-muted-foreground">
              Moderation tools stay hidden until the module is active.
            </p>
            <Button variant="outline" @click="activeTab = 'modules'">
              Review modules
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="reports" class="m-0">
        <Card v-if="enabledModules.includes('REPORT')" :class="mobileCardClass">
          <CardHeader :class="mobileCardHeaderClass">
            <CardTitle>Reports Configuration</CardTitle>
            <CardDescription>
              Configure where user reports are sent
            </CardDescription>
          </CardHeader>
          <CardContent :class="[mobileCardContentClass, 'space-y-4']">
            <div class="space-y-2">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label for="reports-channel" class="text-sm font-medium"
                >Reports Channel</Label>
                <div v-if="channelsInitialLoading" class="flex gap-2">
                  <Skeleton class="h-9 w-48 rounded-md" />
                  <Skeleton class="h-9 w-20 rounded-md" />
                </div>
                <div v-else class="flex gap-2">
                  <Select
                    v-model="reportsChannel"
                    :disabled="reportsSaving"
                    class="w-48"
                  >
                    <SelectTrigger class="h-9">
                      <SelectValue placeholder="Select channel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="channel in textChannels"
                        :key="channel.id"
                        :value="channel.id"
                      >
                        # {{ channel.name }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    class="gap-1 px-2"
                    :disabled="reportsSaving ||
                    channelsInitialLoading"
                    @click="reportsChannel = null"
                  >
                    <Icon name="lucide:ban" class="h-3 w-3" />
                    <span class="hidden sm:inline">Disable</span>
                  </Button>
                </div>
              </div>
              <div class="flex justify-end">
                <Button
                  @click="saveReportsChannel"
                  :disabled="reportsSaving ||
                  !hasUnsavedReportsChanges ||
                  channelsInitialLoading"
                  size="sm"
                >
                  <Icon
                    v-if="reportsSaving"
                    name="lucide:loader-2"
                    class="h-4 w-4 animate-spin"
                  />
                  <Icon v-else name="lucide:save" class="h-4 w-4" />
                  Save
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card v-else :class="mobileCardClass">
          <CardHeader :class="mobileCardHeaderClass">
            <CardTitle>Reports module disabled</CardTitle>
            <CardDescription>
              Enable reporting in the Modules tab to manage escalation
              destinations.
            </CardDescription>
          </CardHeader>
          <CardContent
            :class="[
              mobileCardContentClass,
              'flex items-center justify-between gap-3'
            ]"
          >
            <p class="text-sm text-muted-foreground">
              Keep everything under Modules when deciding who can submit
              reports.
            </p>
            <Button variant="outline" @click="activeTab = 'modules'">
              Review modules
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="economy" class="m-0">
        <Card
          v-if="enabledModules.includes('ECONOMY')"
          :class="mobileCardClass"
        >
          <CardHeader :class="mobileCardHeaderClass">
            <CardTitle>Economy Configuration</CardTitle>
            <CardDescription>
              Configure the virtual economy settings
            </CardDescription>
          </CardHeader>
          <CardContent :class="[mobileCardContentClass, 'space-y-4']">
            <div class="space-y-4">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label for="currency" class="text-sm font-medium"
                >Currency Symbol</Label>
                <div class="flex gap-2">
                  <Input
                    id="currency"
                    v-model="currency"
                    :disabled="currencySaving"
                    placeholder="🍣…"
                    class="w-16 h-9 text-center"
                    maxlength="2"
                    autocomplete="off"
                    :spellcheck="false"
                  />
                  <Button
                    @click="saveCurrency"
                    :disabled="currencySaving ||
                    !hasUnsavedCurrencyChanges"
                    size="sm"
                  >
                    <Icon
                      v-if="currencySaving"
                      name="lucide:loader-2"
                      class="h-4 w-4 animate-spin"
                    />
                    <Icon v-else name="lucide:save" class="h-4 w-4" />
                    Save
                  </Button>
                </div>
              </div>

              <div class="space-y-2">
                <Label>Shop Management</Label>
                <div class="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Icon name="lucide:plus" size="1.25rem" />
                    Create item
                  </Button>
                  <Button variant="outline" size="sm">
                    <Icon name="lucide:list" size="1.25rem" />
                    View items
                  </Button>
                </div>
                <p class="text-sm text-muted-foreground">
                  Manage shop items that users can purchase with server
                  currency.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card v-else :class="mobileCardClass">
          <CardHeader :class="mobileCardHeaderClass">
            <CardTitle>Economy module disabled</CardTitle>
            <CardDescription>
              Activate the economy module from Modules to customise currency and
              shop items.
            </CardDescription>
          </CardHeader>
          <CardContent
            :class="[
              mobileCardContentClass,
              'flex items-center justify-between gap-3'
            ]"
          >
            <p class="text-sm text-muted-foreground">
              Turning the module on unlocks currency and shop controls here.
            </p>
            <Button variant="outline" @click="activeTab = 'modules'">
              Review modules
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <Card v-if="error" :class="[mobileCardClass, 'mt-6']">
      <CardContent :class="[mobileCardContentClass, 'pt-6']">
        <Alert variant="destructive">
          <Icon name="lucide:alert-circle" size="1.25rem" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load server configuration. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>

    <!-- Moderation Channel Selection Dialog -->
    <Dialog v-model:open="showModerationChannelDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Logging Channel</DialogTitle>
          <DialogDescription>
            Choose a channel where moderation actions and logs will be sent.
            This is required to enable the moderation module.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 py-4">
          <div class="space-y-2">
            <Label for="moderation-channel">Logging Channel</Label>
            <Select
              v-model="pendingModerationChannel"
              id="moderation-channel"
              :disabled="moduleMutation === 'MODERATION'"
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="channel in textChannels"
                  :key="channel.id"
                  :value="channel.id"
                >
                  # {{ channel.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p class="text-sm text-muted-foreground">
              This channel will receive moderation logs including bans, kicks,
              timeouts, and message edits/deletes.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            @click="showModerationChannelDialog = false"
          >
            Cancel
          </Button>
          <Button
            @click="confirmModerationChannel"
            :disabled="!pendingModerationChannel ||
            moduleMutation === 'MODERATION'"
          >
            Enable Moderation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
