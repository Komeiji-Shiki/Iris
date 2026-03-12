<template>
  <div class="input-area">
    <input
      ref="fileInputEl"
      class="sr-only"
      type="file"
      accept="image/*"
      multiple
      :disabled="disabled"
      @change="handleFileSelection"
    />

    <div
      class="input-shell"
      :class="{ 'drag-active': dragActive }"
      @dragenter.prevent="handleDragEnter"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <div class="input-meta">
        <div class="input-title">继续当前工作流</div>
        <div class="input-hint">Enter 发送 · Shift + Enter 换行</div>
      </div>

      <div v-if="images.length > 0" class="image-preview-strip">
        <div
          v-for="(image, index) in images"
          :key="`${image.mimeType}-${index}`"
          class="image-preview-item"
        >
          <img :src="toImageSrc(image)" :alt="`待发送图片 ${index + 1}`" />
          <button
            class="image-preview-remove"
            type="button"
            :disabled="disabled"
            @click="removeImage(index)"
          >
            <AppIcon :name="ICONS.common.close" />
          </button>
        </div>
      </div>

      <div class="input-box">
        <textarea
          ref="inputEl"
          v-model="text"
          placeholder="给 Iris 发送消息..."
          rows="1"
          :disabled="disabled"
          @keydown.enter.exact.prevent="handleSend"
          @input="autoResize"
          @paste="handlePaste"
        ></textarea>

        <div class="input-actions">
          <button
            class="btn-attach"
            type="button"
            :disabled="disabled || images.length >= MAX_IMAGES"
            @click="openFilePicker"
          >
            <AppIcon :name="ICONS.common.attach" class="btn-attach-icon" />
            <span>上传图片</span>
          </button>

          <button
            class="btn-send"
            :disabled="disabled || !canSend"
            @click="handleSend"
          >
            <span class="btn-send-label">{{ disabled ? '生成中...' : '发送' }}</span>
            <AppIcon :name="ICONS.common.send" class="btn-send-icon" />
          </button>
        </div>
      </div>

      <div class="input-upload-hint">
        <span>支持拖拽/粘贴上传 · 最多 {{ MAX_IMAGES }} 张 · 单张不超过 5MB</span>
        <span v-if="errorMessage" class="input-error">{{ errorMessage }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { ImageInput } from '../api/types'
import AppIcon from './AppIcon.vue'
import { ICONS } from '../constants/icons'

const MAX_IMAGES = 5
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const props = defineProps<{ disabled: boolean }>()
const emit = defineEmits<{ send: [text: string, images?: ImageInput[]] }>()

const disabled = computed(() => props.disabled)
const text = ref('')
const images = ref<ImageInput[]>([])
const errorMessage = ref('')
const dragActive = ref(false)
const inputEl = ref<HTMLTextAreaElement | null>(null)
const fileInputEl = ref<HTMLInputElement | null>(null)
let dragDepth = 0

const canSend = computed(() => text.value.trim().length > 0 || images.value.length > 0)

function setError(message: string) {
  errorMessage.value = message
}

function clearError() {
  errorMessage.value = ''
}

function toImageSrc(image: ImageInput): string {
  return `data:${image.mimeType};base64,${image.data}`
}

function openFilePicker() {
  if (props.disabled || images.value.length >= MAX_IMAGES) return
  fileInputEl.value?.click()
}

function removeImage(index: number) {
  images.value.splice(index, 1)
  if (images.value.length < MAX_IMAGES) {
    clearError()
  }
}

function readFileAsImageInput(file: File): Promise<ImageInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`无法读取图片 ${file.name}`))
        return
      }
      const [, data = ''] = reader.result.split(',', 2)
      if (!data) {
        reject(new Error(`图片 ${file.name} 转码失败`))
        return
      }
      resolve({
        mimeType: file.type || 'image/png',
        data,
      })
    }
    reader.onerror = () => reject(new Error(`图片 ${file.name} 读取失败`))
    reader.readAsDataURL(file)
  })
}

async function appendFiles(files: File[]) {
  if (props.disabled || files.length === 0) return

  const errors: string[] = []
  const imageFiles = files.filter((file) => file.type.startsWith('image/'))
  if (imageFiles.length !== files.length) {
    errors.push('仅支持上传 image/* 图片文件')
  }

  const remainingSlots = MAX_IMAGES - images.value.length
  if (remainingSlots <= 0) {
    setError(`最多上传 ${MAX_IMAGES} 张图片`)
    return
  }

  const candidateFiles = imageFiles.slice(0, remainingSlots)
  if (imageFiles.length > remainingSlots) {
    errors.push(`最多上传 ${MAX_IMAGES} 张图片`)
  }

  const validFiles = candidateFiles.filter((file) => {
    if (file.size > MAX_IMAGE_BYTES) {
      errors.push(`${file.name} 超过 5MB 限制`)
      return false
    }
    return true
  })

  if (validFiles.length === 0) {
    setError(errors[0] ?? '没有可用的图片文件')
    return
  }

  try {
    const nextImages = await Promise.all(validFiles.map(readFileAsImageInput))
    images.value = [...images.value, ...nextImages]
    if (errors.length > 0) {
      setError(errors.join('；'))
    } else {
      clearError()
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    setError(detail)
  }
}

async function handleFileSelection(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files ?? [])
  await appendFiles(files)
  target.value = ''
}

function handleDragEnter(event: DragEvent) {
  if (props.disabled || !event.dataTransfer?.types.includes('Files')) return
  dragDepth += 1
  dragActive.value = true
}

function handleDragOver(event: DragEvent) {
  if (props.disabled || !event.dataTransfer?.types.includes('Files')) return
  dragActive.value = true
}

function handleDragLeave(event: DragEvent) {
  if (props.disabled || !event.dataTransfer?.types.includes('Files')) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) {
    dragActive.value = false
  }
}

async function handleDrop(event: DragEvent) {
  dragDepth = 0
  dragActive.value = false
  if (props.disabled) return
  const files = Array.from(event.dataTransfer?.files ?? [])
  await appendFiles(files)
}

async function handlePaste(event: ClipboardEvent) {
  if (props.disabled) return
  const imageFiles = Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file instanceof File)

  if (imageFiles.length === 0) return

  event.preventDefault()
  await appendFiles(imageFiles)
}

function resetComposer() {
  text.value = ''
  images.value = []
  clearError()
  nextTick(() => {
    if (inputEl.value) inputEl.value.style.height = 'auto'
  })
}

function handleSend() {
  if (!canSend.value || props.disabled) return

  const outgoingImages = images.value.map((image) => ({
    mimeType: image.mimeType,
    data: image.data,
  }))

  emit('send', text.value, outgoingImages.length > 0 ? outgoingImages : undefined)
  resetComposer()
}

function autoResize() {
  if (inputEl.value) {
    inputEl.value.style.height = 'auto'
    inputEl.value.style.height = Math.min(inputEl.value.scrollHeight, 200) + 'px'
  }
}
</script>
