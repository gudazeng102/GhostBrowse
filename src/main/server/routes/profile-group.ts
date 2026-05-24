/**
 * 窗口分组路由（Profile Groups）
 * Phase 5.0: 实现窗口分组的 CRUD + 批量移动 API
 */

import { Router, Response } from 'express'
import { getDatabase } from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'

const router = Router()

// 所有接口都需要登录
router.use(authMiddleware)

// ==================== 类型定义 ====================

interface GroupDto {
  name: string
  color?: string
  remark?: string
  sortOrder?: number
}

// ==================== API 路由 ====================

/**
 * GET /api/v1/profile-groups
 * 查询当前用户的所有分组（含每组窗口数量）
 */
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const db = getDatabase()

    const sql = `
      SELECT 
        g.id, g.name, g.color, g.remark, g.sort_order,
        g.created_at, g.updated_at,
        COUNT(p.id) as profile_count
      FROM profile_groups g
      LEFT JOIN profiles p ON p.group_id = g.id AND p.user_id = g.user_id
      WHERE g.user_id = ?
      GROUP BY g.id
      ORDER BY g.sort_order ASC, g.id ASC
    `

    const rows = db.prepare(sql).all(userId) as any[]

    const list = rows.map(row => ({
      id: row.id,
      name: row.name,
      color: row.color || '#1890ff',
      remark: row.remark || '',
      sortOrder: row.sort_order || 0,
      profileCount: row.profile_count || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))

    // 追加"未分组"虚拟分组统计
    const ungroupedCount = (db.prepare(
      'SELECT COUNT(*) as cnt FROM profiles WHERE user_id = ? AND group_id IS NULL'
    ).get(userId) as { cnt: number }).cnt

    res.json({
      code: 0,
      data: {
        groups: list,
        ungroupedCount
      },
      message: 'success'
    })
  } catch (err: any) {
    console.error('[ProfileGroup API] 获取列表失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '获取列表失败'
    })
  }
})

/**
 * GET /api/v1/profile-groups/:id
 * 查询单个分组详情
 */
router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const { id } = req.params
    const db = getDatabase()

    const row = db.prepare(
      'SELECT * FROM profile_groups WHERE id = ? AND user_id = ?'
    ).get(Number(id), userId) as any

    if (!row) {
      return res.status(404).json({ code: 404, data: null, message: '分组不存在' })
    }

    res.json({
      code: 0,
      data: {
        id: row.id,
        name: row.name,
        color: row.color || '#1890ff',
        remark: row.remark || '',
        sortOrder: row.sort_order || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      },
      message: 'success'
    })
  } catch (err: any) {
    console.error('[ProfileGroup API] 获取详情失败:', err)
    res.status(500).json({ code: 500, data: null, message: err.message || '获取详情失败' })
  }
})

/**
 * POST /api/v1/profile-groups
 * 创建分组
 */
router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const body = req.body as GroupDto
    const db = getDatabase()

    if (!body.name || !body.name.trim()) {
      return res.status(400).json({ code: 400, data: null, message: '分组名称不能为空' })
    }

    const name = body.name.trim()

    // 校验同名
    const existing = db.prepare(
      'SELECT id FROM profile_groups WHERE user_id = ? AND name = ?'
    ).get(userId, name)
    if (existing) {
      return res.status(400).json({ code: 400, data: null, message: '分组名称已存在' })
    }

    const now = Date.now()
    const result = db.prepare(`
      INSERT INTO profile_groups (user_id, name, color, remark, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      name,
      body.color || '#1890ff',
      body.remark || null,
      body.sortOrder || 0,
      now,
      now
    )

    res.json({
      code: 0,
      data: { id: result.lastInsertRowid },
      message: '创建成功'
    })
  } catch (err: any) {
    console.error('[ProfileGroup API] 创建失败:', err)
    res.status(500).json({ code: 500, data: null, message: err.message || '创建失败' })
  }
})

/**
 * PUT /api/v1/profile-groups/:id
 * 更新分组
 */
router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const { id } = req.params
    const body = req.body as GroupDto
    const db = getDatabase()

    const existing = db.prepare(
      'SELECT id FROM profile_groups WHERE id = ? AND user_id = ?'
    ).get(Number(id), userId)
    if (!existing) {
      return res.status(404).json({ code: 404, data: null, message: '分组不存在' })
    }

    if (!body.name || !body.name.trim()) {
      return res.status(400).json({ code: 400, data: null, message: '分组名称不能为空' })
    }

    const name = body.name.trim()

    // 校验同名（排除自身）
    const duplicate = db.prepare(
      'SELECT id FROM profile_groups WHERE user_id = ? AND name = ? AND id != ?'
    ).get(userId, name, Number(id))
    if (duplicate) {
      return res.status(400).json({ code: 400, data: null, message: '分组名称已存在' })
    }

    db.prepare(`
      UPDATE profile_groups
      SET name = ?, color = ?, remark = ?, sort_order = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      name,
      body.color || '#1890ff',
      body.remark || null,
      body.sortOrder || 0,
      Date.now(),
      Number(id),
      userId
    )

    res.json({ code: 0, data: { id: Number(id) }, message: '更新成功' })
  } catch (err: any) {
    console.error('[ProfileGroup API] 更新失败:', err)
    res.status(500).json({ code: 500, data: null, message: err.message || '更新失败' })
  }
})

