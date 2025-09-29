/**
 * Form error handling composable
 * Implements focus management for form validation errors
 */
import type { Ref } from 'vue'

interface FormError {
  field: string
  message: string
  element?: HTMLElement
}

export function useFormErrorHandling() {
  const errors = ref<FormError[]>([])
  const formRef = ref<HTMLFormElement | null>(null)

  /**
   * Add a validation error
   */
  const addError = (field: string, message: string) => {
    const existingIndex = errors.value.findIndex(e => e.field === field)
    if (existingIndex !== -1) {
      errors.value[existingIndex].message = message
    } else {
      errors.value.push({ field, message })
    }
  }

  /**
   * Remove a validation error
   */
  const removeError = (field: string) => {
    const index = errors.value.findIndex(e => e.field === field)
    if (index !== -1) {
      errors.value.splice(index, 1)
    }
  }

  /**
   * Clear all errors
   */
  const clearErrors = () => {
    errors.value = []
  }

  /**
   * Focus the first form field with an error
   * Required by AGENTS.md: "MUST: on submit, focus first error"
   */
  const focusFirstError = () => {
    if (!formRef.value || errors.value.length === 0) return

    const firstError = errors.value[0]
    if (!firstError) return

    const fieldElement = formRef.value.querySelector(
      `[name="${firstError.field}"], #${firstError.field}, [data-field="${firstError.field}"]`
    ) as HTMLElement

    if (fieldElement) {
      fieldElement.focus()
      // Scroll into view if needed
      fieldElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    }
  }

  /**
   * Handle form submission with error focusing
   */
  const handleSubmit = async (
    submitFn: () => Promise<void> | void,
    validateFn?: () => Promise<boolean> | boolean
  ) => {
    try {
      // Clear previous errors
      clearErrors()

      // Validate if validation function provided
      if (validateFn) {
        const isValid = await validateFn()
        if (!isValid) {
          nextTick(() => focusFirstError())
          return false
        }
      }

      // Submit the form
      await submitFn()
      return true
    } catch (error) {
      // Focus first error if submission fails and errors exist
      if (errors.value.length > 0) {
        nextTick(() => focusFirstError())
      }
      throw error
    }
  }

  /**
   * Get error message for a specific field
   */
  const getError = (field: string): string | undefined => {
    return errors.value.find(e => e.field === field)?.message
  }

  /**
   * Check if a field has an error
   */
  const hasError = (field: string): boolean => {
    return errors.value.some(e => e.field === field)
  }

  return {
    errors: readonly(errors),
    formRef,
    addError,
    removeError,
    clearErrors,
    focusFirstError,
    handleSubmit,
    getError,
    hasError
  }
}
