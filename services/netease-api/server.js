'use strict';

const express = require('express');
const { createHandler } = require('./handler');

// Vercel's Express preset captures this app as one Node.js Function.
const app = express();
app.disable('x-powered-by');
app.use(createHandler());
app.listen(Number(process.env.PORT || 3001));

module.exports = app;
