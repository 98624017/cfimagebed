import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'ops/private/initial-clients.private.json');

function parseArgs(argv) {
  const args = {
    configPath: DEFAULT_CONFIG_PATH,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (value === '--config') {
      args.configPath = path.resolve(process.cwd(), argv[index + 1] || '');
      index += 1;
      continue;
    }

    throw new Error(`不支持的参数: ${value}`);
  }

  return args;
}

function normalizeBaseUrl(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    throw new Error('缺少 IMAGEBED_ADMIN_BASE_URL。');
  }

  return value.replace(/\/+$/, '');
}

function normalizeRateLimit(rateLimit, clientId) {
  const nextRateLimit = {};

  if (rateLimit && typeof rateLimit === 'object') {
    if (rateLimit.per_minute != null) {
      const perMinute = Number.parseInt(String(rateLimit.per_minute), 10);
      if (!Number.isFinite(perMinute) || perMinute <= 0) {
        throw new Error(`client ${clientId} 的 rate_limit.per_minute 非法。`);
      }
      nextRateLimit.per_minute = perMinute;
    }

    if (rateLimit.per_hour != null) {
      const perHour = Number.parseInt(String(rateLimit.per_hour), 10);
      if (!Number.isFinite(perHour) || perHour <= 0) {
        throw new Error(`client ${clientId} 的 rate_limit.per_hour 非法。`);
      }
      nextRateLimit.per_hour = perHour;
    }
  }

  return nextRateLimit;
}

function normalizeClient(rawClient, index) {
  if (!rawClient || typeof rawClient !== 'object' || Array.isArray(rawClient)) {
    throw new Error(`第 ${index + 1} 个 client 配置格式非法。`);
  }

  const clientId = String(rawClient.client_id || '').trim();
  if (!clientId) {
    throw new Error(`第 ${index + 1} 个 client 缺少 client_id。`);
  }

  return {
    client_id: clientId,
    name: String(rawClient.name || clientId).trim() || clientId,
    remark: String(rawClient.remark || '').trim(),
    status: String(rawClient.status || 'active').trim() || 'active',
    allow_auto_register: rawClient.allow_auto_register ?? true,
    rate_limit: normalizeRateLimit(rawClient.rate_limit, clientId),
  };
}

async function readClients(configPath) {
  const rawText = await fs.readFile(configPath, 'utf8');
  const payload = JSON.parse(rawText);
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error('client 配置文件必须是非空数组。');
  }

  const clients = payload.map((item, index) => normalizeClient(item, index));
  const uniqueIds = new Set();
  for (const client of clients) {
    if (uniqueIds.has(client.client_id)) {
      throw new Error(`client_id 重复: ${client.client_id}`);
    }
    uniqueIds.add(client.client_id);
  }

  return clients;
}

async function loginAdmin(baseUrl, password) {
  const body = new URLSearchParams();
  body.set('password', password);

  const response = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    redirect: 'manual',
  });

  if (response.status !== 302) {
    throw new Error(`管理员登录失败，HTTP ${response.status}`);
  }

  const cookie = response.headers.get('set-cookie');
  if (!cookie) {
    throw new Error('管理员登录成功但未收到 Session Cookie。');
  }

  return cookie.split(';', 1)[0];
}

async function upsertClient(baseUrl, sessionCookie, client) {
  const response = await fetch(`${baseUrl}/admin/api/clients`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie,
    },
    body: JSON.stringify(client),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`创建 client ${client.client_id} 失败，HTTP ${response.status}: ${errorText}`);
  }

  const payload = await response.json();
  return payload.client;
}

function printPlan(clients) {
  console.log('计划初始化以下 clients:');
  for (const client of clients) {
    const minuteLimit = client.rate_limit.per_minute ?? '-';
    const hourLimit = client.rate_limit.per_hour ?? '-';
    console.log(`- ${client.client_id} | auto_register=${client.allow_auto_register} | ${minuteLimit}/min | ${hourLimit}/hour`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const clients = await readClients(args.configPath);
  printPlan(clients);

  if (args.dryRun) {
    console.log('dry-run 模式，不会写入后台。');
    return;
  }

  const baseUrl = normalizeBaseUrl(process.env.IMAGEBED_ADMIN_BASE_URL);
  const password = String(process.env.IMAGEBED_ADMIN_PASSWORD || '').trim();
  if (!password) {
    throw new Error('缺少 IMAGEBED_ADMIN_PASSWORD。');
  }

  const sessionCookie = await loginAdmin(baseUrl, password);
  for (const client of clients) {
    const saved = await upsertClient(baseUrl, sessionCookie, client);
    console.log(`已写入 ${saved.client_id} (${saved.status})`);
  }

  console.log(`完成，共初始化 ${clients.length} 个 client。`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
