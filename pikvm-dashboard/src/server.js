const path = require('path');
const express = require('express');
const session = require('express-session');

const config = require('./config');
const requireAuth = require('./middleware/requireAuth');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const pikvmClient = require('./pikvmClient');
const statusStore = require('./statusStore');

const app = express();

// We sit behind nginx, which terminates TLS — trust its X-Forwarded-* headers.
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    // Requires nginx to actually serve HTTPS in front of this app — see
    // nginx/pikvm-dashboard.conf and the README.
    secure: config.nodeEnv === 'production',
    maxAge: 12 * 60 * 60 * 1000 // 12 hours
  }
}));

app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));

app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.use('/', authRoutes);

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

app.use('/api', requireAuth, apiRoutes);

async function pollAllStatuses() {
  const results = await Promise.all(config.pikvms.map((kvm) => pikvmClient.getStatus(kvm)));
  statusStore.setStatuses(results);
}

pollAllStatuses().catch((err) => console.error('Initial status poll failed:', err));
setInterval(() => {
  pollAllStatuses().catch((err) => console.error('Status poll failed:', err));
}, config.statusPollIntervalMs);

// Bind to localhost only — nginx is the only thing that should reach this
// app directly; it is not meant to be exposed on the network itself.
app.listen(config.port, '127.0.0.1', () => {
  console.log(`pikvm-dashboard listening on 127.0.0.1:${config.port} (${config.nodeEnv})`);
});
