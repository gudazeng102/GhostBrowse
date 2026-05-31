<template>
  <div class="media-picker" :class="{ 'is-disabled': disabled, 'is-readonly': readonly }">
    <div
      class="mp-grid"
      :class="{ 'mp-grid-compact': compact }"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <div
        v-for="(item, idx) in previews"
        :key="item.key"
        class="mp-item"
        :title="item.name"
      >
        <img :src="item.url" :alt="item.name" class="mp-thumb" />
        <div class="mp-overlay" v-if="!readonly">
          <span
            class="mp-icon-btn"
            v-if="previewable"
            @click.stop="onPreview(idx)"
            title="预览"
          >
            <EyeOutlined />
          </span>
          <span
            class="mp-icon-btn mp-remove"
            @click.stop="removeAt(idx)"
            title="移除"
            v-if="!disabled"
          >
            <DeleteOutlined />
          </span>
        </div>
      </div>

      <div
        v-if="canAddMore"
        class="mp-item mp-trigger"
        :class="{ 'mp-drag-over': dragOver }"
        @click="openFileDialog"
      >
        <slot name="trigger">
          <div class="mp-trigger-inner">
            <PlusOutlined />
            <div class="mp-trigger-text">上传</div>
          </div>
        </slot>
      </div>
    </div>

    <div class="mp-footer">
      <span v-if="showCount" class="mp-count" :class="{ 'mp-over': files.length > maxCount }">
        {{ files.length }} / {{ maxCount }}
      </span>
      <span v-if="rules" class="mp-rules">{{ rules }}</span>
      <slot name="extra" />
    </div>

    <input
      ref="inputRef"
      type="file"
      class="mp-hidden-input"
      multiple
      :accept="acceptAttr"
      @change="onInputChange"
    />

    <!-- 大图预览（最简单的 modal） -->
    <div
      v-if="previewIndex !== null"
      class="mp-preview-mask"
      @click.self="previewIndex = null"
    >
      <div class="mp-preview-box">
        <img :src="previews[previewIndex]?.url" :alt="previews[previewIndex]?.name" />
        <div class="mp-preview-bar">
          <span>{{ previews[previewIndex]?.name }}</span>
          <span class="mp-preview-close" @click="previewIndex = null">关闭</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import {
  PlusOutlined,
  DeleteOutlined,
  EyeOutlined
} from '@ant-design/icons-vue'
import type {
  MediaListType,
  MediaRejectInfo,
  MediaRejectReason,
  MediaValidateResult
} from './types'

interface Props {
  files: File[]
  maxCount?: number
  maxSize?: number
  accept?: string[]
  acceptExt?: string[]
  listType?: MediaListType
  disabled?: boolean
  readonly?: boolean
  showCount?: boolean
  previewable?: boolean
  compact?: boolean
  silent?: boolean
  rules?: string
  beforeAdd?: (file: File) => boolean | Promise<boolean>
}

const props = withDefaults(defineProps<Props>(), {
  files: () => [],
  maxCount: 4,
  maxSize: 5 * 1024 * 1024,
  accept: () => ['image/jpeg', 'image/png', 'image/webp'],
  acceptExt: () => ['.jpg', '.jpeg', '.png', '.webp'],
  listType: 'picture-card',
  disabled: false,
  readonly: false,
  showCount: true,
  previewable: true,
  compact: false,
  silent: false,
  rules: ''
})

