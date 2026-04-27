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
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    console.log('[DB] 数据库连接已关闭')
  }
}
