<script setup lang="ts">
import { cn } from '@/lib/utils'
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="item-actions"
    :class="cn('flex items-center gap-2', props.class)"
  >
    <slot />
  </div>
</template>
