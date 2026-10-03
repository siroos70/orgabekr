const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  getPool,
  ensureSchema,
  checkDatabase,
  createOrder,
  findOrderByAuthority,
  markCreated,
  markFailed,
  markPaid,
} = require('./db');

const root = __dirname;
const publicDir = path.join(root, 'public');
const port = Number(process.env.PORT || 3000);
const routes = {
  '/': path.join(publicDir, 'index.html'),
  '/index.html': path.join(publicDir, 'index.html'),
  '/wholesale/': path.join(root, 'wholesale', 'index.html'),
  '/wholesale': path.join(root, 'wholesale', 'index.html'),
  '/dried-fig-types/': path.join(root, 'dried-fig-types', 'index.html'),
  '/dried-fig-types': path.join(root, 'dried-fig-types', 'index.html'),
  '/pay/': path.join(root, 'pay', 'index.html'),
  '/pay': path.join(root, 'pay', 'index.html'),
  '/manus-routes.json': path.join(publicDir, 'manus-routes.json'),
};
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};
const paymentAttempts = new Map();
const paymentWindowMs = 10 * 60 * 1000;
const paymentAttemptLimit = 5;

function isPaymentRateLimited(req) {
  const address = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  if (paymentAttempts.size > 10000) {
    for (const [key, value] of paymentAttempts) if (now - value.startedAt > paymentWindowMs) paymentAttempts.delete(key);
  }
  const current = paymentAttempts.get(address);
  if (!current || now - current.startedAt > paymentWindowMs) {
    paymentAttempts.set(address, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > paymentAttemptLimit;
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  if (decoded.includes('..')) return null;
  return decoded;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 32 * 1024) reject(new Error('payload_too_large'));
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

function digits(value) {
  return String(value || '').replace(/[۰-۹]/g, (char) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(char))).replace(/[٠-٩]/g, (char) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(char)));
}

function numberValue(value) {
  const normalized = digits(value).replace(/[,_\s]/g, '');
  return /^\d+$/.test(normalized) ? Number(normalized) : NaN;
}

function gatewayConfig() {
  const sandbox = process.env.ZARINPAL_MODE !== 'production';
  return sandbox ? {
    mode: 'sandbox',
    requestUrl: 'https://sandbox.zarinpal.com/pg/v4/payment/request.json',
    verifyUrl: 'https://sandbox.zarinpal.com/pg/v4/payment/verify.json',
    startUrl: 'https://sandbox.zarinpal.com/pg/StartPay/',
  } : {
    mode: 'production',
    requestUrl: 'https://payment.zarinpal.com/pg/v4/payment/request.json',
    verifyUrl: 'https://payment.zarinpal.com/pg/v4/payment/verify.json',
    startUrl: 'https://www.zarinpal.com/pg/StartPay/',
  };
}

function callbackUrl(req) {
  const configuredOrigin = process.env.PUBLIC_ORIGIN;
  if (!configuredOrigin) throw new Error('PUBLIC_ORIGIN_REQUIRED');
  const origin = new URL(configuredOrigin);
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('PUBLIC_ORIGIN_REQUIRED');
  return `${origin.origin}/api/payments/zarinpal/callback`;
}

