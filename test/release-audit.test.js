'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('the release audit requires dynamic products to use the option-capable product-page shell', () => {
  const root = path.resolve(__dirname, '..');
  const result = spawnSync(process.execPath, ['scripts/audit-release.js'], {
    cwd: root,
    encoding: 'utf8'
  });

  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr].filter(Boolean).join('\n')
  );
  assert.match(result.stdout, /Release audit passed\./);
});
