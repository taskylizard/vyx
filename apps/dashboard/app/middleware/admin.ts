import { toast } from 'vue-sonner'

export default defineNuxtRouteMiddleware(() => {
  const { loggedIn, user, options } = useAuth()

  if (!loggedIn.value) {
    return navigateTo(options.redirectGuestTo || '/')
  }

  if ((user.value as any)?.role !== 'admin') {
    toast('Error', {
      description: 'You are not authorized to access this page'
    })
    return navigateTo('/app')
  }
})
