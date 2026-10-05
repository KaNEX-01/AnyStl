# AnyStl

Search 21 model sites at once — 3D printing sites (**MakerWorld**, **Thingiverse**, **Printables**, **Thangs**, **MyMiniFactory**, **Creality Cloud**, **Makeronline**, **Pinshape**, **Nexprint**), CAD sites (**GrabCAD**, **Tinkercad**), Blender / general 3D asset sites (**Sketchfab**, **CGTrader**, **TurboSquid**, **Free3D**, **BlenderKit**, **Blend Swap**, **Poly Haven**, **3D Warehouse**, **CadNav**) — plus **Cults3D**, **Gambody** and others through the **Yeggi** search engine. Sites that can't be searched automatically (Cults3D, Fab, STLFinder) get "Also search on" links that open the same search in your browser.

- **Search** — one query, results from every site side by side. Sites are grouped by purpose (community, printer brands, CAD & engineering, 3D assets & Blender, more via Yeggi); switch groups or single sites on and off to search only what you need.
- Results appear site by site as each one answers; the sidebar shows which sites are still loading or failed. Scroll down and more results load on their own.
- The default sort, **Best of each site**, ranks every model against the other results from its own site, so big sites don't bury small ones. Most liked / most downloaded are still there.
- **Filters:** free only, hide AI, max price, and **merge duplicates** (the same model found on several sites becomes one card with "+2 sites"). Add `-word` to the search to leave out results containing that word.
- The search, sort and filters live in the address bar, so reload, back / forward and shared links work.
- **Quick preview:** click a card for bigger images, author, license and file types (STL, 3MF, STEP…) without leaving AnyStl. Ctrl/middle-click still opens the site.
- Marketplace results show a price tag ("Free", "$9.99", "Full Plan").
- **Featured** — trending / popular / staff-picked models from each site, in one place.
- **Saved** — click the bookmark on any model to keep it. Saved models are stored in
  `~/.local/share/anystl/saved.json` (Linux), `~/Library/Application Support/AnyStl/` (macOS)
  or `%APPDATA%\AnyStl\` (Windows), so they survive browser changes.
  Give saved models a note and put them in collections (from the quick preview), export them as JSON (backup, can be imported again) or CSV, and use **Check links** to find models that were taken down.
  **Select** picks several saved models at once (shift-click for a range) to add them to a collection, take them out of one, export or remove them.
- **Open in OrcaSlicer** — from the quick preview of a Printables or Thingiverse model, the model's STL / 3MF files go straight into [OrcaSlicer](https://github.com/SoftFever/OrcaSlicer) (several files arrive as one zip). Thingiverse takes ~20 s because of its download countdown. Sites that need an account to download (MakerWorld, Thangs, MyMiniFactory…) aren't supported.
- **Site health** — how fast each site answers, how often it fails or blocks, and the latest error. **Run check** runs a test search on every site and flags ones that answer with nothing or with results missing images or titles, which usually means the site changed its pages.

I made this with Claude

## How to run

1. Install [Node.js 20+](https://nodejs.org)
2. Double-click the start script:
   - **Windows:** `start.cmd`
   - **Linux / macOS:** `start.sh`

That's it. The first run installs everything and opens `http://localhost:3000` in your default browser. Later runs start instantly. Running the script again while AnyStl is already up just opens a new tab.

To stop: close the AnyStl browser tab, close the terminal window, or press `Ctrl+C`.

## How it works

Everything runs on your own machine. Searches go straight to the model sites — nothing is sent anywhere else.

Searches can take a moment — each site is fetched live, so give it a few seconds before results appear. The very first search after starting can take ~30 s while the headless browser gets past the sites' bot checks; later searches are faster.

If a site shows up as an error ("blocked by the site's bot check"), just search again in a minute — the other sites are unaffected.
A site that keeps blocking automated searches is skipped for 10 minutes and offered as an "Also search on" link instead.

**TurboSquid and Free3D (Linux)** only let a regular, visible browser through. AnyStl runs one on an invisible virtual screen, which needs Xvfb (`sudo pacman -S xorg-server-xvfb`, `sudo apt install xvfb`, …). Without it those two sites are skipped and shown as links.

**MyMiniFactory** is searched through its public sitemaps (~430,000 models, cached for a week in `~/.cache/anystl/`). Its thumbnails are looked up from each model page the first time a card is shown (this uses `curl`), then cached; like/download counts aren't available.

## Built with

- [Next.js](https://nextjs.org) 16 (React 19)
- [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS](https://tailwindcss.com) 4
- [Playwright](https://playwright.dev) with [playwright-extra](https://github.com/berstend/puppeteer-extra/tree/master/packages/playwright-extra) and [puppeteer-extra-plugin-stealth](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth) for scraping
- [ESLint](https://eslint.org) 9
