import assert from 'node:assert/strict';

const workerModulePromise = import('../src/index.js');

export async function createWorker() {
  const mod = await workerModulePromise;
  mod.__testables?.resetState?.();
  return mod.default;
}

export class MemoryKV {
  constructor() {
    this.map = new Map();
    this.getCalls = [];
    this.putCalls = [];
  }

  async get(key, options = {}) {
    this.getCalls.push({ key, options });
    const value = this.map.get(key);
    if (value === undefined) {
      return null;
    }

    if (options.type === 'json') {
      return JSON.parse(value);
    }

    return value;
  }

  async put(key, value, options = {}) {
    this.putCalls.push({ key, value, options });
    this.map.set(key, value);
  }
}

export class MemoryR2Bucket {
  constructor() {
    this.map = new Map();
    this.putCalls = [];
  }

  async put(key, value, options = {}) {
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
    this.putCalls.push({ key, value: bytes, options });
    this.map.set(key, { value: bytes, options });
  }
}

export function createEnv(overrides = {}) {
  return {
    IMAGEBED_KV: new MemoryKV(),
    UGUU_API_BASE_URL: 'https://uguu.se',
    ...overrides,
  };
}

export async function createUploadRequest(url, headers = {}, fileOptions = {}) {
  const {
    body = 'demo-image',
    filename = 'demo.png',
    type = 'image/png',
    fieldName = 'files[]',
  } = fileOptions;

  const form = new FormData();
  form.set(fieldName, new File([body], filename, { type }));
  form.set('output', 'json');

  return new Request(url, {
    method: 'POST',
    headers,
    body: form,
  });
}

export async function putJson(kv, key, value) {
  await kv.put(key, JSON.stringify(value));
}

export async function getJson(kv, key) {
  const value = await kv.get(key, { type: 'json' });
  assert.ok(value, `Expected JSON value for key ${key}`);
  return value;
}

export function installFetchMock(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = originalFetch;
  };
}
