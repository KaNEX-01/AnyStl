# AnyStl

Search 22 sources at once (up to 24 with Cults3D and TraceParts configured) — 3D printing sites (**MakerWorld**, **Thingiverse**, **Printables**, **Thangs**, **MyMiniFactory**, **Creality Cloud**, **Makeronline**, **Pinshape**, **Nexprint**), CAD sites (**GrabCAD**, **Tinkercad**), Blender / general 3D asset sites (**Sketchfab**, **CGTrader**, **TurboSquid**, **Free3D**, **BlenderKit**, **Blend Swap**, **Poly Haven**, **3D Warehouse**, **CadNav**), and public STL files from **Wikimedia Commons**. **Yeggi** also covers **Cults3D**, **Gambody** and others. External links let you run the same search on sites AnyStl hasn't searched directly, including Fab and STLFinder.

- **Search** — one query, results from every site side by side. Sites are grouped by purpose (community, printer brands, CAD & engineering, 3D assets & Blender, more via Yeggi); switch groups or single sites on and off to search only what you need.
- Results appear site by site as each one answers; the sidebar shows which sites are still loading or failed. Scroll down and more results load on their own.
- The default sort, **Best of each site**, ranks every model against the other results from its own site, so big sites don't bury small ones. Most liked / most downloaded are still there.
- **Filters:** free only, hide AI, max price, **file format** (STL, 3MF, STEP, and more), **license**, and **merge duplicates** (the same model found on several sites becomes one card with "+2 sites"). Add `-word` to the search to leave out results containing that word.
- Format and license filters use information returned in search results, without fetching every model page. Coverage includes Printables, MakerWorld, Thangs, Wikimedia Commons, Sketchfab, Poly Haven, and format-only coverage for 3D Warehouse, BlenderKit, Blend Swap, and Tinkercad. Choose **Unknown** for unlisted formats or **Not stated** for missing licenses. The commercial reuse filter only matches recognized CC0, CC BY and CC BY-SA labels; check the original license and its conditions before using a model.
- The search, sort and filters live in the address bar, so reload, back / forward and shared links work.
- **Quick preview:** click a card for bigger images, author, license and file types (STL, 3MF, STEP…) without leaving AnyStl. Ctrl/middle-click still opens the site.
- **Check a model’s license** in its preview. Recognized Creative Commons licenses get a summary of commercial use, sharing adaptations and attribution. The panel links to the model and, when available, to the terms reported by the source or to the official Creative Commons terms for a known version. Missing or unrecognized terms are not permission to reuse the model.
- **Compare models:** use the comparison icon on up to three cards, then open **Compare** for a side-by-side view of photos, formats, licenses, prices and any source-reported dimensions. Details load only when the comparison is opened.
- Marketplace results show a price tag ("Free", "$9.99", "Full Plan").
- **Featured** — trending / popular / staff-picked models from supported sites, in one place.
- **Saved** — click the bookmark on any model to keep it. Saved models are stored in
  `~/.local/share/anystl/saved.json` (Linux), `~/Library/Application Support/AnyStl/` (macOS)
  or `%APPDATA%\AnyStl\` (Windows), so they survive browser changes.
  Give saved models a note and put them in collections (from the quick preview), export them as JSON (backup, can be imported again) or CSV, and use **Check links** to find models that were taken down.
  Choose **Find alternatives** on a removed model to search other sites for matching or similar titles. These are suggestions, not verified copies, and the original saved entry is not replaced.
  **Select** picks several saved models at once (shift-click for a range) to add them to a collection, take them out of one, export or remove them.
- **Open in OrcaSlicer** — from the quick preview (or card button) of a Printables, Thingiverse, free MyMiniFactory, or Wikimedia Commons model, the model's STL / 3MF files go straight into [OrcaSlicer](https://github.com/SoftFever/OrcaSlicer) (several files arrive as one zip). Thingiverse takes ~20 s because of its download countdown. Sites that need an account to download (MakerWorld, Thangs, paid MyMiniFactory…) aren't supported.
- **OrcaSlicer tab plugin** — [`orcaslicer/anystl.py`](orcaslicer/anystl.py) adds an **AnyStl** tab inside OrcaSlicer 2.5.1+. Works **standalone with zero setup** (pure Python stdlib, searches 14+ libraries directly with no Node.js, `start.sh`, or desktop launcher required) and automatically upgrades to your local AnyStl server if one is running. See [`orcaslicer/README.md`](orcaslicer/README.md).
- **Site health** — how fast each site answers, how often it fails or blocks, and the latest error. **Run check** runs a test search on every site and flags ones that answer with nothing or with results missing images or titles, which usually means the site changed its pages.

I made this with Claude

## How to run

1. Double-click the start script:
   - **Windows:** `start.cmd` (automatically downloads a private Node.js LTS runtime into `%LOCALAPPDATA%\AnyStl\node` if Node.js 20+ is not installed, then installs packages and Chromium)
   - **Linux / macOS:** install [Node.js 20+](https://nodejs.org) and run `start.sh`

That's it. The first run installs everything and opens `http://localhost:3000` in your default browser. Later runs start instantly. Running the script again while AnyStl is already up just opens a new tab.

