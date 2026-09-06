#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { renderSitemap } = require('../lib/sitemap-route.js');
const { renderGenericProductPage } = require('../lib/generic-product-route.js');
const root = path.resolve(__dirname, '..');

async function main() {
  const origin = process.argv.find(arg => arg.startsWith('--origin='))?.split('=')[1];
  const catalogFile = process.argv.find(arg => arg.startsWith('--catalog='))?.slice('--catalog='.length);
  const catalog = catalogFile ? JSON.parse(fs.readFileSync(catalogFile, 'utf8')) : await (await fetch('https://www.bassbingebaits.com/api/catalog')).json();
  const urls = [...renderSitemap(catalog).matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  for (const redirect of config.redirects || []) {
    if (redirect.source.includes(':')) continue;
    assert.ok(urls.includes('https://www.bassbingebaits.com' + redirect.destination), 'Redirect target must be admitted: ' + redirect.source);
  }
  const report = [];
  for (const url of urls) {
    const pathname = new URL(url).pathname;
    let html;
    if (origin) {
      const response = await fetch(origin + pathname, {redirect:'manual'});
      assert.equal(response.status,200,pathname);
      assert.doesNotMatch(response.headers.get('x-robots-tag') || '',/noindex/i,pathname);
      html = await response.text();
    } else if (pathname.startsWith('/products/')) {
      html = renderGenericProductPage(catalog.products.find(product=>product.handle === pathname.split('/').pop()));
    } else {
      html = fs.readFileSync(path.join(root, pathname === '/' ? 'index.html' : pathname.slice(1)+'.html'),'utf8');
    }
    assert.equal([...html.matchAll(/rel="canonical"/g)].length,1,pathname);
    assert.ok(html.includes(`rel="canonical" href="${url}"`),pathname);
    assert.match(html,/<title>[^<]+<\/title>/,pathname);
    assert.match(html,/<meta\s+name="description"\s+content="[^"]+"/,pathname);
    assert.match(html,/<h1[\s>]/,pathname);
    assert.doesNotMatch(html,/<meta[^>]+(?:noindex|nofollow)/i,pathname);
    if (pathname.startsWith('/products/')) assert.match(html,/<main class="product-page">/,pathname);
    report.push(pathname);
  }
  console.log(JSON.stringify({passed:report.length,paths:report},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
