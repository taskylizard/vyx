<script setup lang="ts">
import { cn } from '@/lib/utils'
import { useVModel } from '@vueuse/core'
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
  defaultValue?: string | number
  modelValue?: string | number
  class?: HTMLAttributes['class']
  type?: string
  inputmode?:
    | 'none'
    | 'text'
    | 'decimal'
    | 'numeric'
    | 'tel'
    | 'search'
    | 'email'
    | 'url'
  spellcheck?: boolean
  autocomplete?: string
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', payload: string | number): void
}>()

const modelValue = useVModel(props, 'modelValue', emits, {
  passive: true,
  defaultValue: props.defaultValue
})

// Determine if spellcheck should be disabled for certain input types
const shouldDisableSpellcheck = computed(() => {
  if (props.spellcheck !== undefined) return props.spellcheck

  const type = props.type?.toLowerCase()
  const inputmode = props.inputmode?.toLowerCase()

  // Disable spellcheck for emails, codes, usernames, numbers
  return type === 'email' ||
    type === 'password' ||
    inputmode === 'email' ||
    inputmode === 'numeric' ||
    inputmode === 'decimal' ||
    inputmode === 'tel'
})
</script>

<template>
  <input
    v-model="modelValue"
    data-slot="input"
    :type="type"
    :inputmode="inputmode"
    :spellcheck="shouldDisableSpellcheck ? 'false' : 'true'"
    :autocomplete="autocomplete"
    :class="cn(
      'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-10 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm min-h-[44px] md:min-h-[40px]',
      'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
      'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
      props.class
    )"
  >
</template>
