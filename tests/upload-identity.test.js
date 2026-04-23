import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClientKey, buildInstallKey } from '../src/lib/kv-keys.js';
import {
  createEnv,
  createUploadRequest,
  createWorker,
  getJson,
  MemoryR2Bucket,
  putJson,
} from './helpers.js';

test('unknown client_id returns invalid_client', async () => {
  const worker = await createWorker();
  const env = createEnv();
  const request = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'missing-client',
    'X-Install-Id': 'install-a',
  });

  const response = await worker.fetch(request, env, {});
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.error.code, 'invalid_client');
});

test('disabled client returns client_disabled', async () => {
  const worker = await createWorker();
  const env = createEnv();
  await putJson(env.IMAGEBED_KV, buildClientKey('client-disabled'), {
    client_id: 'client-disabled',
    status: 'disabled',
    allow_auto_register: true,
  });

  const request = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-disabled',
    'X-Install-Id': 'install-a',
  });

  const response = await worker.fetch(request, env, {});
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.error.code, 'client_disabled');
});

test('unknown install auto-registers when client allows it', async () => {
  const worker = await createWorker();
  const env = createEnv({
    IMAGEBED_R2: new MemoryR2Bucket(),
    R2_PUBLIC_BASE_URL: 'https://r2.example.com',
  });
  await putJson(env.IMAGEBED_KV, buildClientKey('client-auto'), {
    client_id: 'client-auto',
    status: 'active',
    allow_auto_register: true,
    rate_limit: {
      per_minute: 100,
      per_hour: 1000,
    },
  });
  await putJson(env.IMAGEBED_KV, 'config:global', {
    upload_mode: 'r2_only',
  });

  const request = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-auto',
    'X-Install-Id': 'install-new',
  });

  const response = await worker.fetch(request, env, {});
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.match(payload.files[0].url, /^https:\/\/r2\.example\.com\//);

  const install = await getJson(env.IMAGEBED_KV, buildInstallKey('client-auto', 'install-new'));
  assert.equal(install.status, 'active');
  assert.equal(install.request_count, 1);
  assert.equal(install.upload_count, 1);
});

test('unknown install is rejected when auto-register is disabled', async () => {
  const worker = await createWorker();
  const env = createEnv();
  await putJson(env.IMAGEBED_KV, buildClientKey('client-closed'), {
    client_id: 'client-closed',
    status: 'active',
    allow_auto_register: false,
    rate_limit: {
      per_minute: 100,
      per_hour: 1000,
    },
  });

  const request = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-closed',
    'X-Install-Id': 'install-new',
  });

  const response = await worker.fetch(request, env, {});
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.error.code, 'install_blocked');
});

test('blocked install is rejected', async () => {
  const worker = await createWorker();
  const env = createEnv();
  await putJson(env.IMAGEBED_KV, buildClientKey('client-blocked'), {
    client_id: 'client-blocked',
    status: 'active',
    allow_auto_register: true,
  });
  await putJson(env.IMAGEBED_KV, buildInstallKey('client-blocked', 'install-blocked'), {
    client_id: 'client-blocked',
    install_id: 'install-blocked',
    status: 'blocked_perm',
    request_count: 4,
    upload_count: 2,
    error_count: 1,
  });

  const request = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-blocked',
    'X-Install-Id': 'install-blocked',
  });

  const response = await worker.fetch(request, env, {});
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.error.code, 'install_blocked');
});
