import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadToR2 } from '../src/services/storage-r2.js';
import { MemoryR2Bucket } from './helpers.js';

test('uploadToR2 writes file with normalized prefix and default content type fallback', async () => {
  const form = new FormData();
  form.set('files[]', new File(['demo'], 'demo.bin'));
  const request = new Request('https://cfimagebed.example/upload', {
    method: 'POST',
    body: form,
  });
  const env = {
    IMAGEBED_R2: new MemoryR2Bucket(),
    R2_PUBLIC_BASE_URL: 'https://cdn.example.com/',
    R2_OBJECT_PREFIX: '/nested/path/',
  };

  const result = await uploadToR2(request, env, new Date('2026-04-23T00:00:00.000Z'));
  const payload = await result.response.json();

  assert.equal(result.status, 200);
  assert.equal(env.IMAGEBED_R2.putCalls.length, 1);
  assert.match(env.IMAGEBED_R2.putCalls[0].key, /^nested\/path\/2026\/04\/23\/[0-9a-f]{12}\.bin$/);
  assert.equal(env.IMAGEBED_R2.putCalls[0].options.httpMetadata.contentType, 'application/octet-stream');
  assert.equal(payload.files[0].filename, 'demo.bin');
  assert.match(payload.files[0].url, /^https:\/\/cdn\.example\.com\/nested\/path\/2026\/04\/23\//);
});

test('uploadToR2 uses preview public url for preview workers.dev hostnames', async () => {
  const form = new FormData();
  form.set('files[]', new File(['demo'], 'demo.png', { type: 'image/png' }));
  const request = new Request('https://preview-cfimagebed.w986424017.workers.dev/upload', {
    method: 'POST',
    body: form,
  });
  const env = {
    IMAGEBED_R2: new MemoryR2Bucket(),
    R2_PUBLIC_BASE_URL: 'https://image.light-ai.cloud',
    R2_PREVIEW_PUBLIC_BASE_URL: 'https://pub-preview.r2.dev',
  };

  const result = await uploadToR2(request, env, new Date('2026-04-23T00:00:00.000Z'));
  const payload = await result.response.json();

  assert.equal(result.status, 200);
  assert.match(payload.files[0].url, /^https:\/\/pub-preview\.r2\.dev\/2026\/04\/23\//);
});

test('uploadToR2 rejects missing IMAGEBED_R2 binding', async () => {
  const form = new FormData();
  form.set('files[]', new File(['demo'], 'demo.png', { type: 'image/png' }));
  const request = new Request('https://cfimagebed.example/upload', {
    method: 'POST',
    body: form,
  });

  await assert.rejects(
    () => uploadToR2(request, { R2_PUBLIC_BASE_URL: 'https://cdn.example.com' }),
    /Missing IMAGEBED_R2 binding/,
  );
});

test('uploadToR2 rejects missing public base url', async () => {
  const form = new FormData();
  form.set('files[]', new File(['demo'], 'demo.png', { type: 'image/png' }));
  const request = new Request('https://cfimagebed.example/upload', {
    method: 'POST',
    body: form,
  });

  await assert.rejects(
    () => uploadToR2(request, { IMAGEBED_R2: new MemoryR2Bucket() }),
    /Missing R2_PUBLIC_BASE_URL/,
  );
});

test('uploadToR2 rejects requests without uploaded files', async () => {
  const form = new FormData();
  form.set('output', 'json');
  const request = new Request('https://cfimagebed.example/upload', {
    method: 'POST',
    body: form,
  });

  await assert.rejects(
    () => uploadToR2(request, {
      IMAGEBED_R2: new MemoryR2Bucket(),
      R2_PUBLIC_BASE_URL: 'https://cdn.example.com',
    }),
    /No upload file found/,
  );
});
