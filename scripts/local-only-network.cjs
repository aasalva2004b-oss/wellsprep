// Applied to test/seed child processes, AFTER emulator artifacts are installed.
// Deny outbound sockets and fetches; a Firebase cloud fallback fails immediately.
const net = require('node:net');
const assert = require('node:assert/strict');
const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const emulatorPorts = new Set([8080, 9099]);
// Two fixed loopback ports are reserved for the authenticated HTTP tests.
if (process.env.NODE_ENV === 'test' && process.env.WELLSPREP_LOCAL_HTTP_TESTS === 'true') {
  emulatorPorts.add(3321); emulatorPorts.add(3322);
}
function checkHost(host) {
  assert.ok(loopback.has(String(host || 'localhost')), `Network isolation: non-loopback destination blocked (${host})`);
}
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let options = args[0];
  if (Array.isArray(options)) options = options[0];
  if (options && typeof options === 'object') {
    if (options.path) throw new Error('Network isolation: Unix socket access is disabled in tests');
    checkHost(options.host || options.hostname);
    assert.ok(emulatorPorts.has(Number(options.port)), 'Network isolation: only emulator ports 8080/9099 are allowed');
  } else if (typeof options === 'number') {
    checkHost(typeof args[1] === 'string' ? args[1] : 'localhost');
    assert.ok(emulatorPorts.has(options), 'Network isolation: only emulator ports 8080/9099 are allowed');
  } else {
    throw new Error('Network isolation: unsupported connection target');
  }
  return originalConnect.apply(this, args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  checkHost(url.hostname);
  assert.ok(['http:', 'https:'].includes(url.protocol), 'Network isolation: unsupported URL protocol');
  return originalFetch(input, init);
};
