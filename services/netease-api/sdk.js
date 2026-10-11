'use strict';

let sdk;

// Load only when an API request arrives; Hexo builds need no music network access.
function loadApi() {
  if (!sdk) sdk = require('@neteasecloudmusicapienhanced/api');
  return sdk;
}

module.exports = { loadApi };
