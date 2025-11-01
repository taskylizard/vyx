<script setup lang="ts">
import { cn } from '@/lib/utils'
import { reactiveOmit } from '@vueuse/core'
import type { NavigationMenuListProps } from 'reka-ui'
import { NavigationMenuList, useForwardProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

const props = defineProps<
  NavigationMenuListProps & { class?: HTMLAttributes['class'] }
>()

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <NavigationMenuList
    data-slot="navigation-menu-list"
    v-bind="forwardedProps"
    :class="cn(
      'group flex flex-1 list-none items-center justify-center gap-1',
      props.class
    )"
  >
    <slot />
  </NavigationMenuList>
</template>