To stop: close the AnyStl browser tab, close the terminal window, or press `Ctrl+C`.

### Desktop app launcher (Linux & Windows)

Prefer a dedicated window instead of a browser tab? AnyStl includes a lightweight Tauri v2 desktop launcher in [`desktop/`](desktop/):

- **Linux:** run `npm run desktop:install-linux` (requires Rust and `webkit2gtk-4.1`). This builds the native `anystl` binary, installs it to `~/.local/bin/anystl`, and adds an **AnyStl** entry to your application launcher.
- **Windows:** place `anystl.exe` (built with `cargo build --manifest-path desktop/Cargo.toml --release` or downloaded from the [Desktop App Build](.github/workflows/desktop-release.yml) workflow) inside your AnyStl folder and launch it — on the first run it automatically downloads Node.js LTS (no admin rights needed), installs npm packages and Playwright Chromium, and builds AnyStl. You can also run `powershell -ExecutionPolicy Bypass -File desktop\install-windows.ps1` (add `-DesktopShortcut` for a desktop icon) to pre-install everything and add a Start Menu shortcut.

Opening the desktop app installs any missing dependencies on first launch, starts the local Next.js server automatically with no terminal window, opens external model pages in your default browser, passes `orcaslicer://` links straight to OrcaSlicer, and shuts down the server when you close the window.

## How it works

Everything runs on your own machine. Searches go straight to the model sites — nothing is sent anywhere else.

Searches can take a moment — each site is fetched live, so give it a few seconds before results appear. The very first search after starting can take ~30 s while the headless browser gets past the sites' bot checks; later searches are faster.

If a site shows up as an error ("blocked by the site's bot check"), just search again in a minute — the other sites are unaffected.
A site that keeps blocking automated searches is skipped for 10 minutes and offered as an "Also search on" link instead.

**TurboSquid and Free3D (Linux)** only let a regular, visible browser through. AnyStl runs one on an invisible virtual screen, which needs Xvfb (`sudo pacman -S xorg-server-xvfb`, `sudo apt install xvfb`, …). Without it those two sites are skipped and shown as links.

**MyMiniFactory** uses its public sitemaps as a fallback (~430,000 models, cached for a week in `~/.cache/anystl/`). Sitemap thumbnails are looked up on demand (using `curl`) and cached; like/download counts aren't available from the sitemap.

### Search APIs

Add only the credentials you have to `.env.local` in the project directory (see `.env.example`):

