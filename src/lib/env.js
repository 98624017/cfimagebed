export function getEnvValue(env, key, fallback = '') {
  const value = env && typeof env[key] === 'string' ? env[key].trim() : '';
  return value || fallback;
}

export function getKv(env) {
  if (
    !env ||
    !env.IMAGEBED_KV ||
    typeof env.IMAGEBED_KV.get !== 'function' ||
    typeof env.IMAGEBED_KV.put !== 'function'
  ) {
    throw new Error('Missing IMAGEBED_KV binding.');
  }

  return env.IMAGEBED_KV;
}
