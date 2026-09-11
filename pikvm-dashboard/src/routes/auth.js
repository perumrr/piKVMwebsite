const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const pikvmClient = require('../pikvmClient');

const router = express.Router();

// Slows down brute-forcing of the shared site login. Tune to taste.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in a few minutes.' }
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const validUsername = username === config.siteUsername;
  // Always run bcrypt.compare even on a bad username, so response timing
  // doesn't reveal whether the username was right.
  const hashToCheck = validUsername ? config.sitePasswordHash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
  const validPassword = await bcrypt.compare(password, hashToCheck);

  if (!validUsername || !validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not start session' });
    req.session.authenticated = true;
    req.session.username = username;
    res.json({ ok: true });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// Called by nginx's `auth_request` directive for every request to a
// /kvm/<slug>/ location. Two jobs:
//   1. 200 if the visitor has a valid site session, 401 otherwise.
//   2. If the request names a piKVM slug (via X-PiKVM-Slug, set by nginx),
//      return that piKVM's current auth_token in a response header so
//      nginx can inject it into the proxied request. This is what lets
//      users skip piKVM's own login screen entirely.
router.get('/verify', async (req, res) => {
  if (!req.session || !req.session.authenticated) {
    return res.status(401).end();
  }

  const slug = req.get('X-PiKVM-Slug');
  if (slug) {
    const kvm = config.pikvms.find((k) => k.slug === slug);
    if (!kvm) return res.status(404).end();
    try {
      const token = await pikvmClient.getToken(kvm);
      res.set('X-PiKVM-Token', token);
    } catch (err) {
      return res.status(502).end();
    }
  }

  return res.status(200).end();
});

module.exports = router;
