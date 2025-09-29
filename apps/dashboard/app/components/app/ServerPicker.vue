<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { Server } from '~/types/server'

interface Props {
  servers?: Server[]
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  servers: () => [],
  loading: false
})

// Use provided data from layout as fallback
const injectedServers = inject<Ref<Server[]>>('servers', ref([]))
const injectedLoading = inject<Ref<boolean>>('serversLoading', ref(false))
const injectedError = inject<Ref<Error | null>>('serversError', ref(null))
const route = useRoute()
const router = useRouter()

// Use props if provided, otherwise fall back to injected data
const servers = computed<Server[]>(() =>
  props.servers?.length ? props.servers : injectedServers.value
)
const loading = computed<boolean>(() => props.loading || injectedLoading.value)
const error = computed<Error | null>(() => injectedError.value)

const selected = ref<string>('')
let updatingFromRoute = false

const selectedServer = computed<Server | undefined>(() =>
  servers.value.find((s) => s.id === selected.value)
)

const findGuildIdInRoute = (): string => {
  const param = route.params.guildId
  if (Array.isArray(param)) {
    return param[0] || ''
  }
  if (typeof param === 'string' && param.length > 0) {
    return param
  }
  const query = route.query.guildId
  if (Array.isArray(query)) {
    return query[0] || ''
  }
  if (typeof query === 'string') {
    return query
  }
  return ''
}

const syncSelectedWithRoute = () => {
  updatingFromRoute = true
  const guildId = findGuildIdInRoute()
  if (guildId && servers.value.some((server) => server.id === guildId)) {
    selected.value = guildId
  } else if (!selected.value && servers.value.length) {
    selected.value = servers.value[0]?.id || ''
  }
  nextTick(() => {
    updatingFromRoute = false
  })
}

watch(servers, () => {
  syncSelectedWithRoute()
}, { immediate: true })

watch(
  () => route.fullPath,
  () => {
    syncSelectedWithRoute()
  }
)

// Emit selected server changes
const emit = defineEmits<{
  'update:selected': [serverId: string]
  'server-change': [server: Server | undefined]
}>()

const goToServer = (guildId: string) => {
  if (!guildId || import.meta.server || !router) return
  if (
    route.params.guildId === guildId && route.path.startsWith('/app/server/')
  ) {
    router.replace(`/app/server/${guildId}`)
    return
  }
  router.push(`/app/server/${guildId}`)
}

watch(selected, (newSelected, oldSelected) => {
  emit('update:selected', newSelected)
  emit('server-change', selectedServer.value)
  if (updatingFromRoute) return
  if (!newSelected || newSelected === oldSelected) return
  if (
    route.params.guildId === newSelected &&
    route.path.startsWith('/app/server/')
  ) {
    return
  }
  goToServer(newSelected)
})

const getServerIcon = (server: Server): string => {
  return server.icon
    ? `https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png`
    : server.name || ''
}

const truncateServerName = (name: string, maxLength = 20): string => {
  return name.length > maxLength ? name.substring(0, maxLength) + '...' : name
}

const getPlaceholderText = (): string => {
  if (loading.value) return 'Loading servers...'
  if (error.value) return 'Failed to load servers'
  if (!servers.value?.length) return 'No manageable servers found'
  return 'Select a server'
}

const retryLoading = async () => {
  await refreshNuxtData('discord-servers')
}
</script>

<template>
  <div class="*:not-first:mt-2">
    <Select v-model="selected" :disabled="loading || !servers?.length">
      <SelectTrigger
        class="w-full h-auto ps-2 text-left [&>span]:flex [&>span]:items-center [&>span]:gap-2 [&>span_img]:shrink-0"
      >
        <div class="flex items-center gap-3">
          <div
            v-if="loading"
            class="w-8 h-8 rounded-full bg-neutral-5 animate-pulse"
          />
          <Avatar v-else-if="selectedServer" class="w-8 h-8">
            <AvatarImage
              :src="getServerIcon(selectedServer)"
              :alt="selectedServer?.name || ''"
            />
            <AvatarFallback class="bg-neutral-5 text-neutral-12 text-xs">
              {{
                selectedServer?.name?.charAt(0)
                ?.toUpperCase() || '?'
              }}
            </AvatarFallback>
          </Avatar>
          <div v-else class="w-8 h-8 rounded-full bg-neutral-5" />

          <SelectValue class="text-left" :placeholder="getPlaceholderText()">
            <span v-if="selectedServer && !loading">{{
              truncateServerName(selectedServer?.name || '')
            }}</span>
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent
        v-if="!loading && servers?.length"
        class="[&_*[role=option]]:ps-2 [&_*[role=option]]:pe-8 [&_*[role=option]>span]:start-auto [&_*[role=option]>span]:end-2"
      >
        <SelectItem v-for="srv in servers" :key="srv.id" :value="srv.id">
          <div class="flex items-center gap-3">
            <Avatar class="rounded-full">
              <AvatarImage :src="getServerIcon(srv)" :alt="srv?.name || ''" />
              <AvatarFallback class="bg-neutral-5 text-neutral-12 text-xs">
                {{ srv.name?.charAt(0)?.toUpperCase() || '?' }}
              </AvatarFallback>
            </Avatar>
            <span class="font-medium">{{
              truncateServerName(srv?.name || '')
            }}</span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
    <div v-if="error" class="flex items-center gap-2 text-xs text-destructive">
      <span>Unable to load servers</span>
      <Button
        variant="outline"
        size="sm"
        class="h-7 px-2 text-xs"
        :disabled="loading"
        @click="retryLoading"
      >
        Retry
      </Button>
    </div>
  </div>
</template>
