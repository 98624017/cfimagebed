import { extractUploadFiles, getFileExtension } from '../lib/file-meta.js';

const BYTES_PER_MB = 1024 * 1024;

const ALLOWED_MIME_KIND_MAP = new Map([
  ['image/jpeg', 'image'],
  ['image/jpg', 'image'],
  ['image/png', 'image'],
  ['image/gif', 'image'],
  ['image/webp', 'image'],
  ['image/avif', 'image'],
  ['image/svg+xml', 'image'],
  ['video/mp4', 'video'],
  ['video/webm', 'video'],
  ['video/quicktime', 'video'],
  ['video/x-m4v', 'video'],
  ['audio/mpeg', 'audio'],
  ['audio/mp3', 'audio'],
  ['audio/wav', 'audio'],
  ['audio/x-wav', 'audio'],
  ['audio/wave', 'audio'],
  ['audio/ogg', 'audio'],
  ['audio/mp4', 'audio'],
  ['audio/x-m4a', 'audio'],
  ['audio/aac', 'audio'],
  ['audio/flac', 'audio'],
]);

const ALLOWED_EXTENSION_KIND_MAP = new Map([
  ['jpg', 'image'],
  ['jpeg', 'image'],
  ['png', 'image'],
  ['gif', 'image'],
  ['webp', 'image'],
  ['avif', 'image'],
  ['svg', 'image'],
  ['mp4', 'video'],
  ['webm', 'video'],
  ['mov', 'video'],
  ['m4v', 'video'],
  ['mp3', 'audio'],
  ['wav', 'audio'],
  ['ogg', 'audio'],
  ['oga', 'audio'],
  ['m4a', 'audio'],
  ['aac', 'audio'],
  ['flac', 'audio'],
]);

function normalizeMediaKind(file) {
  const mimeType = typeof file?.type === 'string' ? file.type.trim().toLowerCase() : '';
  if (mimeType && ALLOWED_MIME_KIND_MAP.has(mimeType)) {
    return ALLOWED_MIME_KIND_MAP.get(mimeType);
  }

  const extension = getFileExtension(file);
  return ALLOWED_EXTENSION_KIND_MAP.get(extension) || null;
}

function formatMediaLabel(kind) {
  if (kind === 'image') {
    return 'Image';
  }
  if (kind === 'video') {
    return 'Video';
  }
  return 'Audio';
}

function resolveLimitMb(globalConfig, kind) {
  const configured = globalConfig?.media_size_limits_mb?.[kind];
  const parsed = Number.parseInt(String(configured ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return parsed;
}

export async function validateUploadFiles(request, globalConfig) {
  const files = await extractUploadFiles(request);
  if (files.length === 0) {
    return {
      status: 400,
      code: 'missing_file',
      message: 'No upload file found.',
    };
  }

  for (const entry of files) {
    const mediaKind = normalizeMediaKind(entry.file);
    if (!mediaKind) {
      return {
        status: 415,
        code: 'unsupported_media_type',
        message: 'Only common image, video, and audio files are allowed.',
      };
    }

    const limitMb = resolveLimitMb(globalConfig, mediaKind);
    const limitBytes = limitMb * BYTES_PER_MB;
    if (entry.file.size > limitBytes) {
      return {
        status: 413,
        code: 'file_too_large',
        message: `${formatMediaLabel(mediaKind)} file exceeds ${limitMb} MB limit.`,
      };
    }
  }

  return null;
}
