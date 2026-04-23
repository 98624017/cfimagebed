import { getKv } from '../lib/env.js';
import { buildClientIndexKey, buildClientKey } from '../lib/kv-keys.js';

async function readClientIndex(kv) {
  const index = await kv.get(buildClientIndexKey(), { type: 'json' });
  return Array.isArray(index) ? index : [];
}

export async function listAdminClients(env) {
  const kv = getKv(env);
  const ids = await readClientIndex(kv);
  const clients = await Promise.all(ids.map((clientId) => kv.get(buildClientKey(clientId), { type: 'json' })));
  return clients.filter(Boolean);
}

export async function upsertAdminClient(env, payload) {
  const kv = getKv(env);
  const clientId = typeof payload.client_id === 'string' ? payload.client_id.trim() : '';
  if (!clientId) {
    throw new Error('client_id is required.');
  }

  const current = await kv.get(buildClientKey(clientId), { type: 'json' });
  const nextClient = {
    client_id: clientId,
    name: payload.name || current?.name || clientId,
    remark: payload.remark || current?.remark || '',
    status: payload.status || current?.status || 'active',
    allow_auto_register: payload.allow_auto_register ?? current?.allow_auto_register ?? true,
    rate_limit: {
      ...(current?.rate_limit || {}),
      ...(payload.rate_limit || {}),
    },
    created_at: current?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await kv.put(buildClientKey(clientId), JSON.stringify(nextClient));

  const index = await readClientIndex(kv);
  if (!index.includes(clientId)) {
    index.push(clientId);
    await kv.put(buildClientIndexKey(), JSON.stringify(index));
  }

  return nextClient;
}
