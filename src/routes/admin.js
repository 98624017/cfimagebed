import { htmlResponse, jsonError, jsonResponse, redirectResponse } from '../lib/http.js';
import { verifyAdminPassword } from '../services/admin-auth.js';
import {
  createAdminSession,
  createLogoutCookie,
  getAdminSession,
} from '../services/admin-session.js';
import { readAdminConfig, updateAdminConfig } from '../services/admin-config.js';
import { listAdminClients, upsertAdminClient } from '../services/admin-clients.js';
import {
  buildInstallSummary,
  listAdminInstalls,
  searchAdminInstalls,
  updateAdminInstallStatus,
} from '../services/admin-installs.js';
import { renderDashboardPage } from '../views/dashboard-page.js';
import { renderClientsPage } from '../views/clients-page.js';
import { renderConfigPage } from '../views/config-page.js';
import { renderInstallsPage } from '../views/installs-page.js';

export function resetAdminRouteState() {
}

function renderLoginPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>cfimagebed Admin Login</title>
  </head>
  <body>
    <main>
      <h1>cfimagebed Admin</h1>
      <form method="post" action="/admin/login">
        <label>
          Password
          <input type="password" name="password" autocomplete="current-password">
        </label>
        <button type="submit">Login</button>
      </form>
    </main>
  </body>
</html>`;
}

async function readJsonBody(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!/^application\/json\b/i.test(contentType)) {
    return {};
  }

  return request.json();
}

function parseBoolean(value, fallback = false) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false;
  }

  return fallback;
}

function parseOptionalInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalNullableInt(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function handleAdminRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/admin/login') {
    if (request.method === 'POST') {
      const form = await request.formData();
      const password = String(form.get('password') || '');

      if (!verifyAdminPassword(env, password)) {
        return htmlResponse(401, renderLoginPage());
      }

      const { cookie } = await createAdminSession(env);
      return redirectResponse('/admin', 302, {
        'Set-Cookie': cookie,
      });
    }

    return htmlResponse(200, renderLoginPage());
  }

  if (url.pathname === '/admin/logout') {
    return redirectResponse('/admin/login', 302, {
      'Set-Cookie': createLogoutCookie(),
    });
  }

  if (url.pathname.startsWith('/admin/api/')) {
    const session = await getAdminSession(env, request);
    if (!session) {
      return jsonError(401, 'admin_unauthorized', 'Admin login required.');
    }

    if (url.pathname === '/admin/api/config') {
      if (request.method === 'GET') {
        return jsonResponse(200, {
          config: await readAdminConfig(env),
        });
      }

      if (request.method === 'PUT') {
        return jsonResponse(200, {
          config: await updateAdminConfig(env, await readJsonBody(request)),
        });
      }
    }

    if (url.pathname === '/admin/api/clients') {
      if (request.method === 'GET') {
        return jsonResponse(200, {
          clients: await listAdminClients(env),
        });
      }

      if (request.method === 'POST') {
        return jsonResponse(200, {
          client: await upsertAdminClient(env, await readJsonBody(request)),
        });
      }
    }

    if (url.pathname === '/admin/api/installs') {
      const clientId = url.searchParams.get('client_id') || '';
      const query = url.searchParams.get('q') || '';

      if (request.method === 'GET') {
        const installs = await searchAdminInstalls(env, clientId, query);
        return jsonResponse(200, {
          installs,
          summary: buildInstallSummary(installs),
        });
      }

      if (request.method === 'PATCH') {
        const payload = await readJsonBody(request);
        return jsonResponse(200, {
          install: await updateAdminInstallStatus(
            env,
            String(payload.client_id || ''),
            String(payload.install_id || ''),
            String(payload.action || ''),
          ),
        });
      }
    }

    return jsonError(404, 'unsupported_path', 'Unsupported admin API path.');
  }

  const session = await getAdminSession(env, request);
  if (!session) {
    return redirectResponse('/admin/login');
  }

  if (url.pathname === '/admin') {
    const [config, clients] = await Promise.all([
      readAdminConfig(env),
      listAdminClients(env),
    ]);
    const installGroups = await Promise.all(
      clients.map((client) => listAdminInstalls(env, client.client_id)),
    );
    const installSummary = buildInstallSummary(installGroups.flat());

    return htmlResponse(200, renderDashboardPage({
      config,
      clients,
      installSummary,
      notice: url.searchParams.get('notice') || '',
    }));
  }

  if (url.pathname === '/admin/clients') {
    if (request.method === 'POST') {
      const form = await request.formData();
      await upsertAdminClient(env, {
        client_id: String(form.get('client_id') || ''),
        name: String(form.get('name') || ''),
        remark: String(form.get('remark') || ''),
        status: String(form.get('status') || 'active'),
        allow_auto_register: parseBoolean(form.get('allow_auto_register'), true),
        rate_limit: {
          per_minute: parseOptionalNullableInt(form.get('rate_per_minute')),
          per_hour: parseOptionalNullableInt(form.get('rate_per_hour')),
        },
      });

      return redirectResponse('/admin/clients?notice=Client+saved');
    }

    return htmlResponse(200, renderClientsPage({
      clients: await listAdminClients(env),
      notice: url.searchParams.get('notice') || '',
    }));
  }

  if (url.pathname === '/admin/config') {
    if (request.method === 'POST') {
      const form = await request.formData();
      await updateAdminConfig(env, {
        upload_mode: String(form.get('upload_mode') || 'uguu_only'),
        default_allow_auto_register: parseBoolean(form.get('default_allow_auto_register'), true),
        default_client_rate_limit: {
          per_minute: parseOptionalInt(form.get('client_per_minute'), 120),
          per_hour: parseOptionalInt(form.get('client_per_hour'), 3000),
        },
        default_install_rate_limit: {
          per_minute: parseOptionalInt(form.get('install_per_minute'), 20),
        },
        default_cooldown_seconds: parseOptionalInt(form.get('default_cooldown_seconds'), 300),
        media_size_limits_mb: {
          image: parseOptionalInt(form.get('image_max_mb'), 25),
          video: parseOptionalInt(form.get('video_max_mb'), 150),
          audio: parseOptionalInt(form.get('audio_max_mb'), 15),
        },
      });

      return redirectResponse('/admin/config?notice=Config+saved');
    }

    return htmlResponse(200, renderConfigPage({
      config: await readAdminConfig(env),
      notice: url.searchParams.get('notice') || '',
    }));
  }

  if (url.pathname === '/admin/installs') {
    const clientId = url.searchParams.get('client_id') || '';
    const query = (url.searchParams.get('q') || '').trim().toLowerCase();

    if (request.method === 'POST') {
      const form = await request.formData();
      const formClientId = String(form.get('client_id') || '');
      const installId = String(form.get('install_id') || '');
      const action = String(form.get('action') || '');
      await updateAdminInstallStatus(env, formClientId, installId, action);
      return redirectResponse(`/admin/installs?client_id=${encodeURIComponent(formClientId)}&notice=Install+updated`);
    }

    const filteredInstalls = await searchAdminInstalls(env, clientId, query);

    return htmlResponse(200, renderInstallsPage({
      clientId,
      installs: filteredInstalls,
      query,
      notice: url.searchParams.get('notice') || '',
    }));
  }

  return jsonError(404, 'unsupported_path', 'Unsupported admin page path.');
}
