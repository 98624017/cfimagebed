import { createHash, randomBytes } from 'node:crypto';

function normalizeBaseUrl(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function inferExtensionFromMimeType(mimeType) {
  const normalized = (mimeType || '').toLowerCase();
  if (normalized === 'image/png') {
    return 'png';
  }
  if (normalized === 'image/jpeg') {
    return 'jpg';
  }
  if (normalized === 'image/gif') {
    return 'gif';
  }
  if (normalized === 'image/webp') {
    return 'webp';
  }
  if (normalized === 'image/svg+xml') {
    return 'svg';
  }
  if (normalized === 'application/pdf') {
    return 'pdf';
  }

  return 'bin';
}

export function getFileExtension(file) {
  const name = typeof file?.name === 'string' ? file.name.trim() : '';
  const lastDot = name.lastIndexOf('.');
  if (lastDot > 0 && lastDot < name.length - 1) {
    return name.slice(lastDot + 1).toLowerCase();
  }

  return inferExtensionFromMimeType(file?.type || '');
}

export function buildR2ObjectKey(file, now = new Date()) {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const randomPart = randomBytes(6).toString('hex');
  const extension = getFileExtension(file);

  return `${year}/${month}/${day}/${randomPart}.${extension}`;
}

export function buildPublicFileUrl(baseUrl, objectKey) {
  return `${normalizeBaseUrl(baseUrl)}/${objectKey}`;
}

export async function extractUploadFiles(request) {
  const formData = await request.clone().formData();
  const files = [];

  for (const [name, value] of formData.entries()) {
    if (value instanceof File) {
      files.push({ fieldName: name, file: value });
    }
  }

  return files;
}

export async function buildUploadCacheKey(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!/^multipart\/form-data\b/i.test(contentType)) {
    return null;
  }

  const files = await extractUploadFiles(request);
  if (files.length === 0) {
    return null;
  }

  const fileHashes = [];
  for (const entry of files) {
    const bytes = new Uint8Array(await entry.file.arrayBuffer());
    const hash = createHash('md5');
    hash.update(bytes);
    fileHashes.push(hash.digest('hex'));
  }

  return `upload:${fileHashes.join(',')}`;
}