/**
 * DELETE /api/v1/profile-groups/:id
 * 删除分组（组内窗口的 group_id 自动置 NULL）
 */
router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const { id } = req.params
    const db = getDatabase()

    const existing = db.prepare(
      'SELECT id FROM profile_groups WHERE id = ? AND user_id = ?'
    ).get(Number(id), userId)
    if (!existing) {
      return res.status(404).json({ code: 404, data: null, message: '分组不存在' })
    }

    // 事务：先把组内 profile.group_id 置 NULL，再删除分组
    const tx = db.transaction(() => {
      db.prepare(
        'UPDATE profiles SET group_id = NULL, updated_at = ? WHERE group_id = ? AND user_id = ?'
      ).run(Date.now(), Number(id), userId)

      db.prepare(
        'DELETE FROM profile_groups WHERE id = ? AND user_id = ?'
      ).run(Number(id), userId)
    })
    tx()

    res.json({ code: 0, data: { id: Number(id) }, message: '删除成功' })
  } catch (err: any) {
    console.error('[ProfileGroup API] 删除失败:', err)
    res.status(500).json({ code: 500, data: null, message: err.message || '删除失败' })
  }
})

/**
 * POST /api/v1/profile-groups/:id/move
 * 批量移动窗口到指定分组
 * - :id 为 0 或 'null' 表示移动到"未分组"
 * - body: { profileIds: number[] }
 */
router.post('/:id/move', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const { id } = req.params
    const { profileIds } = req.body as { profileIds: number[] }
    const db = getDatabase()

    if (!Array.isArray(profileIds) || profileIds.length === 0) {
      return res.status(400).json({ code: 400, data: null, message: 'profileIds 不能为空' })
    }

    // 解析目标分组：0 / 'null' / 'ungrouped' 表示未分组
    let targetGroupId: number | null = null
    if (id !== '0' && id !== 'null' && id !== 'ungrouped') {
      const groupRow = db.prepare(
        'SELECT id FROM profile_groups WHERE id = ? AND user_id = ?'
      ).get(Number(id), userId)
      if (!groupRow) {
        return res.status(404).json({ code: 404, data: null, message: '目标分组不存在' })
      }
      targetGroupId = Number(id)
    }

    // 批量更新（事务）
    const now = Date.now()
    const stmt = db.prepare(
      'UPDATE profiles SET group_id = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    )
    let changes = 0
    const tx = db.transaction(() => {
      for (const pid of profileIds) {
        const r = stmt.run(targetGroupId, now, Number(pid), userId)
        changes += r.changes
      }
    })
    tx()

    res.json({
      code: 0,
      data: { changes, targetGroupId },
      message: `已移动 ${changes} 个窗口`
    })
  } catch (err: any) {
    console.error('[ProfileGroup API] 批量移动失败:', err)
    res.status(500).json({ code: 500, data: null, message: err.message || '批量移动失败' })
  }
})

export default router