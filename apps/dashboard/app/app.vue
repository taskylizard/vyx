<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'
import { ConfigProvider } from 'reka-ui'
</script>

<template>
  <main>
    <ConfigProvider>
      <NuxtRouteAnnouncer />
      <NuxtLoadingIndicator color="#aec5e8" />
      <NuxtLayout>
        <NuxtPage />
        <Toaster />
      </NuxtLayout>
    </ConfigProvider>
  </main>
</template>
