-- =====================================================
-- GhostBrowse 数据库初始化脚本
-- Phase 1.0: 创建基础数据表
-- =====================================================

-- 代理表：存储代理服务器信息
CREATE TABLE IF NOT EXISTS proxies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('http','https','socks5')),
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT,
  password TEXT,
  remark TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 指纹窗口配置表（Profile）：存储浏览器指纹配置
-- Phase 1.6 修复：webrtc_mode CHECK 添加 'real' 选项
-- Phase 2.1 修复：添加 startup_url 字段
-- Phase 2.6 修复：添加 icon_path 字段
CREATE TABLE IF NOT EXISTS profiles (
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
  startup_url TEXT,
  icon_path TEXT,
  user_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 代理检测记录表：存储代理检测历史
CREATE TABLE IF NOT EXISTS proxy_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proxy_id INTEGER NOT NULL REFERENCES proxies(id),
  user_id INTEGER,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','fail')),
  ip TEXT,
  country TEXT,
  city TEXT,
  latency INTEGER,
  checked_at INTEGER NOT NULL
);

-- 创建索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_profiles_proxy_id ON profiles(proxy_id);
CREATE INDEX IF NOT EXISTS idx_proxy_checks_proxy_id ON proxy_checks(proxy_id);
CREATE INDEX IF NOT EXISTS idx_proxy_checks_checked_at ON proxy_checks(checked_at);

-- =====================================================
-- Phase 1.8 用户认证表
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  reset_token TEXT,
  reset_token_expires INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 邮箱验证码表
CREATE TABLE IF NOT EXISTS verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('register','reset_password')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);

-- =====================================================
-- Phase 5.0: 窗口分组功能
-- =====================================================
CREATE TABLE IF NOT EXISTS profile_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#1890ff',
  remark TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_groups_user ON profile_groups(user_id);

-- =====================================================
-- 迭代 5.0: 采集结果表
-- =====================================================
CREATE TABLE IF NOT EXISTS extraction_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  profile_id INTEGER,
  task_run_id INTEGER REFERENCES task_runs(id),
  platform TEXT NOT NULL DEFAULT 'twitter',
  target_type TEXT NOT NULL DEFAULT 'tweet',
  target TEXT,
  user_name TEXT,
  data_type TEXT NOT NULL DEFAULT 'tweet',
  raw_data TEXT NOT NULL,
  collected_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_extraction_task_run ON extraction_results(task_run_id);
CREATE INDEX IF NOT EXISTS idx_extraction_target ON extraction_results(platform, target_type);

-- =====================================================
-- 迭代 6.0: 联动发布模块 - 发布队列
-- =====================================================
CREATE TABLE IF NOT EXISTS publish_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  profile_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','scheduled','processing','success','failed','cancelled')),
  execute_at INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  tweet_id TEXT,
  tweet_url TEXT,
  error_msg TEXT,
  retry_count INTEGER DEFAULT 0,
  media_urls TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_publish_queue_status ON publish_queue(status, execute_at);
CREATE INDEX IF NOT EXISTS idx_publish_queue_batch ON publish_queue(batch_id);
CREATE INDEX IF NOT EXISTS idx_publish_queue_profile ON publish_queue(profile_id);

-- =====================================================
-- 迭代 6.0: 联动发布模块 - 调度日志
-- =====================================================
CREATE TABLE IF NOT EXISTS publish_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  task_id INTEGER,
  details TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_publish_logs_created ON publish_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_publish_logs_event ON publish_logs(event_type);