/**
 * Trend Radar 共享类型定义
 * 用于 main / renderer / shared 之间传递
 */

export interface TrendAnalysisRequest {
  /** 话题标签（含或不含 #） */
  topic: string
  /** 用户补充分析指令 */
  userInstruction: string
  /** 账号定位描述 */
  accountPersona: string
  /** 可选：指定使用哪次采集任务的 ID，不传则自动取最近一次匹配话题 */
  extractionRunId?: number
  /** 可选：指定采集条数（默认 50） */
  maxCount?: number
}

export interface TrendAnalysisHotspot {
  topic: string
  risk: 'low' | 'medium' | 'high'
  riskType: string
  matchScore: number
  lifecycle: 'rising' | 'peak' | 'cooling'
}

export interface TrendAnalysisStrategy {
  targetAccount: string
  /** 目标账号的显示名（如：みくすけ゜(声優好き←)），来自 AI 或采集数据 */
  targetAccountName?: string
  /** 目标账号的 handle ID（如：@MKsuke39_seiyu），来自 AI 或采集数据 */
  targetAccountHandle?: string
  /** 目标账号不在采集数据中时的警告信息 */
  targetAccountWarning?: string
  action: 'comment' | 'retweet' | 'original'
  language: string
  reason: string
}

export interface TrendAnalysisRiskResult {
  topic: string
  finalRisk: string
  finalRiskType: string
  originalRisk: string
  matchedRules: string[]
  overridden: boolean
  allowed: boolean
  buttonState: 'enabled' | 'warning' | 'disabled'
  hint: string
}

export interface TrendAnalysisResult {
  success: boolean
  error?: string
  hotspots: TrendAnalysisHotspot[]
  selectedStrategy: TrendAnalysisStrategy
  contents: string[]
  riskResults: TrendAnalysisRiskResult[]
  rawAIOutput: string
  aiDurationMs: number
  tweetCount: number
}