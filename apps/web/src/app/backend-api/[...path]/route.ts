import { NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string {
  const url =
    process.env.SERVER_INTERNAL_URL ||
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3001';
  return url.replace(/\/+$/, '');
}

async function handleProxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const resolvedParams = await params;
  const pathSegment = resolvedParams.path ? resolvedParams.path.join('/') : '';
  const search = request.nextUrl.search || '';
  const backendBase = getBackendUrl();
  const targetUrl = `${backendBase}/${pathSegment}${search}`;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('host');
  requestHeaders.delete('connection');

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let bodyData: BodyInit | undefined = undefined;

  if (hasBody) {
    try {
      bodyData = await request.blob();
    } catch {
      bodyData = undefined;
    }
  }

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers: requestHeaders,
      body: bodyData,
      // @ts-expect-error duplex is valid in Node runtime
      duplex: 'half',
      cache: 'no-store',
    });

    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.delete('content-encoding');

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Upstream server error';
    return NextResponse.json(
      { statusCode: 502, message: `Backend proxy unreachable: ${errorMsg}` },
      { status: 502 },
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const HEAD = handleProxy;
export const OPTIONS = handleProxy;
