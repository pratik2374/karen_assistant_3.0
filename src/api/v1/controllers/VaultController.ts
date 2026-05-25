import { Request, Response, Router } from 'express';
import { DocumentVaultMongoRepository, DocumentVaultEntry } from '../../../infrastructure/persistence/mongo/repositories/DocumentVaultMongoRepository.js';
import { randomUUID } from 'crypto';

// ─── DEBUG LOGGER ──────────────────────────────────────────────────────────
// Structured prefix makes it trivial to grep: grep "\[VAULT" server.log
const TAG = '[VAULT]';
function log(section: string, msg: string, data?: unknown) {
  const ts = new Date().toISOString();
  if (data !== undefined) {
    console.log(`${ts} ${TAG}[${section}] ${msg}`, data);
  } else {
    console.log(`${ts} ${TAG}[${section}] ${msg}`);
  }
}
function logErr(section: string, msg: string, err: unknown) {
  const ts = new Date().toISOString();
  console.error(`${ts} ${TAG}[${section}] ❌ ${msg}`);
  if (err instanceof Error) {
    console.error(`  name   : ${err.name}`);
    console.error(`  message: ${err.message}`);
    console.error(`  stack  :\n${err.stack}`);
  } else {
    console.error('  raw err:', err);
  }
}
// ──────────────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class VaultController {
  public router: Router;

  constructor(private vaultRepo: DocumentVaultMongoRepository) {
    log('INIT', 'VaultController constructor called');
    log('INIT', 'vaultRepo received?', !!vaultRepo);
    log('INIT', 'vaultRepo type', typeof vaultRepo);
    log('INIT', 'vaultRepo keys', vaultRepo ? Object.keys(vaultRepo) : 'N/A');

    this.router = Router();
    this.initializeRoutes();

    log('INIT', 'Router initialized, routes registered');
  }

  private initializeRoutes() {
    log('ROUTES', 'Registering middleware and routes');

    // ── AUTH MIDDLEWARE ──────────────────────────────────────────────────
    this.router.use((req, res, next) => {
      // Allow the login POST route to pass through
      if (req.path === '/login' && req.method === 'POST') {
        return next();
      }

      // Parse cookies
      const cookieHeader = req.headers.cookie || '';
      const cookies = Object.fromEntries(
        cookieHeader.split('; ').map(c => {
          const parts = c.split('=');
          return [parts[0], parts.slice(1).join('=')];
        })
      );

      const session = cookies.vault_session;
      const expectedSession = 'authenticated';

      if (session === expectedSession) {
        return next();
      }

      // If requesting API data, return a JSON 401
      if (req.path.startsWith('/api')) {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      // Otherwise, render the gorgeous login page
      return this.renderLoginPage(req, res);
    });

    this.router.get('/', this.renderDashboard.bind(this));
    this.router.post('/login', this.handleLogin.bind(this));
    this.router.post('/logout', this.handleLogout.bind(this));
    this.router.get('/api', this.getDocuments.bind(this));
    this.router.post('/api', this.addDocument.bind(this));
    this.router.delete('/api/:id', this.deleteDocument.bind(this));

    log('ROUTES', 'All routes registered: GET /, POST /login, POST /logout, GET /api, POST /api, DELETE /api/:id');
  }

  // ── CUSTOM LOGIN PAGE ────────────────────────────────────────────────────
  private renderLoginPage(_req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com; connect-src 'self'; img-src 'self' data:;"
    );

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vault — Authenticate</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: radial-gradient(circle at 50% 50%, #151528 0%, #080810 100%);
      color: #ffffff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      overflow: hidden;
    }
    .grid-bg {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background-image: linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
      background-size: 30px 30px;
      background-position: center;
      z-index: 1;
      pointer-events: none;
    }
    .glow-orb {
      position: absolute;
      width: 400px; height: 400px;
      background: radial-gradient(circle, rgba(44,44,255,0.12) 0%, transparent 70%);
      border-radius: 50%;
      top: 20%; left: 30%;
      z-index: 2;
      pointer-events: none;
      filter: blur(40px);
      animation: float 8s ease-in-out infinite;
    }
    @keyframes float {
      0%, 100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-20px) scale(1.05); }
    }
    .login-card {
      background: rgba(255,255,255,0.03);
      backdrop-filter: blur(25px);
      -webkit-backdrop-filter: blur(25px);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      width: 100%;
      max-width: 400px;
      padding: 2.5rem;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
      z-index: 10;
      position: relative;
      transition: transform 0.1s ease;
    }
    .brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      margin-bottom: 2rem;
      text-align: center;
    }
    .brand-icon {
      width: 42px; height: 42px;
      background: #ffffff;
      color: #080810;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 15px rgba(255,255,255,0.2);
    }
    .brand-title {
      font-family: 'Syne', sans-serif;
      font-weight: 800;
      font-size: 1.5rem;
      letter-spacing: -0.02em;
    }
    .brand-subtitle {
      font-size: 0.78rem;
      color: rgba(255,255,255,0.4);
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-top: 4px;
    }
    .field {
      margin-bottom: 1.25rem;
    }
    .field label {
      display: block;
      font-size: 0.72rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: rgba(255,255,255,0.5);
      margin-bottom: 6px;
    }
    .field input {
      width: 100%;
      height: 44px;
      padding: 0 14px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      background: rgba(0,0,0,0.2);
      color: #ffffff;
      font-family: 'DM Sans', sans-serif;
      font-size: 0.9rem;
      outline: none;
      transition: all 0.2s ease;
    }
    .field input:focus {
      border-color: #2c2cff;
      background: rgba(0,0,0,0.4);
      box-shadow: 0 0 0 4px rgba(44,44,255,0.2);
    }
    .btn {
      width: 100%;
      height: 44px;
      background: #ffffff;
      color: #080810;
      border: none;
      border-radius: 8px;
      font-family: 'Syne', sans-serif;
      font-weight: 700;
      font-size: 0.9rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s ease;
      margin-top: 1.5rem;
    }
    .btn:hover {
      background: #e8e8ff;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(44,44,255,0.25);
    }
    .btn:active {
      transform: translateY(0);
    }
    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none !important;
      box-shadow: none !important;
    }
    .error-alert {
      background: rgba(217,48,37,0.12);
      border: 1px solid rgba(217,48,37,0.25);
      border-radius: 8px;
      padding: 10px 12px;
      color: #ff8f8f;
      font-size: 0.8rem;
      display: none;
      margin-bottom: 1.25rem;
      animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-5px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .shake {
      animation: shake 0.4s ease;
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-8px); }
      40%, 80% { transform: translateX(8px); }
    }
    .footer-text {
      text-align: center;
      font-size: 0.72rem;
      color: rgba(255,255,255,0.3);
      margin-top: 2rem;
    }
  </style>
