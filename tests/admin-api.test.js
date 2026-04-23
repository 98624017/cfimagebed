import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { buildClientKey, buildInstallKey } from '../src/lib/kv-keys.js';
import { createEnv, createWorker, putJson } from './helpers.js';

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('admin login success sets session cookie', async () => {
  const worker = await createWorker();
  const env = createEnv({
    ADMIN_PASSWORD_HASH: sha256Hex('secret-pass'),
  });
  const form = new FormData();
  form.set('password', 'secret-pass');
  const request = new Request('https://cfimagebed.example/admin/login', {
    method: 'POST',
    body: form,
  });

  const response = await worker.fetch(request, env, {});

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), '/admin');
  assert.match(response.headers.get('Set-Cookie') || '', /cfimagebed_admin_session=/);
});

test('authenticated admin can read default config', async () => {
  const worker = await createWorker();
  const env = createEnv({
    ADMIN_PASSWORD_HASH: sha256Hex('secret-pass'),
  });

  const loginForm = new FormData();
  loginForm.set('password', 'secret-pass');
  const loginResponse = await worker.fetch(new Request('https://cfimagebed.example/admin/login', {
    method: 'POST',
    body: loginForm,
  }), env, {});
  const cookie = loginResponse.headers.get('Set-Cookie');
  assert.ok(cookie);

  const response = await worker.fetch(new Request('https://cfimagebed.example/admin/api/config', {
    headers: {
      Cookie: cookie,
    },
  }), env, {});
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.config.upload_mode, 'uguu_only');
  assert.equal(payload.config.default_allow_auto_register, true);
  assert.equal(payload.config.media_size_limits_mb.image, 25);
  assert.equal(payload.config.media_size_limits_mb.video, 150);
  assert.equal(payload.config.media_size_limits_mb.audio, 15);
});

test('authenticated admin can create and list clients', async () => {
  const worker = await createWorker();
  const env = createEnv({
    ADMIN_PASSWORD_HASH: sha256Hex('secret-pass'),
  });

  const loginForm = new FormData();
  loginForm.set('password', 'secret-pass');
  const loginResponse = await worker.fetch(new Request('https://cfimagebed.example/admin/login', {
    method: 'POST',
    body: loginForm,
  }), env, {});
  const cookie = loginResponse.headers.get('Set-Cookie');
  assert.ok(cookie);

  const createResponse = await worker.fetch(new Request('https://cfimagebed.example/admin/api/clients', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: 'client-admin-created',
      name: 'Admin Created',
      allow_auto_register: false,
      rate_limit: {
        per_minute: 30,
      },
    }),
  }), env, {});
  const createPayload = await createResponse.json();

  assert.equal(createResponse.status, 200);
  assert.equal(createPayload.client.client_id, 'client-admin-created');
  assert.equal(createPayload.client.allow_auto_register, false);

  const listResponse = await worker.fetch(new Request('https://cfimagebed.example/admin/api/clients', {
    headers: {
      Cookie: cookie,
    },
  }), env, {});
  const listPayload = await listResponse.json();

  assert.equal(listResponse.status, 200);
  assert.equal(listPayload.clients.length, 1);
  assert.equal(listPayload.clients[0].client_id, 'client-admin-created');
});

test('authenticated admin can list and update installs', async () => {
  const worker = await createWorker();
  const env = createEnv({
    ADMIN_PASSWORD_HASH: sha256Hex('secret-pass'),
  });
  await putJson(env.IMAGEBED_KV, buildClientKey('client-install-admin'), {
    client_id: 'client-install-admin',
    status: 'active',
    allow_auto_register: true,
  });
  await putJson(env.IMAGEBED_KV, 'index:installs:client-install-admin', ['install-admin']);
  await putJson(env.IMAGEBED_KV, buildInstallKey('client-install-admin', 'install-admin'), {
    client_id: 'client-install-admin',
    install_id: 'install-admin',
    status: 'active',
    request_count: 3,
    upload_count: 2,
    error_count: 0,
  });

  const loginForm = new FormData();
  loginForm.set('password', 'secret-pass');
  const loginResponse = await worker.fetch(new Request('https://cfimagebed.example/admin/login', {
    method: 'POST',
    body: loginForm,
  }), env, {});
  const cookie = loginResponse.headers.get('Set-Cookie');
  assert.ok(cookie);

  const pageResponse = await worker.fetch(new Request('https://cfimagebed.example/admin/installs?client_id=client-install-admin', {
    headers: {
      Cookie: cookie,
    },
  }), env, {});
  const html = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.match(html, /install-admin/);

  const form = new FormData();
  form.set('client_id', 'client-install-admin');
  form.set('install_id', 'install-admin');
  form.set('action', 'block_perm');
  const blockResponse = await worker.fetch(new Request('https://cfimagebed.example/admin/installs', {
    method: 'POST',
    headers: {
      Cookie: cookie,
    },
    body: form,
  }), env, {});

  assert.equal(blockResponse.status, 302);

  const updatedInstall = await env.IMAGEBED_KV.get(buildInstallKey('client-install-admin', 'install-admin'), { type: 'json' });
  assert.equal(updatedInstall.status, 'blocked_perm');
});

test('authenticated admin installs api supports filtering and patch updates', async () => {
  const worker = await createWorker();
  const env = createEnv({
    ADMIN_PASSWORD_HASH: sha256Hex('secret-pass'),
  });
  await putJson(env.IMAGEBED_KV, buildClientKey('client-install-api'), {
    client_id: 'client-install-api',
    status: 'active',
    allow_auto_register: true,
  });
  await putJson(env.IMAGEBED_KV, 'index:installs:client-install-api', ['install-foo', 'install-bar']);
  await putJson(env.IMAGEBED_KV, buildInstallKey('client-install-api', 'install-foo'), {
    client_id: 'client-install-api',
    install_id: 'install-foo',
    status: 'active',
    request_count: 1,
    upload_count: 1,
    error_count: 0,
  });
  await putJson(env.IMAGEBED_KV, buildInstallKey('client-install-api', 'install-bar'), {
    client_id: 'client-install-api',
    install_id: 'install-bar',
    status: 'blocked_temp',
    request_count: 3,
    upload_count: 2,
    error_count: 1,
  });

  const loginForm = new FormData();
  loginForm.set('password', 'secret-pass');
  const loginResponse = await worker.fetch(new Request('https://cfimagebed.example/admin/login', {
    method: 'POST',
    body: loginForm,
  }), env, {});
  const cookie = loginResponse.headers.get('Set-Cookie');
  assert.ok(cookie);

  const listResponse = await worker.fetch(new Request('https://cfimagebed.example/admin/api/installs?client_id=client-install-api&q=bar', {
    headers: {
      Cookie: cookie,
    },
  }), env, {});
  const listPayload = await listResponse.json();

  assert.equal(listResponse.status, 200);
  assert.equal(listPayload.installs.length, 1);
  assert.equal(listPayload.installs[0].install_id, 'install-bar');
  assert.equal(listPayload.summary.blocked, 1);

  const patchResponse = await worker.fetch(new Request('https://cfimagebed.example/admin/api/installs', {
    method: 'PATCH',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: 'client-install-api',
      install_id: 'install-bar',
      action: 'unblock',
    }),
  }), env, {});
  const patchPayload = await patchResponse.json();

  assert.equal(patchResponse.status, 200);
  assert.equal(patchPayload.install.status, 'active');
});
