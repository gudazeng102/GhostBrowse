/**
 * 迭代 6.0: 联动发布模块
 */
import { Router } from "express"
import http from "http"
import WebSocket from "ws"
import multer from "multer"
import * as fs from "fs"
import * as path from "path"
import { app as electronApp } from "electron"
import { getDatabase } from "../db"
import { getRunningProfiles, isProfileRunning } from "../../browser/launcher"
import { XGraphQLClient } from "../services/x-graphql-client"
import { executePublish, PublishMediaInput } from "../services/publish-executor"
import { parseMediaUrls } from "../services/publish-scheduler"
import { resolveCurrentXUsername } from "../services/x-username-resolver"

const router = Router()

const MAX_FILES = 4
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])

function getUploadsRoot(): string {
  const isDev = !electronApp.isPackaged
  const root = isDev
    ? path.join(process.cwd(), "resources", "uploads", "publish")
    : path.join(electronApp.getPath("userData"), "uploads", "publish")
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true })
  return root
}

function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[\\/:*?"<>|]/g, "_")
  return base.length > 80 ? base.slice(0, 80) : base
}

function extByMime(mime: string): string {
  if (mime === "image/jpeg") return ".jpg"
  if (mime === "image/png") return ".png"
  if (mime === "image/webp") return ".webp"
  if (mime === "image/gif") return ".gif"
  return ""
}

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) { cb(new Error("不支持的文件类型: " + file.mimetype)); return }
    cb(null, true)
  }
}).array("files", MAX_FILES)

function parseBoolField(v: any, def: boolean): boolean {
  if (v === undefined || v === null) return def
  if (typeof v === "boolean") return v
  const s = String(v).toLowerCase().trim()
  if (s === "false" || s === "0" || s === "") return false
  return true
}

function parseIntField(v: any, def: number): number {
  if (v === undefined || v === null || v === "") return def
  const n = parseInt(String(v))
  return isNaN(n) ? def : n
}

function parseProfileIds(body: any): string[] {
  const raw = body.profile_ids ?? body["profile_ids[]"]
  if (raw === undefined || raw === null) return []
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  return [String(raw)].filter(Boolean)
}

router.get("/accounts", async (_req, res) => {
  try {
    const db = getDatabase()
    const all: any[] = db.prepare("SELECT id,title FROM profiles ORDER BY id DESC").all()
    const running = await getRunningProfiles() as number[]
    const result: any[] = []
    const nowUnix = Math.floor(Date.now() / 1000)
    for (const p of all) {
      let status = "offline"
      let username = ""
      if (running.indexOf(p.id) >= 0) {
        try {
          const c = new XGraphQLClient()
          const k = await c.loadCookiesFromProfile(p.id)
          if (k.auth_token) {
            status = "healthy"
            username = await resolveCurrentXUsername(p.id)
          }
        } catch {}
      }
      const st = db.prepare("SELECT COUNT(*) as c FROM publish_queue WHERE profile_id=? AND status='success' AND created_at>?")
      const cr: any = st.get([p.id, nowUnix - 86400])
      result.push({ profileId: p.id, profileName: p.title, username, status, todayCount: cr?.c || 0, lastCheckTime: Date.now() })
    }
    res.json({ code: 0, data: result, message: "ok" })
  } catch (e: any) { res.status(500).json({ code: 500, message: e.message }) }
})

