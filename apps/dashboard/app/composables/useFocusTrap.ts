/**
 * Focus trap composable for dialogs and modals
 * Implements WAI-ARIA APG focus management patterns
 */
import { type Ref } from 'vue'

interface UseFocusTrapOptions {
  immediate?: boolean
  restoreFocus?: boolean
}

export function useFocusTrap(
  target: Ref<HTMLElement | null>,
  options: UseFocusTrapOptions = {}
) {
  const { immediate = false, restoreFocus = true } = options

  let previouslyFocusedElement: HTMLElement | null = null
  let isActive = false

  const focusableElements = (container: HTMLElement): HTMLElement[] => {
    const selectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]'
    ].join(',')

    return Array.from(container.querySelectorAll(selectors))
      .filter((el): el is HTMLElement =>
        el instanceof HTMLElement &&
        !el.hasAttribute('aria-hidden') &&
        el.offsetParent !== null // visible elements only
      )
  }

  const handleKeydown = (event: KeyboardEvent) => {
    if (!isActive || !target.value || event.key !== 'Tab') return

    const focusableElementsList = focusableElements(target.value)
    if (focusableElementsList.length === 0) return

    const firstElement = focusableElementsList[0]
    const lastElement = focusableElementsList[focusableElementsList.length - 1]

    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }
  }

  const activate = () => {
    if (isActive || !target.value) return

    // Store currently focused element
    if (restoreFocus) {
      previouslyFocusedElement = document.activeElement as HTMLElement
    }

    // Focus the first focusable element in the trap
    const focusableElementsList = focusableElements(target.value)
    if (focusableElementsList.length > 0) {
      focusableElementsList[0].focus()
    }

    // Add event listener
    document.addEventListener('keydown', handleKeydown)
    isActive = true
  }

  const deactivate = () => {
    if (!isActive) return

    // Remove event listener
    document.removeEventListener('keydown', handleKeydown)

    // Restore focus to previously focused element
    if (restoreFocus && previouslyFocusedElement) {
      previouslyFocusedElement.focus()
      previouslyFocusedElement = null
    }

    isActive = false
  }

  // Auto-activate if immediate option is true
  if (immediate) {
    watch(target, (newTarget) => {
      if (newTarget) {
        nextTick(() => activate())
      } else {
        deactivate()
      }
    }, { immediate: true })
  }

  // Cleanup on unmount
  onUnmounted(() => {
    deactivate()
  })

  return {
    activate,
    deactivate,
    isActive: readonly(computed(() => isActive))
  }
}
