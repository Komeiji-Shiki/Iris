<template>
  <div ref="containerEl" class="messages">
    <div class="messages-shell">
      <div v-if="messages.length === 0 && !isStreaming" class="welcome">
        <div class="welcome-badge">IrisClaw Workspace</div>
        <h2>把灵感、问题和工具流都放进一个对话里</h2>
        <p>
          支持流式响应、多会话记录与工具调用，适合长时间沉浸式协作。
        </p>

        <div class="welcome-tips">
          <div class="welcome-tip">
            <strong>流式回复</strong>
            <span>边生成边阅读，长输出也能保持顺滑。</span>
          </div>
          <div class="welcome-tip">
            <strong>工具调用</strong>
            <span>把搜索、文件与命令结果折叠进同一条工作流。</span>
          </div>
          <div class="welcome-tip">
            <strong>多会话记录</strong>
            <span>保留上下文脉络，像工作台一样持续推进任务。</span>
          </div>
        </div>
      </div>

      <template v-for="(msg, i) in messages" :key="i">
        <template v-for="(part, j) in msg.parts" :key="`${i}-${j}`">
          <MessageBubble
            v-if="part.type === 'text' && part.text?.trim()"
            :role="msg.role"
            :text="part.text!"
          />
          <ToolBlock
            v-else-if="part.type === 'function_call'"
            type="call"
            :name="part.name!"
            :data="part.args"
          />
          <ToolBlock
            v-else-if="part.type === 'function_response'"
            type="response"
            :name="part.name!"
            :data="part.response"
          />
        </template>
      </template>

      <MessageBubble
        v-if="isStreaming && streamingText"
        role="model"
        :text="streamingText"
        :streaming="true"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { Message } from '../api/types'
import MessageBubble from './MessageBubble.vue'
import ToolBlock from './ToolBlock.vue'

const props = defineProps<{
  messages: Message[]
  streamingText: string
  isStreaming: boolean
}>()

const containerEl = ref<HTMLElement>()

function scrollToBottom() {
  nextTick(() => {
    if (containerEl.value) {
      containerEl.value.scrollTop = containerEl.value.scrollHeight
    }
  })
}

watch(() => props.messages.length, scrollToBottom)
watch(() => props.streamingText, scrollToBottom)
</script>
