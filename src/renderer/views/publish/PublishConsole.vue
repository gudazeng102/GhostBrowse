<template>
  <div class="publish-console">
    <a-page-header title="联动发布" sub-title="迭代 6.x — 多账号 + 多图片发布" />

    <!-- 发布创作区 -->
    <a-card size="small" class="section-card" title="发布推文">
      <a-row :gutter="16">
        <a-col :span="24" class="mb-2">
          <label class="field-label">选择账号（最多 5 个）</label>
          <a-select
            v-model:value="selectedProfileIds"
            mode="multiple"
            :max-tag-count="3"
            placeholder="选择已登录推特的窗口"
            style="width:100%"
            :options="accountOptions"
            :disabled="accountLoading || publishing"
          />
        </a-col>
        <a-col :span="24" class="mb-2">
          <label class="field-label">推文内容</label>
          <a-textarea
            v-model:value="content"
            :rows="4"
            placeholder="请输入推文内容..."
            :disabled="publishing"
            :class="{ 'text-danger': overCharLimit }"
          />
          <div class="char-limit-panel">
            <div class="char-limit-main" :class="{ 'char-limit-danger': overCharLimit }">
      
              <span class="char-count">{{ content.length }} / {{ currentCharLimit }}</span>
              <span class="char-limit-desc">
                （根据X官方的限制，非付费订阅用户最多只能发送280个字，付费订阅用户最多只能发送10000个字，如果您X账号是付费订阅用户，可以点击下switch解除非付费订阅用户的字数限制）
              </span>
            </div>
            <div class="subscription-row">
              <span>是否订阅用户？</span>
              <a-switch
                v-model:checked="isSubscribedUser"
                :disabled="publishing"
                checked-children="是"
                un-checked-children="否"
              />
            </div>
          </div>
        </a-col>
        <a-col :span="24" class="mb-2">
          <label class="field-label">媒体附件（最多 4 张图片，单张 ≤ 5MB）</label>
          <MediaPicker
            v-model:files="mediaFiles"
            :max-count="4"
            :max-size="5 * 1024 * 1024"
            :accept="['image/jpeg','image/png','image/webp']"
            :accept-ext="['.jpg','.jpeg','.png','.webp']"
            :disabled="publishing"
            silent
            rules="支持 jpg / png / webp"
            @reject="onMediaReject"
          />
        </a-col>
        <a-col :span="12" class="mb-2">
          <label class="field-label">发布时间</label>
          <a-space>
            <a-radio-group v-model:value="isImmediate" :disabled="publishing">
              <a-radio :value="true">立即发布</a-radio>
              <a-radio :value="false">延迟发布</a-radio>
            </a-radio-group>
            <a-select
              v-if="!isImmediate"
              v-model:value="delayMinutes"
              style="width:130px"
              :options="delayOptions"
              :disabled="publishing"
            />
          </a-space>
        </a-col>
        <a-col :span="24" class="mt-2">
          <a-button
            type="primary"
            size="large"
            :disabled="cannotPublish"
            :loading="publishing"
            @click="showPreview"
          >
            发布
          </a-button>
          <span v-if="publishing && uploadPercent > 0" class="upload-tip">
            上传中 {{ uploadPercent }}%
          </span>
        </a-col>
      </a-row>
    </a-card>

    <!-- 绑定账号列表 -->
    <a-card size="small" class="section-card" title="绑定账号列表">
      <template #extra>
        <a-button size="small" @click="loadAccounts" :loading="accountLoading">刷新</a-button>
      </template>
      <a-table
        :data-source="accounts"
        :columns="accountColumns"
        :pagination="false"
        size="small"
        :loading="accountLoading"
        row-key="profileId"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-tag :color="statusColor(record.status)">
              {{ statusLabel(record.status) }}
            </a-tag>
          </template>
          <template v-if="column.key === 'action'">
            <a-button size="small" @click="checkHealth(record.profileId)" :loading="checkingId === record.profileId">检测</a-button>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 发布预览弹窗 -->
    <a-modal
      v-model:visible="previewVisible"
      title="确认发布"
      @ok="handlePublish"
      :confirm-loading="publishing"
      ok-text="确认发布"
      cancel-text="再想想"
      :mask-closable="!publishing"
    >
      <p><strong>目标账号及预计执行时间：</strong></p>
      <p v-for="item in previewAccounts" :key="item.profileId" class="preview-account">
        {{ item.displayName }} — ⏰ {{ item.estimatedTime }}
      </p>
      <p><strong>推文内容：</strong></p>
      <p v-if="content.trim()" class="preview-content">{{ content }}</p>
      <p v-else class="preview-content preview-empty">（无文字内容）</p>
      <div v-if="mediaFiles.length > 0">
        <p><strong>媒体附件（{{ mediaFiles.length }} 张）：</strong></p>
        <div class="preview-media">
          <img
            v-for="(p, idx) in mediaPreviewUrls"
            :key="idx"
            :src="p"
            class="preview-thumb"
          />
        </div>
        <p class="preview-note">
          注意：每个账号会各自上传一次这组图片
        </p>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { message } from 'ant-design-vue'
