<template>
  <div class="tool-block" :class="[type, { open }]">
    <button
      class="tool-header"
      type="button"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="tool-icon">▶</span>
      <div class="tool-header-main">
        <span class="tool-label">{{ type === 'call' ? '工具调用' : '工具结果' }}</span>
        <strong class="tool-name">{{ name }}</strong>
      </div>
      <span class="tool-state">{{ open ? '收起' : '展开' }}</span>
    </button>
    <div class="tool-body">{{ formatted }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  type: 'call' | 'response'
  name: string
  data: unknown
}>()

const open = ref(false)
const formatted = computed(() => JSON.stringify(props.data ?? null, null, 2))
</script>
