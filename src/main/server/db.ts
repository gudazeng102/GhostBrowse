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
  const isDev = !app.isPackaged
  
  if (isDev) {
    return path.join(process.cwd(), 'ghostbrowse.db')
  } else {
    return path.join(app.getPath('userData'), 'ghostbrowse.db')
  }
}

/**
 * 获取 migrations.sql 文件路径
 */
function getMigrationsPath(): string {
  const isDev = !app.isPackaged
  
  if (isDev) {
    return path.join(process.cwd(), 'resources', 'migrations.sql')
  } else {
    return path.join(process.resourcesPath, 'resources', 'migrations.sql')
  }
}

/**
 * 初始化数据库连接
 */
export function initDatabase(): Database.Database {
  if (db) {
    return db
  }

  const dbPath = getDatabasePath()


  const dbDir = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  runMigrations()


  return db
}

/**
 * 重建 profiles 表（修复 CHECK 约束等结构变更）
 */
function migrateProfilesTable(): void {
  if (!db) return

  try {
    const tableExists = db!.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='profiles'
    `).get()

    if (!tableExists) {

      return
    }

    const hasCorrectCheck = db!.prepare(`
      SELECT sql FROM sqlite_master WHERE type='table' AND name='profiles'
    `).get() as { sql: string } | undefined

    if (hasCorrectCheck && hasCorrectCheck.sql.includes("'real'")) {

      return
    }



    db!.exec('BEGIN TRANSACTION')
    db!.exec('CREATE TABLE profiles_backup AS SELECT * FROM profiles')
    db!.exec('DROP TABLE profiles')

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

    db!.exec(`
      INSERT INTO profiles (id, title, proxy_id, chrome_version, os, webrtc_mode, timezone_mode, geolocation_mode, language_mode, ui_language, screen_resolution, font, canvas_mode, webgl_mode, media_device_mode, created_at, updated_at)
      SELECT id, title, proxy_id, chrome_version, os, webrtc_mode, timezone_mode, geolocation_mode, language_mode, ui_language, screen_resolution, font, canvas_mode, webgl_mode, media_device_mode, created_at, updated_at FROM profiles_backup
    `)

    db!.exec('DROP TABLE profiles_backup')
    db!.exec('COMMIT')

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


  if (!fs.existsSync(migrationsPath)) {
    console.error(`[DB] 迁移脚本不存在: ${migrationsPath}`)
    throw new Error(`迁移脚本不存在: ${migrationsPath}`)
  }

  const sql = fs.readFileSync(migrationsPath, 'utf-8')

  const createTableRegex = /CREATE\s+TABLE\s+.*?;/gis
  const createIndexRegex = /CREATE\s+INDEX\s+.*?;/gis
  
  const statements: string[] = []
  
  let match
  while ((match = createTableRegex.exec(sql)) !== null) {
    statements.push(match[0])
  }
  
  createIndexRegex.lastIndex = 0
  while ((match = createIndexRegex.exec(sql)) !== null) {
    statements.push(match[0])
  }

  for (const statement of statements) {
    try {
      db!.exec(statement)

    } catch (err: any) {
      console.error(`[DB] SQL 执行失败: ${err.message}`)
    }
  }



  migrateProfilesTable()
  migrateUserIdColumns()
  createFingerprintChecksTable()
  migrateStartupUrlColumn()
  createCookieBackupsTable()
  migrateFingerprintColumns()
  createSessionTabsTable()
  migrateCookieJsonColumn()
  createPlatformAccountsTable()
}

function migrateCookieJsonColumn(): void {
  if (!db) return

  try {
    const columns = db!.prepare('PRAGMA table_info(profiles)').all() as any[]
    const hasCookieJson = columns.some(col => col.name === 'cookie_json')
    if (!hasCookieJson) {
      db!.prepare('ALTER TABLE profiles ADD COLUMN cookie_json TEXT').run()
      console.log('[DB] profiles 表已添加 cookie_json 字段')
    }
  } catch (err: any) {
    console.error('[DB] cookie_json 字段迁移失败:', err.message)
  }
}


/**
 * Phase 1.9: 多账号数据隔离 - 为现有表添加 user_id 字段
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

      } else {

      }
    } catch (err: any) {
      console.error(`[DB Migrate] 为 ${table} 表添加 user_id 字段失败:`, err.message)
    }
  }

  migrateExistingDataToUser()
}

/**
 * Phase 1.9: 数据迁移 - 将已有数据归属到指定账号
 */
function migrateExistingDataToUser(): void {
  if (!db) return

  const targetEmail = '1031185308@qq.com'
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(targetEmail) as { id: number } | undefined

  if (!user) {

    return
  }

  const userId = user.id

  try {
    const proxyResult = db.prepare('UPDATE proxies SET user_id = ? WHERE user_id IS NULL').run(userId)

  } catch (err: any) {
    console.error(`[DB Migrate] 迁移代理数据失败:`, err.message)
  }

  try {
    const profileResult = db.prepare('UPDATE profiles SET user_id = ? WHERE user_id IS NULL').run(userId)

  } catch (err: any) {
    console.error(`[DB Migrate] 迁移窗口数据失败:`, err.message)
  }

  try {
    const checkResult = db.prepare('UPDATE proxy_checks SET user_id = ? WHERE user_id IS NULL').run(userId)

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
        proxy_status TEXT CHECK(proxy_status IN ('success','fail','no_proxy')),
        proxy_ip TEXT,
        proxy_country TEXT,
        proxy_city TEXT,
        proxy_latency INTEGER,
        purity_score INTEGER NOT NULL DEFAULT 0,
        purity_level TEXT NOT NULL DEFAULT 'unknown' CHECK(purity_level IN ('excellent','good','fair','poor','unknown')),
        fingerprint_snapshot TEXT,
        risk_warnings TEXT,
        checked_at INTEGER NOT NULL
      )
    `
    db!.prepare(sql).run()

  } catch (err: any) {
    console.error('[DB] fingerprint_checks 表创建失败:', err.message)
  }
}

