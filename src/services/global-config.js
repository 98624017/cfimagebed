import { getKv } from '../lib/env.js';
import { buildGlobalConfigKey } from '../lib/kv-keys.js';

const DEFAULT_GLOBAL_CONFIG = {
  upload_mode: 'uguu_only',
  default_allow_auto_register: true,
  default_client_rate_limit: {
    per_minute: 120,
    per_hour: 3000,
  },
  default_install_rate_limit: {
    per_minute: 20,
  },
  default_cooldown_seconds: 300,
  media_size_limits_mb: {
    image: 25,
    video: 150,
    audio: 15,
  },
};

export async function getGlobalConfig(env) {
  const kv = getKv(env);
  const stored = await kv.get(buildGlobalConfigKey(), { type: 'json' });

  return {
    ...DEFAULT_GLOBAL_CONFIG,
    ...(stored || {}),
    default_client_rate_limit: {
      ...DEFAULT_GLOBAL_CONFIG.default_client_rate_limit,
      ...(stored?.default_client_rate_limit || {}),
    },
    default_install_rate_limit: {
      ...DEFAULT_GLOBAL_CONFIG.default_install_rate_limit,
      ...(stored?.default_install_rate_limit || {}),
    },
    media_size_limits_mb: {
      ...DEFAULT_GLOBAL_CONFIG.media_size_limits_mb,
      ...(stored?.media_size_limits_mb || {}),
    },
  };
}
