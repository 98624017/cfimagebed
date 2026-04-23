import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClientKey, buildInstallKey } from '../src/lib/kv-keys.js';
import {
  createEnv,
  createUploadRequest,
  createWorker,
  MemoryR2Bucket,
  putJson,
} from './helpers.js';

test('client rate limit returns rate_limited', async () => {
  const worker = await createWorker();
  const env = createEnv({
    IMAGEBED_R2: new MemoryR2Bucket(),
    R2_PUBLIC_BASE_URL: 'https://r2.example.com',
  });
  await putJson(env.IMAGEBED_KV, buildClientKey('client-rate-limit'), {
    client_id: 'client-rate-limit',
    status: 'active',
    allow_auto_register: true,
    rate_limit: {
      per_minute: 1,
      per_hour: 100,
    },
  });
  await putJson(env.IMAGEBED_KV, 'config:global', {
    upload_mode: 'r2_only',
  });

  const firstRequest = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-rate-limit',
    'X-Install-Id': 'install-one',
  });
  const secondRequest = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-rate-limit',
    'X-Install-Id': 'install-two',
  });

  const firstResponse = await worker.fetch(firstRequest, env, {});
  assert.equal(firstResponse.status, 200);

  const secondResponse = await worker.fetch(secondRequest, env, {});
  const secondPayload = await secondResponse.json();

  assert.equal(secondResponse.status, 429);
  assert.equal(secondPayload.error.code, 'rate_limited');
});

test('install rate limit returns rate_limited', async () => {
  const worker = await createWorker();
  const env = createEnv({
    IMAGEBED_R2: new MemoryR2Bucket(),
    R2_PUBLIC_BASE_URL: 'https://r2.example.com',
  });
  await putJson(env.IMAGEBED_KV, buildClientKey('client-install-limit'), {
    client_id: 'client-install-limit',
    status: 'active',
    allow_auto_register: true,
    rate_limit: {
      per_minute: 100,
      per_hour: 1000,
    },
  });
  await putJson(env.IMAGEBED_KV, buildInstallKey('client-install-limit', 'install-limit'), {
    client_id: 'client-install-limit',
    install_id: 'install-limit',
    status: 'active',
    request_count: 0,
    upload_count: 0,
    error_count: 0,
  });
  await putJson(env.IMAGEBED_KV, 'config:global', {
    upload_mode: 'r2_only',
    default_install_rate_limit: {
      per_minute: 1,
    },
  });

  const firstRequest = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-install-limit',
    'X-Install-Id': 'install-limit',
  });
  const secondRequest = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-install-limit',
    'X-Install-Id': 'install-limit',
  });

  const firstResponse = await worker.fetch(firstRequest, env, {});
  assert.equal(firstResponse.status, 200);

  const secondResponse = await worker.fetch(secondRequest, env, {});
  const secondPayload = await secondResponse.json();

  assert.equal(secondResponse.status, 429);
  assert.equal(secondPayload.error.code, 'rate_limited');
});
