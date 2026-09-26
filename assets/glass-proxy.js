// Added by the Translucent extension (setting "Other Extensions: Antigravity glass"). Antigravity's chat page is
// served by the agy hub on localhost and can't be styled from outside, so its panel loads the page through this
// small proxy, which adds the CSS in translucent-glass.css (next to this file) to the page. Everything else passes
// through untouched, websockets included. Turning the setting off puts Antigravity back as it was.
'use strict';
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const CSS_FILE = path.join(__dirname, 'translucent-glass.css');
const started = new Map();

function readCss() {
  try {
    return fs.readFileSync(CSS_FILE, 'utf8');
  } catch {
    return '';
  }
}

function start(targetPort, proxyPort) {
  const target = `localhost:${targetPort}`;
  const self = `localhost:${proxyPort}`;
  const fixHeaders = (h) => {
    const out = { ...h, host: target };
    if (out.origin) out.origin = out.origin.replace(self, target);
    if (out.referer) out.referer = out.referer.replace(self, target);
    return out;
  };
  const server = http.createServer((req, res) => {
    const headers = fixHeaders(req.headers);
    delete headers['accept-encoding'];
    const up = http.request({ host: '127.0.0.1', port: targetPort, method: req.method, path: req.url, headers }, (ur) => {
      const type = String(ur.headers['content-type'] || '');
      if (!type.startsWith('text/html')) {
        res.writeHead(ur.statusCode, ur.headers);
        ur.pipe(res);
        return;
      }
      const chunks = [];
      ur.on('data', (c) => chunks.push(c));
      ur.on('end', () => {
        let body = Buffer.concat(chunks).toString('utf8');
        const style = `<style id="translucent-glass">\n${readCss()}\n</style>`;
        body = body.includes('</head>') ? body.replace('</head>', `${style}</head>`) : style + body;
        const h = { ...ur.headers };
        delete h['content-length'];
        delete h['transfer-encoding'];
        h['content-length'] = Buffer.byteLength(body);
        res.writeHead(ur.statusCode, h);
        res.end(body);
      });
    });
    up.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  server.on('upgrade', (req, socket, head) => {
    const up = net.connect(targetPort, '127.0.0.1', () => {
      const headers = fixHeaders(req.headers);
      let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
      for (const [k, v] of Object.entries(headers)) {
        for (const one of Array.isArray(v) ? v : [v]) raw += `${k}: ${one}\r\n`;
      }
      up.write(raw + '\r\n');
      if (head && head.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  });
  // Another VS Code window may already run the same proxy (the port is worked out the same way); that's fine.
  server.on('error', () => {});
  server.listen(proxyPort, '127.0.0.1');
}

/** Returns the URL to load instead: the same page through the proxy, or the original if it isn't local. */
module.exports = function glassUrl(serverUrl) {
  try {
    const u = new URL(serverUrl);
    if (u.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(u.hostname) || !u.port) {
      return serverUrl;
    }
    const targetPort = Number(u.port);
    const proxyPort = 46000 + (targetPort % 15000);
    if (!started.has(targetPort)) {
      started.set(targetPort, true);
      start(targetPort, proxyPort);
    }
    u.hostname = 'localhost';
    u.port = String(proxyPort);
    return u.toString();
  } catch {
    return serverUrl;
  }
};
