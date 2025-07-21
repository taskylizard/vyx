<script setup lang="ts">
const colorMode = useColorMode();
const toggleTheme = () => {
  colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
};
</script>

<template>
  <Button variant="ghost" size="icon" @click="toggleTheme"
    :aria-label="`Switch to ${$colorMode.preference === 'dark' ? 'light' : 'dark'} mode`">
    <Icon :name="$colorMode.preference === 'dark' ? 'lucide:sun' : 'lucide:moon'" size="18" />
  </Button>
</template>
