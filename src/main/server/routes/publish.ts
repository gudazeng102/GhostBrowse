/**
 * 迭代 6.0: 联动发布模块
 */
import { Router, Request, Response } from "express"
import http from "http"
import WebSocket from "ws"
import { getDatabase } from "../db"
import { getRunningProfiles, isProfileRunning } from "../../browser/launcher"
import { XGraphQLClient } from "../services/x-graphql-client"
import { executePublish } from "../services/publish-executor"

const router = Router()

router.get("/accounts", async (_req, res) => {
  try {
    const db = getDatabase()
    const all: any[] = db.prepare("SELECT id,title FROM profiles ORDER BY id DESC").all()
    const running = await getRunningProfiles() as number[]
    const result: any[] = []
    const nowUnix = Math.floor(Date.now() / 1000)
    for (const p of all) {
      let status = "offline"
      if (running.indexOf(p.id) >= 0) {
        try { const c = new XGraphQLClient(); const k = await c.loadCookiesFromProfile(p.id); if (k.auth_token) status = "healthy" } catch {}
      }
      const st = db.prepare("SELECT COUNT(*) as c FROM publish_queue WHERE profile_id=? AND status='success' AND created_at>?")
      const cr: any = st.get([p.id, nowUnix - 86400])
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
    const now2 = Math.floor(Date.now() / 1000)
    const imm = req.body.is_immediate !== false
    const dm = req.body.delay_minutes || 0
    const shuf = p.slice()
    for (let i = shuf.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = shuf[i]; shuf[i] = shuf[j]; shuf[j] = t }
    const base = imm ? 0 : dm * 60
    const st = db.prepare("INSERT INTO publish_queue(batch_id,profile_id,content,raw_content,status,execute_at,sequence)VALUES(?,?,?,?,'pending',?,?)")
    for (let i = 0; i < shuf.length; i++) {
      const pid = parseInt(shuf[i])
      const ea = now2 + base + Math.floor(Math.random() * 5) + 1
      const finalContent = ct.trim()
      st.run(bid, pid, finalContent, ct.trim(), ea, i)
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

router.post("/execute-now/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const db = getDatabase()
    const row: any = db.prepare("SELECT * FROM publish_queue WHERE id=? AND (status='pending' OR status='scheduled')").get(id)
    if (!row) { res.json({ code: 0, data: null, message: "任务不存在或已执行" }); return }
    db.prepare("UPDATE publish_queue SET status='processing' WHERE id=?").run(id)
    const result = await executePublish(row.profile_id, row.content)
    if (result.success) {
      db.prepare("UPDATE publish_queue SET status='success',tweet_id=?,tweet_url=?,error_msg=NULL,updated_at=strftime('%s','now') WHERE id=?").run(result.tweetId, result.tweetUrl, id)
      db.prepare("INSERT INTO publish_logs(event_type,message,task_id) VALUES(?,?,?)").run("success", "Execute-now task #" + id + " OK", id)
      res.json({ code: 0, data: { id, tweetUrl: result.tweetUrl }, message: "发布成功" })
    } else {
      db.prepare("UPDATE publish_queue SET status='failed',error_msg=?,updated_at=strftime('%s','now') WHERE id=?").run(result.errorMsg, id)
      db.prepare("INSERT INTO publish_logs(event_type,message,task_id) VALUES(?,?,?)").run("fail", "Execute-now task #" + id + " failed: " + result.errorMsg, id)
      res.json({ code: 0, data: { id }, message: "发布失败: " + result.errorMsg })
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
        records: rows.map(r => ({ id: r.id, batchId: r.batch_id, profileId: r.profile_id, content: r.content, status: r.status, executeAt: r.execute_at, tweetUrl: r.tweet_url, errorMsg: r.error_msg, createdAt: r.created_at }))
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
        q.id,
        q.batch_id,
        q.profile_id,
        p.title AS profile_name,
        q.content,
        q.status,
        q.execute_at,
        q.error_msg,
        q.retry_count,
        q.created_at,
        q.updated_at,
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
        total: total?.t || 0,
        page,
        pageSize: ps,
        records: rows.map(r => ({
          id: r.id,
          batchId: r.batch_id,
          profileId: r.profile_id,
          profileName: r.profile_name || "",
          content: r.content,
          status: r.status,
          executeAt: r.execute_at,
          errorMsg: r.error_msg,
          retryCount: r.retry_count || 0,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          logMessages: r.log_messages || ""
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
