import { createHash, timingSafeEqual } from 'node:crypto';
import { getEnvValue } from '../lib/env.js';

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function verifyAdminPassword(env, password) {
  const expectedHash = getEnvValue(env, 'ADMIN_PASSWORD_HASH');
  if (!expectedHash) {
    return false;
  }

  const actualHash = sha256Hex(password);
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const actualBuffer = Buffer.from(actualHash, 'hex');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export const __testables = {
  sha256Hex,
};
