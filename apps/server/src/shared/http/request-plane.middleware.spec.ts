import type { Request, Response } from 'express';
import {
  createCsrfOriginMiddleware,
  createRequestPlaneMiddleware,
  requestPlaneConfigFromEnv,
} from './request-plane.middleware';

const config = requestPlaneConfigFromEnv({
  NODE_ENV: 'production',
  PUBLIC_SITE_URL: 'https://sovrack.tech',
  CUSTOMER_APP_URL: 'https://app.sovrack.tech',
  STAFF_APP_URL: 'https://staff.sovrack.tech',
});

function run(
  middleware: ReturnType<typeof createRequestPlaneMiddleware>,
  input: {
    host: string;
    path: string;
    method?: string;
    cookie?: string;
    origin?: string;
  },
) {
  const request = {
    method: input.method ?? 'GET',
    path: input.path,
    headers: {
      host: input.host,
      cookie: input.cookie,
      origin: input.origin,
    },
  } as unknown as Request;
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status } as unknown as Response;
  const next = jest.fn();
  middleware(request, response, next);
  return { next, status, json };
}

describe('request plane middleware', () => {
  const middleware = createRequestPlaneMiddleware(config);

  it('keeps the public host free of application APIs', () => {
    expect(
      run(middleware, { host: 'sovrack.tech', path: '/auth/me' }).status,
    ).toHaveBeenCalledWith(404);
  });

  it('allows customer APIs but not staff APIs on the app host', () => {
    expect(
      run(middleware, { host: 'app.sovrack.tech', path: '/projects' }).next,
    ).toHaveBeenCalled();
    expect(
      run(middleware, { host: 'app.sovrack.tech', path: '/staff/users' })
        .status,
    ).toHaveBeenCalledWith(404);
  });

  it('allows only the one-time impersonation exchange on the app host', () => {
    expect(
      run(middleware, {
        host: 'app.sovrack.tech',
        method: 'POST',
        path: '/staff/impersonation/exchange',
      }).next,
    ).toHaveBeenCalled();
  });

  it('keeps client APIs off the staff host', () => {
    expect(
      run(middleware, { host: 'staff.sovrack.tech', path: '/projects' })
        .status,
    ).toHaveBeenCalledWith(404);
  });
});

describe('CSRF origin middleware', () => {
  const middleware = createCsrfOriginMiddleware(config);

  it('accepts a cookie mutation only from the exact customer origin', () => {
    expect(
      run(middleware, {
        host: 'app.sovrack.tech',
        method: 'POST',
        path: '/projects',
        cookie: 'deploy_automation_token=x',
        origin: 'https://app.sovrack.tech',
      }).next,
    ).toHaveBeenCalled();
  });

  it('rejects missing and sibling origins for cookie mutations', () => {
    for (const origin of [undefined, 'https://staff.sovrack.tech']) {
      expect(
        run(middleware, {
          host: 'app.sovrack.tech',
          method: 'DELETE',
          path: '/projects/p1',
          cookie: 'deploy_automation_token=x',
          origin,
        }).status,
      ).toHaveBeenCalledWith(403);
    }
  });

  it('does not impose browser CSRF semantics on bearer-only API clients', () => {
    expect(
      run(middleware, {
        host: 'app.sovrack.tech',
        method: 'POST',
        path: '/projects',
      }).next,
    ).toHaveBeenCalled();
  });
});