async function providerCall(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  return data;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function resultPage(title, message, tone = 'success', refId = '') {
  const color = tone === 'success' ? '#55652a' : '#5b1d23';
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} | ارگابکر</title><style>body{margin:0;background:#f8f4ec;color:#23302a;font-family:Tahoma,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px}.card{max-width:560px;background:#fffdf9;border:1px solid #e1e2d8;border-radius:26px;padding:38px;text-align:center;box-shadow:0 20px 55px #34371b14}.mark{width:58px;height:58px;display:grid;place-items:center;border-radius:50%;background:${color};color:#f8e3a2;font-size:28px;margin:0 auto 20px}h1{font-size:28px;margin:0 0 12px}p{color:#697166;line-height:2;font-size:14px}.ref{color:${color};font-weight:bold}.button{display:inline-block;background:#5b1d23;color:#fff8ed;border-radius:999px;padding:12px 20px;text-decoration:none;font-size:13px;font-weight:bold;margin-top:12px}</style></head><body><main class="card"><div class="mark">${tone === 'success' ? '✓' : '!'}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${refId ? `<p class="ref">کد پیگیری: ${escapeHtml(refId)}</p>` : ''}<a class="button" href="/pay/">بازگشت به پرداخت آنلاین</a></main></body></html>`;
}

async function requestPayment(req, res) {
  if (isPaymentRateLimited(req)) return sendJson(res, 429, { ok: false, code: 'rate_limited', message: 'لطفاً چند دقیقه بعد دوباره تلاش کنید.' });
  if (!getPool()) return sendJson(res, 503, { ok: false, code: 'database_not_ready', message: 'پایگاه داده هنوز آماده نیست.' });
  const merchantId = process.env.ZARINPAL_MERCHANT_ID;
  if (!merchantId) return sendJson(res, 503, { ok: false, code: 'payment_not_configured', message: 'درگاه پرداخت هنوز پیکربندی نشده است.' });
  let body;
  try { body = await readJson(req); } catch (error) { return sendJson(res, 400, { ok: false, code: error.message }); }
  const amountToman = numberValue(body.amountToman);
  if (!Number.isSafeInteger(amountToman) || amountToman < 1000 || amountToman > 500000000) {
    return sendJson(res, 422, { ok: false, code: 'invalid_amount', message: 'مبلغ را بین ۱٬۰۰۰ تا ۵۰۰٬۰۰۰٬۰۰۰ تومان وارد کنید.' });
  }
  const amountRial = amountToman * 10;
  const orderId = `ERG-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const name = String(body.name || '').trim().slice(0, 120);
  const phone = digits(body.phone).trim().slice(0, 40);
  const email = String(body.email || '').trim().slice(0, 190);
  const description = String(body.description || 'خرید از ارگابکر').trim().slice(0, 255) || 'خرید از ارگابکر';
  const config = gatewayConfig();
  let redirectCallback;
  try { redirectCallback = callbackUrl(req); } catch { return sendJson(res, 503, { ok: false, code: 'public_origin_required', message: 'آدرس عمومی HTTPS سایت برای بازگشت از درگاه تنظیم نشده است.' }); }
  try {
    await createOrder({ orderId, amountRial, amountToman, description, name, phone, email });
    const providerResponse = await providerCall(config.requestUrl, {
      merchant_id: merchantId,
      amount: amountRial,
      currency: 'IRR',
      description,
      callback_url: redirectCallback,
      metadata: { mobile: phone || undefined, email: email || undefined, order_id: orderId },
    });
    const data = providerResponse.data || {};
    const code = Number(data.code);
    if (code !== 100 || !data.authority) {
      await markFailed(orderId, Number.isFinite(code) ? code : null);
      return sendJson(res, 502, { ok: false, code: 'provider_rejected', message: 'درخواست پرداخت از طرف درگاه پذیرفته نشد.' });
    }
    await markCreated(orderId, data.authority, code);
    return sendJson(res, 200, { ok: true, orderId, mode: config.mode, redirectUrl: `${config.startUrl}${encodeURIComponent(data.authority)}` });
  } catch (error) {
    console.error('zarinpal_request_failed', error.message);
    try { await markFailed(orderId, null); } catch {}
    const code = error.message === 'PUBLIC_ORIGIN_REQUIRED' ? 'public_origin_required' : 'payment_provider_unavailable';
    return sendJson(res, 502, { ok: false, code, message: code === 'public_origin_required' ? 'آدرس عمومی سایت برای بازگشت از درگاه تنظیم نشده است.' : 'ارتباط با درگاه پرداخت برقرار نشد.' });
  }
}

async function handleCallback(req, res) {
  const query = new URL(req.url, 'http://localhost').searchParams;
  const authority = query.get('Authority') || query.get('authority') || '';
  const status = query.get('Status') || query.get('status') || '';
  if (!authority) return sendJson(res, 400, { ok: false, code: 'missing_authority' });
  if (!getPool()) return sendJson(res, 503, { ok: false, code: 'database_not_ready' });
  const order = await findOrderByAuthority(authority);
  if (!order) return sendJson(res, 404, { ok: false, code: 'order_not_found' });
  if (order.status === 'paid') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(resultPage('پرداخت قبلاً تأیید شده', 'این تراکنش قبلاً در سمت سرور تأیید شده است.', 'success', order.ref_id || ''));
  }
  if (status.toUpperCase() !== 'OK') {
    await markFailed(order.order_id, -1);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(resultPage('پرداخت انجام نشد', 'پرداخت لغو شد یا از طرف درگاه تکمیل نشد. مبلغی از سمت ارگابکر ثبت نشده است.', 'error'));
  }
  const config = gatewayConfig();
  try {
    const providerResponse = await providerCall(config.verifyUrl, { merchant_id: process.env.ZARINPAL_MERCHANT_ID, amount: order.amount_rial, authority });
    const data = providerResponse.data || {};
    const code = Number(data.code);
    if (code === 100 || code === 101) {
      await markPaid(order.order_id, code, data.ref_id || '');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(resultPage('پرداخت با موفقیت انجام شد', 'پرداخت شما با موفقیت تأیید شد. برای هماهنگی ارسال، ارگابکر با شما تماس می‌گیرد.', 'success', data.ref_id || ''));
    }
    await markFailed(order.order_id, code);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(resultPage('تأیید پرداخت انجام نشد', 'تراکنش از طرف درگاه تأیید نشد. لطفاً با ارگابکر تماس بگیرید.', 'error'));
  } catch (error) {
    console.error('zarinpal_verify_failed', error.message);
    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(resultPage('خطا در تأیید پرداخت', 'ارتباط با درگاه برای تأیید تراکنش برقرار نشد. لطفاً کد پیگیری خود را نگه دارید و با ارگابکر تماس بگیرید.', 'error'));
  }
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error'); }
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[extension] || 'application/octet-stream', 'Cache-Control': extension === '.html' || extension === '.json' ? 'no-cache' : 'public, max-age=3600' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = safePath(req.url || '/');
  if (!urlPath) return sendJson(res, 400, { ok: false, code: 'bad_request' });
  try {
    if (req.method === 'GET' && urlPath === '/api/health') {
      let databaseReady = false;
      try { databaseReady = await checkDatabase(); } catch (error) { console.error('health_check_failed', error.message); }
      return sendJson(res, databaseReady ? 200 : 503, { status: databaseReady ? 'ok' : 'not_ready', service: 'ergabaker', databaseConfigured: Boolean(process.env.DATABASE_URL), databaseReady, paymentConfigured: Boolean(process.env.ZARINPAL_MERCHANT_ID), publicOriginConfigured: Boolean(process.env.PUBLIC_ORIGIN) });
    }
    if (req.method === 'POST' && urlPath === '/api/payments/zarinpal/request') return requestPayment(req, res);
    if (req.method === 'GET' && urlPath === '/api/payments/zarinpal/callback') return handleCallback(req, res);
    if (routes[urlPath]) return serveFile(res, routes[urlPath]);
    if (path.extname(urlPath)) return serveFile(res, path.join(publicDir, urlPath));
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>صفحه پیدا نشد</title><body style="font-family:Tahoma;padding:4rem;background:#f8f4ec;color:#23302a"><h1>این صفحه پیدا نشد.</h1><a href="/">بازگشت به صفحه اصلی</a></body></html>');
  } catch (error) {
    console.error('request_failed', error.message);
    return sendJson(res, 500, { ok: false, code: 'internal_error' });
  }
});

ensureSchema().catch((error) => console.error('database_schema_failed', error.message));
server.listen(port, '0.0.0.0', () => console.log(`Ergabaker listening on http://0.0.0.0:${port}`));
