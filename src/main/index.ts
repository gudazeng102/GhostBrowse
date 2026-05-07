/**
 * Electron 主进程入口
 * Phase 1.0: 启动 Express 服务器，创建 BrowserWindow
 */

// 加载环境变量配置（使用 path 前先导入）
import * as path from 'path'
import * as dotenv from 'dotenv'
dotenv.config({ path: path.join(process.cwd(), '.env') })

import { app, BrowserWindow, Menu } from 'electron'
import * as fs from 'fs'
import { startServer } from './server/app'
import { closeDatabase } from './server/db'

// 开发模式标识
const isDev = !app?.isPackaged

// BrowserWindow 实例
let mainWindow: any = null

/**
 * 创建 Electron 主窗口
 */
async function createWindow(): Promise<void> {


  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    // Windows 下不设置 frame:false，保留原生窗口控制按钮
    show: false, // 等待 ready-to-show 再显示
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true
    }
  })

  // 显示菜单栏（方便开发调试）
  if (isDev) {
    const menu = Menu.buildFromTemplate([
      {
        label: '文件',
        submenu: [
          { label: '刷新', role: 'reload' },
          { label: '强制刷新', role: 'forceReload' },
          { label: '开发者工具', role: 'toggleDevTools' },
          { type: 'separator' },
          { label: '退出', role: 'quit' }
        ]
      },
      {
        label: '视图',
        submenu: [
          { label: '放大', role: 'zoomIn' },
          { label: '缩小', role: 'zoomOut' },
          { label: '重置缩放', role: 'resetZoom' }
        ]
      }
    ])
    Menu.setApplicationMenu(menu)
  } else {
    // 生产模式：隐藏菜单栏
    Menu.setApplicationMenu(null)
  }

  // 等待窗口准备好再显示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()

  })

  // 窗口关闭时
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 加载页面
  // 开发模式：加载 Vite 开发服务器
  // 生产模式：加载 Express 静态文件（已在 http://localhost:3000）
  const loadURL = isDev
    ? 'http://localhost:5173'
    : 'http://localhost:3000'


  
  try {
    await mainWindow.loadURL(loadURL)

  } catch (err) {
    console.error('[Electron] 页面加载失败:', err)
  }

  // 开发模式下打开开发者工具
  if (isDev) {
    mainWindow.webContents.openDevTools()
  }
}

/**
 * 应用程序入口
 */
async function main(): Promise<void> {
  // === Phase 1.7 打包后首次运行自检（开始）===
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'ghostbrowse.db')
  const profilesDir = path.join(userDataPath, 'profiles')








  // Extension 路径检查
  const extPath = app.isPackaged
    ? path.join(process.resourcesPath, 'extension')
    : path.join(process.cwd(), 'src', 'main', 'browser', 'extension')




  // 自动创建 profiles 目录
  if (!fs.existsSync(profilesDir)) {
    fs.mkdirSync(profilesDir, { recursive: true })

  }


  // === Phase 1.7 打包后首次运行自检（结束）===









  try {
    // Phase 1: 启动 Express 服务器

    await startServer(3000, '0.0.0.0')


    // Phase 2: 创建 Electron 窗口
    await createWindow()

  } catch (err) {
    console.error('[GhostBrowse] 启动失败:', err)
    app.quit()
  }
}

// ==================== Electron 生命周期 ====================

// app.whenReady() - 应用准备就绪
app.whenReady().then(main).catch(err => {
  console.error('[GhostBrowse] 未捕获的启动错误:', err)
  app.quit()
})

// macOS 特性：当所有窗口关闭时，不退出应用
app.on('window-all-closed', () => {
  // Windows/Linux: 关闭窗口后退出应用
  if (process.platform !== 'darwin') {

    app.quit()
  }
})

// macOS 特性：应用激活时（点击 Dock 图标）
app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow()
  }
})

// 应用退出前清理
app.on('before-quit', () => {

  closeDatabase()
})

// 未捕获的异常处理
process.on('uncaughtException', (err) => {
  console.error('[GhostBrowse] 未捕获的异常:', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[GhostBrowse] 未处理的 Promise 拒绝:', reason)
})
