# ===== 6.3 Edge case fixes =====

# 1. Update scheduler with processing timeout, cooldown, and logging
$scheduler = @'
import { Logger } from "../../../shared/utils/logger"
import { getDatabase } from "../db"
import { executePublish } from "./publish-executor"

const l = new Logger("PublishScheduler")
let h: ReturnType<typeof setInterval> | null = null
let busy = false

function wl(ev: string, msg: string, id?: number) {
  try { const db = getDatabase(); db.prepare("INSERT INTO publish_logs(event_type,message,task_id) VALUES(?,?,?)").run(ev, msg, id || null) } catch {}
}

async function scan(): Promise<void> {
  if (busy) return; busy = true
  try {
    const db = getDatabase(); wl("scan", "Scanner running")

    // Recover stale processing (>5min)
    const stale: any[] = db.prepare("SELECT * FROM publish_queue WHERE status='processing' AND updated_at<strftime('%s','now')-300").all()
    for (const s of stale) {
      const r = (s.retry_count || 0) + 1
      if (r < 3) {
        db.prepare("UPDATE publish_queue SET status='pending',retry_count=?,execute_at=strftime('%s','now') WHERE id=?").run(r, s.id)
        wl("recover", "Task #" + s.id + " recovered", s.id)
      } else {
        db.prepare("UPDATE publish_queue SET status='failed',error_msg='Timeout after 5min' WHERE id=?").run(s.id)
        wl("fail", "Task #" + s.id + " timeout", s.id)
      }
    }

    const row: any = db.prepare("SELECT * FROM publish_queue WHERE status='pending' AND execute_at<=strftime('%s','now') ORDER BY execute_at ASC LIMIT 1").get()
    if (!row) { l.info("[Scanner] no tasks"); return }

    // 60s cooldown per profile
    const cd: any = db.prepare("SELECT COUNT(*) as c FROM publish_queue WHERE profile_id=? AND status='success' AND created_at>strftime('%s','now')-60").get(row.profile_id)
    if (cd && cd.c > 0) {
      const re = Math.floor(Date.now() / 1000) + 60
      db.prepare("UPDATE publish_queue SET execute_at=? WHERE id=?").run(re, row.id)
      l.info("[Scanner] task #" + row.id + " cooldown"); return
    }

    db.prepare("UPDATE publish_queue SET status='processing',updated_at=strftime('%s','now') WHERE id=?").run(row.id)
    l.info("[Scanner] executing #" + row.id); wl("execute", "Executing #" + row.id, row.id)
    const result = await executePublish(row.profile_id, row.content)

    if (result.success) {
      db.prepare("UPDATE publish_queue SET status='success',tweet_id=?,tweet_url=?,updated_at=strftime('%s','now') WHERE id=?").run(result.tweetId, result.tweetUrl, row.id)
      l.info("[Scanner] #" + row.id + " OK"); wl("success", "Task #" + row.id + " OK", row.id)
    } else {
      const r2 = (row.retry_count || 0) + 1
      if (r2 < 3) {
        const ra = Math.floor(Date.now() / 1000) + 300
        db.prepare("UPDATE publish_queue SET status='pending',retry_count=?,error_msg=?,execute_at=?,updated_at=strftime('%s','now') WHERE id=?").run(r2, result.errorMsg, ra, row.id)
        l.info("[Scanner] #" + row.id + " retry " + r2 + "/3"); wl("retry", "Task #" + row.id + " retry " + r2 + "/3", row.id)
      } else {
        db.prepare("UPDATE publish_queue SET status='failed',error_msg=?,updated_at=strftime('%s','now') WHERE id=?").run(result.errorMsg, row.id)
        l.error("[Scanner] #" + row.id + " failed"); wl("fail", "Task #" + row.id + " failed: " + result.errorMsg, row.id)
      }
    }
  } catch (e: any) { l.error("[Scanner] " + (e.message || "")) } finally { busy = false }
}

export function startPublishScheduler() {
  if (h) return; l.info("[Scheduler] started"); wl("start", "Scheduler started"); scan(); h = setInterval(scan, 60000)
}

export function stopPublishScheduler() {
  if (h) { clearInterval(h); h = null; wl("stop", "Scheduler stopped") }
}
'@

# 2. Update routes: add content suffix for batch, 60s cooldown check
$routes = @'
import { Router, Request, Response } from "express"
import { getDatabase } from "../db"
import { getRunningProfiles } from "../../browser/launcher"
import { XGraphQLClient } from "../services/x-graphql-client"

