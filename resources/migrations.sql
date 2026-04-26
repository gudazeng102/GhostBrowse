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
CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  proxy_id INTEGER REFERENCES proxies(id),
  chrome_version TEXT NOT NULL DEFAULT '128',
  os TEXT NOT NULL DEFAULT 'Windows',
  webrtc_mode TEXT NOT NULL DEFAULT 'replace' CHECK(webrtc_mode IN ('forward','replace','disable')),
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
);

-- 代理检测记录表：存储代理检测历史
CREATE TABLE IF NOT EXISTS proxy_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proxy_id INTEGER NOT NULL REFERENCES proxies(id),
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
