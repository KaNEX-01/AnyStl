# AnyStl for OrcaSlicer

This plugin adds an **AnyStl** tab to OrcaSlicer's main window.

**Zero-setup standalone mode:** You do **not** need Node.js, `npm`, `start.sh`, or the AnyStl desktop launcher to use this plugin. Installing [`anystl.py`](anystl.py) alone searches 14 3D model libraries directly using OrcaSlicer's built-in Python 3 runtime (stdlib only, no pip packages). If you also run the full local AnyStl Next.js server, the plugin connects to it automatically.

## Install locally (zero setup)

1. Use OrcaSlicer **2.5.1** or newer with Python Pages support.
2. In OrcaSlicer, open **Plugins → Browse plugins → Install local plugin** and select [`anystl.py`](anystl.py).
3. Activate **AnyStl**, approve its upfront network/thread/opener permissions prompt, enable its Pages capability if needed, and open the new **AnyStl** tab.

That's it — you can start searching immediately without running any external script or server.

## What works standalone (no local server)

- **14 keyless model libraries** searched in parallel directly in Python:
  - **3D printing:** Printables, MakerWorld, Creality Cloud, Makeronline, Nexprint, Pinshape, Wikimedia Commons (STL)
  - **CAD:** GrabCAD, Tinkercad
  - **3D assets & Blender:** Sketchfab, Poly Haven, BlenderKit, Blend Swap, 3D Warehouse
- **3 optional API-key libraries** configurable in **Plugins → AnyStl → Config**:
  - Thingiverse (`thingiverse_token`)
  - MyMiniFactory (`myminifactory_key`)
  - Cults3D (`cults3d_username` + `cults3d_api_key`)
- **External browser links** for browser-only / bot-checked sites (Thangs, Yeggi, STLFinder, Fab, and unconfigured optional sites).
- **Featured tab:** trending & popular models from Printables, MakerWorld, Makeronline, and Sketchfab.
- **Filters & sorting:** Free only, Hide AI, Merge duplicates, Max $, format filter, license filter, site presets (`All`, `3D Printing`, `CAD`, `3D Assets`), and `-word` exclusion.
- **Saved, Opened & Compare:** bookmark models (persisted via OrcaSlicer's private plugin storage `orca.host.plugin.storage()` with `localStorage` fallback and JSON backup copy), track opened models, and compare up to 3 models side by side.
- **License summary** in the quick preview modal.

## Optional: connect to a full local AnyStl server

If you also want Playwright-scraped sites (Thingiverse without an API key, Thangs, CGTrader, TurboSquid, Free3D, Yeggi) and the full web UI, start your local AnyStl server (`start.sh`, `start.cmd`, or the `anystl` desktop app).

In default **`"mode": "auto"`**, opening the **AnyStl** tab checks `server_url` (`http://127.0.0.1:3000` by default):
- If the local server is running, the tab opens it automatically.
- If it is not running, the tab opens the standalone Python UI immediately (and offers a **Switch to local server ↗** link if you start the server later).

## Plugin Config

Open **Plugins → AnyStl → Config** to customize JSON settings:

```json
{
  "mode": "auto",
  "server_url": "http://127.0.0.1:3000",
  "thingiverse_token": "",
  "myminifactory_key": "",
  "cults3d_username": "",
  "cults3d_api_key": ""
}
```

- `mode`:
  - `"auto"` (default): use local server if already running, otherwise run standalone.
  - `"standalone"`: always run pure-Python standalone mode without probing `server_url`.
  - `"server"`: always redirect to `server_url`.
- `server_url`: local loopback origin only (`127.0.0.1`, `localhost`, or `[::1]`).

Reload the plugin or restart OrcaSlicer after changing config values.

## Opening a model

Click any model card for the quick preview (larger image, formats, and Creative Commons license summary) or click **Open ↗** to open the model page in your default browser and download its STL / 3MF files.

Direct **Send to Slicer** is disabled inside the OrcaSlicer plugin tab because OrcaSlicer 2.5.x does not expose a native in-process model import API for plugins. **Open in OrcaSlicer** remains available in the standalone AnyStl web and desktop apps.

## OrcaSlicer UI tips

- When OrcaSlicer compacts the tab bar (for example, after **New Project**), look for the magnifying-glass icon after **Project** instead of the **AnyStl** label.
- If typing a space opens OrcaSlicer's action search, turn off **Open the Speed Dial from the keyboard** in OrcaSlicer's **Preferences → General → Features**, or paste the full query into the search box.
- On Linux Flatpak, if WebKit rendering stalls while updating the page, try launching once with WebKit compositing disabled:

  ```bash
  flatpak run --env=WEBKIT_DISABLE_COMPOSITING_MODE=1 com.orcaslicer.OrcaSlicer
  ```

To uninstall, deactivate and delete AnyStl in the Plugins dialog. This doesn't change your printer presets or external AnyStl data.

## Test

```bash
bash scripts/test-orcaslicer-plugin.sh             # Python 3.11+ & Node, no OrcaSlicer or network required
bash scripts/test-orcaslicer-plugin.sh --browser   # Also checks the full web UI in WebView mode (run npm run build first)
```