router.post("/task", (req, res) => {
  uploadMiddleware(req, res, (err: any) => {
    if (err) { res.status(400).json({ code: 400, message: err?.message || "上传失败" }); return }
    try {
      const p = parseProfileIds(req.body)
      const ct = (req.body.content as string) || ""
      const files = (req.files as Express.Multer.File[] | undefined) || []

      if (!p || p.length === 0) { res.status(400).json({ code: 400, message: "no accounts" }); return }
      if (p.length > 5) { res.status(400).json({ code: 400, message: "max 5" }); return }

      const hasContent = !!(ct && ct.trim())
      const hasMedia = files.length > 0
      if (!hasContent && !hasMedia) { res.status(400).json({ code: 400, message: "文案与图片至少有一项" }); return }
      const isSubscribed = parseBoolField(req.body.is_subscribed, false)
      const contentLimit = isSubscribed ? 10000 : 280
      if (ct.length > contentLimit) { res.status(400).json({ code: 400, message: "当前推文已超过字数限制，请修改" }); return }
      if (files.length > MAX_FILES) { res.status(400).json({ code: 400, message: "最多 " + MAX_FILES + " 张图片" }); return }
      for (const f of files) {
        if (!ALLOWED_MIME.has(f.mimetype)) { res.status(400).json({ code: 400, message: "不支持的文件类型: " + f.mimetype }); return }
        if (f.size > MAX_FILE_SIZE) { res.status(400).json({ code: 400, message: "文件超过 5MB: " + f.originalname }); return }
      }

      const db = getDatabase()
      const bid = "b_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8)
      const now2 = Math.floor(Date.now() / 1000)
      const imm = parseBoolField(req.body.is_immediate, true)
      const dm = parseIntField(req.body.delay_minutes, 0)

      const mediaList: PublishMediaInput[] = []
      if (files.length > 0) {
        const dir = path.join(getUploadsRoot(), bid)
        fs.mkdirSync(dir, { recursive: true })
        for (let i = 0; i < files.length; i++) {
          const f = files[i]
          const ext = path.extname(f.originalname) || extByMime(f.mimetype)
          const fname = String(i + 1).padStart(2, "0") + "_" + safeFilename(f.originalname || ("image" + ext))
          const full = path.join(dir, fname)
          fs.writeFileSync(full, f.buffer)
          mediaList.push({ localPath: full, mime: f.mimetype })
        }
      }
      const mediaJson = mediaList.length > 0 ? JSON.stringify(mediaList) : null

      const shuf = p.slice()
      for (let i = shuf.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const t = shuf[i]; shuf[i] = shuf[j]; shuf[j] = t
      }
      const base = imm ? 0 : dm * 60
      const st = db.prepare("INSERT INTO publish_queue(batch_id,profile_id,content,raw_content,status,execute_at,sequence,media_urls)VALUES(?,?,?,?,'pending',?,?,?)")
      for (let i = 0; i < shuf.length; i++) {
        const pid = parseInt(shuf[i])
        const ea = now2 + base + Math.floor(Math.random() * 5) + 1
        const finalContent = ct.trim()
        st.run(bid, pid, finalContent, ct.trim(), ea, i, mediaJson)
      }
      res.json({ code: 0, data: { batchId: bid, taskCount: shuf.length, mediaCount: mediaList.length }, message: "created" })
    } catch (e: any) {
      res.status(500).json({ code: 500, message: e.message })
    }
  })
})

router.post("/cancel/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const db = getDatabase()
    const r = db.prepare("UPDATE publish_queue SET status='cancelled' WHERE id=? AND (status='pending' OR status='scheduled')").run(id)
    res.json({ code: 0, data: { id }, message: r.changes > 0 ? "ok" : "fail" })
  } catch (e: any) { res.status(500).json({ code: 500, message: e.message }) }
})

router.post("/execute-now/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const db = getDatabase()
    const row: any = db.prepare("SELECT * FROM publish_queue WHERE id=? AND (status='pending' OR status='scheduled')").get(id)
    if (!row) { res.json({ code: 0, data: null, message: "任务不存在或已执行" }); return }
    db.prepare("UPDATE publish_queue SET status='processing' WHERE id=?").run(id)
    const mediaList = parseMediaUrls(row.media_urls)
    const result = await executePublish(row.profile_id, row.content, mediaList)
    if (result.success) {
      db.prepare("UPDATE publish_queue SET status='success',tweet_id=?,tweet_url=?,error_msg=NULL,updated_at=strftime('%s','now') WHERE id=?").run(result.tweetId, result.tweetUrl, id)
      db.prepare("INSERT INTO publish_logs(event_type,message,task_id) VALUES(?,?,?)").run("success", "Execute-now task #" + id + " OK", id)
      res.json({ code: 0, data: { id, tweetUrl: result.tweetUrl }, message: "发布成功" })
    } else {
      const stageTag = result.errorStage ? "[" + result.errorStage + "] " : ""
      const fullErr = stageTag + (result.errorMsg || "")
      db.prepare("UPDATE publish_queue SET status='failed',error_msg=?,updated_at=strftime('%s','now') WHERE id=?").run(fullErr, id)
      db.prepare("INSERT INTO publish_logs(event_type,message,task_id) VALUES(?,?,?)").run("fail", "Execute-now task #" + id + " failed: " + fullErr, id)
      res.json({ code: 0, data: { id }, message: "发布失败: " + fullErr })
    }
  } catch (e: any) { res.status(500).json({ code: 500, message: e.message }) }
})

router.delete("/records/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const db = getDatabase()
    const r = db.prepare("DELETE FROM publish_queue WHERE id=?").run(id)
    res.json({ code: 0, data: { id }, message: r.changes > 0 ? "deleted" : "not found" })
  } catch (e: any) { res.status(500).json({ code: 500, message: e.message }) }
})

router.post("/records/batch-delete", (req, res) => {
  try {
    const { ids } = req.body as { ids?: number[] }
    if (!ids || ids.length === 0) { res.status(400).json({ code: 400, message: "no ids" }); return }
    const db = getDatabase()
    const placeholders = ids.map(() => "?").join(",")
    const r = db.prepare("DELETE FROM publish_queue WHERE id IN (" + placeholders + ")").run(...ids)
    res.json({ code: 0, data: { deleted: r.changes }, message: "deleted " + r.changes + " records" })
  } catch (e: any) { res.status(500).json({ code: 500, message: e.message }) }
})