| Site | Server-side setting | Without credentials or on API failure |
| --- | --- | --- |
| [Thingiverse](https://www.thingiverse.com/developers/swagger) | `THINGIVERSE_ACCESS_TOKEN` (access token) | Existing Playwright search |
| [MyMiniFactory](https://www.myminifactory.com/pages/for-developers) | `MYMINIFACTORY_API_KEY` (developer key) | Existing sitemap search |
| [CGTrader](https://www.cgtrader.com/developers) | `CGTRADER_ACCESS_TOKEN` (OAuth access token, not the client ID or secret) | Existing Playwright search |
| [Cults3D](https://cults3d.com/en/api/keys) | Both `CULTS3D_USERNAME` (account handle) and `CULTS3D_API_KEY` (API key, not your password) | Existing Yeggi search and external Cults3D link |
| [TraceParts](https://developers.traceparts.com/docs/requesting-apikey) | `TRACEPARTS_API_KEY`, `TRACEPARTS_TENANT_UID`, `TRACEPARTS_CLASSIFICATION_CODE`, `TRACEPARTS_EASYLINK_ID` | External TraceParts search link |

Stop any running instance and restart. If you're starting with an older production build, rebuild it once (`bash start.sh --rebuild` on Linux/macOS, or `npm run build` on Windows before launching). Credentials are used only on the server, for requests to the matching provider. Successful empty API responses are not retried with the fallback. Yeggi remains an independent source even when Cults3D is enabled.

**Wikimedia Commons** needs no credentials. It searches for STL files, including scans and educational models, links to the Commons file page for license details, and supports **Open in OrcaSlicer**. Sketchfab and Poly Haven also use keyless public APIs. Cults3D and Commons are search-only sources; they do not add Featured sections.

**API-only / SearXNG mode:** Set `ANYSTL_NO_BROWSER=1` in `.env.local` to run AnyStl without launching Playwright Chromium (only fast API/HTTP sources stay enabled, plus any site with configured API credentials). You can also set `SEARXNG_URL=http://127.0.0.1:8888` to use a local/self-hosted SearXNG JSON endpoint as an API fallback for browser-scraped sites (MakerWorld, Thingiverse, Thangs, CGTrader, Cults3D, TurboSquid, Free3D). Or use the **Fast (API)** preset in the sidebar anytime to search only non-browser sources.

**TraceParts** searches product families in one authorized catalog, not the whole public website. Request API credentials and an [EasyLink ID](https://developers.traceparts.com/reference/easylink-level-1) for that catalog; the [catalog list API](https://developers.traceparts.com/reference/get_v2-search-cataloglist) provides its classification code. Optionally set `TRACEPARTS_CATEGORY_CODE` to narrow the catalog. AnyStl keeps a one-hour in-memory catalog and matches family labels, codes and supplier codes locally. CAD format selection, access and downloads stay on TraceParts. This source is search-only: it does not add Featured or OrcaSlicer support. Configure it only for catalogs and uses TraceParts has authorized; consult its [API Terms of Use](https://developers.traceparts.com/docs/api-terms-of-use) before displaying or distributing catalog data.

## Checking that everything works

```
npm run build && npm run smoke
```

Starts a separate AnyStl on port 3999 (with a throwaway data folder, so your saved models aren't touched) and tests every feature against the live sites: each site's search, images, quick preview, Featured, Saved and Open in OrcaSlicer. It prints PASS / FAIL per item and takes about two minutes; `npm run smoke -- --quick` skips Featured and OrcaSlicer. A site that suddenly fails usually changed its pages.

### Search API tests

```bash
bash scripts/test-apis.sh --list
bash scripts/test-apis.sh                      # All offline API suites
bash scripts/test-apis.sh thingiverse          # One offline suite
bash scripts/test-apis.sh --live               # All registered direct API checks
bash scripts/test-apis.sh --live wikimedia cults3d
bash scripts/test-apis.sh --live traceparts      # Checks that the configured catalog has usable products
```

Offline tests use fake responses and do not load `.env.local`. Live tests use the local Next.js environment, including `.env.local`. They report `PASS`, `FAIL`, or `SKIP` (missing credentials); a failure or a run with no passing checks exits nonzero. Omit the site name in live mode to run every registered live check.

To add a provider, put `<platform>.test.mjs` in `scripts/api-tests/`. For a live check, add `<platform>.live.mjs` exporting `{ query, search }` as its default export, plus `tokenEnv` for one credential or `requiredEnv` for a list of required credentials. `search(query)` must call the provider's API adapter directly and return normalized model results, never use the general search with its fallback. See the Cults3D and Wikimedia Commons files for examples.

## Built with

- [Next.js](https://nextjs.org) 16 (React 19)
- [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS](https://tailwindcss.com) 4
- [Playwright](https://playwright.dev) with [playwright-extra](https://github.com/berstend/puppeteer-extra/tree/master/packages/playwright-extra) and [puppeteer-extra-plugin-stealth](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth) for scraping
- [ESLint](https://eslint.org) 9
