import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';

test('app returns unsupported_path for unknown route', async () => {
  const app = createApp();
  const response = await app.fetch(new Request('https://cfimagebed.example/unknown'), {}, {});
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.error.code, 'unsupported_path');
});

test('app converts unexpected routing errors into internal_error response', async () => {
  const app = createApp();
  const response = await app.fetch({ url: 'not-a-valid-url' }, {}, {});
  const payload = await response.json();

  assert.equal(response.status, 500);
  assert.equal(payload.error.code, 'internal_error');
  assert.match(payload.error.message, /invalid/i);
});
