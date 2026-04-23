import { getKv } from '../lib/env.js';
import {
  buildClientRateLimitKey,
  buildInstallRateLimitKey,
} from '../lib/kv-keys.js';

function buildBucket(windowSeconds, nowMs) {
  const windowMs = windowSeconds * 1000;
  return Math.floor(nowMs / windowMs);
}

async function consumeLimit(kv, key, limit, windowSeconds) {
  if (!Number.isFinite(limit) || limit <= 0) {
    return { allowed: true };
  }

  const current = await kv.get(key, { type: 'json' });
  const count = (current?.count || 0) + 1;
  if (count > limit) {
    return { allowed: false };
  }

  await kv.put(key, JSON.stringify({ count }), {
    expirationTtl: windowSeconds,
  });

  return { allowed: true, count };
}

export async function consumeClientRateLimits(env, client, globalConfig, nowMs) {
  const kv = getKv(env);
  const effective = {
    ...globalConfig.default_client_rate_limit,
    ...(client.rate_limit || {}),
  };

  const minuteBucket = buildBucket(60, nowMs);
  const hourBucket = buildBucket(3600, nowMs);

  const minuteResult = await consumeLimit(
    kv,
    buildClientRateLimitKey(client.client_id, minuteBucket),
    effective.per_minute,
    60,
  );
  if (!minuteResult.allowed) {
    return minuteResult;
  }

  return consumeLimit(
    kv,
    buildClientRateLimitKey(client.client_id, hourBucket),
    effective.per_hour,
    3600,
  );
}

export async function consumeInstallRateLimits(env, clientId, installId, install, globalConfig, nowMs) {
  const kv = getKv(env);
  const effective = {
    ...globalConfig.default_install_rate_limit,
    ...(install.rate_limit || {}),
  };
  const minuteBucket = buildBucket(60, nowMs);

  return consumeLimit(
    kv,
    buildInstallRateLimitKey(clientId, installId, minuteBucket),
    effective.per_minute,
    60,
  );
}
