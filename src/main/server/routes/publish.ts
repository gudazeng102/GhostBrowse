/**
 * 迭代 6.0: 联动发布模块
 */
import { Router, Request, Response } from "express"
import { getDatabase } from "../db"
import { getRunningProfiles } from "../../browser/launcher"
import { XGraphQLClient } from "../services/x-graphql-client"

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
    const tailChars = [" ~"," //"," .."," +1"," *"," ->"]
    let base = imm ? 0 : dm * 60
    const st = db.prepare("INSERT INTO publish_queue(batch_id,profile_id,content,raw_content,status,execute_at,sequence)VALUES(?,?,?,?,'pending',?,?)")
    for (let i = 0; i < shuf.length; i++) {
      const pid = parseInt(shuf[i])
      let ea = now2 + base
      if (i === 0) { ea += Math.floor(Math.random() * 6) + 5 } else { ea += Math.floor(Math.random() * 6) + 10 }
      let finalContent = ct.trim()
      if (shuf.length > 1) { finalContent += " " + tailChars[Math.floor(Math.random() * tailChars.length)] }
      st.run(bid, pid, finalContent, ct.trim(), ea, i)
      base = ea - now2
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
