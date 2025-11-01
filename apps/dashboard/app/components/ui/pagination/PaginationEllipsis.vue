<script setup lang="ts">
import { cn } from '@/lib/utils'
import { reactiveOmit } from '@vueuse/core'
import { MoreHorizontal } from 'lucide-vue-next'
import type { PaginationEllipsisProps } from 'reka-ui'
import { PaginationEllipsis } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

const props = defineProps<
  PaginationEllipsisProps & { class?: HTMLAttributes['class'] }
>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <PaginationEllipsis
    data-slot="pagination-ellipsis"
    v-bind="delegatedProps"
    :class="cn('flex size-9 items-center justify-center', props.class)"
  >
    <slot>
      <MoreHorizontal class="size-4" />
      <span class="sr-only">More pages</span>
    </slot>
  </PaginationEllipsis>
</template>
