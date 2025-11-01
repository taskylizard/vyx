<script lang="ts" setup>
import { cn } from '@/lib/utils'
import { reactiveOmit } from '@vueuse/core'
import type { StepperDescriptionProps } from 'reka-ui'
import { StepperDescription, useForwardProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

const props = defineProps<
  StepperDescriptionProps & { class?: HTMLAttributes['class'] }
>()

const delegatedProps = reactiveOmit(props, 'class')

const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <StepperDescription
    v-slot="slotProps"
    v-bind="forwarded"
    :class="cn('text-xs text-muted-foreground', props.class)"
  >
    <slot v-bind="slotProps" />
  </StepperDescription>
</template>
