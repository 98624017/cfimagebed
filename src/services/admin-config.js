import { getKv } from '../lib/env.js';
import { buildGlobalConfigKey } from '../lib/kv-keys.js';
import { getGlobalConfig } from './global-config.js';

export async function readAdminConfig(env) {
  return getGlobalConfig(env);
}

export async function updateAdminConfig(env, partialConfig) {
  const kv = getKv(env);
  const current = await getGlobalConfig(env);
  const nextConfig = {
    ...current,
    ...partialConfig,
    default_client_rate_limit: {
      ...current.default_client_rate_limit,
      ...(partialConfig.default_client_rate_limit || {}),
    },
    default_install_rate_limit: {
      ...current.default_install_rate_limit,
      ...(partialConfig.default_install_rate_limit || {}),
    },
    media_size_limits_mb: {
      ...current.media_size_limits_mb,
      ...(partialConfig.media_size_limits_mb || {}),
    },
    updated_at: new Date().toISOString(),
  };

  await kv.put(buildGlobalConfigKey(), JSON.stringify(nextConfig));
  return nextConfig;
}
