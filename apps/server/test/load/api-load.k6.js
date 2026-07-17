/* eslint-disable */
// k6 load test for the Deploy Automation API read paths.
//
// Run (needs k6 installed: https://k6.io):
//   API=http://localhost:3001 \
//   EMAIL=admin@deployautomation.local PASSWORD='CHANGE_MOI_ADMIN_PASSWORD' \
//   k6 run backend/test/load/api-load.k6.js
//
// Logs in ONCE in setup() (the /auth/login route is rate-limited 5/min) and
// reuses the JWT as a Bearer token for every virtual user.
import http from 'k6/http';
import { check, sleep } from 'k6';

const API = __ENV.API || 'http://localhost:3001';
const EMAIL = __ENV.EMAIL || 'admin@deployautomation.local';
const PASSWORD = __ENV.PASSWORD || 'CHANGE_MOI_ADMIN_PASSWORD';

export const options = {
  // Ramp to 20 concurrent users, hold, ramp down.
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 20 },
    { duration: '15s', target: 0 },
  ],
  // SLOs — the run FAILS if these are breached.
  thresholds: {
    http_req_failed: ['rate<0.01'], // < 1% errors
    http_req_duration: ['p(95)<500'], // p95 < 500ms
    'http_req_duration{endpoint:readiness}': ['p(95)<150'],
  },
};

export function setup() {
  const res = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'login 200': (r) => r.status === 200 });
  const token = res.json('access_token');
  if (!token) throw new Error(`Login failed (status ${res.status})`);
  return { token };
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}` };

  // Liveness/readiness are unauthenticated and must stay fast.
  const ready = http.get(`${API}/health/ready`, {
    tags: { endpoint: 'readiness' },
  });
  check(ready, { 'ready ok': (r) => r.status === 200 || r.status === 503 });

  const reads = http.batch([
    ['GET', `${API}/projects`, null, { headers, tags: { endpoint: 'projects' } }],
    ['GET', `${API}/deployments`, null, { headers, tags: { endpoint: 'deployments' } }],
    [
      'GET',
      `${API}/monitoring/overview`,
      null,
      { headers, tags: { endpoint: 'monitoring' } },
    ],
  ]);
  reads.forEach((r) =>
    check(r, { 'read 2xx': (res) => res.status >= 200 && res.status < 300 }),
  );

  sleep(1);
}
