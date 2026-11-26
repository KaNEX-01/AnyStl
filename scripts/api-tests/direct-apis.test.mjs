import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const build = process.env.ANYSTL_TEST_BUILD;
const { searchMakerWorldApi } = require(path.join(build, 'scrapers/makerworld.js'));
const { searchThangsApi } = require(path.join(build, 'scrapers/thangs.js'));

test('searchMakerWorldApi fetches direct JSON and maps formats, CC license, and AI flag', async () => {
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    assert.match(String(url), /makerworld\.com\/api\/v1\/search-service\/select\/design2/);
    return new Response(JSON.stringify({
      total: 1,
      hits: [{
        id: 40146,
        title: 'Benchy Bambu Pla Basic',
        slug: 'benchy-bambu-pla-basic',
        cover: 'https://makerworld.bblmw.com/cover.jpg',
        likeCount: 14766,
        downloadCount: 478963,
        license: 'BY-ND',
        isAIGC: false,
        designExtension: { model_files: [{ modelType: '3mf', modelName: 'benchy.3mf' }] },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const models = await searchMakerWorldApi('benchy', 1);
    assert.equal(models.length, 1);
    assert.equal(models[0].url, 'https://makerworld.com/en/models/40146');
    assert.equal(models[0].license, 'CC BY-ND');
    assert.deepEqual(models[0].formats, ['3MF']);
    assert.equal(models[0].isAI, false);
  } finally {
    global.fetch = realFetch;
  }
});

test('searchMakerWorldApi returns null on 403 so Playwright fallback runs', async () => {
  const realFetch = global.fetch;
  global.fetch = async () => new Response('blocked', { status: 403 });
  try {
    assert.equal(await searchMakerWorldApi('benchy', 1), null);
  } finally {
    global.fetch = realFetch;
  }
});

test('searchThangsApi fetches direct v3 JSON and maps likes, downloads, formats and membership price', async () => {
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    const u = new URL(String(url));
    assert.equal(u.pathname, '/api/models/v3/search-by-text');
    assert.equal(u.searchParams.get('searchTerm'), 'benchy');
    assert.equal(u.searchParams.get('page'), '1'); // 0-indexed page 2
    return new Response(JSON.stringify({
      results: [
        {
          modelId: '56337',
          modelTitle: 'Benchy Legacy',
          modelPageUrl: 'https://thangs.com/m/56337',
          thumbnailUrl: 'https://storage.googleapis.com/thangs/benchy.png',
          nLikes: 430,
          nDownloads: 9130,
          fileTypes: ['stl', '3mf'],
          plans: [],
        },
        {
          modelId: '99999',
          name: 'Pro Dragon',
          plans: [{ id: 1 }],
          fileTypes: ['stl'],
        },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const models = await searchThangsApi('benchy', 2);
    assert.equal(models.length, 2);
    assert.equal(models[0].title, 'Benchy Legacy');
    assert.equal(models[0].likes, 430);
    assert.equal(models[0].downloads, 9130);
    assert.deepEqual(models[0].formats, ['STL', '3MF']);
    assert.equal(models[0].price, undefined);

    assert.equal(models[1].url, 'https://thangs.com/m/99999');
    assert.equal(models[1].price, 'Members');
  } finally {
    global.fetch = realFetch;
  }
});
