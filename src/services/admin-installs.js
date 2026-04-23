import { getKv } from '../lib/env.js';
import {
  buildCooldownKey,
  buildInstallIndexKey,
  buildInstallKey,
} from '../lib/kv-keys.js';

async function readInstallIndex(kv, clientId) {
  const index = await kv.get(buildInstallIndexKey(clientId), { type: 'json' });
  return Array.isArray(index) ? index : [];
}

export async function registerInstallIndex(env, clientId, installId) {
  const kv = getKv(env);
  const index = await readInstallIndex(kv, clientId);
  if (!index.includes(installId)) {
    index.push(installId);
    await kv.put(buildInstallIndexKey(clientId), JSON.stringify(index));
  }
}

export async function listAdminInstalls(env, clientId) {
  const kv = getKv(env);
  if (!clientId) {
    return [];
  }

  const installIds = await readInstallIndex(kv, clientId);
  const installs = await Promise.all(
    installIds.map((installId) => kv.get(buildInstallKey(clientId, installId), { type: 'json' })),
  );

  return installs.filter(Boolean);
}

export async function searchAdminInstalls(env, clientId, query = '') {
  const installs = await listAdminInstalls(env, clientId);
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) {
    return installs;
  }

  return installs.filter((install) =>
    String(install.install_id || '').toLowerCase().includes(normalized),
  );
}

export async function updateAdminInstallStatus(env, clientId, installId, action) {
  const kv = getKv(env);
  const install = await kv.get(buildInstallKey(clientId, installId), { type: 'json' });
  if (!install) {
    throw new Error('Install not found.');
  }

  const nextInstall = {
    ...install,
    updated_at: new Date().toISOString(),
  };

  if (action === 'block_perm') {
    nextInstall.status = 'blocked_perm';
    nextInstall.temporary_block_until = null;
  } else if (action === 'block_temp') {
    const until = new Date(Date.now() + (60 * 60 * 1000)).toISOString();
    nextInstall.status = 'blocked_temp';
    nextInstall.temporary_block_until = until;
  } else if (action === 'unblock') {
    nextInstall.status = 'active';
    nextInstall.temporary_block_until = null;
    await kv.put(buildCooldownKey(clientId, installId), '', {
      expirationTtl: 1,
    });
  } else {
    throw new Error('Unsupported install action.');
  }

  await kv.put(buildInstallKey(clientId, installId), JSON.stringify(nextInstall));
  await registerInstallIndex(env, clientId, installId);
  return nextInstall;
}

export function buildInstallSummary(installs) {
  return installs.reduce((summary, install) => {
    summary.total += 1;

    if (install.status === 'blocked_perm' || install.status === 'blocked_temp') {
      summary.blocked += 1;
    } else if (install.status === 'cooldown') {
      summary.cooldown += 1;
    } else {
      summary.active += 1;
    }

    return summary;
  }, {
    total: 0,
    active: 0,
    blocked: 0,
    cooldown: 0,
  });
}
