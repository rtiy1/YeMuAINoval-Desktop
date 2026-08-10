import axios from 'axios'
import { getAnthropicApiKey } from 'src/utils/auth.js'
import { getOauthConfig } from '../../constants/oauth.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { logForDebugging } from '../../utils/debug.js'
import { logError } from '../../utils/log.js'
import { isEssentialTrafficOnly } from '../../utils/privacyLevel.js'
import { getMCodeUserAgent } from '../../utils/userAgent.js'
import type { ModelOption } from '../../utils/model/modelOptions.js'

const MODELS_ENDPOINT = '/v1/models'
const FETCH_TIMEOUT_MS = 5_000
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

type ApiModelsResponse = {
  data?: Array<{
    id?: string
    display_name?: string
    name?: string
  }>
}

/**
 * Model list source: the user-configured API base URL (ANTHROPIC_BASE_URL or
 * the default API origin). Supports both Anthropic-style
 * `{ data: [{ id, display_name }] }` and OpenAI-compatible
 * `{ data: [{ id }] }` responses. Fails silently — the built-in model list
 * remains the fallback.
 */
export async function refreshApiModels(): Promise<void> {
  const config = getGlobalConfig()
  const cached = config.mcodeApiModelsCache
  if (
    cached &&
    cached.fetchedAt &&
    Date.now() - cached.fetchedAt < CACHE_TTL_MS
  ) {
    return
  }

  if (isEssentialTrafficOnly()) {
    logForDebugging('[Models] Skipped: Nonessential traffic disabled')
    return
  }

  const baseUrl = (process.env.ANTHROPIC_BASE_URL || getOauthConfig().BASE_API_URL).replace(/\/+$/, '')
  const apiKey = getAnthropicApiKey()
  if (!apiKey) {
    logForDebugging('[Models] Skipped: no API key configured')
    return
  }

  try {
    const response = await axios.get<ApiModelsResponse>(
      `${baseUrl}${MODELS_ENDPOINT}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'x-api-key': apiKey,
          'User-Agent': getMCodeUserAgent(),
        },
        timeout: FETCH_TIMEOUT_MS,
      },
    )
    const data = response.data?.data
    if (!Array.isArray(data) || data.length === 0) {
      return
    }
    const models: ModelOption[] = []
    for (const m of data) {
      if (!m.id || !m.id.trim()) continue
      const label = m.display_name || m.name || m.id
      models.push({
        value: m.id,
        label,
        description: m.id,
      })
    }
    if (models.length === 0) return
    saveGlobalConfig(current => ({
      ...current,
      mcodeApiModelsCache: {
        models,
        fetchedAt: Date.now(),
        source: baseUrl,
      },
    }))
    logForDebugging(`[Models] Fetched ${models.length} models from ${baseUrl}`)
  } catch (error) {
    // Never block startup on a model-list fetch failure; the built-in list
    // is always available as the fallback.
    logError(error)
  }
}
