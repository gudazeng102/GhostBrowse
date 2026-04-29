/**
 * 数据库模块 - 使用 better-sqlite3 连接和初始化数据库
 * Phase 1.0: 创建 proxies、profiles、proxy_checks 三张表
 */

import Database from 'better-sqlite3'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

// 数据库实例（单例）
let db: Database.Database | null = null

/**
 * 获取数据库文件路径
 * - 开发时：项目根目录/ghostbrowse.db
 * - 打包后：%APPDATA%/GhostBrowse/ghostbrowse.db
 */
function getDatabasePath(): string {
  // 开发模式（package.json 中 main 字段指向 src/main/index.ts）
  const isDev = !app.isPackaged
  
  if (isDev) {
    // 开发模式：数据库放在项目根目录
    return path.join(process.cwd(), 'ghostbrowse.db')
  } else {
    // 打包模式：数据库放在用户数据目录
    return path.join(app.getPath('userData'), 'ghostbrowse.db')
  }
}

/**
 * 获取 migrations.sql 文件路径
 * - 开发时：resources/migrations.sql（项目根目录）
 * - 打包后：process.resourcesPath/resources/migrations.sql
 */
function getMigrationsPath(): string {
  const isDev = !app.isPackaged
  
  if (isDev) {
    // 开发模式：resources 在项目根目录
    return path.join(process.cwd(), 'resources', 'migrations.sql')
  } else {
    // 打包模式：extraResources 在 process.resourcesPath
    return path.join(process.resourcesPath, 'resources', 'migrations.sql')
  }
}

/**
 * 初始化数据库连接
 * - 打开/创建数据库文件
 * - 执行 migrations.sql 创建表结构
 */
export function initDatabase(): Database.Database {
  if (db) {
    return db
  }

  const dbPath = getDatabasePath()
  console.log(`[DB] 数据库路径: ${dbPath}`)

  // 确保目录存在
  const dbDir = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  // 创建数据库连接（better-sqlite3 是同步 API）
  db = new Database(dbPath)
  
  // 启用外键约束
  db.pragma('foreign_keys = ON')

  // 执行数据库迁移
  runMigrations()

  console.log('[DB] 数据库初始化完成')
  return db
}

/**
 * 重建 profiles 表（修复 CHECK 约束等结构变更）
 * SQLite 不支持 ALTER TABLE 修改 CHECK 约束，需要重建表
 */
