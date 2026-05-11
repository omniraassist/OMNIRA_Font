// test.js — Stripe payment server + static checkout page
// ─────────────────────────────────────────────────────
// .env: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY
//
// Default (no TLS warnings):
//   node test.js  →  http://localhost:500/
//   Browsers treat http://localhost as a secure context; Stripe.js works.
//
// HTTPS (optional — use if you specifically need https://):
//   TEST_JS_HTTPS=1 node test.js  →  https://localhost:500/
//   • If mkcert is installed, dev-certs/ is created automatically (run mkcert -install once).
//   • Otherwise a self-signed cert is used → Advanced → Proceed in Chrome.
//   • Or put PEMs in dev-certs/localhost.pem + localhost-key.pem (see .gitignore).
//
// Port: TEST_JS_PORT=5000 node test.js
// Skip auto mkcert: TEST_JS_SKIP_MKCERT=1 node test.js
// ─────────────────────────────────────────────────────

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const selfsigned = require('selfsigned');

const app = express();
const ROOT = __dirname;
const PORT = Number(process.env.TEST_JS_PORT) || 500;
const WANT_HTTPS = String(process.env.TEST_JS_HTTPS || '').trim() === '1';

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('\n❌  STRIPE_SECRET_KEY is missing in .env\n');
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10',
});

app.get('/payment-env.js', (req, res) => {
  const pk = String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
  res
    .type('application/javascript')
    .set('Cache-Control', 'no-store')
    .send(`window.__STRIPE_PUBLISHABLE_KEY=${JSON.stringify(pk)};`);
});

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST'],
  })
);

app.post('/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.log('⚠️  Webhook received but STRIPE_WEBHOOK_SECRET not set.');
    return res.sendStatus(200);
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('❌  Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      console.log(
        `🎉  Payment succeeded: ${pi.id} | $${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()}`
      );
      break;
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object;
      console.log(`❌  Payment failed: ${pi.id} | ${pi.last_payment_error?.message}`);
      break;
    }
    default:
      console.log(`ℹ️   Webhook: ${event.type}`);
  }

  res.sendStatus(200);
});

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    publishable_key_configured: Boolean(String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim()),
  });
});

app.post('/create-payment-intent', async (req, res) => {
  try {
    const {
      amount = 1000,
      currency = 'usd',
      email,
      name,
    } = req.body;

    if (typeof amount !== 'number' || amount < 50) {
      return res.status(400).json({ error: 'Invalid amount. Minimum is $0.50.' });
    }

    let customer;
    if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 });
      if (existing.data.length > 0) {
        customer = existing.data[0];
        if (name && !customer.name) {
          customer = await stripe.customers.update(customer.id, { name });
        }
      } else {
        customer = await stripe.customers.create({ email, name: name || '' });
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      payment_method_types: ['card'],
      ...(customer ? { customer: customer.id } : {}),
      receipt_email: email || undefined,
      description: 'Premium Access — One-time payment',
      metadata: {
        product: 'Premium Access',
        buyer_name: name || 'Guest',
        buyer_email: email || '',
      },
    });

    console.log(
      `✅  PaymentIntent ${paymentIntent.id} | $${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`
    );

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error('❌  Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static(ROOT, { index: false }));
app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

const DEV_CERT_PEM = path.join(ROOT, 'dev-certs', 'localhost.pem');
const DEV_KEY_PEM = path.join(ROOT, 'dev-certs', 'localhost-key.pem');

function loadTlsFromDisk() {
  const certPath = String(process.env.TEST_JS_TLS_CERT || DEV_CERT_PEM).trim();
  const keyPath = String(process.env.TEST_JS_TLS_KEY || DEV_KEY_PEM).trim();
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    return null;
  }
  return {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
    certPath,
    keyPath,
  };
}

function tryMkcertGenerate() {
  if (String(process.env.TEST_JS_SKIP_MKCERT || '').trim() === '1') {
    return false;
  }
  try {
    fs.mkdirSync(path.join(ROOT, 'dev-certs'), { recursive: true });
  } catch (_) {
    /* ignore */
  }
  const args = ['-cert-file', DEV_CERT_PEM, '-key-file', DEV_KEY_PEM, 'localhost', '127.0.0.1', '::1'];
  const r = spawnSync('mkcert', args, { cwd: ROOT, encoding: 'utf8' });
  if (r.error && r.error.code === 'ENOENT') {
    return false;
  }
  if (r.status !== 0) {
    if (r.stderr) process.stderr.write(r.stderr);
    return false;
  }
  return fs.existsSync(DEV_CERT_PEM) && fs.existsSync(DEV_KEY_PEM);
}

function printStart(url, extra) {
  console.log(`\n🚀  ${url}`);
  console.log(`    Health: ${url.replace(/\/$/, '')}/health`);
  if (extra) console.log(`\n    ${extra}\n`);
  else console.log('');
}

if (!WANT_HTTPS) {
  app.listen(PORT, () => {
    const base = `http://localhost:${PORT}`;
    printStart(
      `${base}/`,
      'Using HTTP on localhost (no certificate warning). For https:// use: TEST_JS_HTTPS=1 node test.js'
    );
  });
} else {
  (async function startTls() {
    try {
      let fromDisk = loadTlsFromDisk();
      if (!fromDisk && tryMkcertGenerate()) {
        fromDisk = loadTlsFromDisk();
      }

      let key;
      let cert;
      let tlsMode = 'selfsigned';

      if (fromDisk) {
        key = fromDisk.key;
        cert = fromDisk.cert;
        tlsMode = 'mkcert';
      } else {
        const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
          keySize: 2048,
          algorithm: 'sha256',
        });
        key = pems.private;
        cert = pems.cert;
      }

      const base = `https://localhost:${PORT}`;
      https.createServer({ key, cert }, app).listen(PORT, () => {
        if (tlsMode === 'mkcert') {
          printStart(`${base}/`, 'TLS: dev-certs (mkcert). If the browser still warns, run once: mkcert -install');
        } else {
          printStart(
            `${base}/`,
            'TLS: self-signed → Chrome: Advanced → Proceed. Or: winget install FiloSottile.mkcert && mkcert -install, then restart.'
          );
        }
      });
    } catch (e) {
      console.error('HTTPS setup failed:', e.message);
      process.exit(1);
    }
  })();
}
