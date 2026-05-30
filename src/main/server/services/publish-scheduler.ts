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
      db.prepare("UPDATE publish_queue SET status='success',tweet_id=?,tweet_url=?,error_msg=NULL,updated_at=strftime('%s','now') WHERE id=?").run(result.tweetId, result.tweetUrl, row.id)
      l.info("[Scanner] #" + row.id + " OK"); wl("success", "Task #" + row.id + " OK", row.id)
    } else {
      // 不可恢复的错误（344=每日上限, 187=重复, 326=账号受限）直接标记失败，不重试
      const noRetryCodes = ["(344)", "(187)", "(326)", "Cookie expired", "Window closed"]
      const skipRetry = noRetryCodes.some(code => (result.errorMsg || "").includes(code))
      if (skipRetry || (row.retry_count || 0) >= 2) {
        db.prepare("UPDATE publish_queue SET status='failed',error_msg=?,updated_at=strftime('%s','now') WHERE id=?").run(result.errorMsg, row.id)
        l.error("[Scanner] #" + row.id + " failed: " + result.errorMsg); wl("fail", "Task #" + row.id + " failed: " + result.errorMsg, row.id)
      } else {
        const r2 = (row.retry_count || 0) + 1
        const ra = Math.floor(Date.now() / 1000) + 300
        db.prepare("UPDATE publish_queue SET status='pending',retry_count=?,error_msg=?,execute_at=?,updated_at=strftime('%s','now') WHERE id=?").run(r2, result.errorMsg, ra, row.id)
        l.info("[Scanner] #" + row.id + " retry " + r2 + "/3: " + result.errorMsg); wl("retry", "Task #" + row.id + " retry " + r2 + "/3: " + result.errorMsg, row.id)
      }
    }
  } catch (e: any) { l.error("[Scanner] " + (e.message || "")) } finally { busy = false }
}

export function startPublishScheduler() {
  if (h) return; l.info("[Scheduler] started (10s)"); wl("start", "Scheduler started"); scan(); h = setInterval(scan, 10000)
}

export function stopPublishScheduler() {
  if (h) { clearInterval(h); h = null; wl("stop", "Scheduler stopped") }
}