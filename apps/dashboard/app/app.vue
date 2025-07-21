<script setup lang="ts">
import { ConfigProvider } from "reka-ui";
import { Toaster } from "@/components/ui/sonner";
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