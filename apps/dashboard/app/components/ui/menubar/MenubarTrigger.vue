<script setup lang="ts">
import { cn } from '@/lib/utils'
import { reactiveOmit } from '@vueuse/core'
import type { MenubarTriggerProps } from 'reka-ui'
import { MenubarTrigger, useForwardProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

const props = defineProps<
  MenubarTriggerProps & { class?: HTMLAttributes['class'] }
>()

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <MenubarTrigger
    data-slot="menubar-trigger"
    v-bind="forwardedProps"
    :class="cn(
      'focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex items-center rounded-sm px-2 py-1 text-sm font-medium outline-hidden select-none',
      props.class
    )"
  >
    <slot />
  </MenubarTrigger>
</template>
