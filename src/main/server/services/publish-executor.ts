/**
 * 迭代 6.0: 联动发布模块 - 推文执行器
 * 通过 X GraphQL API + 真实 queryId 发布推文
 */
import { XGraphQLClient } from './x-graphql-client'
import { Logger } from '../../../shared/utils/logger'

const logger = new Logger("PublishExecutor")

export interface PublishResult {
  success: boolean
  tweetId?: string
  tweetUrl?: string
  errorMsg?: string
  username?: string
}

const CREATE_TWEET_QID = "H-t2v_HvFR07ZBP9aOeKoA"

const CREATE_TWEET_FEATURES = {
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  rweb_conversational_replies_downvote_enabled: false,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: false,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  articles_preview_enabled: true,
  rweb_cashtags_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true
}

export async function executePublish(profileId: number, content: string): Promise<PublishResult> {
  try {
    logger.info("[Executor] 开始为 Profile " + profileId + " 发布推文")

    const client = new XGraphQLClient()
    const cookies = await client.loadCookiesFromProfile(profileId)
    if (!cookies.auth_token || !cookies.ct0) {
      return { success: false, errorMsg: "Not logged in" }
    }

    const variables = {
      tweet_text: content,
      media: { media_entities: [], possibly_sensitive: false },
      semantic_annotation_ids: [],
      disallowed_reply_options: null,
      semantic_annotation_options: { composition_signal_1: true, source: "Profile" }
    }

    const { data } = await client.graphqlRequest(
      CREATE_TWEET_QID,
      "CreateTweet",
      variables,
      CREATE_TWEET_FEATURES
    )

    const tweetResults = data?.data?.create_tweet?.tweet_results
    const tweetResult = tweetResults?.result

    if (tweetResult) {
      const restId = tweetResult.rest_id
      const u = tweetResult.core?.user_results?.result
      const screenName = u?.core?.screen_name || u?.legacy?.screen_name || u?.screen_name || ""
      const tweetUrl = screenName
        ? "https://x.com/" + screenName + "/status/" + restId
        : "https://x.com/i/web/status/" + restId
      logger.info("[Executor] OK: " + tweetUrl)
      return { success: true, tweetId: restId, tweetUrl, username: screenName }
    }

    if (tweetResults && Object.keys(tweetResults).length === 0) {
      return {
        success: false,
        errorMsg: "X软拒绝：CreateTweet 返回空 tweet_results（可能是风控/重复内容/请求上下文不足）"
      }
    }

    const errors = data?.errors
    if (errors && errors.length > 0) {
      const err = errors[0]
      let msg = err.message || "Unknown"
      if (err.code === 187) msg = "Duplicate (187)"
      else if (err.code === 326) msg = "Account restricted (326)"
      logger.error("[Executor] " + msg)
      return { success: false, errorMsg: msg }
    }

    const raw = JSON.stringify(data || {}).substring(0, 500)
    return { success: false, errorMsg: "Publish failed: " + raw }
  } catch (err: any) {
    const msg = err.message || String(err)
    logger.error("[Executor] " + msg)
    if (msg.includes("auth_token") || msg.includes("ct0") || msg.includes("401") || msg.includes("403")) return { success: false, errorMsg: "Cookie expired" }
    if (msg.includes("429") || msg.includes("Rate Limit")) return { success: false, errorMsg: "Rate limited (429)" }
    if (msg.includes("ECONNREFUSED") || msg.includes("refused")) return { success: false, errorMsg: "Window closed" }
    return { success: false, errorMsg: msg.substring(0, 200) }
  }
}