function migrateProfilesTable(): void {
  if (!db) return

  try {
    // 检查 profiles 表是否存在
    const tableExists = db!.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='profiles'
    `).get()

    if (!tableExists) {
      // 表还不存在，跳过（会在 runMigrations 中创建）
      console.log('[DB] profiles 表尚不存在，跳过重建')
      return
    }

    // 检查当前表的 webrtc_mode CHECK 约束是否包含 'real'
    const tableInfo = db!.prepare("PRAGMA table_info(profiles)").all()
    const hasCorrectCheck = db!.prepare(`
      SELECT sql FROM sqlite_master WHERE type='table' AND name='profiles'
    `).get() as { sql: string } | undefined

    if (hasCorrectCheck && hasCorrectCheck.sql.includes("'real'")) {
      // CHECK 约束已包含 'real'，无需重建
      console.log('[DB] profiles 表结构已正确，跳过重建')
      return
    }

    console.log('[DB] profiles 表 CHECK 约束需要更新，开始重建表...')

    // 开始事务
    db!.exec('BEGIN TRANSACTION')

    // 1. 备份原表数据
    db!.exec('CREATE TABLE profiles_backup AS SELECT * FROM profiles')

    // 2. 删除原表
    db!.exec('DROP TABLE profiles')

    // 3. 重新创建表（使用最新的表结构）
    const createSql = `
      CREATE TABLE profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        proxy_id INTEGER REFERENCES proxies(id),
        chrome_version TEXT NOT NULL DEFAULT '128',
        os TEXT NOT NULL DEFAULT 'Windows',
        webrtc_mode TEXT NOT NULL DEFAULT 'replace' CHECK(webrtc_mode IN ('forward','replace','real','disable')),
        timezone_mode TEXT NOT NULL DEFAULT 'ip',
        geolocation_mode TEXT NOT NULL DEFAULT 'ip',
        language_mode TEXT NOT NULL DEFAULT 'ip',
        ui_language TEXT NOT NULL DEFAULT 'zh-CN',
        screen_resolution TEXT NOT NULL DEFAULT '1920x1080',
        font TEXT NOT NULL DEFAULT 'default',
        canvas_mode TEXT NOT NULL DEFAULT 'noise',
        webgl_mode TEXT NOT NULL DEFAULT 'mock',
        media_device_mode TEXT NOT NULL DEFAULT 'mock',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `
    db!.exec(createSql)

    // 4. 恢复数据
    db!.exec(`
      INSERT INTO profiles (id, title, proxy_id, chrome_version, os, webrtc_mode, timezone_mode, geolocation_mode, language_mode, ui_language, screen_resolution, font, canvas_mode, webgl_mode, media_device_mode, created_at, updated_at)
      SELECT id, title, proxy_id, chrome_version, os, webrtc_mode, timezone_mode, geolocation_mode, language_mode, ui_language, screen_resolution, font, canvas_mode, webgl_mode, media_device_mode, created_at, updated_at FROM profiles_backup
    `)

    // 5. 删除备份表
    db!.exec('DROP TABLE profiles_backup')

    // 提交事务
    db!.exec('COMMIT')
    console.log('[DB] profiles 表重建完成')
  } catch (err: any) {
    db!.exec('ROLLBACK')
    console.error('[DB] profiles 表重建失败:', err.message)
  }
}

/**
 * 执行数据库迁移脚本
 */
function runMigrations(): void {
  if (!db) return

  const migrationsPath = getMigrationsPath()
  console.log(`[DB] 迁移脚本路径: ${migrationsPath}`)

  if (!fs.existsSync(migrationsPath)) {
    console.error(`[DB] 迁移脚本不存在: ${migrationsPath}`)
    throw new Error(`迁移脚本不存在: ${migrationsPath}`)
  }

  // 读取 SQL 文件
  const sql = fs.readFileSync(migrationsPath, 'utf-8')

  // 分割并执行每条 SQL 语句
  // 使用正则表达式匹配完整的 CREATE TABLE 和 CREATE INDEX 语句
  const createTableRegex = /CREATE\s+TABLE\s+.*?;/gis
  const createIndexRegex = /CREATE\s+INDEX\s+.*?;/gis
  
  const statements: string[] = []
  
  // 提取所有 CREATE TABLE 语句
  let match
  while ((match = createTableRegex.exec(sql)) !== null) {
    statements.push(match[0])
  }
  
  // 提取所有 CREATE INDEX 语句
  createIndexRegex.lastIndex = 0 // 重置正则状态
  while ((match = createIndexRegex.exec(sql)) !== null) {
    statements.push(match[0])
  }

  // 直接执行每个语句
  for (const statement of statements) {
    try {
      db!.exec(statement)
      console.log(`[DB] SQL 执行成功`)
    } catch (err: any) {
      console.error(`[DB] SQL 执行失败`)
      console.error(`[DB] 错误详情: ${err.message}`)
      // 继续执行下一个语句
    }
  }

  console.log('[DB] 数据库迁移完成，共执行 ' + statements.length + ' 条 SQL')

  // 特殊处理：检查并重建 profiles 表（修复 CHECK 约束）
  migrateProfilesTable()

  // Phase 1.9: 多账号数据隔离 - 添加 user_id 字段
  migrateUserIdColumns()

  // Phase 2.0: 指纹检测 - 创建 fingerprint_checks 表
  createFingerprintChecksTable()
}

/**
 * Phase 1.9: 多账号数据隔离 - 为现有表添加 user_id 字段
 * 将 proxies、profiles、proxy_checks 三张表增加 user_id 字段
 */
function migrateUserIdColumns(): void {
  if (!db) return

  const tables = ['proxies', 'profiles', 'proxy_checks']
  for (const table of tables) {
    try {
      const columns = db!.prepare(`PRAGMA table_info(${table})`).all() as any[]
      const hasUserId = columns.some(col => col.name === 'user_id')
      if (!hasUserId) {
        db!.prepare(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER`).run()
        console.log(`[DB Migrate] 已为 ${table} 表添加 user_id 字段`)
      } else {
        console.log(`[DB Migrate] ${table} 表已有 user_id 字段，跳过`)
      }
    } catch (err: any) {
      console.error(`[DB Migrate] 为 ${table} 表添加 user_id 字段失败:`, err.message)
    }
  }

  // 数据迁移：将已有数据归属到指定账号
  migrateExistingDataToUser()
}

