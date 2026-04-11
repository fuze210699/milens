<template>
  <button @click="copy('hello')">Copy</button>
</template>

<script setup>
import { useClipboard } from '@/composables/useClipboard'

const { copy } = useClipboard()
</script>
