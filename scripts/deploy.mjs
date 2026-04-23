import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const configPath = path.join(projectRoot, 'wrangler.jsonc');

function applyVarOverride(config, key, envKey) {
  const value = typeof process.env[envKey] === 'string' ? process.env[envKey].trim() : '';
  if (!value) {
    return;
  }

  config.vars ||= {};
  config.vars[key] = value;
}

function buildEffectiveConfig() {
  const rawConfig = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(rawConfig);

  applyVarOverride(config, 'UGUU_API_BASE_URL', 'IMAGEBED_UGUU_API_BASE_URL');
  applyVarOverride(config, 'R2_PUBLIC_BASE_URL', 'IMAGEBED_R2_PUBLIC_BASE_URL');
  applyVarOverride(config, 'R2_PREVIEW_PUBLIC_BASE_URL', 'IMAGEBED_R2_PREVIEW_PUBLIC_BASE_URL');
  applyVarOverride(config, 'R2_OBJECT_PREFIX', 'IMAGEBED_R2_OBJECT_PREFIX');
  applyVarOverride(config, 'UPLOAD_CACHE_TTL_SECONDS', 'IMAGEBED_UPLOAD_CACHE_TTL_SECONDS');

  const tempConfigPath = path.join(projectRoot, '.tmp-wrangler.deploy.json');
  fs.writeFileSync(tempConfigPath, JSON.stringify(config, null, 2));
  return tempConfigPath;
}

function normalizeCustomDomain(rawValue) {
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!value) {
    return null;
  }

  const normalizedInput = /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(normalizedInput);
  if (url.pathname !== '/' || url.search || url.hash || url.port) {
    throw new Error('CF_WORKER_CUSTOM_DOMAIN 只能是纯域名，不能包含路径、查询参数、哈希或端口。');
  }

  return url.hostname;
}

const extraArgs = process.argv.slice(2);
const customDomain = normalizeCustomDomain(process.env.CF_WORKER_CUSTOM_DOMAIN);
const effectiveConfigPath = buildEffectiveConfig();
const wranglerArgs = ['deploy', '--config', effectiveConfigPath, ...extraArgs];

if (customDomain) {
  wranglerArgs.push('--domain', customDomain);
  console.log(`使用自定义域名部署: ${customDomain}`);
} else {
  console.log('未设置 CF_WORKER_CUSTOM_DOMAIN，将仅部署到 workers.dev。');
}

const result = spawnSync('wrangler', wranglerArgs, {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env,
});

try {
  fs.unlinkSync(effectiveConfigPath);
} catch {
  // 临时配置文件清理由脚本兜底，不影响部署结果
}

if (result.error) {
  console.error(`执行 wrangler 失败: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
