// A Vite plugin that serves the plugin API under /__spectrail/api/<plugin>/<name>.
// Only `spectrail dev` sets the handler. In a static build there is no server,
// so a page must fall back to data that the build wrote.
export const API_PREFIX = '/__spectrail/api';
export const HANDLER_KEY = Symbol.for('spectrail.api');

/** @public The generated VitePress config imports this function by file path. */
export function spectrailApi() {
  return {
    name: 'spectrail-api',
    configureServer(server) {
      server.middlewares.use(API_PREFIX, async (req, res, next) => {
        const handle = globalThis[HANDLER_KEY];
        if (!handle) return next();
        const url = new URL(req.url, 'http://localhost');
        try {
          const out = await handle(url.pathname.replace(/^\/+/, ''), Object.fromEntries(url.searchParams));
          if (out === undefined) return next();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(out));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
        return undefined;
      });
    },
  };
}
