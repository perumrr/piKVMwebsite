const express = require('express');
const statusStore = require('../statusStore');
const config = require('../config');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json(statusStore.getStatuses());
});

router.get('/pikvms', (req, res) => {
  res.json(config.pikvms.map(({ slug, name }) => ({ slug, name, path: `/kvm/${slug}/` })));
});

module.exports = router;
