<template>
  <div class="user-card">
    <Avatar :src="user.avatar" />
    <span>{{ user.name }}</span>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from 'vue';
import Avatar from './Avatar.vue';

interface Props {
  user: {
    name: string;
    avatar: string;
  };
}

const props = defineProps<Props>();
</script>