</head>
<body>
  <div class="grid-bg"></div>
  <div class="glow-orb"></div>

  <div class="login-card" id="loginCard">
    <div class="brand">
      <div class="brand-icon">
        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <div>
        <h1 class="brand-title">Vault</h1>
        <p class="brand-subtitle">Secure Document Store</p>
      </div>
    </div>

    <div class="error-alert" id="errorAlert"></div>

    <form onsubmit="handleLogin(event)">
      <div class="field">
        <label for="username">Username</label>
        <input type="text" id="username" required autocomplete="username" placeholder="e.g. karen">
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input type="password" id="password" required autocomplete="current-password" placeholder="••••••••">
      </div>
      <button class="btn" type="submit" id="submitBtn">
        Access Vault
      </button>
    </form>

    <p class="footer-text">Protected by end-to-end token validation</p>
  </div>

  <script>
    async function handleLogin(e) {
      e.preventDefault();
      const userEl = document.getElementById('username');
      const passEl = document.getElementById('password');
      const btn = document.getElementById('submitBtn');
      const card = document.getElementById('loginCard');
      const errAlert = document.getElementById('errorAlert');

      const username = userEl.value.trim();
      const password = passEl.value;

      btn.disabled = true;
      btn.textContent = 'Verifying...';
      errAlert.style.display = 'none';

      try {
        const res = await fetch('/vault/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Authentication failed.');
        }

        window.location.reload();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Access Vault';
        
        errAlert.textContent = err.message;
        errAlert.style.display = 'block';
        
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 400);
      }
    }
  </script>
