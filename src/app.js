import { handleAdminRequest, resetAdminRouteState } from './routes/admin.js';
import { handleUploadRequest, resetUploadRouteState } from './routes/upload.js';
import { INTERNAL_ERROR_CODE, jsonError } from './lib/http.js';

export function createApp() {
  return {
    async fetch(request, env, context) {
      try {
        const url = new URL(request.url);

        if (url.pathname === '/upload') {
          return await handleUploadRequest(request, env, context);
        }

        if (url.pathname === '/admin' || url.pathname === '/admin/login' || url.pathname.startsWith('/admin/')) {
          return await handleAdminRequest(request, env, context);
        }

        return jsonError(404, 'unsupported_path', 'Unsupported path.');
      } catch (error) {
        return jsonError(
          500,
          INTERNAL_ERROR_CODE,
          error instanceof Error ? error.message : 'Unexpected error.',
        );
      }
    },
    resetState() {
      resetUploadRouteState();
      resetAdminRouteState();
    },
  };
}
