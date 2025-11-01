<script setup lang="ts">
import { cn } from '@/lib/utils'
import { Loader2Icon } from 'lucide-vue-next'
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <Loader2Icon
    role="status"
    aria-label="Loading"
    :class="cn('size-4 animate-spin', props.class)"
  />
</template>
