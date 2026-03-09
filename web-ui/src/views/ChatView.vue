<template>
  <main class="chat-area">
    <section class="chat-frame">
      <header class="chat-topbar">
        <div class="chat-topbar-main">
          <span class="chat-kicker">IrisClaw Assistant</span>
          <h2>沉浸式对话工作台</h2>
        </div>
        <p class="chat-topbar-note">支持流式回复、多会话记录与工具调用</p>
      </header>

      <MessageList
        :messages="messages"
        :streaming-text="streamingText"
        :is-streaming="isStreaming"
      />
      <ChatInput :disabled="sending" @send="sendMessage" />
    </section>
  </main>
</template>

<script setup lang="ts">
import { useChat } from '../composables/useChat'
import MessageList from '../components/MessageList.vue'
import ChatInput from '../components/ChatInput.vue'

const { messages, sending, streamingText, isStreaming, sendMessage } = useChat()
</script>
