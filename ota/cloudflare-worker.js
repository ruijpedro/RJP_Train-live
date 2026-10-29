// Worker OTA RJP Train Live — Cloudflare R2, com suporte HTTP Range.
// Binding R2: OTA_BUCKET. Worker de comboios permanece independente.
const OBJECT = 'rjp-train-live-ota-v2.12.1.zip';
const ROUTE = '/ota/v2.12.1.zip';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag',
  'Cache-Control': 'public, max-age=300',
};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'RJP Train Live OTA', storage: !!env.OTA_BUCKET }, { headers: cors });
    }
    if (url.pathname !== ROUTE || !['GET', 'HEAD'].includes(request.method)) {
      return new Response('Not found', { status: 404, headers: cors });
    }
    if (!env.OTA_BUCKET) return new Response('R2 binding OTA_BUCKET missing', { status: 503, headers: cors });
    const metadata = await env.OTA_BUCKET.head(OBJECT);
    if (!metadata) return new Response('OTA package not uploaded', { status: 404, headers: cors });
    const size = metadata.size;
    const headers = new Headers(cors);
    headers.set('Content-Type', 'application/zip');
    headers.set('Accept-Ranges', 'bytes');
    if (metadata.httpEtag) headers.set('ETag', metadata.httpEtag);

    let range;
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (!match || (!match[1] && !match[2])) {
        headers.set('Content-Range', `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      let start, end;
      if (!match[1]) {
        const suffix = Number(match[2]);
        if (!Number.isSafeInteger(suffix) || suffix <= 0) {
          headers.set('Content-Range', `bytes */${size}`);
          return new Response(null, { status: 416, headers });
        }
        start = Math.max(0, size - suffix);
        end = size - 1;
      } else {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : size - 1;
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) {
        headers.set('Content-Range', `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      end = Math.min(end, size - 1);
      range = { offset: start, length: end - start + 1 };
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
      headers.set('Content-Length', String(range.length));
    } else {
      headers.set('Content-Length', String(size));
    }
    const status = range ? 206 : 200;
    if (request.method === 'HEAD') return new Response(null, { status, headers });
    const file = await env.OTA_BUCKET.get(OBJECT, range ? { range } : undefined);
    if (!file) return new Response('OTA package missing', { status: 404, headers: cors });
    return new Response(file.body, { status, headers });
  },
};
