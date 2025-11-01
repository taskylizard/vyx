<script setup lang="ts">
import { cn } from '@/lib/utils'
import { reactiveOmit } from '@vueuse/core'
import type { ComboboxItemIndicatorProps } from 'reka-ui'
import { ComboboxItemIndicator, useForwardProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

const props = defineProps<
  ComboboxItemIndicatorProps & { class?: HTMLAttributes['class'] }
>()

const delegatedProps = reactiveOmit(props, 'class')

const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <ComboboxItemIndicator
    data-slot="combobox-item-indicator"
    v-bind="forwarded"
    :class="cn('ml-auto', props.class)"
  >
    <slot />
  </ComboboxItemIndicator>
</template>
