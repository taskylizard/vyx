/**
 * Unsaved changes warning composable
 * Required by AGENTS.md: "MUST: Warn on unsaved changes before navigation"
 */
export function useUnsavedChanges(hasChanges: Ref<boolean>) {
  const { $router: _router } = useNuxtApp()
  let isNavigatingAway = false

  const warnBeforeUnload = (event: BeforeUnloadEvent) => {
    if (hasChanges.value && !isNavigatingAway) {
      event.preventDefault()
      // Modern browsers ignore custom messages, but still show the warning
      event.returnValue =
        'You have unsaved changes. Are you sure you want to leave?'
      return event.returnValue
    }
  }

  const warnBeforeRouteChange = () => {
    if (hasChanges.value) {
      const shouldLeave = confirm(
        'You have unsaved changes. Are you sure you want to leave?'
      )
      if (shouldLeave) {
        isNavigatingAway = true
        return true
      }
      return false
    }
    return true
  }

  // Set up browser beforeunload warning
  onMounted(() => {
    window.addEventListener('beforeunload', warnBeforeUnload)
  })

  // Clean up
  onUnmounted(() => {
    window.removeEventListener('beforeunload', warnBeforeUnload)
  })

  // For programmatic navigation
  const navigateWithConfirm = (to: string) => {
    if (warnBeforeRouteChange()) {
      return navigateTo(to)
    }
  }

  return {
    navigateWithConfirm,
    warnBeforeRouteChange
  }
}
