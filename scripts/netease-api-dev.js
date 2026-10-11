'use strict';

const { createHandler } = require('../services/netease-api/handler');

// `npm start` serves the API on the same origin as the local Hexo preview.
hexo.extend.filter.register('server_middleware', (app) => {
  app.use('/api/netease', createHandler());
}, 5);
