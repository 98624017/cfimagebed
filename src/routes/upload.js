import { getKv } from '../lib/env.js';
import { jsonError, jsonResponse, withCorsHeaders } from '../lib/http.js';
import { buildUploadCacheKey } from '../lib/file-meta.js';
import { getClientConfig } from '../services/client-registry.js';
import { getGlobalConfig } from '../services/global-config.js';
import {
  ensureInstallRecord,
  recordInstallActivity,
} from '../services/install-registry.js';
import {
  consumeClientRateLimits,
  consumeInstallRateLimits,
} from '../services/rate-limit.js';
import {
  buildCachedUploadResponse,
  executeUpload,
  maybePersistUploadResult,
  maybeReadCachedUploadResult,
} from '../services/storage-router.js';
import { validateUploadFiles } from '../services/upload-validation.js';

export function resetUploadRouteState() {
}

function getRequiredHeader(request, name) {
  const value = request.headers.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export async function handleUploadRequest(request, env) {
  if (request.method === 'OPTIONS') {
    return withCorsHeaders(new Response(null, { status: 204 }));
  }

  if (request.method !== 'POST') {
    return jsonError(405, 'unsupported_method', 'Upload endpoint only accepts POST.');
  }

  try {
    getKv(env);
  } catch (error) {
    return jsonError(500, 'internal_error', error.message);
  }

  const clientId = getRequiredHeader(request, 'X-Client-Id');
  if (!clientId) {
    return jsonError(400, 'missing_client_id', 'Missing X-Client-Id header.');
  }

  const installId = getRequiredHeader(request, 'X-Install-Id');
  if (!installId) {
    return jsonError(400, 'missing_install_id', 'Missing X-Install-Id header.');
  }

  const nowMs = Date.now();
  const globalConfig = await getGlobalConfig(env);
  const client = await getClientConfig(env, clientId);
  if (!client) {
    return jsonError(403, 'invalid_client', 'Unknown client_id.');
  }

  if (client.status !== 'active') {
    return jsonError(403, 'client_disabled', 'Client is disabled.');
  }

  const installResult = await ensureInstallRecord(env, client, installId, globalConfig, nowMs);
  if (installResult.error) {
    return jsonError(
      installResult.error.status,
      installResult.error.code,
      installResult.error.message,
    );
  }

  const { install } = installResult;
  const validationError = await validateUploadFiles(request, globalConfig);
  if (validationError) {
    await recordInstallActivity(env, install, { errored: true, uploaded: false }, nowMs);
    return jsonError(validationError.status, validationError.code, validationError.message);
  }

  const uploadCacheKey = await buildUploadCacheKey(request);
  const cachedPayload = await maybeReadCachedUploadResult(env, uploadCacheKey);
  if (cachedPayload) {
    await recordInstallActivity(env, install, { errored: false, uploaded: true }, nowMs);
    return buildCachedUploadResponse(cachedPayload);
  }

  const clientRateLimit = await consumeClientRateLimits(env, client, globalConfig, nowMs);
  if (!clientRateLimit.allowed) {
    await recordInstallActivity(env, install, { errored: true, uploaded: false }, nowMs);
    return jsonError(429, 'rate_limited', 'Client rate limit exceeded.');
  }

  const installRateLimit = await consumeInstallRateLimits(env, clientId, installId, install, globalConfig, nowMs);
  if (!installRateLimit.allowed) {
    await recordInstallActivity(env, install, { errored: true, uploaded: false }, nowMs);
    return jsonError(429, 'rate_limited', 'Install rate limit exceeded.');
  }

  try {
    const uploadResult = await executeUpload(request, env, globalConfig);
    await maybePersistUploadResult(env, uploadCacheKey, uploadResult);
    await recordInstallActivity(env, install, {
      errored: !uploadResult.ok,
      uploaded: uploadResult.ok,
    }, nowMs);

    return uploadResult.response;
  } catch (error) {
    await recordInstallActivity(env, install, { errored: true, uploaded: false }, nowMs);
    return jsonError(500, 'internal_error', error instanceof Error ? error.message : 'Unexpected error.');
  }
}