import {
  fetchPublishAccounts,
  createPublishTaskWithMedia,
  checkPublishHealth
} from '../../api/publish'
import { MediaPicker } from '../../components/common/MediaPicker'
import type { MediaRejectInfo } from '../../components/common/MediaPicker'

interface AccountItem {
  profileId: number
  profileName: string
  username: string
  status: string
  todayCount: number
}

interface PreviewAccountInfo {
  profileId: string
  displayName: string
  estimatedTime: string
}

const accounts = ref<AccountItem[]>([])
const accountLoading = ref(false)
const accountsMap = ref<Record<number, AccountItem>>({})

const selectedProfileIds = ref<string[]>([])
const content = ref('')
const mediaFiles = ref<File[]>([])
const isImmediate = ref(true)
const delayMinutes = ref(5)
const isSubscribedUser = ref(false)

const publishing = ref(false)
const previewVisible = ref(false)
const uploadPercent = ref(0)

const checkingId = ref<number | null>(null)

const delayOptions = [
  { value: 1, label: '1 分钟' },
  { value: 5, label: '5 分钟' },
  { value: 10, label: '10 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 60, label: '60 分钟' },
]

const accountColumns = [
  { title: '窗口', dataIndex: 'profileName', key: 'profileName' },
  { title: '用户名', dataIndex: 'username', key: 'username' },
  { title: '状态', dataIndex: 'status', key: 'status' },
  { title: '今日发布', dataIndex: 'todayCount', key: 'todayCount' },
  { title: '操作', key: 'action' },
]

const accountOptions = computed(() => {
  return accounts.value
    .filter(a => a.status !== 'offline')
    .map(a => ({ value: String(a.profileId), label: `${a.profileName} (@${a.username || '?'})` }))
})

const currentCharLimit = computed(() => isSubscribedUser.value ? 10000 : 280)
const overCharLimit = computed(() => content.value.length > currentCharLimit.value)


const cannotPublish = computed(() => {
  if (selectedProfileIds.value.length === 0) return true
  if (content.value.trim() === '' && mediaFiles.value.length === 0) return true
  if (mediaFiles.value.length > 4) return true
  return false
})

const previewAccounts = computed((): PreviewAccountInfo[] => {
  const shuffled = [...selectedProfileIds.value]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const now = Date.now()
  const base = isImmediate.value ? 0 : delayMinutes.value * 60 * 1000
  const list: PreviewAccountInfo[] = []
  for (let i = 0; i < shuffled.length; i++) {
    const estTime = isImmediate.value
      ? '5 秒内'
      : new Date(now + base + 5000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    list.push({
      profileId: shuffled[i],
      displayName: getProfileName(shuffled[i]),
      estimatedTime: estTime,
    })
  }
  return list
})

// 预览弹窗中显示的缩略图 URL 列表（仅在弹窗打开时创建/回收）
const mediaPreviewUrls = ref<string[]>([])
function buildPreviewUrls() {
  releasePreviewUrls()
  mediaPreviewUrls.value = mediaFiles.value.map(f => URL.createObjectURL(f))
}
function releasePreviewUrls() {
  for (const u of mediaPreviewUrls.value) URL.revokeObjectURL(u)
  mediaPreviewUrls.value = []
}
watch(previewVisible, v => {
  if (v) buildPreviewUrls()
  else releasePreviewUrls()
})

function statusColor(s: string) {
  if (s === 'healthy') return 'green'
  if (s === 'suspected') return 'orange'
  return 'red'
}
function statusLabel(s: string) {
  if (s === 'healthy') return '正常'
  if (s === 'suspected') return '疑似失效'
  return '已掉线'
}
function getProfileName(pid: string) {
  const id = parseInt(pid)
  const a = accountsMap.value[id]
  return a ? `${a.profileName} (@${a.username || '?'})` : `Profile ${pid}`
}

async function loadAccounts() {
  accountLoading.value = true
  try {
    const data = await fetchPublishAccounts()
    accounts.value = data as AccountItem[]
    const m: Record<number, AccountItem> = {}
    for (const a of data) { m[a.profileId] = a }
    accountsMap.value = m
  } catch (e: any) {
    message.error('加载账号列表失败: ' + (e.message || ''))
  } finally {
    accountLoading.value = false
  }
}

async function checkHealth(profileId: number) {
  checkingId.value = profileId
  try {
    const data = await checkPublishHealth(profileId)
    message.info('状态: ' + (data.status === 'healthy' ? '正常' : '已掉线'))
    await loadAccounts()
  } catch (e: any) {
    message.error('检测失败: ' + (e.message || ''))
  } finally {
    checkingId.value = null
  }
}

// MediaPicker 拒绝事件：汇总后统一提示
let rejectBatch: MediaRejectInfo[] = []
let rejectTimer: any = null
function onMediaReject(info: MediaRejectInfo) {
  rejectBatch.push(info)
  if (rejectTimer) clearTimeout(rejectTimer)
  rejectTimer = setTimeout(() => {
    const msgs = rejectBatch.map(r => r.message)
    rejectBatch = []
    rejectTimer = null
    const merged = msgs.length <= 3
      ? msgs.join('；')
      : msgs.slice(0, 3).join('；') + ` 等共 ${msgs.length} 项被拒绝`
    message.warning(merged)
  }, 80)
}

function assertCharLimit(): boolean {
  if (overCharLimit.value) {
    message.warning('当前推文已超过字数限制，请修改')
    return false
  }
  return true
}

function showPreview() {
  if (!assertCharLimit()) return
  if (cannotPublish.value) {
    message.warning('请检查账号、文案或图片是否符合要求')
    return
  }
  previewVisible.value = true
}

async function handlePublish() {
  if (!assertCharLimit()) return
  if (cannotPublish.value) return
  publishing.value = true
  uploadPercent.value = 0
  try {
    const form = new FormData()
    for (const pid of selectedProfileIds.value) form.append('profile_ids', pid)
    form.append('content', content.value)
    form.append('is_immediate', isImmediate.value ? 'true' : 'false')
    form.append('delay_minutes', String(delayMinutes.value))
    form.append('is_subscribed', isSubscribedUser.value ? 'true' : 'false')
    for (const f of mediaFiles.value) form.append('files', f, f.name)

    const data = await createPublishTaskWithMedia(form, (ev: any) => {
      if (ev && ev.total) {
        uploadPercent.value = Math.round((ev.loaded / ev.total) * 100)
      }
    })
    message.success(
      '已创建任务 ' + data.taskCount + ' 个' +
      (data.mediaCount > 0 ? '（含 ' + data.mediaCount + ' 张图片）' : '')
    )
    previewVisible.value = false
    // 重置：仅清掉本次内容，保留账号选择方便连发
    content.value = ''
    mediaFiles.value = []
    await loadAccounts()
  } catch (e: any) {
    const apiMsg = e?.response?.data?.message || e?.message || '发布失败'
    message.error('发布失败: ' + apiMsg)
  } finally {
    publishing.value = false
    uploadPercent.value = 0
  }
}

onMounted(() => {
  loadAccounts()
})

onBeforeUnmount(() => {
  releasePreviewUrls()
  if (rejectTimer) { clearTimeout(rejectTimer); rejectTimer = null }
  rejectBatch = []
})
</script>

<style scoped>
.publish-console {
  padding: 12px;
}
.section-card {
  margin-bottom: 12px;
}
.field-label {
  display: block;
  margin-bottom: 4px;
  color: #555;
  font-size: 13px;
}
.mb-2 {
  margin-bottom: 12px;
}
.mt-2 {
  margin-top: 8px;
}
.text-danger :deep(textarea) {
  border-color: #ff4d4f;
}
.char-limit-panel {
  margin-top: 8px;
}
.char-limit-main {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(0, 0, 0, 0.88);
  font-size: 12px;
  line-height: 1.5;
}
.char-limit-danger {
  color: #ff4d4f;
}
.char-count {
  min-width: 76px;
  font-weight: 600;
}
.char-limit-desc {
  flex: 1;
}
.subscription-row {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #555;
  font-size: 13px;
}
.upload-tip {
  margin-left: 12px;
  color: #1890ff;
  font-size: 12px;
}
.preview-account {
  margin: 4px 0;
  color: #444;
}
.preview-content {
  background: #fafafa;
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid #f0f0f0;
  white-space: pre-wrap;
  word-break: break-word;
}
.preview-empty {
  color: #999;
}
.preview-media {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.preview-thumb {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #eee;
}
.preview-note {
  margin-top: 8px;
  color: #888;
  font-size: 12px;
}
</style>
