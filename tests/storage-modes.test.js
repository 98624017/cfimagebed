import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClientKey } from '../src/lib/kv-keys.js';
import {
  createEnv,
  createUploadRequest,
  createWorker,
  installFetchMock,
  MemoryR2Bucket,
  putJson,
} from './helpers.js';

test('uguu_only mode forwards upload to uguu and returns upstream body', async () => {
  const worker = await createWorker();
  const env = createEnv();
  await putJson(env.IMAGEBED_KV, buildClientKey('client-uguu'), {
    client_id: 'client-uguu',
    status: 'active',
    allow_auto_register: true,
  });

  const request = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-uguu',
    'X-Install-Id': 'install-uguu',
  });

  const restoreFetch = installFetchMock(async (input, init = {}) => {
    assert.equal(input.toString(), 'https://uguu.se/upload');
    assert.equal(init.method, 'POST');
    return new Response(JSON.stringify({
      success: true,
      files: [{ url: 'https://uguu.se/files/demo.png', filename: 'demo.png', size: 10 }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  try {
    const response = await worker.fetch(request, env, {});
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.files[0].url, 'https://uguu.se/files/demo.png');
  } finally {
    restoreFetch();
  }
});

test('r2_only mode stores file in R2 and returns uguu-compatible payload', async () => {
  const worker = await createWorker();
  const env = createEnv({
    IMAGEBED_R2: new MemoryR2Bucket(),
    R2_PUBLIC_BASE_URL: 'https://r2.example.com',
  });
  await putJson(env.IMAGEBED_KV, buildClientKey('client-r2'), {
    client_id: 'client-r2',
    status: 'active',
    allow_auto_register: true,
  });
  await putJson(env.IMAGEBED_KV, 'config:global', {
    upload_mode: 'r2_only',
  });

  const request = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-r2',
    'X-Install-Id': 'install-r2',
  });

  const response = await worker.fetch(request, env, {});
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.match(payload.files[0].url, /^https:\/\/r2\.example\.com\//);
  assert.equal(env.IMAGEBED_R2.putCalls.length, 1);
  assert.match(env.IMAGEBED_R2.putCalls[0].key, /^\d{4}\/\d{2}\/\d{2}\//);
});

test('uguu_failover_r2 falls back to R2 when uguu returns non-2xx', async () => {
  const worker = await createWorker();
  const env = createEnv({
    IMAGEBED_R2: new MemoryR2Bucket(),
    R2_PUBLIC_BASE_URL: 'https://r2.example.com',
  });
  await putJson(env.IMAGEBED_KV, buildClientKey('client-failover'), {
    client_id: 'client-failover',
    status: 'active',
    allow_auto_register: true,
  });
  await putJson(env.IMAGEBED_KV, 'config:global', {
    upload_mode: 'uguu_failover_r2',
  });

  const request = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-failover',
    'X-Install-Id': 'install-failover',
  });

  const restoreFetch = installFetchMock(async () => new Response('upstream failed', {
    status: 500,
    headers: { 'Content-Type': 'text/plain' },
  }));

  try {
    const response = await worker.fetch(request, env, {});
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.match(payload.files[0].url, /^https:\/\/r2\.example\.com\//);
    assert.equal(env.IMAGEBED_R2.putCalls.length, 1);
  } finally {
    restoreFetch();
  }
});
