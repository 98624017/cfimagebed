import { getKv } from '../lib/env.js';
import { buildClientKey } from '../lib/kv-keys.js';

export async function getClientConfig(env, clientId) {
  const kv = getKv(env);
  return kv.get(buildClientKey(clientId), { type: 'json' });
}
