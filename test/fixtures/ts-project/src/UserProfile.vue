<template>
  <div v-if="isVisible">
    <UserAvatar :src="avatarUrl" @click="handleClick" />
    <span>{{ displayName }}</span>
    <el-button v-show="canEdit" @submit="onSubmit">Edit</el-button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import UserAvatar from './UserAvatar.vue';

const isVisible = ref(true);
const canEdit = ref(false);

const displayName = computed(() => 'John');
const avatarUrl = computed(() => '/avatar.png');

function handleClick() {
  console.log('clicked');
}

function onSubmit() {
  console.log('submitted');
}
</script>