/**
 * Phase 2.1: 窗口启动页面自定义 - 为 profiles 表添加 startup_url 字段
 */
function migrateStartupUrlColumn(): void {
  if (!db) return

  try {
    const columns = db!.prepare('PRAGMA table_info(profiles)').all() as any[]
    const hasStartupUrl = columns.some(col => col.name === 'startup_url')
    if (!hasStartupUrl) {
      db!.prepare('ALTER TABLE profiles ADD COLUMN startup_url TEXT').run()

    } else {

    }
  } catch (err: any) {
    console.error('[DB Migrate] 为 profiles 表添加 startup_url 字段失败:', err.message)
  }
}

/**
 * Phase 2.2: Cookie 管理 - 创建 cookie_backups 表
 */
function createCookieBackupsTable(): void {
  if (!db) return

  try {
    const sql = `
      CREATE TABLE IF NOT EXISTS cookie_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        backup_type TEXT NOT NULL DEFAULT 'auto' CHECK(backup_type IN ('auto','manual')),
        backup_path TEXT NOT NULL,
        cookie_count INTEGER DEFAULT 0,
        size_bytes INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `
    db!.prepare(sql).run()

  } catch (err: any) {
    console.error('[DB] cookie_backups 表创建失败:', err.message)
  }
}

/**
 * Phase 3.0: 浏览器设定卡片 + 生成新指纹
 * 为 profiles 表添加指纹参数相关字段
 */
function migrateFingerprintColumns(): void {
  if (!db) return

  try {
    const columns = db!.prepare('PRAGMA table_info(profiles)').all() as any[]
    const columnNames = columns.map(col => col.name)

    const newColumns = [
      { name: 'device_name', type: 'TEXT' },
      { name: 'mac_address', type: 'TEXT' },
      { name: 'canvas_noise_seed', type: 'TEXT' },
      { name: 'audio_noise_seed', type: 'TEXT' },
      { name: 'rects_noise_seed', type: 'TEXT' },
      { name: 'webgl_vendor', type: 'TEXT' },
      { name: 'webgl_renderer', type: 'TEXT' },
    ]

    for (const col of newColumns) {
      if (!columnNames.includes(col.name)) {
        db!.prepare(`ALTER TABLE profiles ADD COLUMN ${col.name} ${col.type}`).run()

      } else {

      }
    }
  } catch (err: any) {
    console.error('[DB Migrate] 为 profiles 表添加指纹字段失败:', err.message)
  }
}

/**
 * Phase 2.3: 指纹配置智能跟随代理IP - 字段支持 'auto' 值
 * 
 * 注意：以下三个字段在 Phase 2.3 中支持存储 'auto' 字符串值
 * - ui_language: 支持 'auto' 表示跟随代理IP国家自动设置语言
 * - font: 支持 'auto' 表示跟随代理IP国家自动设置字体
 * - screen_resolution: 支持 'auto' 表示跟随代理IP国家自动设置分辨率
 * 
 * 数据库存储 'auto' 字符串，启动时由后端解析为实际值
 */

/**
 * Phase 3.5 Rev3 Fix: 窗口级 Session 标签页持久化引擎
 * 创建 profile_session_tabs 表（无唯一约束，允许同一 Profile 打开相同 URL 的多个标签页）
 */
function createSessionTabsTable(): void {
  if (!db) return

  try {
    const sql = `
      CREATE TABLE IF NOT EXISTS profile_session_tabs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        url TEXT NOT NULL,
        title TEXT,
        active INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        updated_at INTEGER NOT NULL,
        source TEXT DEFAULT 'unknown'
      )
    `
    db!.prepare(sql).run()

    // 创建索引（查询加速 + source 字段索引）
    db!.prepare(`
      CREATE INDEX IF NOT EXISTS idx_session_tabs_profile 
      ON profile_session_tabs(profile_id, sort_order)
    `).run()

    // Phase 3.5 Rev5: 迁移 source 字段（表已存在时添加新列）
    const columns = db!.prepare('PRAGMA table_info(profile_session_tabs)').all() as any[]
    const hasSource = columns.some(col => col.name === 'source')
    if (!hasSource) {
      db!.prepare('ALTER TABLE profile_session_tabs ADD COLUMN source TEXT DEFAULT "unknown"').run()
    }

  } catch (err: any) {
    console.error('[DB] profile_session_tabs 表创建失败:', err.message)
  }
}

/**
 * 关闭数据库连接
 */
function createPlatformAccountsTable(): void {
  if (!db) return
  try {
    const sql = `
      CREATE TABLE IF NOT EXISTS platform_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        platform TEXT NOT NULL DEFAULT 'twitter',
        account TEXT NOT NULL,
        password TEXT NOT NULL,
        username_confirm TEXT DEFAULT NULL,
        two_fa_type TEXT DEFAULT NULL,
        two_fa_secret TEXT DEFAULT NULL,
        two_fa_backup_codes TEXT DEFAULT NULL,
        is_active INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `
    db!.prepare(sql).run()
    // 索引
    db!.prepare('CREATE INDEX IF NOT EXISTS idx_pa_profile ON platform_accounts(profile_id, user_id)').run()
    // 迁移：为已有表添加 username_confirm 列
    try {
      db!.prepare('ALTER TABLE platform_accounts ADD COLUMN username_confirm TEXT DEFAULT NULL').run()
    } catch (e: any) {
      // 列已存在则忽略
    }
  } catch (err: any) {
    console.error('[DB] platform_accounts 表创建失败:', err.message)
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null

  }
}
