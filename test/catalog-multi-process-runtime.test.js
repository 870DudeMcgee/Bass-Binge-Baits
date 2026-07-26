'use strict';

const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function createRedisFixtureServer() {
  const values = new Map();
  return http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const command = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      let result = null;
      if (command[0] === 'GET') {
        result = values.get(command[1]) ?? null;
      } else if (command[0] === 'SET') {
        const key = command[1];
        if (command.includes('NX') && values.has(key)) {
          result = null;
        } else {
          values.set(key, command[2]);
          result = 'OK';
        }
      } else if (command[0] === 'EVAL' && command[2] === 2) {
        values.set(command[3], command[5]);
        if (command[6] && values.get(command[4]) === command[6]) {
          values.delete(command[4]);
        }
        result = 1;
      } else if (command[0] === 'EVAL') {
        if (values.get(command[3]) === command[4]) {
          values.delete(command[3]);
          result = 1;
        } else {
          result = 0;
        }
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ result }));
    });
  });
}

test('separate Node runtimes read one Redis-backed generation', async (t) => {
  const server = createRedisFixtureServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  const child = path.join(__dirname, 'helpers', 'catalog-runtime-child.js');

  const writerResult = await execFileAsync(process.execPath, [child, 'writer', url]);
  const readerResult = await execFileAsync(process.execPath, [child, 'reader', url]);
  const writer = JSON.parse(writerResult.stdout);
  const reader = JSON.parse(readerResult.stdout);

  assert.notEqual(reader.pid, writer.pid);
  assert.equal(reader.generationId, writer.generationId);
  assert.equal(reader.generatedAt, writer.generatedAt);
  assert.equal(reader.lastSuccessfulRefreshAt, writer.lastSuccessfulRefreshAt);
  assert.equal(reader.cache, 'hit');
});
