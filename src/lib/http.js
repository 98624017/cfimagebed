export const INTERNAL_ERROR_CODE = 'internal_error';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-Client-Id, X-Install-Id',
};

export function withCorsHeaders(response, extraHeaders = {}) {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }

  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function jsonResponse(status, payload, extraHeaders = {}) {
  return withCorsHeaders(
    new Response(JSON.stringify(payload), {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    }),
    extraHeaders,
  );
}

export function jsonError(status, code, message, extraHeaders = {}) {
  return jsonResponse(
    status,
    {
      error: {
        code,
        message,
      },
    },
    extraHeaders,
  );
}

export function htmlResponse(status, html, extraHeaders = {}) {
  return withCorsHeaders(
    new Response(html, {
      status,
      headers: {
        'Content-Type': 'text/html; charset=UTF-8',
      },
    }),
    extraHeaders,
  );
}

export function redirectResponse(location, status = 302, extraHeaders = {}) {
  return withCorsHeaders(
    new Response(null, {
      status,
      headers: {
        Location: location,
      },
    }),
    extraHeaders,
  );
}
