import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const build = process.env.ANYSTL_TEST_BUILD;
const { searchViaSearxng } = require(path.join(build, 'scrapers/searxng.js'));
const { availableSearchPlatforms } = require(path.join(build, 'sourceAvailability.js'));

test('searchViaSearxng queries configured SEARXNG_URL and keeps only validated model URLs', async () => {
  const prevUrl = process.env.SEARXNG_URL;
  const realFetch = global.fetch;
  process.env.SEARXNG_URL = 'http://127.0.0.1:8888/';
  const requested = [];
  global.fetch = async (url) => {
    requested.push(String(url));
    return new Response(JSON.stringify({
      results: [
        {
          url: 'https://makerworld.com/en/models/12345-gridfinity-bin?ref=abc',
          title: 'Gridfinity Bin | Free 3D Print Model - MakerWorld',
          thumbnail: 'https://makerworld.bblmw.com/thumb.webp',
        },
        {
          url: 'https://makerworld.com/en/community/post/999',
          title: 'Not a model page',
        },
        {
          url: 'https://evil.example/en/models/12345',
          title: 'Wrong domain',
        },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const models = await searchViaSearxng('makerworld', 'gridfinity', 2);
    assert.equal(requested.length, 1);
    const u = new URL(requested[0]);
    assert.equal(u.origin, 'http://127.0.0.1:8888');
    assert.equal(u.pathname, '/search');
    assert.equal(u.searchParams.get('q'), 'site:makerworld.com gridfinity');
    assert.equal(u.searchParams.get('format'), 'json');
    assert.equal(u.searchParams.get('pageno'), '2');

    assert.equal(models.length, 1);
    assert.equal(models[0].title, 'Gridfinity Bin');
    assert.equal(models[0].url, 'https://makerworld.com/en/models/12345-gridfinity-bin');
    assert.equal(models[0].thumbnail, 'https://makerworld.bblmw.com/thumb.webp');
    assert.equal(models[0].platform, 'makerworld');
  } finally {
    global.fetch = realFetch;
    if (prevUrl === undefined) delete process.env.SEARXNG_URL;
    else process.env.SEARXNG_URL = prevUrl;
  }
});

test('ANYSTL_NO_BROWSER=1 hides browser-only sites unless an API or SEARXNG_URL is configured', () => {
  const prevNoBrowser = process.env.ANYSTL_NO_BROWSER;
  const prevSearx = process.env.SEARXNG_URL;
  const prevTv = process.env.THINGIVERSE_ACCESS_TOKEN;
  try {
    process.env.ANYSTL_NO_BROWSER = '1';
    delete process.env.SEARXNG_URL;
    delete process.env.THINGIVERSE_ACCESS_TOKEN;

    const apiOnly = availableSearchPlatforms();
    assert.ok(apiOnly.includes('printables'));
    assert.ok(apiOnly.includes('makerworld'));
    assert.ok(apiOnly.includes('thangs'));
    assert.ok(!apiOnly.includes('thingiverse'));
    assert.ok(!apiOnly.includes('cgtrader'));
    assert.ok(!apiOnly.includes('yeggi'));

    process.env.THINGIVERSE_ACCESS_TOKEN = 'test-token';
    assert.ok(availableSearchPlatforms().includes('thingiverse'));

    process.env.SEARXNG_URL = 'http://127.0.0.1:8888';
    const withSearx = availableSearchPlatforms();
    assert.ok(withSearx.includes('cgtrader'));
    assert.ok(withSearx.includes('cults3d'));
    assert.ok(!withSearx.includes('yeggi'));
  } finally {
    if (prevNoBrowser === undefined) delete process.env.ANYSTL_NO_BROWSER;
    else process.env.ANYSTL_NO_BROWSER = prevNoBrowser;
    if (prevSearx === undefined) delete process.env.SEARXNG_URL;
    else process.env.SEARXNG_URL = prevSearx;
    if (prevTv === undefined) delete process.env.THINGIVERSE_ACCESS_TOKEN;
    else process.env.THINGIVERSE_ACCESS_TOKEN = prevTv;
  }
});
