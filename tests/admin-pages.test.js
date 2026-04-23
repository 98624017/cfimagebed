import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createEnv, createWorker } from './helpers.js';

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function loginAndGetCookie(worker, env) {
  const form = new FormData();
  form.set('password', 'secret-pass');

  const response = await worker.fetch(new Request('https://cfimagebed.example/admin/login', {
    method: 'POST',
    body: form,
  }), env, {});

  const cookie = response.headers.get('Set-Cookie');
  assert.ok(cookie);
  return cookie;
}

test('unauthenticated admin page redirects to login', async () => {
  const worker = await createWorker();
  const env = createEnv();
  const response = await worker.fetch(new Request('https://cfimagebed.example/admin'), env, {});

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), '/admin/login');
});

test('authenticated dashboard page renders overview content', async () => {
  const worker = await createWorker();
  const env = createEnv({
    ADMIN_PASSWORD_HASH: sha256Hex('secret-pass'),
  });
  const cookie = await loginAndGetCookie(worker, env);

  const response = await worker.fetch(new Request('https://cfimagebed.example/admin', {
    headers: {
      Cookie: cookie,
    },
  }), env, {});
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /概览/);
  assert.match(html, /上传模式/);
  assert.match(html, /安装实例总数/);
});

test('authenticated clients page shows created client', async () => {
  const worker = await createWorker();
  const env = createEnv({
    ADMIN_PASSWORD_HASH: sha256Hex('secret-pass'),
  });
  const cookie = await loginAndGetCookie(worker, env);

  await worker.fetch(new Request('https://cfimagebed.example/admin/api/clients', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: 'client-page-visible',
      name: 'Page Visible',
      allow_auto_register: true,
    }),
  }), env, {});

  const response = await worker.fetch(new Request('https://cfimagebed.example/admin/clients', {
    headers: {
      Cookie: cookie,
    },
  }), env, {});
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /client-page-visible/);
  assert.match(html, /Page Visible/);
});

test('authenticated clients page can update existing client through form submit', async () => {
  const worker = await createWorker();
  const env = createEnv({
    ADMIN_PASSWORD_HASH: sha256Hex('secret-pass'),
  });
  const cookie = await loginAndGetCookie(worker, env);

  await worker.fetch(new Request('https://cfimagebed.example/admin/api/clients', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: 'client-editable',
      name: 'Before Edit',
      allow_auto_register: true,
    }),
  }), env, {});

  const form = new FormData();
  form.set('client_id', 'client-editable');
  form.set('name', 'After Edit');
  form.set('remark', 'edited from page');
  form.set('status', 'disabled');
  form.set('allow_auto_register', 'false');
  form.set('rate_per_minute', '77');
  form.set('rate_per_hour', '777');

  const saveResponse = await worker.fetch(new Request('https://cfimagebed.example/admin/clients', {
    method: 'POST',
    headers: {
      Cookie: cookie,
    },
    body: form,
  }), env, {});
  assert.equal(saveResponse.status, 302);
  assert.equal(saveResponse.headers.get('Location'), '/admin/clients?notice=Client+saved');

  const pageResponse = await worker.fetch(new Request('https://cfimagebed.example/admin/clients?notice=Client+saved', {
    headers: {
      Cookie: cookie,
    },
  }), env, {});
  const html = await pageResponse.text();

  assert.equal(pageResponse.status, 200);
  assert.match(html, /Client saved/);
  assert.match(html, /After Edit/);
  assert.match(html, /edited from page/);
});

test('authenticated config page can update upload mode through form submit', async () => {
  const worker = await createWorker();
  const env = createEnv({
    ADMIN_PASSWORD_HASH: sha256Hex('secret-pass'),
  });
  const cookie = await loginAndGetCookie(worker, env);

  const form = new FormData();
  form.set('upload_mode', 'r2_only');
  form.set('default_allow_auto_register', 'false');
  form.set('client_per_minute', '99');
  form.set('client_per_hour', '199');
  form.set('install_per_minute', '9');
  form.set('default_cooldown_seconds', '66');
  form.set('image_max_mb', '20');
  form.set('video_max_mb', '180');
  form.set('audio_max_mb', '12');

  const updateResponse = await worker.fetch(new Request('https://cfimagebed.example/admin/config', {
    method: 'POST',
    headers: {
      Cookie: cookie,
    },
    body: form,
  }), env, {});

  assert.equal(updateResponse.status, 302);
  assert.equal(updateResponse.headers.get('Location'), '/admin/config?notice=Config+saved');

  const configResponse = await worker.fetch(new Request('https://cfimagebed.example/admin/api/config', {
    headers: {
      Cookie: cookie,
    },
  }), env, {});
  const payload = await configResponse.json();

  assert.equal(payload.config.upload_mode, 'r2_only');
  assert.equal(payload.config.default_allow_auto_register, false);
  assert.equal(payload.config.default_client_rate_limit.per_minute, 99);
  assert.equal(payload.config.media_size_limits_mb.image, 20);
  assert.equal(payload.config.media_size_limits_mb.video, 180);
  assert.equal(payload.config.media_size_limits_mb.audio, 12);
});

test('authenticated installs page can filter by install_id keyword', async () => {
  const worker = await createWorker();
  const env = createEnv({
    ADMIN_PASSWORD_HASH: sha256Hex('secret-pass'),
  });
  const cookie = await loginAndGetCookie(worker, env);

  await worker.fetch(new Request('https://cfimagebed.example/admin/api/clients', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: 'client-filter',
      name: 'Filter Client',
    }),
  }), env, {});

  const createInstall = async (installId) => {
    const form = new FormData();
    form.set('files[]', new File(['demo'], 'demo.png', { type: 'image/png' }));
    form.set('output', 'json');
    const request = new Request('https://cfimagebed.example/upload', {
      method: 'POST',
      headers: {
        'X-Client-Id': 'client-filter',
        'X-Install-Id': installId,
      },
      body: form,
    });
    await worker.fetch(request, createEnv({
      ...env,
      IMAGEBED_KV: env.IMAGEBED_KV,
      IMAGEBED_R2: { put: async () => {} },
      R2_PUBLIC_BASE_URL: 'https://r2.example.com',
    }), {});
  };

  await createInstall('install-alpha');
  await createInstall('install-beta');

  const response = await worker.fetch(new Request('https://cfimagebed.example/admin/installs?client_id=client-filter&q=beta', {
    headers: {
      Cookie: cookie,
    },
  }), env, {});
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /install-beta/);
  assert.doesNotMatch(html, /install-alpha/);
});
