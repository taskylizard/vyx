<script setup lang="ts">
import { cn } from '@/lib/utils'
import { reactiveOmit } from '@vueuse/core'
import type { ContextMenuSeparatorProps } from 'reka-ui'
import { ContextMenuSeparator } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

const props = defineProps<
  ContextMenuSeparatorProps & { class?: HTMLAttributes['class'] }
>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <ContextMenuSeparator
    data-slot="context-menu-separator"
    v-bind="delegatedProps"
    :class="cn('bg-border -mx-1 my-1 h-px', props.class)"
  />
</template>
