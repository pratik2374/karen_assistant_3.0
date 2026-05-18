import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Ramp up to 50 concurrent users
    { duration: '1m', target: 50 },   // Sustain high load
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    // 95% of requests must complete within 200ms
    http_req_duration: ['p(95)<200'],
    // Less than 1% failure rate
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const url = 'http://127.0.0.1:3000/v1/tasks';
  const payload = JSON.stringify({
    title: 'Flood Test Task',
    priority: 'high',
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    timezone: 'UTC',
    idempotencyKey: uuidv4(),
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'x-karen-execution-mode': 'SANDBOX',
    },
  };

  const res = http.post(url, payload, params);

  check(res, {
    'is status 202': (r) => r.status === 202,
  });

  sleep(1);
}
