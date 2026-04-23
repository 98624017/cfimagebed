import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  buildPublicFileUrl,
  buildR2ObjectKey,
  buildUploadCacheKey,
  extractUploadFiles,
  getFileExtension,
} from '../src/lib/file-meta.js';

test('getFileExtension prefers file name suffix and covers supported mime type fallbacks', () => {
  assert.equal(getFileExtension(new File(['x'], 'photo.JPEG', { type: 'image/png' })), 'jpeg');
  assert.equal(getFileExtension(new File(['x'], 'no-extension', { type: 'image/jpeg' })), 'jpg');
  assert.equal(getFileExtension(new File(['x'], 'no-extension', { type: 'image/gif' })), 'gif');
  assert.equal(getFileExtension(new File(['x'], 'no-extension', { type: 'image/webp' })), 'webp');
  assert.equal(getFileExtension(new File(['x'], 'no-extension', { type: 'image/svg+xml' })), 'svg');
  assert.equal(getFileExtension(new File(['x'], 'no-extension', { type: 'application/pdf' })), 'pdf');
  assert.equal(getFileExtension(new File(['x'], 'still-no-extension', { type: 'application/octet-stream' })), 'bin');
});

test('buildR2ObjectKey uses UTC date path and inferred extension', () => {
  const key = buildR2ObjectKey(
    new File(['demo'], 'archive', { type: 'application/pdf' }),
    new Date('2026-04-23T12:34:56.000Z'),
  );

  assert.match(key, /^2026\/04\/23\/[0-9a-f]{12}\.pdf$/);
});

test('buildPublicFileUrl trims trailing slash from base url', () => {
  assert.equal(
    buildPublicFileUrl('https://cdn.example.com/', '2026/04/23/demo.png'),
    'https://cdn.example.com/2026/04/23/demo.png',
  );
});

test('extractUploadFiles keeps only file form entries', async () => {
  const form = new FormData();
  form.set('files[]', new File(['first'], 'first.png', { type: 'image/png' }));
  form.set('caption', 'hello');
  form.set('attachment', new File(['second'], 'second.mp3', { type: 'audio/mpeg' }));

  const request = new Request('https://cfimagebed.example/upload', {
    method: 'POST',
    body: form,
  });

  const files = await extractUploadFiles(request);

  assert.deepEqual(files.map((entry) => entry.fieldName), ['files[]', 'attachment']);
  assert.deepEqual(files.map((entry) => entry.file.name), ['first.png', 'second.mp3']);
});

test('buildUploadCacheKey returns null for non-multipart requests or empty forms', async () => {
  const jsonRequest = new Request('https://cfimagebed.example/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ hello: 'world' }),
  });
  assert.equal(await buildUploadCacheKey(jsonRequest), null);

  const emptyForm = new FormData();
  emptyForm.set('output', 'json');
  const emptyRequest = new Request('https://cfimagebed.example/upload', {
    method: 'POST',
    body: emptyForm,
  });
  assert.equal(await buildUploadCacheKey(emptyRequest), null);
});

test('buildUploadCacheKey hashes all uploaded files in form order', async () => {
  const form = new FormData();
  form.append('files[]', new File(['alpha'], 'alpha.png', { type: 'image/png' }));
  form.append('files[]', new File(['beta'], 'beta.png', { type: 'image/png' }));
  const request = new Request('https://cfimagebed.example/upload', {
    method: 'POST',
    body: form,
  });

  const alphaHash = createHash('md5').update(new Uint8Array(Buffer.from('alpha'))).digest('hex');
  const betaHash = createHash('md5').update(new Uint8Array(Buffer.from('beta'))).digest('hex');

  assert.equal(await buildUploadCacheKey(request), `upload:${alphaHash},${betaHash}`);
});
