/**
 * 本地风险规则引擎
 *
 * 职责：对 DeepSeek 返回的 hotspots 做二次校验，
 * 不可完全信任模型判断。通过敏感词库匹配 + 规则命中 + 权限矩阵
 * 得到最终的风险等级。
 *
 * 纯函数设计，无副作用，便于单元测试。
 */

export interface HotspotRisk {
  /** 子话题描述 */
  topic: string
  /** AI 判定的风险等级 */
  aiRisk: 'low' | 'medium' | 'high'
  /** AI 判定的风险类型 */
  aiRiskType: 'political' | 'racial' | 'brand_negative' | 'none'
  /** AI 判定的匹配度 0-100 */
  matchScore: number
  /** 热度生命周期 */
  lifecycle: 'rising' | 'peak' | 'cooling'
}

export interface RiskRule {
  /** 规则唯一标识 */
  id: string
  /** 匹配类型 */
  type: 'keyword' | 'regex'
  /** 关键词列表（type=keyword 时使用，任一命中即触发） */
  keywords?: string[]
  /** 正则表达式（type=regex 时使用） */
  pattern?: RegExp
  /** 命中后将风险类型覆盖为此值 */
  riskType: 'political' | 'racial' | 'brand_negative'
  /** 命中后强制将风险等级提升至此 */
  severity: 'high' | 'medium'
  /** 规则描述 */
  description: string
}

export interface RiskResult {
  /** 子话题描述 */
  topic: string
  /** 最终风险等级（经过规则引擎覆盖后） */
  finalRisk: 'low' | 'medium' | 'high'
  /** 最终风险类型 */
  finalRiskType: string
  /** 原始风险等级（AI 判定） */
  originalRisk: string
  /** 命中规则列表（空 = 无命中） */
  matchedRules: string[]
  /** 是否被规则引擎覆盖了 AI 的判定 */
  overridden: boolean
}

/**
 * 默认敏感词规则库
 * 可扩展，运营可动态添加
 */
export const DEFAULT_RISK_RULES: RiskRule[] = [
  // 政治敏感
  { id: 'pol_leader', type: 'keyword', keywords: ['习近平', 'Xi Jinping', '普京', 'Putin', 'Trump', 'Biden', '金正恩'], riskType: 'political', severity: 'high', description: '国家领导人相关' },
  { id: 'pol_war', type: 'keyword', keywords: ['战争', 'war', '入侵', 'invasion', '核武器', 'nuclear weapon', '制裁', 'sanctions'], riskType: 'political', severity: 'high', description: '战争/冲突相关' },
  { id: 'pol_election', type: 'keyword', keywords: ['大选', 'election', '投票', 'vote', '竞选', 'campaign'], riskType: 'political', severity: 'medium', description: '选举相关' },
  { id: 'pol_taiwan', type: 'keyword', keywords: ['台湾独立', 'Taiwan independence', '一个中国', 'One China'], riskType: 'political', severity: 'high', description: '领土/主权相关' },
  { id: 'pol_protest', type: 'keyword', keywords: ['抗议', 'protest', '示威', 'demonstration', '罢工', 'strike'], riskType: 'political', severity: 'medium', description: '社会运动相关' },

  // 种族/宗教敏感
  { id: 'race_slur', type: 'keyword', keywords: ['nigger', 'chink', 'spic', '种族歧视', 'racist'], riskType: 'racial', severity: 'high', description: '种族歧视词汇' },
  { id: 'religion', type: 'keyword', keywords: ['伊斯兰', 'Islam', '穆斯林', 'Muslim', '基督教', 'Christianity', '佛教', 'Buddhism', '宗教冲突'], riskType: 'racial', severity: 'medium', description: '宗教相关争议' },
  { id: 'race_immigration', type: 'keyword', keywords: ['移民', 'immigration', '难民', 'refugee', '边境', 'border'], riskType: 'racial', severity: 'medium', description: '移民/难民相关' },

  // 品牌负面
  { id: 'brand_fraud', type: 'keyword', keywords: ['诈骗', 'scam', '庞氏', 'Ponzi', '割韭菜', 'rug pull'], riskType: 'brand_negative', severity: 'high', description: '诈骗相关' },
  { id: 'brand_defame', type: 'keyword', keywords: ['抵制', 'boycott', '丑闻', 'scandal', '泄露', 'leak', '数据泄露', 'data breach'], riskType: 'brand_negative', severity: 'medium', description: '品牌负面事件' },
  { id: 'brand_fake', type: 'keyword', keywords: ['假货', 'fake', '山寨', 'counterfeit', '虚假宣传', 'false advertising'], riskType: 'brand_negative', severity: 'medium', description: '假货/虚假宣传' },
]