const emit = defineEmits<{
  (e: 'update:files', files: File[]): void
  (e: 'change', files: File[]): void
  (e: 'reject', info: MediaRejectInfo): void
  (e: 'exceed', max: number): void
  (e: 'preview', file: File, index: number): void
  (e: 'remove', file: File, index: number): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const previewIndex = ref<number | null>(null)

// 用 WeakMap 缓存 ObjectURL，避免重复创建 / 重复回收
const urlCache = new WeakMap<File, string>()
// 记录组件曾经创建过的 URL，用于卸载时回收
const ownedUrls = new Set<string>()

function getUrl(f: File): string {
  let u = urlCache.get(f)
  if (!u) {
    u = URL.createObjectURL(f)
    urlCache.set(f, u)
    ownedUrls.add(u)
  }
  return u
}

function revokeUrlFor(f: File) {
  const u = urlCache.get(f)
  if (u) {
    URL.revokeObjectURL(u)
    ownedUrls.delete(u)
    urlCache.delete(f)
  }
}

interface PreviewItem {
  key: string
  name: string
  url: string
  file: File
}

const previews = computed<PreviewItem[]>(() =>
  props.files.map((f, i) => ({
    key: f.name + '_' + f.size + '_' + f.lastModified + '_' + i,
    name: f.name,
    url: getUrl(f),
    file: f
  }))
)

const canAddMore = computed(
  () => !props.readonly && !props.disabled && props.files.length < props.maxCount
)

const acceptAttr = computed(() => {
  const all = [...props.accept, ...props.acceptExt]
  return all.join(',')
})

function openFileDialog() {
  if (!canAddMore.value) return
  inputRef.value?.click()
}

function onInputChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return
  addFiles(Array.from(target.files))
  // 清空 input 以便相同文件再次选择
  target.value = ''
}

function onDragOver(e: DragEvent) {
  if (!canAddMore.value) return
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  dragOver.value = true
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  if (!canAddMore.value) return
  const dropped = e.dataTransfer?.files
  if (!dropped || dropped.length === 0) return
  addFiles(Array.from(dropped))
}

function isDuplicate(f: File, list: File[]): boolean {
  return list.some(
    x => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified
  )
}

function buildReject(file: File, reason: MediaRejectReason, message: string): MediaRejectInfo {
  const info: MediaRejectInfo = { file, reason, message }
  emit('reject', info)
  if (!props.silent && typeof window !== 'undefined') {
    // 不依赖 antd message，避免组件强耦合；交给宿主页面统一汇总
    // 仅在控制台留痕
    // eslint-disable-next-line no-console
    console.warn('[MediaPicker] reject:', message)
  }
  return info
}

async function addFiles(incoming: File[]) {
  if (!canAddMore.value && incoming.length > 0) return
  const cur = props.files.slice()
  const remaining = props.maxCount - cur.length
  if (remaining <= 0) {
    emit('exceed', props.maxCount)
    buildReject(incoming[0], 'exceed_count', '已达到最大数量 ' + props.maxCount)
    return
  }

  const mimeSet = new Set(props.accept.map(m => m.toLowerCase()))
  const extSet = new Set(props.acceptExt.map(e => e.toLowerCase()))

  const toAdd: File[] = []
  for (const f of incoming) {
    if (toAdd.length + cur.length >= props.maxCount) {
      emit('exceed', props.maxCount)
      buildReject(f, 'exceed_count', '超过最大数量 ' + props.maxCount + '，已截断')
      break
    }
    const mime = (f.type || '').toLowerCase()
    const ext = ('.' + (f.name.split('.').pop() || '')).toLowerCase()
    if (mime && !mimeSet.has(mime)) {
      buildReject(f, 'invalid_mime', '不支持的类型: ' + (mime || ext || '未知'))
      continue
    }
    if (!mime && !extSet.has(ext)) {
      buildReject(f, 'invalid_ext', '不支持的扩展名: ' + ext)
      continue
    }
    if (f.size > props.maxSize) {
      buildReject(
        f,
        'too_large',
        '文件过大: ' + Math.round(f.size / 1024) + 'KB，上限 ' + Math.round(props.maxSize / 1024) + 'KB'
      )
      continue
    }
    if (isDuplicate(f, cur) || isDuplicate(f, toAdd)) {
      buildReject(f, 'duplicate', '重复文件: ' + f.name)
      continue
    }
    if (props.beforeAdd) {
      try {
        const ok = await props.beforeAdd(f)
        if (!ok) { buildReject(f, 'business_rejected', '被业务规则拒绝: ' + f.name); continue }
      } catch (err: any) {
        buildReject(f, 'business_rejected', err?.message || '业务校验失败')
        continue
      }
    }
    toAdd.push(f)
  }

  if (toAdd.length === 0) return
  const next = cur.concat(toAdd)
  emit('update:files', next)
  emit('change', next)
}

