// Run with bash scripts/test-orcaslicer-plugin.sh --browser.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

async function waitForServer(logPath) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const log = await readFile(logPath, 'utf8');
    const url = log.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)/)?.[1];
    if (url && log.includes('Ready in')) return url;
    await sleep(100);
  }
  throw new Error('Isolated AnyStl server did not start');
}

const base = await waitForServer(process.argv[2]);
const model = {
  title: 'Fixture model', url: 'https://www.printables.com/model/172286', platform: 'printables',
  thumbnail: '', likes: 10, downloads: 2, score: 1, isAI: false,
};
const batch = Array.from({ length: 55 }, (_, index) => index === 0 ? model : ({
  ...model, title: `Fixture model ${index + 1}`, url: `${model.url}-${index + 1}`,
}));
const browser = await chromium.launch({ headless: true });

try {
  for (const embedded of [true, false]) {
    const page = await browser.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    if (embedded) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { value: {
          async writeText(text) {
            if (window.fixtureClipboardBlocked) throw new Error('Clipboard denied');
            window.fixtureClipboard = text;
          },
        } });
        const observer = new MutationObserver(() => {
          if (!document.head) return;
          document.documentElement.setAttribute('data-orca-theme', 'light');
          document.head.insertAdjacentHTML('beforeend', '<style id="orca-plugin-defaults">button{background:red}</style>');
          observer.disconnect();
        });
        observer.observe(document, { childList: true, subtree: true });
      });
    } else {
      await page.addInitScript((model) => {
        const fetchNormally = window.fetch.bind(window);
        window.fetch = (input, options) => {
          const url = new URL(input, location.origin);
          const query = url.searchParams.get('q');
          if (url.pathname !== '/api/search/stream' || !['progress', 'truncated'].includes(query)) {
            return fetchNormally(input, options);
          }
          const encoder = new TextEncoder();
          const source = JSON.stringify({ type: 'source', platform: 'printables', status: 'ok', results: [model] });
          return Promise.resolve(new Response(new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(source.slice(0, 25)));
              controller.enqueue(encoder.encode(source.slice(25) + '\n'));
              if (query === 'truncated') controller.close();
              else window.finishFixtureSearch = () => controller.enqueue(encoder.encode('{"type":"done","page":1}\n'));
            },
            cancel() { window.fixtureSearchCancelled = true; },
          })));
        };
      }, model);
    }

    let preparations = 0;
    const searchPages = [];
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (url.pathname === '/api/warmup') return route.fulfill({ status: 204 });
      if (url.pathname === '/api/search/stream') {
        assert.equal(url.searchParams.get('q'), 'fixture');
        assert.equal(url.searchParams.get('buffered'), embedded ? '1' : null);
        const searchPage = Number(url.searchParams.get('page'));
        searchPages.push(searchPage);
        const results = searchPage === 1 ? (embedded ? batch : [model]) : [];
        const events = [
          { type: 'source', platform: 'printables', status: results.length ? 'ok' : 'empty', results },
          { type: 'done', page: searchPage },
        ];
        if (embedded) return route.fulfill({ json: events });
        return route.fulfill({
          contentType: 'application/x-ndjson',
          body: events.map(JSON.stringify).join('\n') + '\n',
        });
      }
      if (url.pathname === '/api/details') return route.fulfill({ json: { url: model.url, images: [], formats: ['STL'] } });
      if (url.pathname === '/api/slicer/open') {
        assert.equal(route.request().method(), 'POST');
        const body = route.request().postDataJSON();
        assert.equal(body.platform, model.platform);
        assert.equal(body.url, model.url);
        const count = ++preparations;
        const fileUrl = `${base}/api/slicer/file/test-${count}/model.zip`;
        // First click tests direct desktop handoff; second click tests fallback download URL.
        const opened = count === 1;
        return route.fulfill({
          json: {
            opened,
            count: 2,
            fileUrl,
            link: `orcaslicer://open?file=${encodeURIComponent(fileUrl)}`,
            ...(opened ? {} : { error: 'No desktop display' }),
          },
        });
      }
      if (url.pathname === '/api/slicer') {
        assert.equal(url.searchParams.get('platform'), model.platform);
        assert.equal(url.searchParams.get('url'), model.url);
        const file = `${base}/api/slicer/file/test-${++preparations}/model.zip`;
        return route.fulfill({ json: { count: 2, link: `orcaslicer://open?file=${encodeURIComponent(file)}` } });
      }
      return route.continue();
    });

    await page.goto(base);
    if (!embedded) {
      const searchbox = page.getByRole('searchbox', { name: 'Search 3D models' });
      await searchbox.fill('progress');
      await searchbox.press('Enter');
      await page.getByText(model.title, { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Searching', exact: true }).waitFor();
      await page.evaluate(() => window.finishFixtureSearch()); // The transport stays open.
      await page.getByRole('button', { name: 'Search', exact: true }).waitFor();
      await page.waitForFunction(() => window.fixtureSearchCancelled);

      await searchbox.fill('truncated');
      await searchbox.press('Enter');
      await page.getByText('The search connection closed early. Try again.').waitFor();
      await page.getByText(model.title, { exact: true }).waitFor();
    }
    await page.getByRole('searchbox', { name: 'Search 3D models' }).fill('fixture');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    if (embedded) {
      const more = page.getByRole('button', { name: 'Show more models' });
      await more.waitFor();
      assert.equal(await page.locator('main article').count(), 24);
      assert.deepEqual(searchPages, [1]);
      await more.click();
      assert.equal(await page.locator('main article').count(), 48);
      await more.click();
      assert.equal(await page.locator('main article').count(), batch.length);
      assert.deepEqual(searchPages, [1]);
      const load = page.getByRole('button', { name: 'Load more', exact: true });
      await Promise.all([page.waitForResponse((response) => new URL(response.url()).searchParams.get('page') === '2'), load.click()]);
      await load.waitFor();
      assert.deepEqual(searchPages, [1, 2]);
    }
    // Verify card-level Save and Compare buttons; Send to Slicer is hidden in the OrcaSlicer plugin WebView.
    const firstCard = page.locator('main article').first();
    await firstCard.getByRole('button', { name: 'Save model' }).waitFor();
    await firstCard.getByRole('button', { name: `Add to comparison: ${model.title}` }).waitFor();
    const cardSlicer = firstCard.getByRole('button', { name: `Send to Slicer: ${model.title}` });
    if (embedded) {
      assert.equal(await cardSlicer.count(), 0);
    } else {
      await cardSlicer.waitFor();
      await cardSlicer.click();
      await firstCard.getByText('Sent 2 files to OrcaSlicer').waitFor();
    }

    await page.getByText(model.title, { exact: true }).click();
    const dialog = page.getByRole('dialog', { name: model.title });
    const openInOrca = dialog.getByRole('button', { name: 'Open in OrcaSlicer', exact: true });
    if (embedded) {
      assert.equal(await openInOrca.count(), 0);
      assert.equal(await page.locator('#orca-plugin-defaults').count(), 0);
      assert.equal(await page.locator('a[href^="orcaslicer:"]').count(), 0);
      assert.equal(new URL(page.url()).origin, base);
    } else {
      await openInOrca.click();
      // Headless Chromium does not dispatch to a system URI handler.
      await dialog.getByText('Sent 2 files to OrcaSlicer.').waitFor();
      assert.equal(await dialog.getByRole('textbox', { name: 'Download URL' }).count(), 0);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: WebView buffered search, manual batches, theme, direct handoff & fallback URL; browser progressive search, interrupted stream and handoff UI');
} finally {
  await browser.close();
}
