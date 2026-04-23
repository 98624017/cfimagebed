import { randomUUID } from 'node:crypto';
import { getKv } from '../lib/env.js';
import { buildAdminSessionKey } from '../lib/kv-keys.js';

const SESSION_COOKIE_NAME = 'cfimagebed_admin_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function parseCookieHeader(cookieHeader) {
  const result = {};
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (!key) {
      continue;
    }

    result[key] = rest.join('=');
  }

  return result;
}

function formatCookie(name, value, maxAgeSeconds = SESSION_TTL_SECONDS) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export async function createAdminSession(env, nowMs = Date.now()) {
  const kv = getKv(env);
  const sessionId = randomUUID();
  const payload = {
    created_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + (SESSION_TTL_SECONDS * 1000)).toISOString(),
    last_seen_at: new Date(nowMs).toISOString(),
  };

  await kv.put(buildAdminSessionKey(sessionId), JSON.stringify(payload), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  return {
    sessionId,
    cookie: formatCookie(SESSION_COOKIE_NAME, sessionId),
    session: payload,
  };
}

export async function getAdminSession(env, request, nowMs = Date.now()) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = parseCookieHeader(cookieHeader);
  const sessionId = cookies[SESSION_COOKIE_NAME];

  if (!sessionId) {
    return null;
  }

  const kv = getKv(env);
  const session = await kv.get(buildAdminSessionKey(sessionId), { type: 'json' });
  if (!session) {
    return null;
  }

  if (Date.parse(session.expires_at) <= nowMs) {
    return null;
  }

  return { sessionId, session };
}

export function createLogoutCookie() {
  return formatCookie(SESSION_COOKIE_NAME, '', 0);
}
