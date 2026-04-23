import { getEnvValue } from '../lib/env.js';
import { jsonResponse } from '../lib/http.js';
import {
  buildPublicFileUrl,
  buildR2ObjectKey,
  extractUploadFiles,
} from '../lib/file-meta.js';

function getR2Bucket(env) {
  const bucket = env?.IMAGEBED_R2;
  if (!bucket || typeof bucket.put !== 'function') {
    throw new Error('Missing IMAGEBED_R2 binding.');
  }

  return bucket;
}

function normalizePrefix(prefix) {
  const value = typeof prefix === 'string' ? prefix.trim() : '';
  return value ? value.replace(/^\/+|\/+$/g, '') : '';
}

function buildKeyWithPrefix(prefix, key) {
  return prefix ? `${prefix}/${key}` : key;
}

function isPreviewWorkersHostname(request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  if (!hostname.endsWith('.workers.dev')) {
    return false;
  }

  const firstLabel = hostname.split('.')[0] || '';
  return firstLabel !== 'cfimagebed';
}

function resolvePublicBaseUrl(request, env) {
  const defaultBaseUrl = getEnvValue(env, 'R2_PUBLIC_BASE_URL');
  const previewBaseUrl = getEnvValue(env, 'R2_PREVIEW_PUBLIC_BASE_URL');
  if (previewBaseUrl && isPreviewWorkersHostname(request)) {
    return previewBaseUrl;
  }

  return defaultBaseUrl;
}

export async function uploadToR2(request, env, now = new Date()) {
  const bucket = getR2Bucket(env);
  const publicBaseUrl = resolvePublicBaseUrl(request, env);
  if (!publicBaseUrl) {
    throw new Error('Missing R2_PUBLIC_BASE_URL.');
  }

  const prefix = normalizePrefix(getEnvValue(env, 'R2_OBJECT_PREFIX'));
  const files = await extractUploadFiles(request);
  if (files.length === 0) {
    throw new Error('No upload file found.');
  }

  const uploadedFiles = [];

  for (const entry of files) {
    const objectKey = buildKeyWithPrefix(prefix, buildR2ObjectKey(entry.file, now));
    const bytes = await entry.file.arrayBuffer();

    await bucket.put(objectKey, bytes, {
      httpMetadata: {
        contentType: entry.file.type || 'application/octet-stream',
      },
    });

    uploadedFiles.push({
      hash: objectKey,
      filename: entry.file.name || objectKey.split('/').pop(),
      url: buildPublicFileUrl(publicBaseUrl, objectKey),
      size: entry.file.size,
      dupe: false,
    });
  }

  const payload = {
    success: true,
    files: uploadedFiles,
  };

  return {
    backend: 'r2',
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {
      'Content-Type': 'application/json',
    },
    bodyText: JSON.stringify(payload),
    response: jsonResponse(200, payload),
    cacheable: true,
  };
}