/**
 * 对单个话题执行风险规则检测
 * @param topic 子话题描述文本
 * @param rules 风险规则列表（默认使用 DEFAULT_RISK_RULES）
 * @returns 命中规则的 id 列表
 */
export function matchRiskRules(topic: string, rules: RiskRule[] = DEFAULT_RISK_RULES): string[] {
  const matched: string[] = []
  const lowerText = topic.toLowerCase()

  for (const rule of rules) {
    if (rule.type === 'keyword' && rule.keywords) {
      for (const kw of rule.keywords) {
        // 大小写不敏感匹配
        if (lowerText.includes(kw.toLowerCase())) {
          matched.push(rule.id)
          break
        }
      }
    } else if (rule.type === 'regex' && rule.pattern) {
      if (rule.pattern.test(topic)) {
        matched.push(rule.id)
      }
    }
  }

  return matched
}

/**
 * 获取命中规则中最高的影响
 * 返回：覆盖后的 risk 和 riskType
 */
function computeOverriddenRisk(
  matchedRuleIds: string[],
  rules: RiskRule[]
): { risk: 'low' | 'medium' | 'high'; riskType: string } | null {
  if (matchedRuleIds.length === 0) return null

  const matchedRules = rules.filter(r => matchedRuleIds.includes(r.id))
  if (matchedRules.length === 0) return null

  // 取最高的 severity
  const hasHigh = matchedRules.some(r => r.severity === 'high')
  const finalRisk: 'high' | 'medium' = hasHigh ? 'high' : 'medium'

  // 取优先级最高的 riskType（按风险严重度排序）
  const typeOrder: Record<string, number> = { political: 3, racial: 2, brand_negative: 1 }
  let finalRiskType = 'none'
  let maxPriority = 0
  for (const rule of matchedRules) {
    const priority = typeOrder[rule.riskType] || 0
    if (priority > maxPriority) {
      maxPriority = priority
      finalRiskType = rule.riskType
    }
  }

  return { risk: finalRisk, riskType: finalRiskType }
}

/**
 * 对 DeepSeek 返回的 hotspots 做批量风险校验
 *
 * @param hotspots DeepSeek 返回的热点列表（AI 判定）
 * @param rules 风险规则库
 * @returns 每个热点对应的最终风险结果
 */
export function evaluateHotspotRisks(
  hotspots: HotspotRisk[],
  rules: RiskRule[] = DEFAULT_RISK_RULES
): RiskResult[] {
  return hotspots.map(h => {
    const matchedRuleIds = matchRiskRules(h.topic, rules)
    const override = computeOverriddenRisk(matchedRuleIds, rules)

    const overridden = override !== null
    const finalRisk = overridden ? override!.risk : h.aiRisk
    const finalRiskType = overridden ? override!.riskType : h.aiRiskType

    return {
      topic: h.topic,
      finalRisk,
      finalRiskType,
      originalRisk: h.aiRisk,
      matchedRules: matchedRuleIds,
      overridden
    }
  })
}

/**
 * 根据权限矩阵判断是否允许执行
 * 对应需求文档 5.3 节的执行权限矩阵
 */
export function isActionAllowed(
  risk: 'low' | 'medium' | 'high',
  matchScore: number
): { allowed: boolean; buttonState: 'enabled' | 'warning' | 'disabled'; hint: string } {
  if (risk === 'high') {
    return {
      allowed: false,
      buttonState: 'disabled',
      hint: '高风险，需人工复核，禁止自动执行'
    }
  }

  if (risk === 'medium') {
    if (matchScore < 60) {
      return {
        allowed: false,
        buttonState: 'disabled',
        hint: '中风险且匹配度低，建议放弃此热点'
      }
    }
    return {
      allowed: true,
      buttonState: 'warning',
      hint: '中风险，建议人工确认后执行'
    }
  }

  // risk === 'low'
  if (matchScore < 80) {
    return {
      allowed: true,
      buttonState: 'enabled',
      hint: '低风险，可直接执行'
    }
  }

  return {
    allowed: true,
    buttonState: 'enabled',
    hint: '低风险且高匹配度，推荐执行'
  }
}