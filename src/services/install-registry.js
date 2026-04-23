import { getKv } from '../lib/env.js';
import { buildCooldownKey, buildInstallKey } from '../lib/kv-keys.js';
import { registerInstallIndex } from './admin-installs.js';

function nowIso(nowMs) {
  return new Date(nowMs).toISOString();
}

export async function getInstallRecord(env, clientId, installId) {
  const kv = getKv(env);
  return kv.get(buildInstallKey(clientId, installId), { type: 'json' });
}

export async function createInstallRecord(env, clientId, installId, nowMs) {
  const kv = getKv(env);
  const record = {
    client_id: clientId,
    install_id: installId,
    status: 'active',
    first_seen_at: nowIso(nowMs),
    last_seen_at: nowIso(nowMs),
    request_count: 0,
    upload_count: 0,
    error_count: 0,
    temporary_block_until: null,
    updated_at: nowIso(nowMs),
  };

  await kv.put(buildInstallKey(clientId, installId), JSON.stringify(record));
  await registerInstallIndex(env, clientId, installId);
  return record;
}

export async function getCooldownUntil(env, clientId, installId) {
  const kv = getKv(env);
  const rawValue = await kv.get(buildCooldownKey(clientId, installId));
  const value = Number.parseInt(rawValue || '', 10);
  return Number.isFinite(value) ? value : null;
}

export async function ensureInstallRecord(env, client, installId, globalConfig, nowMs) {
  let install = await getInstallRecord(env, client.client_id, installId);

  if (!install) {
    const allowAutoRegister = client.allow_auto_register ?? globalConfig.default_allow_auto_register;
    if (!allowAutoRegister) {
      return {
        error: {
          status: 403,
          code: 'install_blocked',
          message: 'Install registration is disabled for this client.',
        },
      };
    }

    install = await createInstallRecord(env, client.client_id, installId, nowMs);
  }

  if (install.status === 'blocked_perm') {
    return {
      error: {
        status: 403,
        code: 'install_blocked',
        message: 'Install has been permanently blocked.',
      },
    };
  }

  if (install.status === 'blocked_temp') {
    const blockedUntil = Date.parse(install.temporary_block_until || '');
    if (Number.isFinite(blockedUntil) && blockedUntil > nowMs) {
      return {
        error: {
          status: 403,
          code: 'install_blocked',
          message: 'Install is temporarily blocked.',
        },
      };
    }
  }

  if (install.status === 'cooldown') {
    return {
      error: {
        status: 403,
        code: 'install_blocked',
        message: 'Install is cooling down.',
      },
    };
  }

  const cooldownUntil = await getCooldownUntil(env, client.client_id, installId);
  if (cooldownUntil && cooldownUntil > nowMs) {
    return {
      error: {
        status: 403,
        code: 'install_blocked',
        message: 'Install is cooling down.',
      },
    };
  }

  return { install };
}

export async function recordInstallActivity(env, install, updates, nowMs) {
  const kv = getKv(env);
  const nextRecord = {
    ...install,
    request_count: (install.request_count || 0) + 1,
    upload_count: (install.upload_count || 0) + (updates.uploaded ? 1 : 0),
    error_count: (install.error_count || 0) + (updates.errored ? 1 : 0),
    last_seen_at: nowIso(nowMs),
    updated_at: nowIso(nowMs),
  };

  await kv.put(
    buildInstallKey(install.client_id, install.install_id),
    JSON.stringify(nextRecord),
  );
  await registerInstallIndex(env, install.client_id, install.install_id);

  return nextRecord;
}