const router = Router()

router.get("/accounts", async (_req, res) => {
  try {
    const db = getDatabase()
    const all: any[] = db.prepare("SELECT id,title FROM profiles ORDER BY id DESC").all()
    const running = await getRunningProfiles()
    const result: any[] = []
    const now = Math.floor(Date.now() / 1000)
    for (const p of all) {
      let status = "offline"
      if (running.indexOf(p.id) >= 0) {
        try { const c = new XGraphQLClient(); const k = await c.loadCookiesFromProfile(p.id); if (k.auth_token) status = "healthy" } catch {}
      }
      const cr: any = db.prepare("SELECT COUNT(*) as c FROM publish_queue WHERE profile_id=? AND status='success' AND created_at>?", now - 86400).get(p.id)
      result.push({ profileId: p.id, profileName: p.title, username: "", status, todayCount: cr?.c || 0, lastCheckTime: Date.now() })
    }
    res.json({ code: 0, data: result, message: "ok" })
  } catch (e: any) { res.status(500).json({ code: 500, message: e.message }) }
})

router.post("/task", (req, res) => {
  try {
    const p = req.body.profile_ids as string[]
    const ct = req.body.content as string
    if (!p || p.length === 0) { res.status(400).json({ code: 400, message: "no accounts" }); return }
    if (p.length > 5) { res.status(400).json({ code: 400, message: "max 5" }); return }
    if (!ct || !ct.trim()) { res.status(400).json({ code: 400, message: "empty content" }); return }
    if (ct.length > 280) { res.status(400).json({ code: 400, message: "too long" }); return }

    const db = getDatabase()
    const bid = "b_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8)
    const now = Math.floor(Date.now() / 1000)
    const imm = req.body.is_immediate !== false
    const dm = req.body.delay_minutes || 0
    const shuf = p.slice()

    // Fisher-Yates shuffle
    for (let i = shuf.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = shuf[i]; shuf[i] = shuf[j]; shuf[j] = t }

    const tailChars = [" ~", " //", " ..", " ✨", " 👀", " 🎯", " 💡"]
    let base = imm ? 0 : dm * 60
    const st = db.prepare("INSERT INTO publish_queue(batch_id,profile_id,content,raw_content,status,execute_at,sequence)VALUES(?,?,?,?,'pending',?,?)")

    for (let i = 0; i < shuf.length; i++) {
      const pid = parseInt(shuf[i])
      let ea = now + base
      if (i === 0) { ea += Math.floor(Math.random() * 121) + 60 } else { ea += Math.floor(Math.random() * 91) + 30 }
      // Add random suffix for batch dedup avoidance
      let finalContent = ct.trim()
      if (shuf.length > 1) { finalContent += " " + tailChars[Math.floor(Math.random() * tailChars.length)] }
      st.run(bid, pid, finalContent, ct.trim(), ea, i)
      base = ea - now
    }

    res.json({ code: 0, data: { batchId: bid, taskCount: shuf.length }, message: "created" })
  } catch (e: any) { res.status(500).json({ code: 500, message: e.message }) }
})

router.post("/cancel/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const db = getDatabase()
    const r = db.prepare("UPDATE publish_queue SET status='cancelled' WHERE id=? AND (status='pending' OR status='scheduled')").run(id)
    res.json({ code: 0, data: { id }, message: r.changes > 0 ? "ok" : "fail" })
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
        records: rows.map(r => ({ id: r.id, batchId: r.batch_id, profileId: r.profile_id, content: r.content, status: r.status, executeAt: r.execute_at, tweetUrl: r.tweet_url, errorMsg: r.error_msg, createdAt: r.created_at }))
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

export default router
'@

# Write files
[System.IO.File]::WriteAllText('d:\GhostBrowse\src\main\server\services\publish-scheduler.ts', $scheduler)
Write-Host "scheduler written"

[System.IO.File]::WriteAllText('d:\GhostBrowse\src\main\server\routes\publish.ts', $routes)
Write-Host "routes written"

# 3. Fix Express binding to localhost
$appPath = 'd:\GhostBrowse\src\main\server\app.ts'
$app = [System.IO.File]::ReadAllText($appPath)
$app = $app.Replace("host: string = '0.0.0.0'", "host: string = '127.0.0.1'")
[System.IO.File]::WriteAllText($appPath, $app)
Write-Host "app.ts bind address fixed to 127.0.0.1"

Write-Host "`n6.3 update complete"
</write_to_file>