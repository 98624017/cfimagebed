import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClientKey } from '../src/lib/kv-keys.js';
import {
  createEnv,
  createUploadRequest,
  createWorker,
  MemoryR2Bucket,
  putJson,
} from './helpers.js';

test('upload cache stores final response and serves subsequent identical upload', async () => {
  const worker = await createWorker();
  const env = createEnv({
    IMAGEBED_R2: new MemoryR2Bucket(),
    R2_PUBLIC_BASE_URL: 'https://r2.example.com',
    UPLOAD_CACHE_TTL_SECONDS: '9000',
  });
  await putJson(env.IMAGEBED_KV, buildClientKey('client-cache'), {
    client_id: 'client-cache',
    status: 'active',
    allow_auto_register: true,
  });
  await putJson(env.IMAGEBED_KV, 'config:global', {
    upload_mode: 'r2_only',
  });

  const firstRequest = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-cache',
    'X-Install-Id': 'install-cache',
  });
  const secondRequest = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-cache',
    'X-Install-Id': 'install-cache',
  });

  const firstResponse = await worker.fetch(firstRequest, env, {});
  const firstPayload = await firstResponse.json();
  assert.equal(firstResponse.status, 200);
  assert.equal(firstPayload.success, true);
  assert.equal(env.IMAGEBED_R2.putCalls.length, 1);

  const secondResponse = await worker.fetch(secondRequest, env, {});
  const secondPayload = await secondResponse.json();
  assert.equal(secondResponse.status, 200);
  assert.equal(secondResponse.headers.get('X-Imagebed-Cache'), 'HIT');
  assert.equal(secondPayload.files[0].url, firstPayload.files[0].url);
  assert.equal(env.IMAGEBED_R2.putCalls.length, 1);
});
