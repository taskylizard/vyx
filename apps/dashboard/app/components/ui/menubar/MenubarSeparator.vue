<script setup lang="ts">
import { cn } from '@/lib/utils'
import { reactiveOmit } from '@vueuse/core'
import type { MenubarSeparatorProps } from 'reka-ui'
import { MenubarSeparator, useForwardProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

const props = defineProps<
  MenubarSeparatorProps & { class?: HTMLAttributes['class'] }
>()

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <MenubarSeparator
    data-slot="menubar-separator"
    :class="cn('bg-border -mx-1 my-1 h-px', props.class)"
    v-bind="forwardedProps"
  />
</template>
