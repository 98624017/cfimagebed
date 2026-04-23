import { getEnvValue } from '../lib/env.js';
import { withCorsHeaders } from '../lib/http.js';

const DEFAULT_UGUU_API_BASE_URL = 'https://uguu.se';

function resolveUpstreamUrl(request, env) {
  const sourceUrl = new URL(request.url);
  const upstreamBase = new URL(getEnvValue(env, 'UGUU_API_BASE_URL', DEFAULT_UGUU_API_BASE_URL));
  upstreamBase.pathname = sourceUrl.pathname;
  upstreamBase.search = sourceUrl.search;
  return upstreamBase;
}

function cloneRequestHeaders(request) {
  const headers = new Headers(request.headers);
  headers.delete('Host');
  return headers;
}

function serializeResponseHeaders(response) {
  const headers = {};
  for (const [key, value] of response.headers.entries()) {
    headers[key] = value;
  }

  return headers;
}

export async function uploadToUguu(request, env) {
  const upstreamResponse = await fetch(resolveUpstreamUrl(request, env), {
    method: request.method,
    headers: cloneRequestHeaders(request),
    body: request.body,
    redirect: 'manual',
  });

  const bodyText = await upstreamResponse.clone().text();

  return {
    backend: 'uguu',
    ok: upstreamResponse.ok,
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: serializeResponseHeaders(upstreamResponse),
    bodyText,
    response: withCorsHeaders(
      new Response(bodyText, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: upstreamResponse.headers,
      }),
    ),
    cacheable: upstreamResponse.ok,
  };
}
