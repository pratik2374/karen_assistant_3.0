import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  stages: [
    { duration: '2m', target: 20 },   // Ramp up
    { duration: '1h', target: 20 },   // 1 hour soak (use --duration to extend up to 24h)
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    // Memory and queue starvation should not impact baseline latency over long periods
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const url = 'http://127.0.0.1:3000/v1/tasks';
  const payload = JSON.stringify({
    title: 'Soak Test Task',
    priority: 'low', // Low priority to validate queue fairness
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

  // Slow pacing for soak testing
  sleep(5);
}