function removeAt(index: number) {
  if (props.disabled || props.readonly) return
  const cur = props.files.slice()
  const [removed] = cur.splice(index, 1)
  if (removed) {
    emit('remove', removed, index)
    revokeUrlFor(removed)
  }
  emit('update:files', cur)
  emit('change', cur)
}

function clear() {
  if (props.files.length === 0) return
  for (const f of props.files) revokeUrlFor(f)
  emit('update:files', [])
  emit('change', [])
}

function validate(): MediaValidateResult {
  const errors: MediaRejectInfo[] = []
  const mimeSet = new Set(props.accept.map(m => m.toLowerCase()))
  const extSet = new Set(props.acceptExt.map(e => e.toLowerCase()))
  for (const f of props.files) {
    const mime = (f.type || '').toLowerCase()
    const ext = ('.' + (f.name.split('.').pop() || '')).toLowerCase()
    if (mime && !mimeSet.has(mime)) errors.push({ file: f, reason: 'invalid_mime', message: '不支持的类型: ' + mime })
    else if (!mime && !extSet.has(ext)) errors.push({ file: f, reason: 'invalid_ext', message: '不支持的扩展名: ' + ext })
    if (f.size > props.maxSize) errors.push({ file: f, reason: 'too_large', message: '文件过大: ' + f.name })
  }
  if (props.files.length > props.maxCount) {
    errors.push({ file: props.files[props.files.length - 1], reason: 'exceed_count', message: '超过最大数量 ' + props.maxCount })
  }
  return { ok: errors.length === 0, errors }
}

function onPreview(index: number) {
  previewIndex.value = index
  const f = props.files[index]
  if (f) emit('preview', f, index)
}

// 当父组件把某些 file 换走时，回收对应的 ObjectURL
watch(
  () => props.files,
  (next, prev) => {
    if (!prev) return
    for (const old of prev) {
      if (!next.includes(old)) revokeUrlFor(old)
    }
  }
)

onBeforeUnmount(() => {
  for (const u of Array.from(ownedUrls)) {
    URL.revokeObjectURL(u)
  }
  ownedUrls.clear()
})

defineExpose({
  clear,
  addFiles,
  removeAt,
  validate
})
</script>

<style scoped>
.media-picker {
  width: 100%;
}
.mp-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.mp-grid-compact {
  gap: 4px;
}
.mp-item {
  position: relative;
  width: 96px;
  height: 96px;
  border: 1px dashed #d9d9d9;
  border-radius: 6px;
  overflow: hidden;
  background: #fafafa;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mp-grid-compact .mp-item {
  width: 72px;
  height: 72px;
}
.mp-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.mp-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.15s;
}
.mp-item:hover .mp-overlay {
  opacity: 1;
}
.mp-icon-btn {
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.15);
}
.mp-icon-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}
.mp-remove:hover {
  background: rgba(255, 77, 79, 0.6);
}
.mp-trigger {
  cursor: pointer;
  color: #666;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.mp-trigger:hover,
.mp-drag-over {
  border-color: #1890ff;
  color: #1890ff;
  background: #f0f7ff;
}
.mp-trigger-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.mp-footer {
  margin-top: 6px;
  font-size: 12px;
  color: #888;
  display: flex;
  align-items: center;
  gap: 12px;
}
.mp-count.mp-over {
  color: #ff4d4f;
}
.mp-rules {
  color: #999;
}
.mp-hidden-input {
  display: none;
}
.is-disabled,
.is-readonly {
  pointer-events: none;
  opacity: 0.6;
}

/* 预览 modal */
.mp-preview-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mp-preview-box {
  max-width: 80vw;
  max-height: 80vh;
  background: #000;
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  overflow: hidden;
}
.mp-preview-box img {
  max-width: 80vw;
  max-height: 70vh;
  object-fit: contain;
  display: block;
}
.mp-preview-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #fff;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.6);
  font-size: 12px;
}
.mp-preview-close {
  cursor: pointer;
  padding: 2px 8px;
  border: 1px solid #fff;
  border-radius: 4px;
}
.mp-preview-close:hover {
  background: rgba(255, 255, 255, 0.1);
}
</style>
