import { getKv } from '../lib/env.js';
import { withCorsHeaders } from '../lib/http.js';
import { uploadToUguu } from './storage-uguu.js';
import { uploadToR2 } from './storage-r2.js';

function getUploadCacheTtlSeconds(env) {
  const rawValue = typeof env?.UPLOAD_CACHE_TTL_SECONDS === 'string' ? env.UPLOAD_CACHE_TTL_SECONDS.trim() : '';
  const ttl = Number.parseInt(rawValue || '0', 10);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    return 0;
  }

  return ttl;
}

export async function maybeReadCachedUploadResult(env, uploadCacheKey) {
  const ttl = getUploadCacheTtlSeconds(env);
  if (!uploadCacheKey || ttl <= 0) {
    return null;
  }

  const kv = getKv(env);
  return kv.get(uploadCacheKey, { type: 'json' });
}

export function buildCachedUploadResponse(cachedPayload) {
  return withCorsHeaders(
    new Response(cachedPayload.bodyText, {
      status: cachedPayload.status || 200,
      statusText: cachedPayload.statusText || 'OK',
      headers: cachedPayload.headers || { 'Content-Type': 'application/json' },
    }),
    {
      'X-Imagebed-Cache': 'HIT',
    },
  );
}

export async function maybePersistUploadResult(env, uploadCacheKey, result) {
  const ttl = getUploadCacheTtlSeconds(env);
  if (!uploadCacheKey || ttl <= 0 || !result.cacheable || !result.ok) {
    return;
  }

  const kv = getKv(env);
  await kv.put(uploadCacheKey, JSON.stringify({
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
    bodyText: result.bodyText,
  }), {
    expirationTtl: ttl,
  });
}

export async function executeUpload(request, env, globalConfig) {
  const mode = globalConfig.upload_mode;

  if (mode === 'r2_only') {
    return uploadToR2(request, env);
  }

  if (mode === 'uguu_only') {
    return uploadToUguu(request, env);
  }

  if (mode === 'uguu_failover_r2') {
    try {
      const uguuResult = await uploadToUguu(request.clone(), env);
      if (uguuResult.ok) {
        return uguuResult;
      }
    } catch {
      // 交给 R2 兜底
    }

    return uploadToR2(request, env);
  }

  throw new Error(`Unsupported upload mode: ${mode}`);
}
