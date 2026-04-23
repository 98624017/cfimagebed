export function buildClientKey(clientId) {
  return `client:${clientId}`;
}

export function buildInstallKey(clientId, installId) {
  return `install:${clientId}:${installId}`;
}

export function buildInstallIndexKey(clientId) {
  return `index:installs:${clientId}`;
}

export function buildGlobalConfigKey() {
  return 'config:global';
}

export function buildClientIndexKey() {
  return 'index:clients';
}

export function buildClientRateLimitKey(clientId, bucket) {
  return `rate:client:${clientId}:${bucket}`;
}

export function buildInstallRateLimitKey(clientId, installId, bucket) {
  return `rate:install:${clientId}:${installId}:${bucket}`;
}

export function buildCooldownKey(clientId, installId) {
  return `cooldown:${clientId}:${installId}`;
}

export function buildAdminSessionKey(sessionId) {
  return `admin:session:${sessionId}`;
}
