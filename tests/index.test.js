import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, createUploadRequest, createWorker } from './helpers.js';

test('upload route rejects requests without X-Client-Id', async () => {
  const worker = await createWorker();
  const request = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Install-Id': 'install-demo',
    Authorization: 'Bearer sk-legacy',
  });

  const response = await worker.fetch(request, createEnv(), {});
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, 'missing_client_id');
});

test('upload route rejects requests without X-Install-Id', async () => {
  const worker = await createWorker();
  const request = await createUploadRequest('https://cfimagebed.example/upload', {
    'X-Client-Id': 'client-demo',
  });

  const response = await worker.fetch(request, createEnv(), {});
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, 'missing_install_id');
});

test('admin api rejects unauthenticated requests', async () => {
  const worker = await createWorker();
  const request = new Request('https://cfimagebed.example/admin/api/clients');

  const response = await worker.fetch(request, createEnv(), {});
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.error.code, 'admin_unauthorized');
});

test('admin login page is reachable', async () => {
  const worker = await createWorker();
  const request = new Request('https://cfimagebed.example/admin/login');

  const response = await worker.fetch(request, createEnv(), {});
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type') || '', /^text\/html/i);
  assert.match(html, /cfimagebed Admin/i);
});
