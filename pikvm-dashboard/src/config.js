require('dotenv').config();
const fs = require('fs');
const path = require('path');

const pikvmsPath = process.env.PIKVMS_FILE || path.join(__dirname, '..', 'pikvms.json');

let rawPikvms;
try {
  rawPikvms = JSON.parse(fs.readFileSync(pikvmsPath, 'utf8'));
} catch (err) {
  console.error(`Could not read piKVM list at ${pikvmsPath}. Copy pikvms.json.example to pikvms.json and edit it.`);
  console.error(err.message);
  process.exit(1);
}

const required = ['SITE_USERNAME', 'SITE_PASSWORD_HASH', 'SESSION_SECRET', 'PIKVM_USER', 'PIKVM_PASS'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const slugs = new Set();
for (const kvm of rawPikvms) {
  if (!kvm.slug || !kvm.name || !kvm.host) {
    console.error(`Every entry in ${pikvmsPath} needs slug, name, and host. Bad entry: ${JSON.stringify(kvm)}`);
    process.exit(1);
  }
  if (slugs.has(kvm.slug)) {
    console.error(`Duplicate piKVM slug "${kvm.slug}" in ${pikvmsPath} — slugs must be unique.`);
    process.exit(1);
  }
  slugs.add(kvm.slug);
}

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  siteUsername: process.env.SITE_USERNAME,
  sitePasswordHash: process.env.SITE_PASSWORD_HASH,
  sessionSecret: process.env.SESSION_SECRET,
  statusPollIntervalMs: parseInt(process.env.STATUS_POLL_INTERVAL_MS || '10000', 10),
  // Each piKVM gets the shared PIKVM_USER/PIKVM_PASS unless the entry in
  // pikvms.json overrides `user`/`pass` for that specific unit.
  pikvms: rawPikvms.map((kvm) => ({
    user: process.env.PIKVM_USER,
    pass: process.env.PIKVM_PASS,
    ...kvm
  }))
};