/**
 * Phase 1.9: 数据迁移 - 将已有数据归属到指定账号
 * 只有在用户已存在时才执行迁移
 */
function migrateExistingDataToUser(): void {
  if (!db) return

  const targetEmail = '1031185308@qq.com'
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(targetEmail) as { id: number } | undefined

  if (!user) {
    console.log(`[DB Migrate] 用户 ${targetEmail} 尚未注册，跳过数据迁移。已有数据保持未归属状态。`)
    return
  }

  const userId = user.id

  // 迁移代理数据
  try {
    const proxyResult = db.prepare('UPDATE proxies SET user_id = ? WHERE user_id IS NULL').run(userId)
    console.log(`[DB Migrate] 已迁移 ${proxyResult.changes} 条代理记录到用户 ${targetEmail} (ID: ${userId})`)
  } catch (err: any) {
    console.error(`[DB Migrate] 迁移代理数据失败:`, err.message)
  }

  // 迁移窗口数据
  try {
    const profileResult = db.prepare('UPDATE profiles SET user_id = ? WHERE user_id IS NULL').run(userId)
    console.log(`[DB Migrate] 已迁移 ${profileResult.changes} 条窗口记录到用户 ${targetEmail} (ID: ${userId})`)
  } catch (err: any) {
    console.error(`[DB Migrate] 迁移窗口数据失败:`, err.message)
  }

  // 迁移检测记录（直接归属到同一用户）
  try {
    const checkResult = db.prepare('UPDATE proxy_checks SET user_id = ? WHERE user_id IS NULL').run(userId)
    console.log(`[DB Migrate] 已迁移 ${checkResult.changes} 条检测记录到用户 ${targetEmail} (ID: ${userId})`)
  } catch (err: any) {
    console.error(`[DB Migrate] 迁移检测记录失败:`, err.message)
  }
}

/**
 * 获取数据库实例
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('数据库未初始化，请先调用 initDatabase()')
  }
  return db
}

/**
 * Phase 2.0: 指纹检测 - 创建 fingerprint_checks 表
 */
function createFingerprintChecksTable(): void {
  if (!db) return

  try {
    const sql = `
      CREATE TABLE IF NOT EXISTS fingerprint_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL REFERENCES profiles(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        proxy_id INTEGER REFERENCES proxies(id),

        -- 代理检测结果
        proxy_status TEXT CHECK(proxy_status IN ('success','fail','no_proxy')),
        proxy_ip TEXT,
        proxy_country TEXT,
        proxy_city TEXT,
        proxy_latency INTEGER,

        -- 指纹纯洁度评分
        purity_score INTEGER NOT NULL DEFAULT 0,
        purity_level TEXT NOT NULL DEFAULT 'unknown' CHECK(purity_level IN ('excellent','good','fair','poor','unknown')),

        -- 指纹配置快照（JSON 字符串存储）
        fingerprint_snapshot TEXT,

        -- 风险提示（JSON 字符串存储，数组格式）
        risk_warnings TEXT,

        checked_at INTEGER NOT NULL
      )
    `
    db!.prepare(sql).run()
    console.log('[DB] fingerprint_checks 表创建成功')
  } catch (err: any) {
    console.error('[DB] fingerprint_checks 表创建失败:', err.message)
  }
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    console.log('[DB] 数据库连接已关闭')
  }
}
