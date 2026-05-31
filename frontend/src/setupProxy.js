// LOCAL DEV ONLY — proxies /api to the live backend so login/session work
// without CORS (browser sees same-origin localhost). Not used in production build.
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8001',
      changeOrigin: true,
      secure: false,
      cookieDomainRewrite: '', // rewrite session cookie domain to localhost
    })
  );
};