</body>
</html>`;

    res.send(html);
  }

  // ── HANDLE LOGIN POST ────────────────────────────────────────────────────
  private async handleLogin(req: Request, res: Response) {
    log('LOGIN', 'handleLogin() called');
    const { username, password } = req.body || {};
    const validUser = process.env.VAULT_USERNAME || 'karen';
    const validPassword = process.env.VAULT_PASSWORD;

    if (!validPassword) {
      console.error('[VAULT] VAULT_PASSWORD env variable is not set. Access denied.');
      return res.status(500).json({ error: 'Server misconfiguration.' });
    }

    if (username === validUser && password === validPassword) {
      log('LOGIN', '✅ Credentials verified — setting vault_session cookie');
      res.setHeader('Set-Cookie', 'vault_session=authenticated; Path=/vault; HttpOnly; SameSite=Strict; Max-Age=86400');
      return res.json({ success: true });
    }

    log('LOGIN', '❌ Invalid login attempt');
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  // ── HANDLE LOGOUT POST ───────────────────────────────────────────────────
  private async handleLogout(_req: Request, res: Response) {
    log('LOGOUT', 'handleLogout() called — clearing vault_session cookie');
    res.setHeader('Set-Cookie', 'vault_session=; Path=/vault; HttpOnly; SameSite=Strict; Max-Age=0');
    return res.json({ success: true });
  }

  // ── DASHBOARD ────────────────────────────────────────────────────────────
  private async renderDashboard(_req: Request, res: Response) {
    log('DASHBOARD', 'Rendering dashboard HTML');

    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com; connect-src 'self'; img-src 'self' data:;"
      );

      log('DASHBOARD', 'Response headers set, sending HTML now');

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vault — Secure Document Store</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --ink: #0a0a0f; --ink2: #3a3a4a; --ink3: #7a7a8a;
      --surface: #f5f4f0; --card: #ffffff;
      --border: rgba(10,10,15,0.10); --border-strong: rgba(10,10,15,0.22);
      --accent: #2c2cff; --accent-dim: rgba(44,44,255,0.08); --accent-text: #1a1aee;
      --danger: #d93025; --danger-dim: rgba(217,48,37,0.08);
      --success: #137333; --success-dim: rgba(19,115,51,0.08);
      --amber: #b06000; --amber-dim: rgba(176,96,0,0.08);
      --shadow: 0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05);
      --shadow-lg: 0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06);
      --radius: 10px; --radius-sm: 6px;
    }
    html { font-size: 16px; }
    body { font-family: 'DM Sans', sans-serif; background: var(--surface); color: var(--ink); min-height: 100vh; -webkit-font-smoothing: antialiased; }
    .topbar { position: sticky; top: 0; z-index: 100; background: rgba(245,244,240,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); padding: 0 2rem; height: 60px; display: flex; align-items: center; justify-content: space-between; }
    .topbar-brand { display: flex; align-items: center; gap: 10px; font-family: 'Syne', sans-serif; font-weight: 700; font-size: 1rem; color: var(--ink); }
    .brand-icon { width: 30px; height: 30px; background: var(--ink); border-radius: 7px; display: flex; align-items: center; justify-content: center; }
    .brand-icon svg { color: white; }
    .topbar-meta { font-family: 'DM Mono', monospace; font-size: 0.72rem; color: var(--ink3); letter-spacing: 0.04em; }
    .page { max-width: 900px; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }
    .hero { margin-bottom: 2.5rem; }
    .hero-label { font-family: 'DM Mono', monospace; font-size: 0.7rem; letter-spacing: 0.12em; color: var(--ink3); text-transform: uppercase; margin-bottom: 0.5rem; }
    .hero-title { font-family: 'Syne', sans-serif; font-size: 2.2rem; font-weight: 800; letter-spacing: -0.03em; line-height: 1.15; }
    .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 2rem; }
    .stat-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.1rem 1.25rem; box-shadow: var(--shadow); }
    .stat-label { font-size: 0.72rem; font-family: 'DM Mono', monospace; letter-spacing: 0.06em; color: var(--ink3); text-transform: uppercase; margin-bottom: 0.4rem; }
    .stat-value { font-family: 'Syne', sans-serif; font-size: 1.7rem; font-weight: 700; line-height: 1; }
    .stat-value.accent { color: var(--accent-text); }
    .panel { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); margin-bottom: 1.5rem; overflow: hidden; }
    .panel-header { padding: 1.1rem 1.5rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
    .panel-title { font-family: 'Syne', sans-serif; font-size: 0.9rem; font-weight: 700; }
    .panel-body { padding: 1.5rem; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items: end; }
    .field label { display: block; font-size: 0.75rem; font-weight: 500; color: var(--ink2); margin-bottom: 6px; }
    .field input { width: 100%; height: 40px; padding: 0 12px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); font-family: 'DM Sans', sans-serif; font-size: 0.875rem; color: var(--ink); background: var(--surface); outline: none; transition: border-color 0.15s, box-shadow 0.15s, background 0.15s; }
    .field input:focus { border-color: var(--accent); background: #fff; box-shadow: 0 0 0 3px rgba(44,44,255,0.12); }
    .field input::placeholder { color: var(--ink3); }
    .btn { height: 40px; padding: 0 20px; border: none; border-radius: var(--radius-sm); font-family: 'Syne', sans-serif; font-weight: 600; font-size: 0.82rem; cursor: pointer; transition: transform 0.12s, opacity 0.15s; display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
    .btn:active { transform: scale(0.97); }
    .btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
    .btn-primary { background: var(--ink); color: #fff; }
    .btn-primary:hover:not(:disabled) { background: #1a1a2e; }
    .btn-danger { background: var(--danger-dim); color: var(--danger); border: 1px solid rgba(217,48,37,0.18); padding: 0 12px; height: 32px; font-size: 0.77rem; }
    .btn-danger:hover:not(:disabled) { background: rgba(217,48,37,0.15); }
    #toast-container { position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 9999; display: flex; flex-direction: column; gap: 8px; }
    .toast { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: var(--radius); font-size: 0.85rem; font-weight: 500; box-shadow: var(--shadow-lg); border: 1px solid var(--border); min-width: 240px; animation: slideIn 0.25s ease; background: var(--card); }
    .toast.success { border-left: 3px solid var(--success); }
    .toast.error { border-left: 3px solid var(--danger); }
    .toast-icon { font-size: 1rem; }
    .toast.success .toast-icon { color: var(--success); }
    .toast.error .toast-icon { color: var(--danger); }
    @keyframes slideIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
    @keyframes fadeOut { to { opacity:0; transform:translateX(10px); } }
    .doc-table-wrap { overflow-x: auto; }
    .doc-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .doc-table th { font-family: 'DM Mono', monospace; font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink3); padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid var(--border); background: var(--surface); }
    .doc-table td { padding: 1rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
    .doc-table tbody tr { transition: background 0.1s; }
    .doc-table tbody tr:hover { background: rgba(44,44,255,0.025); }
    .doc-table tbody tr:last-child td { border-bottom: none; }
    .doc-name { font-weight: 500; display: flex; align-items: center; gap: 8px; }
    .doc-icon { width: 28px; height: 28px; background: var(--accent-dim); border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.7rem; font-family: 'DM Mono', monospace; color: var(--accent-text); font-weight: 500; }
    .doc-link-cell a { font-family: 'DM Mono', monospace; font-size: 0.75rem; color: var(--accent-text); text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
    .doc-link-cell a:hover { text-decoration: underline; }
    .doc-id { font-family: 'DM Mono', monospace; font-size: 0.68rem; color: var(--ink3); }
    .state-box { padding: 3rem 1rem; text-align: center; }
    .state-box-icon { font-size: 2rem; margin-bottom: 0.75rem; opacity: 0.25; }
    .state-box-title { font-family: 'Syne', sans-serif; font-size: 0.95rem; font-weight: 600; color: var(--ink2); margin-bottom: 0.25rem; }
    .state-box-sub { font-size: 0.8rem; color: var(--ink3); }
    .skeleton-row td { padding: 1rem; border-bottom: 1px solid var(--border); }
    .skel { height: 14px; border-radius: 4px; background: linear-gradient(90deg, var(--border) 25%, rgba(200,200,210,0.3) 50%, var(--border) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 0.68rem; font-family: 'DM Mono', monospace; letter-spacing: 0.04em; }
    .badge-success { background: var(--success-dim); color: var(--success); }
    .badge-amber { background: var(--amber-dim); color: var(--amber); }
    .search-wrap { position: relative; }
    .search-wrap svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--ink3); pointer-events: none; }
    #searchInput { height: 36px; padding: 0 12px 0 34px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); font-family: 'DM Sans', sans-serif; font-size: 0.82rem; color: var(--ink); background: var(--surface); outline: none; width: 200px; transition: border-color 0.15s, width 0.2s ease; }
    #searchInput:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(44,44,255,0.10); width: 260px; background: #fff; }

    @media (max-width: 640px) {
      .form-grid { grid-template-columns: 1fr; }
      .stats-row { grid-template-columns: 1fr 1fr; }
      .hero-title { font-size: 1.6rem; }
      .topbar { padding: 0 1rem; }
      .page { padding: 1.5rem 1rem 4rem; }
    }
  </style>
</head>
<body>

<div id="toast-container"></div>

<div class="topbar">
  <div class="topbar-brand">
    <div class="brand-icon">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    </div>
    Vault
  </div>
  <div style="display: flex; align-items: center; gap: 15px;">
    <span class="topbar-meta" id="vaultTime">—</span>
    <button onclick="handleLogout()" class="btn" style="height: 28px; padding: 0 10px; font-size: 0.72rem; background: var(--danger-dim); color: var(--danger); border: 1px solid rgba(217,48,37,0.15); border-radius: 4px; font-family: 'Syne', sans-serif;">Logout</button>
  </div>
</div>

<div class="page">
  <div class="hero">
    <p class="hero-label">Secure Document Store</p>
    <h1 class="hero-title">Your documents,<br>locked &amp; organised.</h1>
  </div>

  <div class="stats-row">
    <div class="stat-card">
      <p class="stat-label">Total Docs</p>
      <p class="stat-value accent" id="statTotal">—</p>
    </div>
    <div class="stat-card">
      <p class="stat-label">Status</p>
      <p class="stat-value" style="font-size:1rem;padding-top:4px;">
        <span class="badge badge-success" id="statStatus">● Online</span>
      </p>
    </div>
    <div class="stat-card">
      <p class="stat-label">Last Updated</p>
      <p class="stat-value" style="font-size:0.88rem;font-family:'DM Mono',monospace;padding-top:6px;color:var(--ink2);" id="statUpdated">—</p>
    </div>
  </div>

  <div class="panel">
    <div class="panel-header"><span class="panel-title">Add Document</span></div>
    <div class="panel-body">
      <div class="form-grid">
        <div class="field">
          <label for="docName">Document name</label>
          <input type="text" id="docName" placeholder="e.g. Aadhaar Card" autocomplete="off">
        </div>
        <div class="field">
          <label for="docLink">Secure link</label>
          <input type="url" id="docLink" placeholder="https://drive.google.com/…">
        </div>
        <button class="btn btn-primary" id="saveBtn" onclick="addDocument()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Save
        </button>
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-header">
      <span class="panel-title">Documents</span>
      <div class="search-wrap">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="searchInput" placeholder="Filter documents…" oninput="renderTable()">
      </div>
    </div>
    <div class="doc-table-wrap">
      <table class="doc-table">
        <thead>
          <tr><th>Name</th><th>Link</th><th>ID</th><th></th></tr>
        </thead>
        <tbody id="docTableBody">
          <tr class="skeleton-row"><td><div class="skel" style="width:60%"></div></td><td><div class="skel" style="width:80%"></div></td><td><div class="skel" style="width:90%"></div></td><td></td></tr>
          <tr class="skeleton-row"><td><div class="skel" style="width:45%"></div></td><td><div class="skel" style="width:70%"></div></td><td><div class="skel" style="width:90%"></div></td><td></td></tr>
          <tr class="skeleton-row"><td><div class="skel" style="width:55%"></div></td><td><div class="skel" style="width:60%"></div></td><td><div class="skel" style="width:90%"></div></td><td></td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<script>
// ═══════════════════════════════════════════════════════════
// CLIENT-SIDE LOGGER
// All logs appear in the browser developer console (F12)
// ═══════════════════════════════════════════════════════════
function dbg(level, section, msg, data) {
  const consoleMsg = '[VAULT][' + section + '] ' + msg;
  if (level === 'ERR') console.error(consoleMsg, data !== undefined ? data : '');
  else if (level === 'WARN') console.warn(consoleMsg, data !== undefined ? data : '');
  else console.log(consoleMsg, data !== undefined ? data : '');
}

// ── GLOBAL ERROR CATCHERS ──────────────────────────────────
window.addEventListener('error', function(e) {
  dbg('ERR', 'GLOBAL', 'Uncaught JS error: ' + e.message, {
    file: e.filename, line: e.lineno, col: e.colno
  });
  if (e.error && e.error.stack) dbg('ERR', 'STACK', e.error.stack);
});
window.addEventListener('unhandledrejection', function(e) {
  const reason = e.reason;
  dbg('ERR', 'PROMISE', 'Unhandled rejection: ' + (reason ? (reason.message || String(reason)) : 'unknown'));
  if (reason && reason.stack) dbg('ERR', 'STACK', reason.stack);
});

// ══════════════════════════════════════════════════════════
// APP STATE
// ══════════════════════════════════════════════════════════
let allDocs = [];

function safeText(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

function initials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(w => w && w[0] ? w[0].toUpperCase() : '').join('');
}

function toast(msg, type = 'success') {
  dbg('INFO', 'TOAST', msg + ' [type=' + type + ']');
  const icon = type === 'success' ? '✓' : '✕';
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<span class="toast-icon">' + icon + '</span><span>' + safeText(msg) + '</span>';
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => {
    el.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function updateStats() {
  dbg('INFO', 'STATS', 'Updating stats, doc count=' + allDocs.length);
  document.getElementById('statTotal').textContent = allDocs.length;
  const now = new Date();
  document.getElementById('statUpdated').textContent =
    now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function handleLogout() {
  if (!confirm('Log out from Vault?')) return;
  try {
    const res = await fetch('/vault/logout', { method: 'POST' });
    if (res.ok) window.location.reload();
  } catch (err) {
    toast('Logout failed: ' + err.message, 'error');
  }
}

// ── RENDER TABLE ───────────────────────────────────────────
function renderTable() {
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  dbg('INFO', 'RENDER', 'renderTable() called, query="' + query + '", allDocs.length=' + allDocs.length);

  if (!Array.isArray(allDocs)) {
    dbg('ERR', 'RENDER', 'allDocs is not an array!', typeof allDocs);
    return;
  }

  const filtered = query
    ? allDocs.filter(d => {
        if (!d || !d.name || !d.link) {
          dbg('WARN', 'RENDER', 'Doc missing name/link', d);
          return false;
        }
        return d.name.toLowerCase().includes(query) || d.link.toLowerCase().includes(query);
      })
    : allDocs;

  dbg('INFO', 'RENDER', 'Filtered count=' + filtered.length);

  const tbody = document.getElementById('docTableBody');
  if (!tbody) {
    dbg('ERR', 'RENDER', 'docTableBody element NOT FOUND in DOM!');
    return;
  }

  if (filtered.length === 0) {
    dbg('INFO', 'RENDER', 'No docs to show — rendering empty state');
    tbody.innerHTML = '<tr><td colspan="4"><div class="state-box">' +
      '<div class="state-box-icon">🗂</div>' +
      '<p class="state-box-title">' + (query ? 'No results' : 'No documents yet') + '</p>' +
      '<p class="state-box-sub">' + (query ? 'Try a different search term.' : 'Add your first document above.') + '</p>' +
      '</div></td></tr>';
    return;
  }

  dbg('INFO', 'RENDER', 'Building rows for ' + filtered.length + ' docs');

  try {
    const rows = filtered.map((doc, i) => {
      dbg('INFO', 'RENDER', 'Row ' + i + ': docId=' + (doc.docId || 'MISSING') + ' name=' + (doc.name || 'MISSING'));

      if (!doc.docId) dbg('WARN', 'RENDER', 'Doc at index ' + i + ' has no docId!', doc);
      if (!doc.name)  dbg('WARN', 'RENDER', 'Doc at index ' + i + ' has no name!', doc);
      if (!doc.link)  dbg('WARN', 'RENDER', 'Doc at index ' + i + ' has no link!', doc);

      const safeName = safeText(doc.name  || '(no name)');
      const safeLink = safeText(doc.link  || '');
      const safeId   = safeText(doc.docId || '');
      const abbr     = initials(doc.name || '');

      let hostLabel = '';
      try {
        hostLabel = new URL(doc.link).hostname.replace('www.', '').split('.')[0];
        dbg('INFO', 'RENDER', 'Row ' + i + ': parsed hostname="' + hostLabel + '"');
      } catch(urlErr) {
        dbg('WARN', 'RENDER', 'Row ' + i + ': URL parse failed for "' + doc.link + '"', urlErr.message);
        hostLabel = 'Open';
      }

      return '<tr>' +
        '<td><div class="doc-name"><div class="doc-icon">' + safeText(abbr) + '</div>' + safeName + '</div></td>' +
        '<td class="doc-link-cell"><a href="' + safeLink + '" target="_blank" rel="noopener noreferrer">' +
          safeText(hostLabel || 'Open') +
          '<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
        '</a></td>' +
        '<td><span class="doc-id">' + safeId.slice(0, 8) + '…</span></td>' +
        '<td><button class="btn btn-danger" onclick="deleteDoc(\\\'' + safeId + '\\\', this)">Remove</button></td>' +
      '</tr>';
    });

    tbody.innerHTML = rows.join('');
    dbg('INFO', 'RENDER', 'Table innerHTML set successfully, rows rendered=' + rows.length);
  } catch(renderErr) {
    dbg('ERR', 'RENDER', 'Exception during row building: ' + renderErr.message, renderErr.stack);
  }
}

// ── FETCH DOCS ─────────────────────────────────────────────
async function fetchDocs() {
  const url = '/vault/api?_t=' + Date.now();
  dbg('NET', 'FETCH', 'Starting GET ' + url);

  try {
    const fetchStart = performance.now();
    const res = await fetch(url, { credentials: 'same-origin' });
    const fetchMs = (performance.now() - fetchStart).toFixed(0);

    dbg('NET', 'FETCH', 'Response received in ' + fetchMs + 'ms', {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      headers: {
        contentType: res.headers.get('content-type'),
        cacheControl: res.headers.get('cache-control')
      }
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '(unreadable body)');
      dbg('ERR', 'FETCH', 'Non-OK response body: ' + errText);
      throw new Error('HTTP ' + res.status + ' — ' + errText.slice(0, 120));
    }

    const rawText = await res.text();
    dbg('NET', 'FETCH', 'Raw response body (first 300 chars): ' + rawText.slice(0, 300));
    dbg('NET', 'FETCH', 'Response body length: ' + rawText.length);

    let parsed;
    try {
      parsed = JSON.parse(rawText);
      dbg('NET', 'FETCH', 'JSON parsed OK. Type=' + typeof parsed + ', isArray=' + Array.isArray(parsed));
    } catch (jsonErr) {
      dbg('ERR', 'FETCH', 'JSON.parse FAILED: ' + jsonErr.message);
      dbg('ERR', 'FETCH', 'Raw text that failed to parse: ' + rawText.slice(0, 500));
      throw new Error('Invalid JSON from /vault/api: ' + jsonErr.message);
    }

    if (!Array.isArray(parsed)) {
      dbg('ERR', 'FETCH', 'Expected array but got: ' + typeof parsed, parsed);
      throw new Error('Server returned non-array: ' + JSON.stringify(parsed).slice(0, 100));
    }

    dbg('INFO', 'FETCH', 'Docs loaded: count=' + parsed.length);
    if (parsed.length > 0) {
      dbg('INFO', 'FETCH', 'First doc shape (keys): ' + Object.keys(parsed[0]).join(', '));
      dbg('INFO', 'FETCH', 'First doc sample', {
        docId: parsed[0].docId,
        name: parsed[0].name,
        linkLength: parsed[0].link ? parsed[0].link.length : 'N/A'
      });
    }

    allDocs = parsed;
    dbg('INFO', 'FETCH', 'allDocs assigned, length=' + allDocs.length);

    updateStats();
    dbg('INFO', 'FETCH', 'Stats updated');

    renderTable();
    dbg('INFO', 'FETCH', 'renderTable() completed');

    document.getElementById('statStatus').className = 'badge badge-success';
    document.getElementById('statStatus').textContent = '● Online';

  } catch (err) {
    dbg('ERR', 'FETCH', 'fetchDocs FAILED: ' + err.message);
    if (err.stack) dbg('ERR', 'FETCH', 'Stack: ' + err.stack);
    document.getElementById('statStatus').className = 'badge badge-amber';
    document.getElementById('statStatus').textContent = '● Degraded';
    document.getElementById('docTableBody').innerHTML =
      '<tr><td colspan="4"><div class="state-box">' +
      '<div class="state-box-icon">⚠</div>' +
      '<p class="state-box-title">Could not load documents</p>' +
      '<p class="state-box-sub">' + safeText(err.message) + '</p>' +
      '</div></td></tr>';
  }
}

// ── ADD DOCUMENT ───────────────────────────────────────────
async function addDocument() {
  dbg('INFO', 'ADD', 'addDocument() triggered');

  const nameEl = document.getElementById('docName');
  const linkEl = document.getElementById('docLink');
  const btn    = document.getElementById('saveBtn');

  if (!nameEl || !linkEl || !btn) {
    dbg('ERR', 'ADD', 'DOM elements missing', {
      nameEl: !!nameEl, linkEl: !!linkEl, btn: !!btn
    });
    return;
  }

  const name = nameEl.value.trim();
  const link = linkEl.value.trim();

  dbg('INFO', 'ADD', 'Form values', {
    nameLength: name.length,
    linkLength: link.length,
    linkPreview: link.slice(0, 60)
  });

  if (!name) {
    dbg('WARN', 'ADD', 'Validation failed: name is empty');
    nameEl.focus();
    toast('Document name is required.', 'error');
    return;
  }
  if (!link) {
    dbg('WARN', 'ADD', 'Validation failed: link is empty');
    linkEl.focus();
    toast('Secure link is required.', 'error');
    return;
  }

  try {
    const parsedUrl = new URL(link);
    dbg('INFO', 'ADD', 'URL validation passed', { protocol: parsedUrl.protocol, host: parsedUrl.host });
  } catch (urlErr) {
    dbg('WARN', 'ADD', 'URL validation failed: ' + urlErr.message);
    toast('Please enter a valid URL.', 'error');
    linkEl.focus();
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="animation:spin 0.8s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Saving…';

  const payload = { name, link };
  dbg('NET', 'ADD', 'POSTing to /vault/api', { name, linkLength: link.length });

  try {
    const postStart = performance.now();
    const res = await fetch('/vault/api?_t=' + Date.now(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });
    const postMs = (performance.now() - postStart).toFixed(0);

    dbg('NET', 'ADD', 'POST response in ' + postMs + 'ms', {
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get('content-type')
    });

    const rawText = await res.text();
    dbg('NET', 'ADD', 'POST raw response body: ' + rawText.slice(0, 400));

    if (!res.ok) {
      let errMsg = 'HTTP ' + res.status;
      try {
        const errBody = JSON.parse(rawText);
        errMsg = errBody.error || errMsg;
        dbg('ERR', 'ADD', 'Server error response parsed', errBody);
      } catch {
        dbg('WARN', 'ADD', 'Could not parse error body as JSON: ' + rawText.slice(0, 100));
      }
      throw new Error(errMsg);
    }

    let responseData;
    try {
      responseData = JSON.parse(rawText);
      dbg('NET', 'ADD', 'POST response parsed OK', {
        success: responseData.success,
        docId: responseData.doc ? responseData.doc.docId : 'MISSING',
        docKeys: responseData.doc ? Object.keys(responseData.doc) : 'no doc'
      });
    } catch (jsonErr) {
      dbg('ERR', 'ADD', 'Failed to parse POST response JSON: ' + jsonErr.message);
      throw new Error('Server returned invalid JSON after save');
    }

    if (!responseData.doc) {
      dbg('ERR', 'ADD', 'Response OK but no doc object in response!', responseData);
      throw new Error('Save succeeded but server returned no document data');
    }

    dbg('INFO', 'ADD', 'Prepending doc to allDocs array (was length=' + allDocs.length + ')');
    allDocs.unshift(responseData.doc);
    dbg('INFO', 'ADD', 'allDocs.length now=' + allDocs.length);

    updateStats();
    renderTable();

    nameEl.value = '';
    linkEl.value = '';
    dbg('INFO', 'ADD', 'Form cleared');

    toast('Document saved securely.');
    dbg('INFO', 'ADD', 'addDocument() completed successfully');

  } catch (err) {
    dbg('ERR', 'ADD', 'addDocument FAILED: ' + err.message);
    if (err.stack) dbg('ERR', 'ADD', 'Stack: ' + err.stack);
    toast('Failed to save: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Save';
    dbg('INFO', 'ADD', 'Save button re-enabled');
  }
}

// ── DELETE DOC ─────────────────────────────────────────────
async function deleteDoc(id, btnEl) {
  dbg('INFO', 'DELETE', 'deleteDoc() called, id=' + id);

  if (!id) {
    dbg('ERR', 'DELETE', 'deleteDoc called with empty id!');
    toast('Cannot delete: missing document ID.', 'error');
    return;
  }

  if (!confirm('Delete this document? This cannot be undone.')) {
    dbg('INFO', 'DELETE', 'User cancelled deletion');
    return;
  }

  btnEl.disabled = true;
  btnEl.textContent = '…';

  const url = '/vault/api/' + encodeURIComponent(id);
  dbg('NET', 'DELETE', 'DELETE ' + url);

  try {
    const start = performance.now();
    const res = await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
    const ms = (performance.now() - start).toFixed(0);

    dbg('NET', 'DELETE', 'DELETE response in ' + ms + 'ms', {
      status: res.status, ok: res.ok
    });

    const rawText = await res.text();
    dbg('NET', 'DELETE', 'DELETE response body: ' + rawText.slice(0, 200));

    if (!res.ok) {
      throw new Error('HTTP ' + res.status + ' — ' + rawText.slice(0, 80));
    }

    const prevLen = allDocs.length;
    allDocs = allDocs.filter(d => d.docId !== id);
    dbg('INFO', 'DELETE', 'Filtered allDocs: was=' + prevLen + ' now=' + allDocs.length);

    if (allDocs.length === prevLen) {
      dbg('WARN', 'DELETE', 'No doc was removed from allDocs — id not found locally: ' + id);
    }

    updateStats();
    renderTable();
    toast('Document removed.');
    dbg('INFO', 'DELETE', 'deleteDoc() completed successfully');

  } catch (err) {
    dbg('ERR', 'DELETE', 'deleteDoc FAILED: ' + err.message);
    toast('Delete failed: ' + err.message, 'error');
    btnEl.disabled = false;
    btnEl.textContent = 'Remove';
  }
}

// ── INIT ───────────────────────────────────────────────────
function init() {
  dbg('INFO', 'INIT', '=== Vault Dashboard Initializing ===');
  dbg('INFO', 'INIT', 'document.readyState=' + document.readyState);
  dbg('INFO', 'INIT', 'User agent: ' + navigator.userAgent);
  dbg('INFO', 'INIT', 'Window location: ' + window.location.href);

  try {
    const docNameEl = document.getElementById('docName');
    const docLinkEl = document.getElementById('docLink');
    const vaultTimeEl = document.getElementById('vaultTime');

    dbg('INFO', 'INIT', 'DOM element checks', {
      docName: !!docNameEl,
      docLink: !!docLinkEl,
      vaultTime: !!vaultTimeEl,
      docTableBody: !!document.getElementById('docTableBody'),
      statTotal: !!document.getElementById('statTotal'),
      statStatus: !!document.getElementById('statStatus'),
      statUpdated: !!document.getElementById('statUpdated'),
      saveBtn: !!document.getElementById('saveBtn'),
      searchInput: !!document.getElementById('searchInput'),
      toastContainer: !!document.getElementById('toast-container')
    });

    if (docNameEl) {
      docNameEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          dbg('INFO', 'INPUT', 'Enter on docName — focusing docLink');
          const l = document.getElementById('docLink');
          if (l) l.focus();
        }
      });
    }

    if (docLinkEl) {
      docLinkEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          dbg('INFO', 'INPUT', 'Enter on docLink — calling addDocument()');
          addDocument();
        }
      });
    }

    function tick() {
      if (vaultTimeEl) {
        vaultTimeEl.textContent = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      }
    }
    tick();
    setInterval(tick, 10000);

    const spinStyle = document.createElement('style');
    spinStyle.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(spinStyle);
    dbg('INFO', 'INIT', 'Spin keyframe injected');

    dbg('INFO', 'INIT', 'Calling fetchDocs()...');
    fetchDocs();

    dbg('INFO', 'INIT', '=== Init complete ===');

  } catch (err) {
    dbg('ERR', 'INIT', 'INIT CRASHED: ' + err.message);
    if (err.stack) dbg('ERR', 'INIT', err.stack);
  }
}

if (document.readyState === 'loading') {
  dbg('INFO', 'BOOT', 'DOM not ready, attaching DOMContentLoaded listener');
  document.addEventListener('DOMContentLoaded', init);
} else {
  dbg('INFO', 'BOOT', 'DOM already ready (readyState=' + document.readyState + '), calling init() directly');
  init();
}
</script>
</body>
</html>`;

      res.send(html);
      log('DASHBOARD', 'HTML sent successfully');
    } catch (err) {
      logErr('DASHBOARD', 'renderDashboard threw an exception', err);
      res.status(500).send('Dashboard render error — check server logs.');
    }
  }

  // ── GET DOCUMENTS ─────────────────────────────────────────────────────────
  private async getDocuments(_req: Request, res: Response) {
    log('GET', 'getDocuments() called');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    try {
      log('GET', 'Calling vaultRepo.findAll()...');
      log('GET', 'vaultRepo exists?', !!this.vaultRepo);
      log('GET', 'vaultRepo.findAll type?', typeof this.vaultRepo.findAll);

      const docs = await this.vaultRepo.findAll();

      log('GET', 'findAll() returned. Type=' + typeof docs + ', isArray=' + Array.isArray(docs));
      log('GET', 'Total docs returned: ' + (Array.isArray(docs) ? docs.length : 'N/A'));

      if (Array.isArray(docs) && docs.length > 0) {
        log('GET', 'First doc shape (keys): ' + Object.keys(docs[0]).join(', '));
        log('GET', 'First doc sample', {
          docId: docs[0].docId,
          name: docs[0].name,
          hasLink: !!docs[0].link,
          aliasCount: Array.isArray(docs[0].aliases) ? docs[0].aliases.length : 'N/A'
        });
      } else if (Array.isArray(docs) && docs.length === 0) {
        log('GET', 'findAll() returned an empty array — collection may be empty');
      } else {
        log('GET', '⚠ findAll() returned a non-array!', docs);
      }

      log('GET', 'Sending JSON response...');
      res.json(docs);
      log('GET', 'JSON response sent OK');

    } catch (err) {
      logErr('GET', 'getDocuments threw an exception', err);
      log('GET', 'vaultRepo state at time of error', {
        hasRepo: !!this.vaultRepo,
        repoKeys: this.vaultRepo ? Object.keys(this.vaultRepo) : []
      });
      res.status(500).json({ error: 'Failed to retrieve documents.' });
    }
  }

  // ── ADD DOCUMENT ──────────────────────────────────────────────────────────
  private async addDocument(req: Request, res: Response) {
    log('POST', 'addDocument() called');
    log('POST', 'req.body raw', req.body);
    log('POST', 'Content-Type header', req.headers['content-type']);
    log('POST', 'body type', typeof req.body);
    log('POST', 'body is null?', req.body === null);
    log('POST', 'body keys', req.body ? Object.keys(req.body) : 'N/A');

    const { name, link } = req.body || {};

    log('POST', 'Extracted name', { value: name, type: typeof name, length: name ? name.length : 0 });
    log('POST', 'Extracted link', { present: !!link, type: typeof link, length: link ? link.length : 0, preview: link ? link.slice(0, 60) : '' });

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      log('POST', '⚠ Validation FAIL: name missing or empty');
      return res.status(400).json({ error: 'Document name is required.' });
    }

    if (!link || typeof link !== 'string' || link.trim().length === 0) {
      log('POST', '⚠ Validation FAIL: link missing or empty');
      return res.status(400).json({ error: 'Document link is required.' });
    }

    try {
      const parsed = new URL(link);
      log('POST', 'URL validation passed', { protocol: parsed.protocol, host: parsed.host });
    } catch (urlErr) {
      log('POST', '⚠ URL validation FAIL: ' + (urlErr as Error).message);
      return res.status(400).json({ error: 'Invalid URL provided.' });
    }

    const docId = randomUUID();
    const doc: DocumentVaultEntry = {
      docId,
      name: name.trim(),
      link: link.trim(),
      aliases: [name.trim().toLowerCase()]
    };

    log('POST', 'Constructed doc entry', {
      docId: doc.docId,
      name: doc.name,
      linkLength: doc.link.length,
      aliases: doc.aliases
    });

    try {
      log('POST', 'Calling vaultRepo.save(doc)...');
      await this.vaultRepo.save(doc);
      log('POST', 'vaultRepo.save() completed without error');

      const responsePayload = { success: true, doc };
      log('POST', 'Sending success response', { docId: doc.docId });
      res.json(responsePayload);
      log('POST', 'Response sent OK');

    } catch (err) {
      logErr('POST', 'vaultRepo.save() threw an exception', err);
      log('POST', 'Doc that failed to save', doc);
      res.status(500).json({ error: 'Failed to save document.' });
    }
  }

  // ── DELETE DOCUMENT ───────────────────────────────────────────────────────
  private async deleteDocument(req: Request, res: Response) {
    log('DELETE', 'deleteDocument() called');
    log('DELETE', 'req.params', req.params);

    const id = req.params.id as string;
    log('DELETE', 'Extracted id', { id, type: typeof id, length: id ? id.length : 0 });

    if (!id) {
      log('DELETE', '⚠ id is missing/empty — returning 400');
      return res.status(400).json({ error: 'Missing document ID.' });
    }

    try {
      log('DELETE', 'Calling vaultRepo.delete(' + id + ')...');
      await this.vaultRepo.delete(id);
      log('DELETE', 'vaultRepo.delete() completed OK');

      res.json({ success: true });
      log('DELETE', 'Delete response sent');

    } catch (err) {
      logErr('DELETE', 'vaultRepo.delete() threw an exception', err);
      log('DELETE', 'id that failed to delete: ' + id);
      res.status(500).json({ error: 'Failed to delete document.' });
    }
  }
}