router.get("/records", (req, res) => {
  try {
    const db = getDatabase()
    const page = Math.max(1, parseInt(String(req.query.page || "1")))
    const ps = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || "20"))))
    const f = (req.query.status as string) || ""
    let wh = ""; const p: any[] = []
    if (f) { wh = " WHERE status=?"; p.push(f) }
    const total: any = db.prepare("SELECT COUNT(*)as t FROM publish_queue" + wh).get(...p)
    const rows: any[] = db.prepare("SELECT*FROM publish_queue" + wh + " ORDER BY created_at DESC LIMIT ? OFFSET ?").all(...p, ps, (page - 1) * ps)
    res.json({
      code: 0,
      data: {
        total: total?.t || 0, page, pageSize: ps,
        records: rows.map(r => {
          let mediaCount = 0
          try { const arr = r.media_urls ? JSON.parse(r.media_urls) : []; if (Array.isArray(arr)) mediaCount = arr.length } catch {}
          return {
            id: r.id, batchId: r.batch_id, profileId: r.profile_id,
            content: r.content, status: r.status, executeAt: r.execute_at,
            tweetUrl: r.tweet_url, errorMsg: r.error_msg, createdAt: r.created_at,
            mediaCount
          }
        })
      },
      message: "success"
    })
  } catch (e: any) { res.status(500).json({ code: 500, message: e.message }) }
})

router.get("/failure-logs", (req, res) => {
  try {
    const db = getDatabase()
    const page = Math.max(1, parseInt(String(req.query.page || "1")))
    const ps = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || "20"))))
    const total: any = db.prepare("SELECT COUNT(*) as t FROM publish_queue WHERE status!='success' AND (error_msg IS NOT NULL OR status='failed')").get()
    const rows: any[] = db.prepare(`
      SELECT
        q.id, q.batch_id, q.profile_id, p.title AS profile_name,
        q.content, q.status, q.execute_at, q.error_msg, q.retry_count,
        q.created_at, q.updated_at,
        (
          SELECT group_concat(l.event_type || ': ' || l.message, char(10))
          FROM publish_logs l
          WHERE l.task_id = q.id AND (l.event_type='fail' OR l.event_type='retry' OR l.event_type='recover')
        ) AS log_messages
      FROM publish_queue q
      LEFT JOIN profiles p ON p.id = q.profile_id
      WHERE q.status!='success' AND (q.error_msg IS NOT NULL OR q.status='failed')
      ORDER BY q.updated_at DESC, q.created_at DESC
      LIMIT ? OFFSET ?
    `).all(ps, (page - 1) * ps)
    res.json({
      code: 0,
      data: {
        total: total?.t || 0, page, pageSize: ps,
        records: rows.map(r => ({
          id: r.id, batchId: r.batch_id, profileId: r.profile_id,
          profileName: r.profile_name || "", content: r.content,
          status: r.status, executeAt: r.execute_at, errorMsg: r.error_msg,
          retryCount: r.retry_count || 0, createdAt: r.created_at,
          updatedAt: r.updated_at, logMessages: r.log_messages || ""
        }))
      },
      message: "success"
    })
  } catch (e: any) { res.status(500).json({ code: 500, message: e.message }) }
})

router.get("/health/:profileId", async (req, res) => {
  try {
    const pid = parseInt(req.params.profileId)
    try {
      const c = new XGraphQLClient()
      const k = await c.loadCookiesFromProfile(pid)
      res.json({ code: 0, data: { status: (k.auth_token && k.ct0) ? "healthy" : "offline", username: "" }, message: "success" })
    } catch { res.json({ code: 0, data: { status: "offline", username: "" }, message: "not running" }) }
  } catch (e: any) { res.status(500).json({ code: 500, message: e.message }) }
})

router.post("/navigate", async (req, res) => {
  try {
    const { profileId, url } = req.body as { profileId?: number; url?: string }
    if (!profileId || !url) { res.status(400).json({ code: 400, message: "missing params" }); return }
    if (!isProfileRunning(profileId)) { res.status(400).json({ code: 400, message: "窗口 " + profileId + " 未运行" }); return }
    const debugPort = 9000 + profileId
    const targets = await new Promise<any[]>((resolve, reject) => {
      http.get(`http://127.0.0.1:${debugPort}/json`, (r) => {
        let d = ''; r.on('data', c => d += c)
        r.on('end', () => { try { resolve(JSON.parse(d)) } catch { reject(new Error('parse fail')) } })
      }).on('error', reject)
    })
    const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl)
    if (!page?.webSocketDebuggerUrl) { res.status(400).json({ code: 400, message: "窗口未运行" }); return }
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({ id: 1, method: 'Page.navigate', params: { url } }))
        setTimeout(() => { ws.close(); resolve() }, 2000)
      })
      ws.on('error', reject)
      setTimeout(() => reject(new Error('CDP 超时')), 10000)
    })
    res.json({ code: 0, data: { profileId, url }, message: "已跳转" })
  } catch (e: any) {
    const msg = e.code === 'ECONNREFUSED' ? "窗口 " + (req.body?.profileId || '') + " 未运行" : e.message
    res.status(500).json({ code: 500, message: msg })
  }
})

export default router
