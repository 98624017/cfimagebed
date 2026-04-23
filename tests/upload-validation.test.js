import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClientKey, buildGlobalConfigKey } from '../src/lib/kv-keys.js';
import { createEnv, createUploadRequest, createWorker, putJson } from './helpers.js';

async function createValidatedEnv(configOverrides = {}) {
  const env = createEnv({
    IMAGEBED_R2: { put: async () => {} },
    R2_PUBLIC_BASE_URL: 'https://r2.example.com',
  });

  await putJson(env.IMAGEBED_KV, buildClientKey('client-media-check'), {
    client_id: 'client-media-check',
    status: 'active',
    allow_auto_register: true,
  });

  if (Object.keys(configOverrides).length > 0) {
    await putJson(env.IMAGEBED_KV, buildGlobalConfigKey(), {
      upload_mode: 'r2_only',
      ...configOverrides,
    });
  } else {
    await putJson(env.IMAGEBED_KV, buildGlobalConfigKey(), {
      upload_mode: 'r2_only',
    });
  }

  return env;
}

test('upload rejects unsupported file type', async () => {
  const worker = await createWorker();
  const env = await createValidatedEnv();
  const request = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-media-check',
    'X-Install-Id': 'install-text',
  }, {
    body: 'plain text file',
    filename: 'demo.txt',
    type: 'text/plain',
  });

  const response = await worker.fetch(request, env, {});
  const payload = await response.json();

  assert.equal(response.status, 415);
  assert.equal(payload.error.code, 'unsupported_media_type');
});

test('upload rejects image files above configured limit', async () => {
  const worker = await createWorker();
  const env = await createValidatedEnv({
    media_size_limits_mb: {
      image: 1,
    },
  });
  const request = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-media-check',
    'X-Install-Id': 'install-image-limit',
  }, {
    body: 'a'.repeat((1024 * 1024) + 1),
    filename: 'demo.png',
    type: 'image/png',
  });

  const response = await worker.fetch(request, env, {});
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(payload.error.code, 'file_too_large');
  assert.match(payload.error.message, /1 MB/);
});

test('upload rejects video files above configured limit', async () => {
  const worker = await createWorker();
  const env = await createValidatedEnv({
    media_size_limits_mb: {
      video: 1,
    },
  });
  const request = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-media-check',
    'X-Install-Id': 'install-video-limit',
  }, {
    body: 'v'.repeat((1024 * 1024) + 1),
    filename: 'demo.mp4',
    type: 'video/mp4',
  });

  const response = await worker.fetch(request, env, {});
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(payload.error.code, 'file_too_large');
  assert.match(payload.error.message, /Video file exceeds 1 MB limit/);
});

test('upload rejects audio files above configured limit', async () => {
  const worker = await createWorker();
  const env = await createValidatedEnv({
    media_size_limits_mb: {
      audio: 1,
    },
  });
  const request = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-media-check',
    'X-Install-Id': 'install-audio-limit',
  }, {
    body: 'm'.repeat((1024 * 1024) + 1),
    filename: 'demo.mp3',
    type: 'audio/mpeg',
  });

  const response = await worker.fetch(request, env, {});
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(payload.error.code, 'file_too_large');
  assert.match(payload.error.message, /Audio file exceeds 1 MB limit/);
});
