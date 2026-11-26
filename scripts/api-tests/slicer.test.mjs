import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const build = process.env.ANYSTL_TEST_BUILD;
const { SLICER_PLATFORMS } = require(path.join(build, 'platforms.js'));
const { pickFiles } = require(path.join(build, 'slicer.js'));
const { isLoopbackHost, isLoopbackOrigin, openInDesktopSlicer } = require(path.join(build, 'slicerOpen.js'));
const { resolveSlicerTarget } = require(path.join(build, 'sendToOrca.js'));
const { buildSlicerLink, disabledPlatformsForPreset, isValidSlicerLink, sanitizeSettings } = require(path.join(build, 'settings.js'));

test('SLICER_PLATFORMS includes keyless Printables, Thingiverse, MyMiniFactory and Wikimedia Commons', () => {
  assert.deepEqual(SLICER_PLATFORMS, ['printables', 'thingiverse', 'myminifactory', 'wikimedia']);
});

test('pickFiles prefers 3MF over STL and STEP, and accepts pre-packaged model ZIP archives', () => {
  const picked = pickFiles([
    { name: 'part.step', url: 'https://example.test/part.step' },
    { name: 'part.stl', url: 'https://example.test/part.stl' },
    { name: 'project.3mf', url: 'https://example.test/project.3mf' },
    { name: 'readme.txt', url: 'https://example.test/readme.txt' },
  ]);
  assert.deepEqual(picked.map((f) => f.name), ['project.3mf']);

  const archive = pickFiles([
    { name: 'bundle.zip', url: 'https://dl4.myminifactory.com/bundle.zip', archive: true },
  ]);
  assert.deepEqual(archive.map((f) => f.name), ['bundle.zip']);

  const plainZip = pickFiles([
    { name: 'random.zip', url: 'https://example.test/random.zip' },
  ]);
  assert.deepEqual(plainZip, []);
});

test('resolveSlicerTarget selects direct platforms and falls back to supported merged alternates', () => {
  const printables = { title: 'Benchy', url: 'https://www.printables.com/model/3161', platform: 'printables', thumbnail: '', likes: 1, downloads: 1, score: 1, isAI: false };
  const makerworldWithAlt = { title: 'Benchy', url: 'https://makerworld.com/en/models/40146', platform: 'makerworld', thumbnail: '', likes: 1, downloads: 1, score: 1, isAI: false, alternates: [printables] };
  const makerworldOnly = { title: 'Exclusive', url: 'https://makerworld.com/en/models/999', platform: 'makerworld', thumbnail: '', likes: 1, downloads: 1, score: 1, isAI: false };

  assert.equal(resolveSlicerTarget(printables), printables);
  assert.equal(resolveSlicerTarget(makerworldWithAlt), printables);
  assert.equal(resolveSlicerTarget(makerworldOnly), null);
});

test('slicerOpen restricts direct desktop dispatch to loopback origins and valid orcaslicer links', async () => {
  assert.equal(isLoopbackHost('127.0.0.1:3000'), true);
  assert.equal(isLoopbackHost('localhost:3000'), true);
  assert.equal(isLoopbackHost('[::1]:3000'), true);
  assert.equal(isLoopbackHost('example.com'), false);
  assert.equal(isLoopbackHost('localhost.evil.test'), false);

  assert.equal(isLoopbackOrigin('http://127.0.0.1:3000'), true);
  assert.equal(isLoopbackOrigin('http://localhost:3001'), true);
  assert.equal(isLoopbackOrigin('https://evil.example'), false);
  assert.equal(isLoopbackOrigin('file:///etc/hosts'), false);

  const rejected = await openInDesktopSlicer('https://example.com/model.stl');
  assert.equal(rejected.opened, false);

  // Under isolated test env (DISPLAY and WAYLAND_DISPLAY unset), Linux gracefully reports unavailable display.
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    const noDisplay = await openInDesktopSlicer('orcaslicer://open?file=http%3A%2F%2F127.0.0.1%3A3000%2Fmodel.stl');
    assert.equal(noDisplay.opened, false);
    assert.match(noDisplay.error || '', /display/i);
  }
});

test('multi-slicer links and settings sanitization support OrcaSlicer, Bambu Studio, PrusaSlicer, Elegoo Slicer and direct download', () => {
  const file = 'http://127.0.0.1:3000/api/slicer/file/abc/model.zip';
  const orca = buildSlicerLink('orcaslicer', file);
  const bambu = buildSlicerLink('bambustudio', file);
  const prusa = buildSlicerLink('prusaslicer', file);
  const elegoo = buildSlicerLink('elegooslicer', file);
  const direct = buildSlicerLink('download', file);

  assert.ok(orca?.startsWith('orcaslicer://open?file='));
  assert.ok(bambu?.startsWith('bambustudio://open?file='));
  assert.ok(prusa?.startsWith('prusaslicer://open?file='));
  assert.ok(elegoo?.startsWith('elegooslicer://open?file='));
  assert.equal(direct, null);

  assert.equal(isValidSlicerLink(orca), true);
  assert.equal(isValidSlicerLink(bambu), true);
  assert.equal(isValidSlicerLink(prusa), true);
  assert.equal(isValidSlicerLink(elegoo), true);
  assert.equal(isValidSlicerLink('javascript:alert(1)'), false);

  assert.deepEqual(sanitizeSettings({ onboardingDone: true, slicer: 'bambustudio', defaultPreset: 'printing' }), {
    onboardingDone: true,
    slicer: 'bambustudio',
    defaultPreset: 'printing',
  });
  assert.deepEqual(sanitizeSettings({ onboardingDone: 'yes', slicer: 'unknown', defaultPreset: 'nope' }), {
    onboardingDone: false,
    slicer: 'orcaslicer',
    defaultPreset: 'all',
  });

  const fastDisabled = disabledPlatformsForPreset('fast', ['printables', 'thingiverse', 'makerworld', 'yeggi']);
  assert.deepEqual(fastDisabled, ['thingiverse', 'yeggi']);
});
