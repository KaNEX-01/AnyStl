# /// script
# dependencies = []
#
# [tool.orcaslicer.plugin]
# name = "AnyStl"
# description = "Search 3D model libraries right inside OrcaSlicer — works standalone with zero setup, or connects to a local AnyStl server."
# author = "KaNEX-01"
# version = "0.2.0"
# ///

import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import html
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import orca

DEFAULT_URL = "http://127.0.0.1:3000"
DEFAULT_MODE = "auto"  # "auto" | "standalone" | "server"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
)
WIKIMEDIA_USER_AGENT = "AnyStl/0.2 (https://github.com/KaNEX-01/AnyStl)"
RESULT_LIMIT = 24
FEATURED_TTL_SECONDS = 900
MAX_SAVED_ITEMS = 500

ALLOWED_NETWORK_HOSTS = [
    "http://127.0.0.1",
    "http://localhost",
    "http://[::1]",
    "https://api.printables.com",
    "https://media.printables.com",
    "https://makerworld.com",
    "https://www.crealitycloud.com",
    "https://makeronline.com",
    "https://www.nexprint.com",
    "https://pinshape.com",
    "https://grabcad.com",
    "https://api-reader-prd.tinkercad.com",
    "https://api.sketchfab.com",
    "https://api.polyhaven.com",
    "https://commons.wikimedia.org",
    "https://www.blenderkit.com",
    "https://www.blendswap.com",
    "https://3dwarehouse.sketchup.com",
    "https://api.thingiverse.com",
    "https://www.myminifactory.com",
    "https://cults3d.com",
]

PLATFORMS = {
    "printables": {
        "name": "Printables",
        "label": "PRINTABLES",
        "color": "#FB923C",
        "group": "community",
        "direct_slicer": True,
        "default_on": True,
    },
    "makerworld": {
        "name": "MakerWorld",
        "label": "MAKERWORLD",
        "color": "#4ADE80",
        "group": "brand",
        "direct_slicer": False,
        "default_on": True,
    },
    "creality": {
        "name": "Creality Cloud",
        "label": "CREALITY",
        "color": "#2DD4BF",
        "group": "brand",
        "direct_slicer": False,
        "default_on": True,
    },
    "makeronline": {
        "name": "Makeronline",
        "label": "MAKERONLINE",
        "color": "#38BDF8",
        "group": "brand",
        "direct_slicer": False,
        "default_on": True,
    },
    "nexprint": {
        "name": "Nexprint",
        "label": "NEXPRINT",
        "color": "#34D399",
        "group": "community",
        "direct_slicer": False,
        "default_on": True,
    },
    "pinshape": {
        "name": "Pinshape",
        "label": "PINSHAPE",
        "color": "#E879F9",
        "group": "community",
        "direct_slicer": False,
        "default_on": True,
    },
    "wikimedia": {
        "name": "Wikimedia Commons",
        "label": "WIKIMEDIA",
        "color": "#2DD4BF",
        "group": "community",
        "direct_slicer": True,
        "default_on": True,
    },
    "grabcad": {
        "name": "GrabCAD",
        "label": "GRABCAD",
        "color": "#A3E635",
        "group": "cad",
        "direct_slicer": False,
        "default_on": True,
    },
    "tinkercad": {
        "name": "Tinkercad",
        "label": "TINKERCAD",
        "color": "#FB7185",
        "group": "cad",
        "direct_slicer": False,
        "default_on": False,
    },
    "sketchfab": {
        "name": "Sketchfab",
        "label": "SKETCHFAB",
        "color": "#A5B4FC",
        "group": "general",
        "direct_slicer": False,
        "default_on": True,
    },
    "polyhaven": {
        "name": "Poly Haven",
        "label": "POLY HAVEN",
        "color": "#C084FC",
        "group": "general",
        "direct_slicer": False,
        "default_on": False,
    },
    "blenderkit": {
        "name": "BlenderKit",
        "label": "BLENDERKIT",
        "color": "#FCD34D",
        "group": "general",
        "direct_slicer": False,
        "default_on": False,
    },
    "blendswap": {
        "name": "Blend Swap",
        "label": "BLEND SWAP",
        "color": "#F87171",
        "group": "general",
        "direct_slicer": False,
        "default_on": False,
    },
    "warehouse3d": {
        "name": "3D Warehouse",
        "label": "3D WAREHOUSE",
        "color": "#CBD5E1",
        "group": "general",
        "direct_slicer": False,
        "default_on": False,
    },
    "thingiverse": {
        "name": "Thingiverse",
        "label": "THINGIVERSE",
        "color": "#60A5FA",
        "group": "community",
        "direct_slicer": False,
        "default_on": True,
        "optional": True,
    },
    "myminifactory": {
        "name": "MyMiniFactory",
        "label": "MYMINIFACTORY",
        "color": "#7DD3FC",
        "group": "community",
        "direct_slicer": True,
        "default_on": True,
        "optional": True,
    },
    "cults3d": {
        "name": "Cults3D",
        "label": "CULTS3D",
        "color": "#C084FC",
        "group": "community",
        "direct_slicer": False,
        "default_on": True,
        "optional": True,
    },
}

EXTERNAL_LINKS = [
    ("Thingiverse", "https://www.thingiverse.com/search?q={q}&type=things"),
    ("Thangs", "https://thangs.com/search/{q}?scope=all"),
    ("MyMiniFactory", "https://www.myminifactory.com/search?query={q}"),
    ("Cults3D", "https://cults3d.com/en/search?q={q}"),
    ("Yeggi", "https://www.yeggi.com/q/{q_plus}/"),
    ("STLFinder", "https://www.stlfinder.com/3dmodels/{q_dash}/"),
    ("Fab", "https://www.fab.com/search?q={q}"),
]


def _opener_command():
    if sys.platform == "darwin":
        return "open"
    if sys.platform == "win32":
        return "rundll32"
    return "xdg-open"


def parse_config(config):
    """Parses plugin JSON config safely."""
    try:
        settings = json.loads(config) if isinstance(config, str) else config
    except (TypeError, ValueError):
        return None
    if not isinstance(settings, dict):
        return None
    return settings


def server_url(config):
    """Only allow a local AnyStl instance; this setting is an origin, not a page URL."""
    settings = parse_config(config)
    if settings is None:
        return None
    value = settings.get("server_url", DEFAULT_URL)
    if not isinstance(value, str):
        return None
    match = re.fullmatch(
        r"(https?://(?:127\.0\.0\.1|localhost|\[::1\]))(?::([0-9]{1,5}))?/?", value
    )
    if not match:
        return None
    origin, port = match.groups()
    if port is not None:
        if not 1 <= int(port) <= 65535:
            return None
        origin += f":{int(port)}"
    return origin


def plugin_mode(config):
    """Returns 'auto', 'standalone', or 'server'."""
    settings = parse_config(config)
    if settings is None:
        return None
    raw = settings.get("mode", DEFAULT_MODE)
    if not isinstance(raw, str):
        return DEFAULT_MODE
    mode = raw.strip().lower()
    return mode if mode in ("auto", "standalone", "server") else DEFAULT_MODE


def probe_local_server(origin, timeout=0.35):
    """Fast local check to see whether a full AnyStl Next.js server is already running."""
    if not origin:
        return False
    req = urllib.request.Request(origin + "/", method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 500
    except Exception:
        return False


def _http_bytes(url, data=None, headers=None, timeout=15):
    hdrs = {"User-Agent": USER_AGENT}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=data, headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, dict(resp.headers.items()), resp.read()


def _http_json(url, data=None, headers=None, timeout=15):
    hdrs = {"Accept": "application/json"}
    if headers:
        hdrs.update(headers)
    _, _, raw = _http_bytes(url, data=data, headers=hdrs, timeout=timeout)
    return json.loads(raw.decode("utf-8", "replace"))


def _parse_count(raw):
    if not raw:
        return 0
    cleaned = raw.replace(",", "").strip().lower()
    try:
        if cleaned.endswith("k"):
            return int(round(float(cleaned[:-1]) * 1000))
        if cleaned.endswith("m"):
            return int(round(float(cleaned[:-1]) * 1_000_000))
        return int(cleaned)
    except ValueError:
        return 0


def _formats_from_names(names):
    known = {
        "3mf": "3MF",
        "stl": "STL",
        "obj": "OBJ",
        "step": "STEP",
        "stp": "STEP",
        "amf": "AMF",
        "scad": "SCAD",
        "f3d": "F3D",
        "blend": "BLEND",
        "glb": "GLB",
        "gltf": "GLTF",
        "usdz": "USDZ",
        "skp": "SKP",
    }
    found = []
    seen = set()
    for name in names:
        if not isinstance(name, str):
            continue
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        label = known.get(ext)
        if label and label not in seen:
            seen.add(label)
            found.append(label)
    return found


def _finalize(
    *,
    title,
    url,
    platform,
    thumbnail="",
    likes=0,
    downloads=None,
    price=None,
    formats=None,
    license_name=None,
    is_ai=None,
):
    title = (title or "").strip()
    ai = bool(re.search(r"\bAI\b", title, re.IGNORECASE)) if is_ai is None else bool(is_ai)
    item = {
        "title": title,
        "url": url,
        "platform": platform,
        "thumbnail": thumbnail or "",
        "likes": int(likes or 0),
        "downloads": int(downloads) if isinstance(downloads, (int, float)) else None,
        "isAI": ai,
    }
    if price:
        item["price"] = price
    if formats:
        item["formats"] = list(formats)
    if license_name:
        item["license"] = license_name
    return item


# --- Persistent Saved Models Storage (OrcaSlicer plugin storage with safe fallback) ---

_SAVED_LOCK = threading.Lock()


def _plugin_storage_path():
    """Returns Path to saved.json inside OrcaSlicer's private plugin storage dir, if available."""
    try:
        host = getattr(orca, "host", None)
        plugin_ns = getattr(host, "plugin", None)
        storage_fn = getattr(plugin_ns, "storage", None)
        if callable(storage_fn):
            base = storage_fn()
            if base:
                return Path(str(base)) / "saved.json"
    except Exception:
        return None
    return None


def _sanitize_saved_items(items):
    if not isinstance(items, list):
        return []
    out = []
    seen = set()
    for raw in items[:MAX_SAVED_ITEMS]:
        if not isinstance(raw, dict):
            continue
        url = raw.get("url")
        title = raw.get("title")
        platform = raw.get("platform")
        if not (
            isinstance(url, str)
            and (url.startswith("https://") or url.startswith("http://"))
            and isinstance(title, str)
            and title.strip()
            and isinstance(platform, str)
            and platform in PLATFORMS
        ):
            continue
        if url in seen:
            continue
        seen.add(url)
        item = _finalize(
            title=title[:300],
            url=url[:1000],
            platform=platform,
            thumbnail=raw.get("thumbnail") if isinstance(raw.get("thumbnail"), str) else "",
            likes=raw.get("likes") if isinstance(raw.get("likes"), (int, float)) else 0,
            downloads=raw.get("downloads") if isinstance(raw.get("downloads"), (int, float)) else None,
            price=raw.get("price")[:40] if isinstance(raw.get("price"), str) and raw.get("price") else None,
            formats=[str(f)[:16] for f in (raw.get("formats") or [])[:12] if isinstance(f, str)],
            license_name=raw.get("license")[:80] if isinstance(raw.get("license"), str) and raw.get("license") else None,
            is_ai=raw.get("isAI") if isinstance(raw.get("isAI"), bool) else None,
        )
        out.append(item)
    return out


def load_saved_models():
    path = _plugin_storage_path()
    if not path:
        return None
    with _SAVED_LOCK:
        try:
            if not path.is_file():
                return []
            raw = json.loads(path.read_text(encoding="utf-8"))
            return _sanitize_saved_items(raw)
        except Exception:
            return None


def save_saved_models(items):
    path = _plugin_storage_path()
    if not path:
        return False
    cleaned = _sanitize_saved_items(items)
    with _SAVED_LOCK:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(cleaned, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(path)
            return True
        except Exception:
            return False


# --- Pure-Python Search Providers (stdlib only, zero Node.js / npm needed) ---

_POLYHAVEN_LOCK = threading.Lock()
_POLYHAVEN_CACHE = {"at": 0.0, "assets": []}
_FEATURED_LOCK = threading.Lock()
_FEATURED_CACHE = {"at": 0.0, "sections": []}


def _map_printables_items(items):
    out = []
    for it in items:
        files = [
            f.get("name", "")
            for f in (it.get("stls") or []) + (it.get("otherFiles") or [])
            if isinstance(f, dict)
        ]
        lic = it.get("license") or {}
        lic_name = (lic.get("abbreviation") or lic.get("name") or "").strip() or None
        img = (it.get("image") or {}).get("filePath") or ""
        out.append(
            _finalize(
                title=it.get("name", ""),
                url=f"https://www.printables.com/model/{it['id']}-{it.get('slug', '')}",
                platform="printables",
                thumbnail=f"https://media.printables.com/{img}" if img else "",
                likes=it.get("likesCount") or 0,
                downloads=it.get("downloadCount"),
                price="Free",
                formats=_formats_from_names(files),
                license_name=lic_name,
            )
        )
    return out


def search_printables(query, page=1, _cfg=None):
    offset = (page - 1) * RESULT_LIMIT
    gql = (
        "query SearchModels($query: String!, $limit: Int!, $offset: Int!) {"
        "  searchPrints2(query: $query, limit: $limit, offset: $offset) {"
        "    items { id name slug likesCount downloadCount image { filePath }"
        "      stls { name } otherFiles { name } license { name abbreviation } }"
        "  }"
        "}"
    )
    body = json.dumps(
        {"query": gql, "variables": {"query": query, "limit": RESULT_LIMIT, "offset": offset}}
    ).encode("utf-8")
    data = _http_json(
        "https://api.printables.com/graphql/",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Origin": "https://www.printables.com",
            "Referer": "https://www.printables.com/",
        },
    )
    items = ((data.get("data") or {}).get("searchPrints2") or {}).get("items") or []
    return _map_printables_items(items)


def featured_printables():
    gql = (
        "query TrendingModels($limit: Int!, $ordering: String) {"
        "  morePrints(limit: $limit, ordering: $ordering) {"
        "    items { id name slug likesCount downloadCount image { filePath }"
        "      stls { name } otherFiles { name } license { name abbreviation } }"
        "  }"
        "}"
    )
    body = json.dumps(
        {"query": gql, "variables": {"limit": 12, "ordering": "-likes_count_7_days"}}
    ).encode("utf-8")
    data = _http_json(
        "https://api.printables.com/graphql/",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Origin": "https://www.printables.com",
            "Referer": "https://www.printables.com/",
        },
    )
    items = ((data.get("data") or {}).get("morePrints") or {}).get("items") or []
    return _map_printables_items(items)


def search_makerworld(query, page=1, _cfg=None, limit=RESULT_LIMIT):
    offset = (page - 1) * limit
    params = urllib.parse.urlencode({"keyword": query, "limit": limit, "offset": offset})
    data = _http_json(f"https://makerworld.com/api/v1/search-service/select/design2?{params}")
    hits = data.get("hits") or []
    out = []
    for hit in hits:
        ext_files = ((hit.get("designExtension") or {}).get("model_files") or [])
        names = []
        for f in ext_files:
            if isinstance(f, dict):
                if f.get("modelName"):
                    names.append(f["modelName"])
                if f.get("modelType"):
                    names.append(f"model.{f['modelType']}")
        lic = (hit.get("license") or "").strip()
        if re.fullmatch(r"(?:BY|BY-SA|BY-ND|BY-NC|BY-NC-SA|BY-NC-ND)", lic, re.IGNORECASE):
            lic = f"CC {lic.upper()}"
        out.append(
            _finalize(
                title=hit.get("title", ""),
                url=f"https://makerworld.com/en/models/{hit['id']}",
                platform="makerworld",
                thumbnail=hit.get("cover") or "",
                likes=hit.get("likeCount") or 0,
                downloads=hit.get("downloadCount"),
                price="Free",
                formats=_formats_from_names(names),
                license_name=lic or None,
                is_ai=hit.get("isAIGC") if isinstance(hit.get("isAIGC"), bool) else None,
            )
        )
    return out


def featured_makerworld():
    return search_makerworld("", 1, None, limit=12)


def search_creality(query, page=1, _cfg=None):
    body = json.dumps({"page": page, "pageSize": RESULT_LIMIT, "keyword": query}).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "__cxy_app_id_": "cxy-gen2",
        "__cxy_platform_": "2",
        "__cxy_brand_": "creality",
        "__cxy_app_ver_": "7.3.28",
        "__cxy_os_lang_": "0",
        "__cxy_os_ver_": "Linux",
        "__cxy_timezone_": "0",
        "__cxy_token_": "",
        "__cxy_uid_": "",
        "__cxy_duid_": str(uuid.uuid4()),
        "__cxy_requestid_": str(uuid.uuid4()),
    }
    data = _http_json(
        "https://www.crealitycloud.com/api/cxy/smart_search/v1/model",
        data=body,
        headers=headers,
    )
    items = (data.get("result") or {}).get("list") or []
    out = []
    for m in items:
        covers = m.get("covers") or []
        thumb = covers[0].get("url", "") if covers and isinstance(covers[0], dict) else ""
        out.append(
            _finalize(
                title=m.get("groupName", ""),
                url=f"https://www.crealitycloud.com/model-detail/{m['id']}",
                platform="creality",
                thumbnail=thumb,
                likes=m.get("likeCount") or 0,
                downloads=m.get("downloadCount"),
            )
        )
    return out


def _map_makeronline_items(items):
    out = []
    for m in items:
        url = m.get("target_url") or f"https://www.makeronline.com/model/x/{m['mold_id']}.html"
        out.append(
            _finalize(
                title=m.get("title", ""),
                url=url,
                platform="makeronline",
                thumbnail=m.get("mold_image") or "",
                likes=m.get("like_num") or 0,
                downloads=m.get("download_num"),
                price="Free",
            )
        )
    return out


def search_makeronline(query, page=1, _cfg=None):
    body = json.dumps(
        {"page": page, "page_size": RESULT_LIMIT, "keyword": query, "print_type": 0, "search": 1}
    ).encode("utf-8")
    data = _http_json(
        "https://makeronline.com/api/search/model/v2.8",
        data=body,
        headers={"Content-Type": "application/json", "lang": "en"},
    )
    items = (data.get("data") or {}).get("data") or []
    return _map_makeronline_items(items)


def featured_makeronline():
    body = json.dumps(
        {
            "is_first": 1,
            "page": 1,
            "page_size": 12,
            "seed": str(int(time.time() * 1000)),
            "print_type": 0,
            "exclude_ids": [],
        }
    ).encode("utf-8")
    data = _http_json(
        "https://makeronline.com/api/index/recommend-trending/v2.5",
        data=body,
        headers={"Content-Type": "application/json", "lang": "en"},
    )
    items = data.get("data") or []
    return _map_makeronline_items(items if isinstance(items, list) else [])


def search_nexprint(query, page=1, _cfg=None):
    params = urllib.parse.urlencode(
        {"keyword": query, "sortType": "6", "pageNo": str(page), "pageSize": str(RESULT_LIMIT)}
    )
    data = _http_json(
        f"https://www.nexprint.com/gateway/api/v1/model-library-server/model-base-info/search?{params}"
    )
    d = data.get("data") or {}
    items = (d.get("pageResult") or {}).get("list") or d.get("list") or []
    out = []
    for m in items[:RESULT_LIMIT]:
        if not m.get("modelName") or m.get("nsfw"):
            continue
        stats = m.get("statistics") or {}
        out.append(
            _finalize(
                title=m["modelName"],
                url=f"https://www.nexprint.com/en/models/{m['modelId']}",
                platform="nexprint",
                thumbnail=m.get("coverImgUrl") or "",
                likes=stats.get("staticsModelStarPeoPleCount") or 0,
                downloads=stats.get("staticsModelDownloadCount"),
                price="Free",
            )
        )
    return out


def search_pinshape(query, page=1, _cfg=None):
    params = urllib.parse.urlencode({"search": query, "search_type": "items", "page": str(page)})
    _, _, raw = _http_bytes(
        f"https://pinshape.com/items?{params}", headers={"Accept": "text/html"}
    )
    doc = raw.decode("utf-8", "replace")
    out = []
    seen = set()
    for card in doc.split('class="card card-item')[1:]:
        href_m = re.search(r'href="(/items/\d+-[^"]*)"', card)
        title_m = re.search(r'<h5 class="card-title[^"]*">\s*([\s\S]*?)\s*</h5>', card)
        if not href_m or not title_m:
            continue
        href = href_m.group(1)
        if href in seen:
            continue
        seen.add(href)
        img_m = re.search(r'<img[^>]*\ssrc="([^"]+)"[^>]*class="card-img-top', card)
        img = img_m.group(1) if img_m else ""
        if img.startswith("//"):
            img = "https:" + img
        likes_m = re.search(r'class="likes-count">([^<]*)<', card)
        dl_m = re.search(r'bi-download"></i>\s*([\d.,]+[kKmM]?)', card)
        out.append(
            _finalize(
                title=html.unescape(re.sub(r"<[^>]+>", "", title_m.group(1))).strip(),
                url="https://pinshape.com" + href,
                platform="pinshape",
                thumbnail=img,
                likes=_parse_count(likes_m.group(1) if likes_m else ""),
                downloads=_parse_count(dl_m.group(1)) if dl_m else None,
            )
        )
        if len(out) >= RESULT_LIMIT:
            break
    return out


def search_wikimedia(query, page=1, _cfg=None):
    offset = (page - 1) * RESULT_LIMIT
    params = urllib.parse.urlencode(
        {
            "action": "query",
            "generator": "search",
            "gsrnamespace": "6",
            "gsrsearch": f"{query} filetype:3d",
            "gsrlimit": str(RESULT_LIMIT),
            "gsroffset": str(offset),
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiextmetadatafilter": "LicenseShortName",
            "iiurlwidth": "400",
            "format": "json",
            "formatversion": "2",
        }
    )
    data = _http_json(
        f"https://commons.wikimedia.org/w/api.php?{params}",
        headers={"User-Agent": WIKIMEDIA_USER_AGENT},
    )
    pages = (data.get("query") or {}).get("pages") or []
    ranked = []
    for p in pages:
        title = p.get("title") or ""
        if p.get("ns") != 6 or not re.match(r"^File:.+\.stl$", title, re.IGNORECASE):
            continue
        info = (p.get("imageinfo") or [{}])[0]
        desc_url = info.get("descriptionurl") or ""
        if not desc_url.startswith("https://commons.wikimedia.org/wiki/File:"):
            continue
        lic = ((info.get("extmetadata") or {}).get("LicenseShortName") or {}).get("value")
        lic_clean = lic.strip()[:60] if isinstance(lic, str) and "<" not in lic else None
        ranked.append(
            (
                p.get("index", 999999),
                _finalize(
                    title=title[5:-4].replace("_", " ").strip(),
                    url=desc_url.split("?")[0].split("#")[0],
                    platform="wikimedia",
                    thumbnail=info.get("thumburl") or "",
                    likes=0,
                    downloads=None,
                    price="Free",
                    formats=["STL"],
                    license_name=lic_clean,
                ),
            )
        )
    ranked.sort(key=lambda pair: pair[0])
    return [r for _, r in ranked]


def search_grabcad(query, page=1, _cfg=None):
    params = urllib.parse.urlencode({"query": query, "page": str(page)})
    data = _http_json(f"https://grabcad.com/community/api/v1/models?{params}")
    out = []
    for m in (data.get("models") or [])[:RESULT_LIMIT]:
        slug = m.get("cached_slug") or ""
        if not slug:
            continue
        out.append(
            _finalize(
                title=m.get("name", ""),
                url=f"https://grabcad.com/library/{slug}",
                platform="grabcad",
                thumbnail=m.get("preview_image") or "",
                likes=m.get("likes_count") or 0,
                downloads=m.get("downloads_count"),
                price="Free",
            )
        )
    return out


def search_tinkercad(query, page=1, _cfg=None):
    offset = (page - 1) * RESULT_LIMIT
    params = urllib.parse.urlencode(
        {"offset": str(offset), "limit": str(RESULT_LIMIT), "type": "tinkercad", "q": query}
    )
    data = _http_json(f"https://api-reader-prd.tinkercad.com/api/opensearch/designs?{params}")
    out = []
    for d in data.get("designs") or []:
        title = (d.get("description") or "").strip()
        did = d.get("id")
        if not title or not did:
            continue
        raw_t = d.get("thumbnail_json")
        thumbs = {}
        if isinstance(raw_t, str):
            try:
                thumbs = json.loads(raw_t)
            except ValueError:
                thumbs = {}
        elif isinstance(raw_t, dict):
            thumbs = raw_t
        thumb = (
            (thumbs.get("detailThumb") or {}).get("url")
            or (thumbs.get("filmstrip") or {}).get("url")
            or (thumbs.get("galleryThumb") or {}).get("url")
            or ""
        )
        out.append(
            _finalize(
                title=title,
                url=f"https://www.tinkercad.com/things/{did}",
                platform="tinkercad",
                thumbnail=thumb,
                likes=d.get("number_likes") or 0,
                downloads=None,
                price="Free",
            )
        )
    return out


def _map_sketchfab_items(results):
    out = []
    for m in results:
        imgs = sorted(
            (m.get("thumbnails") or {}).get("images") or [],
            key=lambda i: i.get("width", 0),
        )
        thumb = next(
            (i.get("url", "") for i in imgs if i.get("width", 0) >= 400),
            imgs[-1].get("url", "") if imgs else "",
        )
        archives = m.get("archives") or {}
        fmts = [k.upper() for k in ("glb", "gltf", "usdz") if isinstance(archives.get(k), dict)]
        lic = ((m.get("license") or {}).get("label") or "").strip() or None
        out.append(
            _finalize(
                title=m.get("name", ""),
                url=m.get("viewerUrl") or f"https://sketchfab.com/3d-models/{m['uid']}",
                platform="sketchfab",
                thumbnail=thumb,
                likes=m.get("likeCount") or 0,
                downloads=None,
                formats=fmts,
                license_name=lic,
            )
        )
    return out


def search_sketchfab(query, page=1, _cfg=None):
    offset = (page - 1) * RESULT_LIMIT
    params = urllib.parse.urlencode(
        {
            "type": "models",
            "q": query,
            "downloadable": "true",
            "count": str(min(24, RESULT_LIMIT)),
            "cursor": str(offset),
        }
    )
    data = _http_json(f"https://api.sketchfab.com/v3/search?{params}")
    return _map_sketchfab_items(data.get("results") or [])


def featured_sketchfab():
    params = urllib.parse.urlencode(
        {"downloadable": "true", "staffpicked": "true", "sort_by": "-likeCount", "count": "12"}
    )
    data = _http_json(f"https://api.sketchfab.com/v3/models?{params}")
    return _map_sketchfab_items(data.get("results") or [])


def _polyhaven_assets():
    with _POLYHAVEN_LOCK:
        if not _POLYHAVEN_CACHE["assets"] or time.time() - _POLYHAVEN_CACHE["at"] > 21600:
            raw = _http_json(
                "https://api.polyhaven.com/assets?t=models",
                headers={"User-Agent": "AnyStl/0.2"},
            )
            _POLYHAVEN_CACHE["assets"] = list(raw.items())
            _POLYHAVEN_CACHE["at"] = time.time()
        return list(_POLYHAVEN_CACHE["assets"])


def search_polyhaven(query, page=1, _cfg=None):
    assets = _polyhaven_assets()
    words = [w for w in query.lower().split() if w]
    matches = []
    for aid, a in assets:
        hay = " ".join(
            [aid, a.get("name", "")] + list(a.get("tags") or []) + list(a.get("categories") or [])
        ).lower()
        if all(w in hay for w in words):
            matches.append((aid, a))
    matches.sort(key=lambda pair: pair[1].get("download_count", 0), reverse=True)
    start = (page - 1) * RESULT_LIMIT
    return [
        _finalize(
            title=a.get("name", aid),
            url=f"https://polyhaven.com/a/{aid}",
            platform="polyhaven",
            thumbnail=a.get("thumbnail_url") or "",
            likes=0,
            downloads=a.get("download_count"),
            price="Free",
            formats=["BLEND", "GLTF"],
            license_name="CC0",
        )
        for aid, a in matches[start : start + RESULT_LIMIT]
    ]


def search_blenderkit(query, page=1, _cfg=None):
    params = urllib.parse.urlencode(
        {
            "query": f"asset_type:model order:_score {query}",
            "page": str(page),
            "page_size": str(RESULT_LIMIT),
        }
    )
    data = _http_json(f"https://www.blenderkit.com/api/v1/search/?{params}")
    out = []
    for a in data.get("results") or []:
        if (
            not a.get("name")
            or a.get("isPrivate")
            or (a.get("dictParameters") or {}).get("sexualizedContent")
        ):
            continue
        out.append(
            _finalize(
                title=a["name"],
                url=f"https://www.blenderkit.com/asset-gallery-detail/{a['id']}/",
                platform="blenderkit",
                thumbnail=a.get("thumbnailMiddleUrl") or a.get("thumbnailSmallUrl") or "",
                likes=(a.get("ratingsCount") or {}).get("bookmarks") or 0,
                downloads=None,
                price="Free" if a.get("isFree") else "Full Plan",
                formats=["BLEND"],
            )
        )
    return out


def search_blendswap(query, page=1, _cfg=None):
    if page > 1:
        return []
    params = urllib.parse.urlencode({"keyword": query})
    try:
        _, _, raw = _http_bytes(
            f"https://www.blendswap.com/search?{params}", headers={"Accept": "text/html"}
        )
    except urllib.error.HTTPError as err:
        if err.code == 404:
            return []
        raise
    doc = raw.decode("utf-8", "replace")
    out = []
    seen = set()
    for card in doc.split('class="card card-hover')[1:]:
        href_m = re.search(r'href="(/blend/\d+)"', card)
        title_m = re.search(r'<h3 class="[^"]*">([^<]*)</h3>', card)
        if not href_m or not title_m:
            continue
        href = href_m.group(1)
        title = html.unescape(title_m.group(1)).strip()
        if not title or href in seen:
            continue
        seen.add(href)
        img_m = re.search(r'<img[^>]*\ssrc="([^"]+)"', card)
        img = html.unescape(img_m.group(1)) if img_m else ""
        if img.startswith("/"):
            img = "https://www.blendswap.com" + img
        stats_idx = card.find("font-mono")
        stats = (
            re.findall(r"</svg>\s*([\d.,]+[kKmM]?)\s*<", card[stats_idx:])
            if stats_idx != -1
            else []
        )
        likes = _parse_count(stats[0]) if len(stats) > 0 else 0
        downloads = _parse_count(stats[1]) if len(stats) > 1 else None
        out.append(
            _finalize(
                title=title,
                url="https://www.blendswap.com" + href,
                platform="blendswap",
                thumbnail=img,
                likes=likes,
                downloads=downloads,
                price="Free",
                formats=["BLEND"],
            )
        )
        if len(out) >= RESULT_LIMIT:
            break
    return out


def search_warehouse3d(query, page=1, _cfg=None):
    offset = (page - 1) * RESULT_LIMIT
    params = urllib.parse.urlencode(
        {
            "contentType": "3dw",
            "count": str(RESULT_LIMIT),
            "offset": str(offset),
            "showBinaryMetadata": "true",
            "q": query,
        }
    )
    data = _http_json(f"https://3dwarehouse.sketchup.com/warehouse/v1.0/entities?{params}")
    out = []
    for e in data.get("entries") or []:
        if not e.get("title") or e.get("isPrivate"):
            continue
        bins = e.get("binaries") or {}
        thumb = ""
        for k in ("bot_lt", "bot_st"):
            if isinstance(bins.get(k), dict) and bins[k].get("contentUrl"):
                thumb = bins[k]["contentUrl"]
                break
        fmts = [
            lbl
            for k, lbl in (("source_skp", "SKP"), ("glb", "GLB"), ("usdz", "USDZ"))
            if isinstance(bins.get(k), dict) and bins[k].get("contentUrl")
        ]
        out.append(
            _finalize(
                title=e["title"],
                url=f"https://3dwarehouse.sketchup.com/model/{e['id']}",
                platform="warehouse3d",
                thumbnail=thumb,
                likes=e.get("reviewCount") or 0,
                downloads=e.get("downloads"),
                price="Free",
                formats=fmts,
            )
        )
    return out


def search_thingiverse(query, page=1, cfg=None):
    token = (cfg or {}).get("thingiverse_token", "").strip()
    if not token:
        return []
    params = urllib.parse.urlencode(
        {"type": "things", "per_page": str(RESULT_LIMIT), "page": str(page)}
    )
    q_path = urllib.parse.quote(query, safe="")
    data = _http_json(
        f"https://api.thingiverse.com/search/{q_path}?{params}",
        headers={"Authorization": f"Bearer {token}"},
    )
    out = []
    for t in data.get("hits") or []:
        url = t.get("public_url") or (
            f"https://www.thingiverse.com/thing:{t['id']}" if t.get("id") else ""
        )
        if not url or not t.get("name"):
            continue
        out.append(
            _finalize(
                title=t["name"],
                url=url,
                platform="thingiverse",
                thumbnail=t.get("thumbnail") or t.get("preview_image") or "",
                likes=t.get("like_count") or 0,
                downloads=t.get("download_count"),
                price="Free",
            )
        )
    return out


def search_myminifactory(query, page=1, cfg=None):
    key = (cfg or {}).get("myminifactory_key", "").strip()
    if not key:
        return []
    params = urllib.parse.urlencode(
        {"q": query, "page": str(page), "per_page": str(RESULT_LIMIT), "key": key}
    )
    data = _http_json(f"https://www.myminifactory.com/api/v2/search?{params}")
    out = []
    for m in data.get("items") or []:
        url = m.get("url") or ""
        if not m.get("name") or not url.startswith("https://www.myminifactory.com/object/"):
            continue
        imgs = m.get("images") or []
        thumb = ""
        for im in imgs:
            if isinstance(im, dict):
                cand = (
                    (im.get("standard") or {}).get("url")
                    or (im.get("thumbnail") or {}).get("url")
                    or ""
                )
                if cand:
                    thumb = cand
                    if im.get("is_primary"):
                        break
        out.append(
            _finalize(
                title=m["name"],
                url=url,
                platform="myminifactory",
                thumbnail=thumb,
                likes=m.get("likes") or 0,
                downloads=None,
            )
        )
    return out


def search_cults3d(query, page=1, cfg=None):
    user = (cfg or {}).get("cults3d_username", "").strip()
    key = (cfg or {}).get("cults3d_api_key", "").strip()
    if not user or not key:
        return []
    offset = (page - 1) * RESULT_LIMIT
    gql = (
        "query Search($query: String!, $limit: Int!, $offset: Int!) {"
        "  creationsSearchBatch(query: $query, limit: $limit, offset: $offset) {"
        "    results { name(locale: EN) url(locale: EN) shortUrl illustrationImageUrl"
        "      likesCount downloadsCount price(currency: USD) { cents } }"
        "  }"
        "}"
    )
    auth = base64.b64encode(f"{user}:{key}".encode("utf-8")).decode("ascii")
    body = json.dumps(
        {"query": gql, "variables": {"query": query, "limit": RESULT_LIMIT, "offset": offset}}
    ).encode("utf-8")
    data = _http_json(
        "https://cults3d.com/graphql",
        data=body,
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
    )
    results = (((data.get("data") or {}).get("creationsSearchBatch") or {}).get("results") or [])
    out = []
    for m in results:
        if not isinstance(m, dict):
            continue
        name = (m.get("name") or "").strip()
        url = (m.get("url") or m.get("shortUrl") or "").strip()
        if not name or not url.startswith("https://cults3d.com/"):
            continue
        cents = (m.get("price") or {}).get("cents")
        price = (
            "Free"
            if isinstance(cents, int) and cents == 0
            else (f"${cents / 100:.2f}" if isinstance(cents, int) and cents > 0 else None)
        )
        out.append(
            _finalize(
                title=name,
                url=url.split("?")[0].split("#")[0],
                platform="cults3d",
                thumbnail=m.get("illustrationImageUrl") or "",
                likes=m.get("likesCount") or 0,
                downloads=m.get("downloadsCount"),
                price=price,
            )
        )
    return out


PROVIDERS = {
    "printables": search_printables,
    "makerworld": search_makerworld,
    "creality": search_creality,
    "makeronline": search_makeronline,
    "nexprint": search_nexprint,
    "pinshape": search_pinshape,
    "wikimedia": search_wikimedia,
    "grabcad": search_grabcad,
    "tinkercad": search_tinkercad,
    "sketchfab": search_sketchfab,
    "polyhaven": search_polyhaven,
    "blenderkit": search_blenderkit,
    "blendswap": search_blendswap,
    "warehouse3d": search_warehouse3d,
    "thingiverse": search_thingiverse,
    "myminifactory": search_myminifactory,
    "cults3d": search_cults3d,
}

FEATURED_SOURCES = [
    ("printables", "Trending this week", featured_printables),
    ("makerworld", "Popular", featured_makerworld),
    ("makeronline", "Trending", featured_makeronline),
    ("sketchfab", "Staff picks", featured_sketchfab),
]


def load_featured(force=False):
    now = time.time()
    with _FEATURED_LOCK:
        if not force and _FEATURED_CACHE["sections"] and now - _FEATURED_CACHE["at"] < FEATURED_TTL_SECONDS:
            return list(_FEATURED_CACHE["sections"])
    sections = []
    with ThreadPoolExecutor(max_workers=len(FEATURED_SOURCES)) as pool:
        futs = {
            pool.submit(fn): (plat, subtitle)
            for plat, subtitle, fn in FEATURED_SOURCES
        }
        by_plat = {}
        for fut in as_completed(futs):
            plat, subtitle = futs[fut]
            try:
                items = fut.result()
                by_plat[plat] = {"platform": plat, "subtitle": subtitle, "results": items}
            except Exception as err:
                by_plat[plat] = {
                    "platform": plat,
                    "subtitle": subtitle,
                    "results": [],
                    "error": str(err),
                }
        for plat, _, _ in FEATURED_SOURCES:
            if plat in by_plat:
                sections.append(by_plat[plat])
    with _FEATURED_LOCK:
        _FEATURED_CACHE["sections"] = sections
        _FEATURED_CACHE["at"] = time.time()
    return sections


def _popen_detached(argv):
    """Spawns a process without opening /dev/null (avoids OrcaSlicer FsReadWrite audit prompts)."""
    kwargs = {"start_new_session": True} if sys.platform != "win32" else {}
    return subprocess.Popen(argv, **kwargs)


def launch_desktop_url(url):
    """Dispatches a validated https:// or http:// URL to the OS browser handler."""
    if not isinstance(url, str):
        return False, "Invalid URL"
    if not (url.startswith("https://") or url.startswith("http://")):
        return False, "Unsupported URL scheme"
    cmd = _opener_command()
    if cmd == "rundll32":
        argv = ["rundll32", "url.dll,FileProtocolHandler", url]
    elif cmd == "open":
        argv = ["open", url]
    else:
        if not os.environ.get("DISPLAY") and not os.environ.get("WAYLAND_DISPLAY"):
            return False, "No desktop display available to open the browser."
        argv = ["xdg-open", url]
    try:
        _popen_detached(argv)
        return True, None
    except Exception as err:
        return False, f"Could not launch {cmd}: {err}"


GROUPS = [
    {"id": "community", "name": "Community", "description": "Print models shared by makers"},
    {"id": "brand", "name": "Printer brands", "description": "Libraries run by Bambu Lab, Creality and Anycubic"},
    {"id": "cad", "name": "CAD & engineering", "description": "Parts, mechanisms and CAD designs"},
    {"id": "general", "name": "3D assets & Blender", "description": "Blender, game and render models — not always print-ready"},
]

STANDALONE_HTML = r"""<!doctype html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AnyStl - 3D Model Meta Search</title>
<style>
:root {
  --bg: #171412;
  --side: #1f1b18;
  --card: #221d1a;
  --well: #2c2622;
  --field: #26211e;
  --chip: #2a2521;
  --line: #3a322c;
  --line-soft: #332c27;
  --text: #f3ede7;
  --muted: #bdb1a7;
  --dim: #8c8078;
  --accent: #ff7a1a;
  --accent-hover: #ff8d3a;
  --accent-soft: #ffb072;
  --price: #3a2a1c;
  --ok-bg: #1c3a28;
  --ok: #86efac;
  --err-bg: #3b1515;
  --err: #fca5a5;
  --ai: #d8b4fe;
  --font-sans: "Space Grotesk", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
* { box-sizing: border-box; scrollbar-color: var(--line) var(--bg); }
html, body {
  margin: 0; padding: 0; min-height: 100%;
  background: var(--bg); color: var(--text);
  font-family: var(--font-sans); color-scheme: dark;
  -webkit-font-smoothing: antialiased;
}
::selection { background: rgba(255, 122, 26, 0.35); }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--line); border-radius: 5px; }
::-webkit-scrollbar-thumb:hover { background: #4a413b; }
button, input, select { font: inherit; color: inherit; }
button { cursor: pointer; background: none; border: 0; padding: 0; }
a { color: inherit; text-decoration: none; }
.mono { font-family: var(--font-mono); }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}

/* App Shell */
.app { min-height: 100vh; display: flex; flex-direction: column; }
@media (min-width: 1024px) {
  .app { flex-direction: row; }
}

/* Desktop Sidebar */
.sidebar {
  display: none;
  position: sticky; top: 0; height: 100vh; flex-shrink: 0;
  flex-direction: column; gap: 22px; overflow-y: auto;
  background: var(--side); border-right: 1px solid rgba(51, 44, 39, 0.65);
  width: 300px; padding: 26px 20px;
}
@media (min-width: 1024px) {
  .sidebar { display: flex; }
}
.sidebar.collapsed {
  width: 68px; align-items: center; padding: 24px 10px;
}
.side-top { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 8px; }
.sidebar.collapsed .side-top { flex-direction: column; gap: 12px; }
.logo-btn { display: inline-flex; align-items: center; gap: 10px; text-align: left; }
.logo-btn:hover { opacity: 0.92; }
.logo-text { font-size: 22px; font-weight: 700; letter-spacing: -0.025em; color: var(--text); }
.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 8px; color: var(--dim);
}
.icon-btn:hover { background: var(--chip); color: var(--text); }
.divider { height: 1px; width: 100%; background: var(--line-soft); flex-shrink: 0; }

/* Mobile / Narrow Header */
.mobile-head {
  position: sticky; top: 0; z-index: 40;
  background: var(--side); border-bottom: 1px solid var(--line-soft);
}
@media (min-width: 1024px) {
  .mobile-head { display: none; }
}
.mobile-head-top { display: flex; align-items: center; gap: 12px; padding: 12px 16px; }
.mobile-sites-btn {
  margin-left: auto; border-radius: 12px; padding: 8px 12px;
  font-size: 13px; font-weight: 500; background: var(--chip); color: var(--text);
}
.mobile-sites-btn.open { background: var(--accent); color: var(--side); font-weight: 600; }
.mobile-nav-wrap { padding: 0 12px 8px; }
.mobile-drawer { max-height: 70vh; overflow-y: auto; border-top: 1px solid var(--line-soft); padding: 16px; }

/* Nav Links */
.nav { display: flex; gap: 4px; width: 100%; }
.nav.vertical { flex-direction: column; }
.nav-item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 14px; border-radius: 12px; font-size: 14px; font-weight: 500;
  color: var(--muted); transition: background 0.12s, color 0.12s;
}
.nav-item:hover { background: var(--chip); color: var(--text); }
.nav-item.active { background: var(--line-soft); color: var(--text); }
.sidebar.collapsed .nav-item { justify-content: center; padding: 10px 8px; }
.nav-count { font-family: var(--font-mono); font-size: 12px; color: var(--muted); }
.nav-count.accent { color: var(--accent-soft); }

/* Collapsed Spool Counter */
.collapsed-count {
  margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 2px;
  border-radius: 12px; background: var(--chip); padding: 8px;
  font-family: var(--font-mono); font-size: 10px; color: var(--muted);
}
.collapsed-count:hover { color: var(--text); }

/* SourceFilter ("Spools") */
.spools { display: flex; flex-direction: column; gap: 16px; width: 100%; }
.spools-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.spools-head p { margin: 0; font-family: var(--font-mono); font-size: 12px; color: var(--muted); }
.spools-head strong { color: var(--text); font-weight: 600; }
.link-accent { font-size: 12px; font-weight: 500; color: var(--accent-soft); }
.link-accent:hover { color: var(--text); text-decoration: underline; }
.presets { display: flex; flex-wrap: wrap; gap: 6px; }
.preset-btn {
  border-radius: 8px; padding: 4px 10px; font-size: 12px; font-weight: 500;
  background: var(--chip); color: var(--muted);
}
.preset-btn:hover { color: var(--text); }
.preset-btn.active {
  background: rgba(255, 122, 26, 0.15); color: var(--accent-soft);
  box-shadow: inset 0 0 0 1px rgba(255, 122, 26, 0.5);
}
.group { display: flex; flex-direction: column; gap: 8px; }
.group-btn { display: flex; align-items: flex-start; gap: 10px; text-align: left; }
.chk {
  margin-top: 2px; width: 16px; height: 16px; flex-shrink: 0;
  border-radius: 5px; border: 1px solid var(--line);
  display: inline-flex; align-items: center; justify-content: center;
}
.chk.on, .chk.some { border-color: var(--accent); background: var(--accent); color: var(--side); }
.chk-dash { width: 8px; height: 2px; border-radius: 2px; background: var(--side); display: block; }
.group-name { display: block; font-size: 14px; font-weight: 600; color: var(--text); }
.group-name.off { color: var(--dim); }
.group-btn:hover .group-name { color: #ffffff; }
.group-desc { display: block; font-size: 11px; line-height: 1.35; color: var(--dim); }
.group-sites { display: flex; flex-wrap: wrap; gap: 6px; padding-left: 26px; }
.site-pill {
  display: inline-flex; align-items: center; gap: 6px;
  border-radius: 999px; padding: 4px 10px 4px 6px; font-size: 12px;
  background: var(--chip); color: var(--text);
}
.site-pill:hover { background: var(--line); }
.site-pill.off {
  background: transparent; color: var(--dim); text-decoration: line-through;
  box-shadow: inset 0 0 0 1px var(--line-soft);
}
.site-pill.off:hover { color: var(--muted); }
.spool-dot {
  flex-shrink: 0; border-radius: 999px; display: inline-block;
}
.dot-pending { width: 6px; height: 6px; border-radius: 999px; background: var(--accent); display: inline-block; }
.dot-err { font-family: var(--font-mono); font-size: 11px; color: var(--err); font-weight: 700; }
.dot-cnt { font-family: var(--font-mono); font-size: 11px; color: var(--muted); }
.server-banner {
  margin-top: auto; padding: 10px 12px; border-radius: 12px;
  background: var(--chip); border: 1px solid var(--line-soft);
  font-size: 11.5px; color: var(--muted); display: flex; flex-direction: column; gap: 6px;
}

/* Main Content Column */
.content-col { display: flex; flex: 1; min-width: 0; flex-direction: column; }
.main {
  flex: 1; display: flex; flex-direction: column; gap: 20px;
  padding: 16px 16px 24px;
}
@media (min-width: 640px) {
  .main { padding: 16px 24px 24px; }
}
@media (min-width: 1024px) {
  .main { padding: 20px 40px 28px; }
}

/* Sticky Search Header */
.search-head {
  position: relative; z-index: 30;
  margin: 0 -16px; padding: 8px 16px;
  display: flex; flex-direction: column; gap: 12px;
}
@media (min-width: 640px) {
  .search-head { margin: 0 -24px; padding: 8px 24px; }
}
@media (min-width: 1024px) {
  .search-head { margin: 0 -40px; padding: 8px 40px; }
}
.search-head.sticky {
  position: sticky; top: 0;
  background: var(--bg);
  border-bottom: 1px solid rgba(51, 44, 39, 0.85);
}
.search-bar {
  display: flex; align-items: center; gap: 12px; height: 56px;
  border-radius: 16px; border: 1px solid var(--line); background: var(--field);
  padding: 0 8px 0 16px; transition: border-color 0.15s;
}
.search-bar:focus-within { border-color: rgba(255, 122, 26, 0.7); }
.search-input {
  flex: 1; min-width: 0; border: 0; background: transparent;
  font-size: 16px; color: var(--text); outline: none;
}
.search-input::placeholder { color: var(--dim); }
.kbd-hint {
  display: none; flex-shrink: 0; border-radius: 6px; border: 1px solid var(--line);
  background: var(--card); padding: 2px 8px; font-family: var(--font-mono);
  font-size: 11px; color: var(--dim);
}
@media (min-width: 640px) { .kbd-hint { display: inline-block; } }
.clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 8px; font-size: 18px; color: var(--dim);
}
.clear-btn:hover { background: var(--chip); color: var(--text); }
.search-submit {
  display: inline-flex; align-items: center; gap: 8px; height: 40px;
  flex-shrink: 0; border-radius: 12px; background: var(--accent);
  padding: 0 20px; font-size: 14px; font-weight: 700; color: var(--side);
}
.search-submit:hover { background: var(--accent-hover); }
.search-submit:disabled { cursor: not-allowed; opacity: 0.45; }
.search-submit.busy { opacity: 1; }
.progress-track {
  position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
  background: rgba(51, 44, 39, 0.5); overflow: hidden;
}
.progress-fill { height: 100%; background: var(--accent); transition: width 0.25s; }

/* Summary Row + Sort + Column Slider */
.summary-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 20px; }
.summary-text { margin: 0; font-size: 14px; color: var(--muted); }
.summary-text strong { color: var(--text); font-weight: 600; }
.spacer { flex-grow: 1; }
.sort-label { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: var(--muted); }
.select-wrap { position: relative; display: inline-flex; align-items: center; }
.sort-select {
  cursor: pointer; appearance: none; border-radius: 10px;
  border: 1px solid var(--line); background: var(--field);
  padding: 7px 30px 7px 12px; font-size: 14px; color: var(--text); outline: none;
}
.sort-select:focus { border-color: rgba(255, 122, 26, 0.7); }
.select-caret {
  pointer-events: none; position: absolute; right: 10px; color: var(--muted);
}
.col-slider { display: none; align-items: center; gap: 10px; color: var(--muted); }
@media (min-width: 1024px) { .col-slider { display: inline-flex; } }
.col-slider input[type="range"] { width: 80px; cursor: pointer; accent-color: var(--accent); }

/* FilterBar */
.filter-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.ftoggle {
  border-radius: 999px; padding: 6px 12px; font-size: 12px; font-weight: 500;
  background: var(--chip); color: var(--muted);
}
.ftoggle:hover { color: var(--text); }
.ftoggle.on { background: var(--accent); color: var(--side); font-weight: 600; }
.fgroup {
  display: inline-flex; align-items: center; gap: 6px;
  border-radius: 999px; padding: 4px 4px 4px 12px; font-size: 12px; font-weight: 500;
  background: var(--chip); color: var(--muted);
}
.fgroup.on { background: var(--accent); color: var(--side); font-weight: 600; }
.fgroup input, .fgroup select {
  border: 0; border-radius: 999px; background: var(--bg);
  color: var(--text); padding: 3px 8px; font-size: 12px; outline: none;
}
.fgroup input { width: 56px; }
.fgroup input::placeholder { color: var(--dim); }
.clear-filters {
  border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 500;
  color: var(--accent-soft);
}
.clear-filters:hover { background: var(--chip); color: var(--text); }
.excludes-note { font-family: var(--font-mono); font-size: 11px; color: var(--dim); }

/* Initial Hero / Empty */
.hero { display: flex; flex-direction: column; gap: 22px; padding-top: 24px; }
@media (min-width: 1024px) { .hero { padding-top: 44px; } }
.hero h1 {
  margin: 0; font-size: 36px; font-weight: 700; letter-spacing: -0.03em;
  line-height: 1.1; color: var(--text);
}
@media (min-width: 640px) { .hero h1 { font-size: 46px; } }
.hero-sub {
  margin: 12px 0 0; max-width: 672px; font-size: 15px; line-height: 1.65; color: var(--muted);
}
.try-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.try-label { font-family: var(--font-mono); font-size: 12px; color: var(--dim); }
.try-pill {
  border-radius: 999px; border: 1px solid var(--line); padding: 6px 14px;
  font-size: 14px; color: var(--text);
}
.try-pill:hover { border-color: var(--accent); color: var(--accent-soft); }

/* External Links Bar */
.ext-bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
  border-radius: 14px; border: 1px solid var(--line-soft); background: var(--side);
  padding: 10px 14px; font-size: 12px; color: var(--muted);
}
.ext-link { font-weight: 500; color: var(--accent-soft); }
.ext-link:hover { text-decoration: underline; }

/* Loading / Empty States */
.center-box {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 16px; padding: 72px 16px; text-align: center; color: var(--muted);
}
.center-box h1 { margin: 0; font-size: 26px; color: var(--text); }
.page-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 12px; }
.page-head h1 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
.page-sub { margin: 4px 0 0; font-size: 14px; color: var(--muted); }

/* Model Grid */
.grid {
  display: grid; gap: 18px;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}
@media (min-width: 1024px) {
  .grid.cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid.cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .grid.cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .grid.cols-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .grid.cols-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
}

/* Section Headers (Featured) */
.sec-head { display: flex; align-items: center; gap: 10px; margin: 18px 0 12px; }
.sec-head:first-child { margin-top: 0; }
.sec-head h2 { margin: 0; font-size: 18px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; }
.sec-head span { font-size: 13px; color: var(--muted); }

/* ModelCard */
.card {
  position: relative; display: flex; flex-direction: column; overflow: hidden;
  border-radius: 20px; background: var(--card);
  box-shadow: inset 0 0 0 1px transparent;
  transition: box-shadow 0.15s;
}
.card:hover { box-shadow: inset 0 0 0 1px var(--line); }
.card-link { display: flex; flex: 1; flex-direction: column; cursor: pointer; }
.thumb-well {
  position: relative; aspect-ratio: 4 / 3; overflow: hidden;
  background: var(--well); display: flex; align-items: center; justify-content: center;
}
.thumb-well img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  transition: transform 0.25s;
}
.card:hover .thumb-well img { transform: scale(1.04); }
.badge-tl { position: absolute; top: 12px; left: 12px; right: 12px; pointer-events: none; }
.plat-badge {
  display: inline-flex; max-width: 100%; align-items: center; gap: 6px;
  border-radius: 999px; background: rgba(23, 20, 18, 0.86);
  padding: 4px 10px 4px 6px; font-size: 12px; font-weight: 600; color: var(--text);
}
.plat-badge-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badges-bl { position: absolute; left: 12px; bottom: 12px; display: flex; gap: 6px; }
.mini-tag {
  border-radius: 6px; background: rgba(23, 20, 18, 0.86);
  padding: 2px 8px; font-family: var(--font-mono); font-size: 11px; font-weight: 500;
}
.mini-tag.ai { color: var(--ai); }
.mini-tag.opened { color: var(--muted); }
.alt-pill {
  position: absolute; right: 12px; bottom: 12px;
  display: inline-flex; align-items: center; gap: 4px;
  border-radius: 999px; background: rgba(23, 20, 18, 0.86);
  padding: 4px 8px 4px 6px; font-family: var(--font-mono); font-size: 11px; color: var(--text);
}
.filament-strip { height: 5px; width: 100%; flex-shrink: 0; }
.card-body {
  display: flex; flex: 1; flex-direction: column; gap: 10px;
  padding: 14px 16px 16px;
}
.card-title {
  margin: 0; font-size: 15px; font-weight: 600; line-height: 1.35; color: var(--text);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.chip-row { display: flex; flex-wrap: wrap; gap: 4px; font-family: var(--font-mono); font-size: 10.5px; }
.chip { border-radius: 4px; background: var(--chip); padding: 2px 6px; color: var(--muted); }
.chip.lic { color: var(--accent-soft); }
.card-meta {
  margin-top: auto; display: flex; align-items: center; gap: 12px;
  font-family: var(--font-mono); font-size: 12px; color: var(--muted);
}
.price-tag {
  margin-left: auto; border-radius: 6px; padding: 2px 8px; font-weight: 500;
}
.price-tag.free { background: var(--ok-bg); color: var(--ok); }
.price-tag.paid { background: var(--price); color: var(--accent-soft); }
.card-actions {
  display: flex; border-top: 1px solid rgba(51, 44, 39, 0.85);
}
.cact {
  flex: 1; min-width: 0; display: inline-flex; align-items: center; justify-content: center;
  gap: 5px; white-space: nowrap; padding: 8px 6px; font-size: 12px; font-weight: 500;
  color: var(--muted); border-right: 1px solid rgba(51, 44, 39, 0.85);
}
.cact:last-child { border-right: 0; flex: 1.35; }
.cact:hover { background: var(--chip); color: var(--text); }
.cact:disabled { opacity: 0.5; cursor: not-allowed; }
.cact.on { background: rgba(255, 122, 26, 0.15); color: var(--accent-soft); }
.cact.slicer-ready { color: var(--accent-soft); }
.cact.slicer-ready:hover { background: rgba(255, 122, 26, 0.15); }
.cact.sent { background: rgba(28, 58, 40, 0.6); color: var(--ok); }
.cact.err { background: rgba(59, 21, 21, 0.5); color: var(--err); }
.cact.site { background: var(--chip); color: var(--text); }
.slicer-bar {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 8px; border-top: 1px solid rgba(51, 44, 39, 0.85);
  padding: 6px 12px; font-size: 11px;
}
.slicer-bar.ok { background: rgba(28, 58, 40, 0.4); color: var(--ok); }
.slicer-bar.err { background: rgba(59, 21, 21, 0.4); color: var(--err); }
.slicer-bar.info { background: rgba(44, 38, 34, 0.85); color: var(--muted); }
.slicer-note { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.slicer-links { display: flex; flex-shrink: 0; align-items: center; gap: 10px; }

/* Load More Button */
.load-more-wrap { display: flex; flex-direction: column; align-items: center; gap: 8px; padding-top: 16px; }
.load-more-btn {
  display: inline-flex; height: 44px; align-items: center; border-radius: 14px;
  border: 1px solid var(--line); background: var(--field);
  padding: 0 24px; font-size: 14px; font-weight: 600; color: var(--text);
}
.load-more-btn:hover { border-color: var(--accent); }

/* Footer */
.footer {
  margin-top: auto; padding-top: 40px; text-align: center;
  font-family: var(--font-mono); font-size: 11px; color: var(--dim);
}

/* Comparison Tray */
.cmp-tray {
  position: sticky; bottom: 0; z-index: 30;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 12px;
  border-top: 1px solid var(--line); background: rgba(31, 27, 24, 0.96);
  padding: 10px 20px; font-size: 14px;
}
.cmp-tray-btn {
  border-radius: 8px; background: var(--accent); color: var(--side);
  padding: 6px 12px; font-weight: 600;
}
.cmp-tray-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.cmp-clear { color: var(--muted); font-size: 13px; }
.cmp-clear:hover { color: var(--text); }

/* Modals (PreviewModal + Compare Dialog) */
.modal-backdrop {
  position: fixed; inset: 0; z-index: 50; background: rgba(0, 0, 0, 0.72);
  display: flex; align-items: center; justify-content: center; padding: 14px;
}
.preview-card {
  display: grid; width: 100%; max-width: 1024px; max-height: 90vh;
  grid-template-columns: 1fr; overflow-y: auto;
  border-radius: 24px; background: var(--card);
}
@media (min-width: 768px) {
  .preview-card { grid-template-columns: 1.2fr 1fr; overflow: hidden; }
}
.preview-media {
  display: flex; flex-direction: column; gap: 8px; background: var(--well); padding: 12px;
}
.preview-img-box {
  position: relative; aspect-ratio: 4 / 3; overflow: hidden; border-radius: 16px;
  background: var(--bg); display: flex; align-items: center; justify-content: center;
}
.preview-img-box img { width: 100%; height: 100%; object-fit: contain; display: block; }
.preview-info {
  display: flex; flex-direction: column; gap: 16px; padding: 20px;
}
@media (min-width: 768px) {
  .preview-info { max-height: 90vh; overflow-y: auto; }
}
.preview-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.preview-title { margin: 0; font-size: 20px; font-weight: 700; line-height: 1.3; color: var(--text); }
.preview-stats {
  display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
  font-family: var(--font-mono); font-size: 12px; color: var(--muted);
}
.lic-panel {
  border-radius: 14px; border: 1px solid var(--line-soft); background: rgba(44, 38, 34, 0.65);
  padding: 12px 14px; display: flex; flex-direction: column; gap: 6px;
}
.lic-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 600; }
.lic-badges { display: flex; flex-wrap: wrap; gap: 6px; font-family: var(--font-mono); font-size: 11px; }
.lic-b { border-radius: 6px; padding: 2px 7px; background: var(--chip); color: var(--muted); }
.lic-b.ok { background: var(--ok-bg); color: var(--ok); }
.lic-b.warn { background: var(--price); color: var(--accent-soft); }
.lic-note { margin: 0; font-size: 12px; line-height: 1.45; color: var(--muted); }
.files-dl {
  margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 14px;
}
.files-dl dt { color: var(--dim); }
.files-dl dd { margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.slicer-cta {
  display: flex; height: 40px; width: 100%; align-items: center; justify-content: center;
  gap: 8px; border-radius: 12px; border: 1px solid var(--line); background: var(--field);
  padding: 0 16px; font-size: 14px; font-weight: 500; color: var(--text);
}
.slicer-cta:hover { border-color: var(--accent); }
.slicer-cta:disabled { opacity: 0.6; cursor: not-allowed; }
.download-box {
  display: flex; flex-direction: column; gap: 8px; border-radius: 12px;
  border: 1px solid var(--line-soft); background: rgba(44, 38, 34, 0.6);
  padding: 12px; font-size: 12px; color: var(--muted);
}
.download-box p { margin: 0; }
.download-input {
  width: 100%; border-radius: 8px; border: 1px solid var(--line); background: var(--field);
  padding: 8px; font-family: var(--font-mono); font-size: 12px; color: var(--text);
}
.primary-row { display: flex; align-items: center; gap: 8px; }
.primary-cta {
  display: flex; height: 44px; flex: 1; align-items: center; justify-content: center;
  border-radius: 12px; background: var(--accent); padding: 0 20px;
  font-size: 15px; font-weight: 700; color: var(--side);
}
.primary-cta:hover { background: var(--accent-hover); }
.save-sq {
  display: inline-flex; width: 44px; height: 44px; flex-shrink: 0;
  align-items: center; justify-content: center; border-radius: 12px;
  background: var(--chip); color: var(--text);
}
.save-sq:hover { color: var(--accent-soft); }
.save-sq.on { background: var(--accent); color: var(--side); }
.also-list { display: flex; flex-direction: column; gap: 6px; }
.also-item {
  display: flex; align-items: center; gap: 8px; border-radius: 8px;
  padding: 6px 8px; font-size: 14px; color: var(--text); text-align: left;
}
.also-item:hover { background: var(--chip); }

/* Compare Dialog */
.dialog-box {
  width: 100%; max-width: 960px; max-height: 90vh; overflow-y: auto;
  border-radius: 24px; background: var(--card); border: 1px solid var(--line); padding: 20px;
}
.dialog-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.dialog-head h2 { margin: 0; font-size: 20px; font-weight: 700; }
.cmp-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 14px; text-align: left; }
.cmp-table th, .cmp-table td { border-top: 1px solid var(--line); padding: 10px 12px; vertical-align: top; }
.cmp-table thead th { border-top: 0; padding-bottom: 12px; }
.cmp-table tbody th { width: 112px; font-weight: 500; color: var(--muted); }
.cmp-photo {
  aspect-ratio: 4 / 3; border-radius: 12px; background: var(--well);
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  font-size: 12px; color: var(--muted);
}
.cmp-photo img { width: 100%; height: 100%; object-fit: contain; }
</style>
</head>
<body>
<div class="app">
  <aside class="sidebar" id="sidebar"></aside>
  <header class="mobile-head" id="mobileHead"></header>
  <div class="content-col">
    <main class="main" id="main"></main>
    <div id="trayRoot"></div>
  </div>
</div>
<div id="modalRoot"></div>
<script>
(function() {
  var defStyle = document.getElementById("orca-plugin-defaults");
  if (defStyle) defStyle.remove();

  var BOOT = __ANYSTL_BOOT_JSON__;
  var AVAILABLE = Object.keys(BOOT.platforms).filter(function(k) {
    if (k === "thingiverse") return BOOT.hasThingiverseToken;
    if (k === "myminifactory") return BOOT.hasMmfKey;
    if (k === "cults3d") return BOOT.hasCults3dCreds;
    return true;
  });

  function loadStorage(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
  function saveStorage(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  var DEFAULT_FILTERS = {
    freeOnly: false,
    hideAI: false,
    mergeDuplicates: true,
    maxPrice: null,
    format: "",
    license: ""
  };

  var state = {
    tab: "search",
    query: "",
    inputQuery: "",
    page: 1,
    loading: false,
    searched: false,
    searchStart: 0,
    searchTime: 0,
    results: [],
    siteStatus: {},
    siteErrors: {},
    featured: [],
    featuredLoading: false,
    featuredLoaded: false,
    enabled: AVAILABLE.filter(function(k) { return BOOT.platforms[k].default_on; }),
    saved: loadStorage("anystl.standalone.saved", []),
    opened: loadStorage("anystl.standalone.opened", []),
    history: loadStorage("anystl.standalone.history", []),
    compare: [],
    compareOpen: false,
    filters: Object.assign({}, DEFAULT_FILTERS),
    sort: "fair",
    columns: 4,
    collapsed: loadStorage("anystl.sidebarCollapsed", false) === true || loadStorage("anystl.sidebarCollapsed", "0") === "1",
    mobileFilterOpen: false,
    preview: null,
    localServerAvailable: false,
    reqId: 0
  };

  var LOGO_SVG = function(size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 64 64" aria-hidden="true" style="flex-shrink:0;">' +
      '<line x1="43" y1="43" x2="57" y2="57" stroke="#FF7A1A" stroke-width="8" stroke-linecap="round"/>' +
      '<circle cx="27" cy="27" r="21" fill="#1F1B18" stroke="#FF7A1A" stroke-width="6"/>' +
      '<polygon points="27,14 38,20.3 38,32.9 27,39.2 16,32.9 16,20.3" fill="none" stroke="#F3EDE7" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<polyline points="16,20.3 27,26.6 38,20.3" fill="none" stroke="#F3EDE7" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<line x1="27" y1="26.6" x2="27" y2="39.2" stroke="#F3EDE7" stroke-width="2.2"/>' +
      '<line x1="16" y1="20.3" x2="38" y2="20.3" stroke="#F3EDE7" stroke-opacity="0.45" stroke-width="1.4"/>' +
      '<line x1="16" y1="20.3" x2="27" y2="39.2" stroke="#F3EDE7" stroke-opacity="0.45" stroke-width="1.4"/>' +
      '<line x1="38" y1="20.3" x2="27" y2="39.2" stroke="#F3EDE7" stroke-opacity="0.45" stroke-width="1.4"/>' +
    '</svg>';
  };

  var ICONS = {
    search: "M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z",
    featured: "M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.3 6.7 19.1l1-5.8L3.5 9.2l5.9-.9L12 3z",
    saved: "M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z",
    opened: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    nozzle: "M9 3h6v5l-3 3-3-3V3zM12 11v10",
    cube: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    compare: "M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h2m6-14h2a2 2 0 012 2v10a2 2 0 01-2 2h-2M12 3v18",
    grid: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
  };

  function svgIcon(path, size, fill, stroke, sw) {
    return '<svg width="' + (size || 16) + '" height="' + (size || 16) + '" fill="' + (fill || "none") + '" stroke="' + (stroke || "currentColor") + '" viewBox="0 0 24 24" aria-hidden="true" style="flex-shrink:0;">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="' + (sw || 2) + '" d="' + path + '"/></svg>';
  }

  function spoolDot(platform, size, muted) {
    var sz = size || 12;
    var info = BOOT.platforms[platform] || { color: "#ff7a1a" };
    var bg = muted ? "#4a413b" : info.color;
    var ring = Math.max(2, Math.round(sz / 3.5));
    return '<span class="spool-dot" aria-hidden="true" style="width:' + sz + 'px;height:' + sz + 'px;background:' + esc(bg) + ';box-shadow:inset 0 0 0 ' + ring + 'px rgba(0,0,0,0.28);"></span>';
  }

  function platformBadge(platform) {
    var info = BOOT.platforms[platform] || { name: platform, color: "#ff7a1a" };
    return '<span class="plat-badge">' + spoolDot(platform, 12, false) + '<span class="plat-badge-name">' + esc(info.name) + '</span></span>';
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function fmtNum(n) {
    if (n == null) return "—";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
    return String(n);
  }
  function postToPython(msg) {
    if (window.orca && typeof window.orca.postMessage === "function") {
      window.orca.postMessage(msg);
      return true;
    }
    return false;
  }

  function classifyLicense(lic) {
    if (!lic) return "unknown";
    var up = String(lic).toUpperCase();
    if (up.indexOf("CC0") !== -1 || up.indexOf("PUBLIC DOMAIN") !== -1) return "commercial";
    if (up.indexOf("CC ") === 0 || up.indexOf("CC-") === 0) {
      if (up.indexOf("NC") !== -1) return "noncommercial";
      if (up.indexOf("ND") !== -1) return "other";
      return "commercial";
    }
    return "other";
  }

  function licensePanelHtml(lic) {
    if (!lic) {
      return '<div class="lic-panel">' +
        '<div class="lic-head"><span>License</span><span class="lic-b">Not stated</span></div>' +
        '<p class="lic-note">Not listed in search metadata. Check the original model page before reusing this model.</p>' +
      '</div>';
    }
    var up = String(lic).toUpperCase();
    var badges = [];
    if (up.indexOf("CC0") !== -1 || up.indexOf("PUBLIC DOMAIN") !== -1) {
      badges.push('<span class="lic-b ok">Commercial OK</span>');
      badges.push('<span class="lic-b ok">Adaptations OK</span>');
      badges.push('<span class="lic-b ok">No attribution required</span>');
    } else if (up.indexOf("CC ") === 0 || up.indexOf("CC-") === 0) {
      var nc = up.indexOf("NC") !== -1;
      var nd = up.indexOf("ND") !== -1;
      var sa = up.indexOf("SA") !== -1;
      badges.push('<span class="lic-b ' + (nc ? "warn" : "ok") + '">' + (nc ? "Non-commercial" : "Commercial use allowed") + '</span>');
      badges.push('<span class="lic-b ' + (nd ? "warn" : "ok") + '">' + (nd ? "No derivatives" : (sa ? "Share-alike" : "Adaptations OK")) + '</span>');
      badges.push('<span class="lic-b">Attribution required</span>');
    }
    return '<div class="lic-panel">' +
      '<div class="lic-head"><span>License</span><span class="chip lic">' + esc(lic) + '</span></div>' +
      (badges.length ? '<div class="lic-badges">' + badges.join("") + '</div>' : "") +
      '<p class="lic-note">Check the original model page for exact reuse conditions.</p>' +
    '</div>';
  }

  function parseQuery(raw) {
    var terms = [], excludes = [];
    String(raw || "").trim().split(/\s+/).forEach(function(tok) {
      if (!tok) return;
      if (tok.length > 1 && tok[0] === "-") excludes.push(tok.slice(1).toLowerCase());
      else terms.push(tok);
    });
    return { search: terms.join(" "), excludes: excludes };
  }

  function parsePriceNumber(price) {
    if (!price) return null;
    if (price === "Free") return 0;
    var m = String(price).match(/[\d]+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  function normalizeTitle(t) {
    return String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function visibleResults() {
    var parsed = parseQuery(state.query);
    var f = state.filters;
    var list = state.results.filter(function(m) {
      if (state.enabled.indexOf(m.platform) === -1) return false;
      if (f.freeOnly && m.price !== "Free") return false;
      if (f.hideAI && m.isAI) return false;
      if (f.maxPrice !== null) {
        var pnum = parsePriceNumber(m.price);
        if (pnum === null || pnum > f.maxPrice) return false;
      }
      if (f.format) {
        var fmts = m.formats || [];
        if (f.format === "unknown") {
          if (fmts.length > 0) return false;
        } else if (fmts.indexOf(f.format) === -1) {
          return false;
        }
      }
      if (f.license) {
        if (classifyLicense(m.license) !== f.license) return false;
      }
      if (parsed.excludes.some(function(w) { return m.title.toLowerCase().indexOf(w) !== -1; })) return false;
      return true;
    });
    if (f.mergeDuplicates) {
      var byKey = Object.create(null);
      var merged = [];
      list.forEach(function(m) {
        var key = normalizeTitle(m.title);
        if (!key || key.length < 4) { merged.push(m); return; }
        if (!byKey[key]) {
          var copy = Object.assign({}, m, { alternates: [] });
          byKey[key] = copy;
          merged.push(copy);
        } else if (byKey[key].platform !== m.platform) {
          byKey[key].alternates.push(m);
        }
      });
      list = merged;
    }
    if (state.sort === "likes-desc") {
      list.sort(function(a, b) { return (b.likes || 0) - (a.likes || 0); });
    } else if (state.sort === "likes-asc") {
      list.sort(function(a, b) { return (a.likes || 0) - (b.likes || 0); });
    } else if (state.sort === "downloads-desc") {
      list.sort(function(a, b) { return (b.downloads || 0) - (a.downloads || 0); });
    } else if (state.sort === "downloads-asc") {
      list.sort(function(a, b) { return (a.downloads || 0) - (b.downloads || 0); });
    } else {
      var buckets = Object.create(null);
      list.forEach(function(m) { (buckets[m.platform] = buckets[m.platform] || []).push(m); });
      var keys = Object.keys(buckets);
      var fair = [], idx = 0, added = true;
      while (added) {
        added = false;
        for (var i = 0; i < keys.length; i++) {
          var arr = buckets[keys[i]];
          if (idx < arr.length) { fair.push(arr[idx]); added = true; }
        }
        idx++;
      }
      list = fair;
    }
    return list;
  }

  function persistSaved() {
    saveStorage("anystl.standalone.saved", state.saved);
    postToPython({ type: "save_saved", items: state.saved });
  }
  function isSaved(url) { return state.saved.some(function(m) { return m.url === url; }); }
  function toggleSaved(model) {
    if (!model) return;
    if (isSaved(model.url)) state.saved = state.saved.filter(function(m) { return m.url !== model.url; });
    else state.saved = [model].concat(state.saved);
    persistSaved();
    render();
  }
  function isOpened(url) { return state.opened.some(function(m) { return m.url === url; }); }
  function recordOpened(model) {
    if (!model || !model.url) return;
    state.opened = [model].concat(state.opened.filter(function(m) { return m.url !== model.url; })).slice(0, 60);
    saveStorage("anystl.standalone.opened", state.opened);
  }
  function addHistory(q) {
    var trimmed = String(q || "").trim();
    if (!trimmed) return;
    state.history = [trimmed].concat(state.history.filter(function(x) { return x.toLowerCase() !== trimmed.toLowerCase(); })).slice(0, 8);
    saveStorage("anystl.standalone.history", state.history);
  }
  function isCompared(url) { return state.compare.some(function(m) { return m.url === url; }); }
  function toggleCompare(model) {
    if (!model) return;
    if (isCompared(model.url)) {
      state.compare = state.compare.filter(function(m) { return m.url !== model.url; });
      if (state.compare.length < 2) state.compareOpen = false;
    } else if (state.compare.length < 3) {
      state.compare = state.compare.concat([model]);
    }
    render();
  }

  function openExternal(url, model) {
    if (model) recordOpened(model);
    if (!postToPython({ type: "open_external", url: url })) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    if (model) render();
  }

  function copyText(text, btnEl, inputId) {
    var done = function() {
      if (btnEl) btnEl.textContent = "Copied!";
    };
    var fallback = function() {
      var inp = inputId ? document.getElementById(inputId) : null;
      if (inp) {
        inp.focus();
        inp.select();
        if (btnEl) btnEl.textContent = "Press Ctrl+C";
        return;
      }
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
  }

  function runSearch(raw, page, onlyPlatforms) {
    var parsed = parseQuery(raw);
    if (!parsed.search) return;
    var targets = onlyPlatforms && onlyPlatforms.length ? onlyPlatforms : state.enabled;
    state.tab = "search";
    state.query = raw;
    state.inputQuery = raw;
    state.page = page || 1;
    state.loading = true;
    state.searched = true;
    state.searchStart = Date.now();
    addHistory(raw);
    if (state.page === 1 && !onlyPlatforms) {
      state.results = [];
      state.siteStatus = {};
      state.siteErrors = {};
    }
    targets.forEach(function(p) {
      state.siteStatus[p] = "loading";
      delete state.siteErrors[p];
    });
    state.reqId += 1;
    render();
    postToPython({
      type: "search",
      reqId: state.reqId,
      query: parsed.search,
      page: state.page,
      platforms: targets
    });
  }

  function loadFeatured(force) {
    if (state.featuredLoading) return;
    if (state.featuredLoaded && !force) return;
    state.featuredLoading = true;
    render();
    postToPython({ type: "featured", force: !!force });
  }

  function navLinksHtml(vertical, compact) {
    var tabs = [
      { id: "search", label: "Search", icon: ICONS.search },
      { id: "featured", label: "Featured", icon: ICONS.featured },
      { id: "saved", label: "Saved", icon: ICONS.saved, count: state.saved.length, accent: true },
      { id: "opened", label: "Opened", icon: ICONS.opened, count: state.opened.length, accent: false }
    ];
    return '<nav class="nav ' + (vertical ? "vertical" : "") + '">' + tabs.map(function(t) {
      var active = state.tab === t.id;
      var inner = compact
        ? svgIcon(t.icon, 20, "none", "currentColor", 1.8)
        : '<span>' + esc(t.label) + '</span>' +
          (t.count ? '<span class="nav-count ' + (t.accent ? "accent" : "") + '">' + t.count + '</span>' : "");
      return '<button type="button" class="nav-item ' + (active ? "active" : "") + '" data-tab="' + t.id + '"' +
        (compact ? ' title="' + esc(t.label) + '"' : "") +
        (active ? ' aria-current="page"' : "") + '>' + inner + '</button>';
    }).join("") + '</nav>';
  }

  function sourceFilterHtml() {
    var counts = Object.create(null);
    state.results.forEach(function(m) { counts[m.platform] = (counts[m.platform] || 0) + 1; });
    var presets = [
      { id: "all", label: "All", match: function() { return true; } },
      { id: "print", label: "3D Printing", match: function(p) { var g = BOOT.platforms[p].group; return g === "community" || g === "brand"; } },
      { id: "cad", label: "CAD", match: function(p) { return BOOT.platforms[p].group === "cad"; } },
      { id: "assets", label: "3D Assets", match: function(p) { return BOOT.platforms[p].group === "general"; } }
    ];
    var presetBtns = presets.map(function(pr) {
      var targets = AVAILABLE.filter(pr.match);
      if (!targets.length) return "";
      var active = state.enabled.length === targets.length && targets.every(function(p) { return state.enabled.indexOf(p) !== -1; });
      return '<button type="button" class="preset-btn ' + (active ? "active" : "") + '" data-preset="' + pr.id + '" aria-pressed="' + (active ? "true" : "false") + '">' + esc(pr.label) + '</button>';
    }).join("");

    var groupsHtml = BOOT.groups.map(function(g) {
      var sites = AVAILABLE.filter(function(p) { return BOOT.platforms[p].group === g.id; });
      if (!sites.length) return "";
      var onCount = sites.filter(function(p) { return state.enabled.indexOf(p) !== -1; }).length;
      var st = onCount === 0 ? "off" : (onCount === sites.length ? "on" : "some");
      var checkInner = st === "on"
        ? '<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3.5" d="M5 13l4 4L19 7"/></svg>'
        : (st === "some" ? '<span class="chk-dash"></span>' : "");
      var pills = sites.map(function(p) {
        var active = state.enabled.indexOf(p) !== -1;
        var pSt = state.siteStatus[p];
        var indicator = "";
        if (active && state.tab === "search" && state.searched) {
          if (pSt === "loading") indicator = '<span class="dot-pending" title="Searching…"></span>';
          else if (pSt === "error") indicator = '<span class="dot-err" title="' + esc(state.siteErrors[p] || "Failed") + '">!</span>';
          else if (pSt === "ok") indicator = '<span class="dot-cnt">' + (counts[p] || 0) + '</span>';
        }
        return '<button type="button" class="site-pill ' + (active ? "" : "off") + '" data-site="' + esc(p) + '" aria-pressed="' + (active ? "true" : "false") + '">' +
          spoolDot(p, 13, !active) + esc(BOOT.platforms[p].name) + indicator + '</button>';
      }).join("");

      return '<div class="group">' +
        '<button type="button" class="group-btn" data-group="' + esc(g.id) + '" title="' + esc(g.description) + '">' +
          '<span class="chk ' + st + '">' + checkInner + '</span>' +
          '<span><span class="group-name ' + (st === "off" ? "off" : "") + '">' + esc(g.name) + '</span>' +
          '<span class="group-desc">' + esc(g.description) + '</span></span>' +
        '</button>' +
        '<div class="group-sites">' + pills + '</div>' +
      '</div>';
    }).join("");

    return '<div class="spools">' +
      '<div class="spools-head">' +
        '<p>Spools · <strong>' + state.enabled.length + '</strong> of ' + AVAILABLE.length + ' loaded</p>' +
        (state.enabled.length !== AVAILABLE.length ? '<button type="button" class="link-accent" data-preset="all">Select all</button>' : "") +
      '</div>' +
      '<div class="presets" role="group" aria-label="Source presets">' + presetBtns + '</div>' +
      groupsHtml +
    '</div>';
  }

  function renderSidebar() {
    var showFilter = state.tab === "search" || state.tab === "featured";
    var aside = document.getElementById("sidebar");
    aside.className = "sidebar" + (state.collapsed ? " collapsed" : "");
    var collapsePath = state.collapsed ? "M13 5l7 7-7 7M5 5l7 7-7 7" : "M11 19l-7-7 7-7M19 19l-7-7 7-7";
    aside.innerHTML =
      '<div class="side-top">' +
        '<button type="button" class="logo-btn" id="logoHome" aria-label="AnyStl home">' +
          LOGO_SVG(state.collapsed ? 32 : 38) +
          (state.collapsed ? "" : '<span class="logo-text">AnyStl</span>') +
        '</button>' +
        '<button type="button" class="icon-btn" id="collapseBtn" aria-label="' + (state.collapsed ? "Expand sidebar" : "Collapse sidebar") + '" title="' + (state.collapsed ? "Expand sidebar" : "Collapse sidebar for a wider grid") + '">' +
          svgIcon(collapsePath, 16, "none", "currentColor", 2) +
        '</button>' +
      '</div>' +
      '<div style="width:100%;">' + navLinksHtml(true, state.collapsed) + '</div>' +
      (showFilter && !state.collapsed ? '<div class="divider"></div>' + sourceFilterHtml() : "") +
      (showFilter && state.collapsed
        ? '<button type="button" class="collapsed-count" id="expandFromCount" title="Show sites (' + state.enabled.length + '/' + AVAILABLE.length + ' active)"><span style="color:var(--accent-soft);">' + state.enabled.length + '</span><span>/' + AVAILABLE.length + '</span></button>'
        : "") +
      (!state.collapsed && state.localServerAvailable && BOOT.localOrigin && BOOT.mode !== "standalone"
        ? '<div class="server-banner"><span>Local AnyStl server detected</span><button type="button" class="link-accent" id="switchServerBtn" style="text-align:left;">Switch to local server ↗</button></div>'
        : "");

    var mhead = document.getElementById("mobileHead");
    mhead.innerHTML =
      '<div class="mobile-head-top">' +
        '<button type="button" class="logo-btn" id="logoHomeMobile" aria-label="AnyStl home">' + LOGO_SVG(34) + '<span class="logo-text">AnyStl</span></button>' +
        (showFilter
          ? '<button type="button" class="mobile-sites-btn ' + (state.mobileFilterOpen ? "open" : "") + '" id="mobileFilterBtn">Sites <span class="mono" style="font-size:11px;opacity:0.8;">' + state.enabled.length + '/' + AVAILABLE.length + '</span></button>'
          : "") +
      '</div>' +
      '<div class="mobile-nav-wrap">' + navLinksHtml(false, false) + '</div>' +
      (showFilter && state.mobileFilterOpen ? '<div class="mobile-drawer">' + sourceFilterHtml() + '</div>' : "");
  }

  function filterBarHtml(excludes) {
    var f = state.filters;
    var activeCount =
      (f.freeOnly ? 1 : 0) +
      (f.hideAI ? 1 : 0) +
      (!f.mergeDuplicates ? 1 : 0) +
      (f.maxPrice !== null ? 1 : 0) +
      (f.format ? 1 : 0) +
      (f.license ? 1 : 0);
    var formats = ["STL", "3MF", "STEP", "OBJ", "AMF", "SCAD", "F3D", "BLEND", "GLB", "GLTF", "USDZ", "SKP"];
    return '<div class="filter-bar">' +
      '<button type="button" class="ftoggle ' + (f.freeOnly ? "on" : "") + '" id="fFree" aria-pressed="' + (f.freeOnly ? "true" : "false") + '">Free only</button>' +
      '<button type="button" class="ftoggle ' + (f.hideAI ? "on" : "") + '" id="fHideAi" aria-pressed="' + (f.hideAI ? "true" : "false") + '">Hide AI</button>' +
      '<button type="button" class="ftoggle ' + (f.mergeDuplicates ? "on" : "") + '" id="fMerge" aria-pressed="' + (f.mergeDuplicates ? "true" : "false") + '">Merge duplicates</button>' +
      '<label class="fgroup ' + (f.maxPrice !== null ? "on" : "") + '">Max $' +
        '<input id="maxPriceInput" inputmode="decimal" placeholder="any" value="' + (f.maxPrice !== null ? esc(String(f.maxPrice)) : "") + '">' +
      '</label>' +
      '<label class="fgroup ' + (f.format ? "on" : "") + '">Format' +
        '<select id="formatSelect" aria-label="Filter by format">' +
          '<option value="">Any</option>' +
          formats.map(function(fmt) { return '<option value="' + fmt + '"' + (f.format === fmt ? " selected" : "") + '>' + fmt + '</option>'; }).join("") +
          '<option value="unknown"' + (f.format === "unknown" ? " selected" : "") + '>Unknown</option>' +
        '</select>' +
      '</label>' +
      '<label class="fgroup ' + (f.license ? "on" : "") + '">License' +
        '<select id="licenseSelect" aria-label="Filter by license">' +
          '<option value="">Any</option>' +
          '<option value="commercial"' + (f.license === "commercial" ? " selected" : "") + '>Commercial reuse (CC)</option>' +
          '<option value="noncommercial"' + (f.license === "noncommercial" ? " selected" : "") + '>Noncommercial (CC)</option>' +
          '<option value="unknown"' + (f.license === "unknown" ? " selected" : "") + '>Not stated</option>' +
        '</select>' +
      '</label>' +
      (activeCount > 0 ? '<button type="button" class="clear-filters" id="clearFiltersBtn">Clear (' + activeCount + ')</button>' : "") +
      (excludes && excludes.length ? '<span class="excludes-note">without ' + excludes.map(function(w) { return "“" + esc(w) + "”"; }).join(", ") + '</span>' : "") +
    '</div>';
  }

  function cardHtml(m, idx) {
    var info = BOOT.platforms[m.platform] || { name: m.platform, color: "#ff7a1a" };
    var saved = isSaved(m.url);
    var cmp = isCompared(m.url);
    var cmpFull = !cmp && state.compare.length >= 3;
    var chips = [];
    if (m.license) chips.push('<span class="chip lic">' + esc(m.license) + '</span>');
    (m.formats || []).slice(0, 4).forEach(function(f) { chips.push('<span class="chip">' + esc(f) + '</span>'); });

    var altPill = "";
    if (m.alternates && m.alternates.length) {
      var dots = m.alternates.slice(0, 3).map(function(a) { return spoolDot(a.platform, 10, false); }).join("");
      altPill = '<span class="alt-pill">' + dots + '+' + m.alternates.length + ' ' + (m.alternates.length === 1 ? "site" : "sites") + '</span>';
    }

    var fallbackSvg = svgIcon(ICONS.cube, 56, "none", info.color, 1.2);
    return '<article class="card" data-idx="' + idx + '">' +
      '<div class="card-link" data-preview="' + idx + '">' +
        '<div class="thumb-well">' +
          (m.thumbnail
            ? '<img src="' + esc(m.thumbnail) + '" alt="' + esc(m.title) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';">'
            : fallbackSvg) +
          '<div class="badge-tl">' + platformBadge(m.platform) + '</div>' +
          '<div class="badges-bl">' +
            (m.isAI ? '<span class="mini-tag ai">AI</span>' : "") +
            (isOpened(m.url) ? '<span class="mini-tag opened">Opened</span>' : "") +
          '</div>' +
          altPill +
        '</div>' +
        '<div class="filament-strip" style="background:' + esc(info.color) + '"></div>' +
        '<div class="card-body">' +
          '<h3 class="card-title">' + esc(m.title) + '</h3>' +
          (chips.length ? '<div class="chip-row">' + chips.join("") + '</div>' : "") +
          '<div class="card-meta">' +
            '<span title="Likes">♥ ' + fmtNum(m.likes) + '</span>' +
            '<span title="Downloads">↓ ' + fmtNum(m.downloads) + '</span>' +
            (m.price ? '<span class="price-tag ' + (m.price === "Free" ? "free" : "paid") + '">' + esc(m.price) + '</span>' : "") +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="card-actions">' +
        '<button type="button" class="cact ' + (saved ? "on" : "") + '" data-save="' + idx + '" aria-label="' + (saved ? "Remove from saved" : "Save model") + '">' +
          svgIcon(ICONS.saved, 14, saved ? "currentColor" : "none") + '<span>' + (saved ? "Saved" : "Save") + '</span>' +
        '</button>' +
        '<button type="button" class="cact ' + (cmp ? "on" : "") + '" data-cmp="' + idx + '" ' + (cmpFull ? "disabled" : "") + ' aria-label="Compare: ' + esc(m.title) + '">' +
          svgIcon(ICONS.compare, 14) + '<span>' + (cmp ? "Comparing" : "Compare") + '</span>' +
        '</button>' +
        '<button type="button" class="cact" data-ext-idx="' + idx + '" aria-label="Open on ' + esc(info.name) + ': ' + esc(m.title) + '">' +
          '<span>Open ↗</span>' +
        '</button>' +
      '</div>' +
    '</article>';
  }

  var activeList = [];

  function renderTray() {
    var root = document.getElementById("trayRoot");
    if (!state.compare.length) { root.innerHTML = ""; return; }
    root.innerHTML = '<div class="cmp-tray">' +
      '<span role="status" style="color:var(--muted);">' + state.compare.length + '/3 selected' + (state.compare.length === 1 ? " · Pick one more to compare" : "") + '</span>' +
      '<button type="button" class="cmp-clear" id="clearCmpBtn">Clear comparison</button>' +
      '<button type="button" class="cmp-tray-btn" id="openCmpBtn"' + (state.compare.length < 2 ? " disabled" : "") + '>Compare (' + state.compare.length + ')</button>' +
    '</div>';
  }

  function renderModal() {
    var root = document.getElementById("modalRoot");
    if (state.compareOpen && state.compare.length) {
      var cols = state.compare;
      var rows = [
        ["Photo", function(m) { return '<div class="cmp-photo">' + (m.thumbnail ? '<img src="' + esc(m.thumbnail) + '" alt="" referrerpolicy="no-referrer">' : "No photo") + '</div>'; }],
        ["Source", function(m) { return esc((BOOT.platforms[m.platform] || { name: m.platform }).name); }],
        ["Formats", function(m) { return esc((m.formats || []).join(", ") || "Not listed"); }],
        ["License", function(m) { return esc(m.license || "Not listed"); }],
        ["Price", function(m) { return esc(m.price || "Not listed"); }],
        ["Stats", function(m) { return '<span class="mono" style="font-size:12px;">♥ ' + fmtNum(m.likes) + ' · ↓ ' + fmtNum(m.downloads) + '</span>'; }],
        ["Link", function(m, i) {
          var info = BOOT.platforms[m.platform] || { name: m.platform };
          return '<button type="button" class="link-accent" data-cmp-open="' + i + '">Open on ' + esc(info.name) + ' ↗</button>';
        }]
      ];
      root.innerHTML = '<div class="modal-backdrop" id="modalBg"><div class="dialog-box" role="dialog" aria-modal="true" aria-label="Compare models">' +
        '<div class="dialog-head"><h2>Compare models</h2><button type="button" class="icon-btn" id="closeModal" aria-label="Close" style="font-size:22px;">×</button></div>' +
        '<div style="overflow-x:auto;"><table class="cmp-table"><thead><tr><th scope="col" style="color:var(--muted);font-weight:500;">Model</th>' +
          cols.map(function(m, i) {
            return '<th scope="col">' + esc(m.title) + '<button type="button" style="display:block;margin-top:4px;font-size:12px;font-weight:400;color:var(--muted);" data-cmp-rm="' + i + '">Remove</button></th>';
          }).join("") +
        '</tr></thead><tbody>' +
          rows.map(function(r) {
            return '<tr><th scope="row">' + r[0] + '</th>' + cols.map(function(m, i) { return '<td>' + r[1](m, i) + '</td>'; }).join("") + '</tr>';
          }).join("") +
        '</tbody></table></div>' +
      '</div></div>';
      return;
    }

    var m = state.preview;
    if (!m) { root.innerHTML = ""; return; }
    var info = BOOT.platforms[m.platform] || { name: m.platform, color: "#ff7a1a" };
    var saved = isSaved(m.url);
    var alsoHtml = "";
    if (m.alternates && m.alternates.length) {
      alsoHtml = '<div class="also-list"><span class="mono" style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--dim);">Also on</span>' +
        m.alternates.map(function(a, i) {
          var aInfo = BOOT.platforms[a.platform] || { name: a.platform };
          return '<button type="button" class="also-item" data-alt-open="' + i + '">' +
            spoolDot(a.platform, 12, false) +
            '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(aInfo.name) + '</span>' +
            '<span class="mono" style="font-size:12px;color:var(--muted);">♥ ' + fmtNum(a.likes) + '</span>' +
          '</button>';
        }).join("") + '</div>';
    }

    root.innerHTML = '<div class="modal-backdrop" id="modalBg"><div class="preview-card" role="dialog" aria-modal="true" aria-label="' + esc(m.title) + '">' +
      '<div class="preview-media">' +
        '<div class="preview-img-box">' +
          (m.thumbnail ? '<img src="' + esc(m.thumbnail) + '" alt="' + esc(m.title) + '" referrerpolicy="no-referrer">' : '<span style="font-size:14px;color:var(--dim);">No image</span>') +
        '</div>' +
      '</div>' +
      '<div class="preview-info">' +
        '<div class="preview-top">' + platformBadge(m.platform) +
          '<button type="button" class="icon-btn" id="closeModal" aria-label="Close preview" style="font-size:22px;">×</button>' +
        '</div>' +
        '<div><h2 class="preview-title">' + esc(m.title) + '</h2></div>' +
        '<div class="preview-stats">' +
          '<span title="Likes">♥ ' + fmtNum(m.likes) + '</span>' +
          '<span title="Downloads">↓ ' + fmtNum(m.downloads) + '</span>' +
          (m.price ? '<span class="price-tag ' + (m.price === "Free" ? "free" : "paid") + '" style="margin-left:0;">' + esc(m.price) + '</span>' : "") +
          (m.isAI ? '<span class="chip" style="color:var(--ai);">AI</span>' : "") +
        '</div>' +
        licensePanelHtml(m.license) +
        '<dl class="files-dl"><dt>Files</dt><dd>' +
          (m.formats && m.formats.length
            ? m.formats.map(function(f) { return '<span class="chip" style="color:var(--text);">' + esc(f) + '</span>'; }).join("")
            : '<span style="color:var(--muted);">Not listed</span>') +
        '</dd></dl>' +
        alsoHtml +
        '<div class="primary-row">' +
          '<button type="button" class="primary-cta" id="modalOpen">Open on ' + esc(info.name) + ' ↗</button>' +
          '<button type="button" class="save-sq ' + (saved ? "on" : "") + '" id="modalSave" aria-label="' + (saved ? "Remove from saved" : "Save model") + '">' +
            svgIcon(ICONS.saved, 18, saved ? "currentColor" : "none") +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div></div>';
  }

  function renderMain() {
    var main = document.getElementById("main");
    var gridCls = "grid cols-" + state.columns;
    var footer = '<footer class="footer">AnyStl · 3D model meta-search · standalone OrcaSlicer mode · not affiliated with any of the searched sites</footer>';

    if (state.tab === "featured") {
      activeList = [];
      var body = "";
      if (state.featuredLoading && !state.featured.length) {
        body = '<div class="center-box" role="status">' + LOGO_SVG(72) + '<p>Loading trending models…</p></div>';
      } else if (!state.featured.length) {
        body = '<div class="center-box"><p>Could not load featured models right now.</p><button type="button" class="load-more-btn" id="refreshFeatured">Retry</button></div>';
      } else {
        body = state.featured.map(function(sec) {
          if (!sec.results || !sec.results.length || state.enabled.indexOf(sec.platform) === -1) return "";
          var info = BOOT.platforms[sec.platform] || { name: sec.platform };
          var startIdx = activeList.length;
          sec.results.forEach(function(m) { activeList.push(m); });
          return '<section><div class="sec-head"><h2>' + spoolDot(sec.platform, 14, false) + esc(info.name) + '</h2><span>' + esc(sec.subtitle || "") + '</span></div>' +
            '<div class="' + gridCls + '">' + sec.results.map(function(m, i) { return cardHtml(m, startIdx + i); }).join("") + '</div></section>';
        }).join("") || '<div class="center-box"><p>Enable Printables, MakerWorld, Makeronline or Sketchfab in the spools on the left to see featured models.</p></div>';
      }
      main.innerHTML =
        '<div class="page-head"><div><h1>Featured</h1><p class="page-sub">Trending, popular and staff-picked models from supported libraries.</p></div>' +
          '<button type="button" class="load-more-btn" style="height:36px;padding:0 16px;font-size:13px;" id="refreshFeatured">Refresh</button>' +
        '</div>' + body + footer;
      return;
    }

    if (state.tab === "saved") {
      activeList = state.saved;
      var savedBody = activeList.length
        ? '<div class="' + gridCls + '">' + activeList.map(cardHtml).join("") + '</div>'
        : '<div class="center-box"><h1>No saved models yet</h1><p>Click Save on any model card to keep it here across restarts.</p></div>';
      main.innerHTML =
        '<div class="page-head"><div><h1>Saved</h1><p class="page-sub">' + activeList.length + ' bookmarked model' + (activeList.length === 1 ? "" : "s") + '</p></div>' +
          (activeList.length ? '<button type="button" class="load-more-btn" style="height:36px;padding:0 16px;font-size:13px;" id="exportSavedBtn">Copy backup JSON</button>' : "") +
        '</div>' + savedBody + footer;
      return;
    }

    if (state.tab === "opened") {
      activeList = state.opened;
      var openedBody = activeList.length
        ? '<div class="' + gridCls + '">' + activeList.map(cardHtml).join("") + '</div>'
        : '<div class="center-box"><h1>No opened models yet</h1><p>Models you open in your browser appear here.</p></div>';
      main.innerHTML =
        '<div class="page-head"><div><h1>Opened</h1><p class="page-sub">Recently opened on their source sites</p></div>' +
          (activeList.length ? '<button type="button" class="load-more-btn" style="height:36px;padding:0 16px;font-size:13px;" id="clearOpenedBtn">Clear history</button>' : "") +
        '</div>' + openedBody + footer;
      return;
    }

    // Search tab
    var parsed = parseQuery(state.query);
    var siteKeys = Object.keys(state.siteStatus);
    var totalSources = siteKeys.length;
    var pendingCount = siteKeys.filter(function(k) { return state.siteStatus[k] === "loading"; }).length;
    var answeredCount = totalSources - pendingCount;
    var progressPct = totalSources > 0 ? Math.max(8, Math.round((answeredCount / totalSources) * 100)) : 8;
    activeList = state.results.length ? visibleResults() : [];

    var searchBarHtml =
      '<form class="search-bar" id="searchForm" role="search">' +
        svgIcon(ICONS.nozzle, 20, "none", "#ff7a1a", 2) +
        '<label for="searchInput" class="sr-only">Search 3D models</label>' +
        '<input id="searchInput" class="search-input" type="search" value="' + esc(state.inputQuery) + '" placeholder=\'Search 3D models, e.g. "benchy", "phone stand", "articulated dragon"\'>' +
        (!state.inputQuery ? '<kbd class="kbd-hint" title="Press / to focus search">/</kbd>' : "") +
        (state.inputQuery && !state.loading ? '<button type="button" class="clear-btn" id="clearSearchBtn" aria-label="Clear search" title="Clear search">×</button>' : "") +
        '<button type="submit" id="searchBtn" class="search-submit ' + (state.loading ? "busy" : "") + '"' + (state.loading || !state.inputQuery.trim() ? " disabled" : "") + '>' +
          (state.loading ? "Searching" : "Search") +
        '</button>' +
      '</form>';

    var summaryHtml = "";
    if (state.results.length > 0) {
      summaryHtml =
        '<div style="display:flex;flex-direction:column;gap:10px;padding-bottom:4px;">' +
          '<div class="summary-row">' +
            '<p class="summary-text"><strong>' + activeList.length + ' models</strong>' +
              (state.loading
                ? ' <span class="mono" style="font-size:12px;margin-left:6px;">' + answeredCount + '/' + totalSources + ' sites</span>'
                : ' · ' + state.searchTime.toFixed(1) + ' s') +
            '</p>' +
            '<span class="spacer"></span>' +
            '<label class="sort-label">Sort <span class="select-wrap">' +
              '<select id="sortSelect" class="sort-select" aria-label="Sort results">' +
                '<option value="fair"' + (state.sort === "fair" ? " selected" : "") + '>Best of each site</option>' +
                '<option value="likes-desc"' + (state.sort === "likes-desc" ? " selected" : "") + '>Most liked</option>' +
                '<option value="likes-asc"' + (state.sort === "likes-asc" ? " selected" : "") + '>Least liked</option>' +
                '<option value="downloads-desc"' + (state.sort === "downloads-desc" ? " selected" : "") + '>Most downloaded</option>' +
                '<option value="downloads-asc"' + (state.sort === "downloads-asc" ? " selected" : "") + '>Least downloaded</option>' +
              '</select>' +
              '<svg class="select-caret" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>' +
            '</span></label>' +
            '<label class="col-slider" title="Columns">' +
              svgIcon(ICONS.grid, 16) +
              '<input id="colSlider" type="range" min="2" max="6" step="1" value="' + state.columns + '" aria-label="Columns">' +
              '<span class="mono" style="font-size:12px;width:12px;text-align:center;">' + state.columns + '</span>' +
            '</label>' +
          '</div>' +
          filterBarHtml(parsed.excludes) +
        '</div>';
    }

    var headHtml =
      '<div class="search-head ' + (state.searched || state.results.length ? "sticky" : "") + '">' +
        searchBarHtml + summaryHtml +
        (state.loading && totalSources > 0 ? '<div class="progress-track"><div class="progress-fill" style="width:' + progressPct + '%"></div></div>' : "") +
      '</div>';

    var bodyHtml = "";
    if (!state.searched && !state.loading) {
      var suggestions = ["benchy", "articulated dragon", "gridfinity", "phone stand", "cable clip"];
      var histHtml = state.history.length
        ? '<div class="try-row"><span class="try-label">Recent</span>' +
            state.history.map(function(h) { return '<button type="button" class="try-pill" data-suggest="' + esc(h) + '">' + esc(h) + '</button>'; }).join("") +
            '<button type="button" class="clear-filters" id="clearHistBtn">Clear</button></div>'
        : "";
      bodyHtml =
        '<section class="hero">' +
          '<div>' +
            '<h1>What are you printing today?</h1>' +
            '<p class="hero-sub">One search across ' + AVAILABLE.length + ' model sites: printing communities, printer-brand libraries, CAD collections and Blender / 3D asset stores. Pick which ones to load from the spools on the left. Add <span class="mono" style="color:var(--text);">-word</span> to leave out results containing a word.</p>' +
          '</div>' +
          '<div class="try-row"><span class="try-label">Try</span>' +
            suggestions.map(function(s) { return '<button type="button" class="try-pill" data-suggest="' + esc(s) + '">' + esc(s) + '</button>'; }).join("") +
          '</div>' +
          histHtml +
          filterBarHtml(parsed.excludes) +
        '</section>';
    } else if (state.loading && state.results.length === 0) {
      bodyHtml = '<div class="center-box" role="status">' + LOGO_SVG(84) +
        '<p style="font-size:14px;">Searching ' + (state.enabled.length === AVAILABLE.length ? "all" : state.enabled.length) + ' sites…' +
        (answeredCount > 0 ? ' <span class="mono" style="font-size:12px;color:var(--dim);">' + answeredCount + ' answered</span>' : "") +
        '</p></div>';
    } else {
      var qEnc = encodeURIComponent(parsed.search);
      var extBar = '<div class="ext-bar"><span>Also search on</span>' +
        BOOT.externalLinks.map(function(pair) {
          var href = pair[1].replace("{q}", qEnc)
            .replace("{q_plus}", qEnc.replace(/%20/g, "+"))
            .replace("{q_dash}", encodeURIComponent(parsed.search.replace(/\s+/g, "-")));
          return '<button type="button" class="ext-link" data-ext="' + esc(href) + '">' + esc(pair[0]) + ' ↗</button>';
        }).join("") + '</div>';

      if (state.results.length === 0) {
        bodyHtml = '<div class="center-box">' + filterBarHtml(parsed.excludes) + '<p>No results found. Try a different search term.</p>' + extBar + '</div>';
      } else if (activeList.length === 0) {
        bodyHtml = (!state.loading ? extBar : "") + '<div class="center-box"><p>All ' + state.results.length + ' results are hidden by the filters above.</p></div>';
      } else {
        bodyHtml = (!state.loading ? extBar : "") +
          '<div class="' + gridCls + '">' + activeList.map(cardHtml).join("") + '</div>' +
          '<div class="load-more-wrap"><button type="button" class="load-more-btn" id="loadMoreBtn"' + (state.loading ? " disabled" : "") + '>' +
            (state.loading ? "Loading…" : "Load more") +
          '</button></div>';
      }
    }

    var focusedId = document.activeElement && document.activeElement.id;
    var selStart = (focusedId === "searchInput" || focusedId === "maxPriceInput") ? document.activeElement.selectionStart : null;
    main.innerHTML = headHtml + bodyHtml + footer;
    if (focusedId && (focusedId === "searchInput" || focusedId === "maxPriceInput")) {
      var restored = document.getElementById(focusedId);
      if (restored) {
        restored.focus();
        if (selStart !== null) {
          try { restored.setSelectionRange(selStart, selStart); } catch (e) {}
        }
      }
    }
  }

  function render() {
    renderSidebar();
    renderMain();
    renderTray();
    renderModal();
  }

  document.addEventListener("submit", function(e) {
    if (e.target && e.target.id === "searchForm") {
      e.preventDefault();
      var inp = document.getElementById("searchInput");
      if (inp) runSearch(inp.value, 1);
    }
  });

  document.addEventListener("input", function(e) {
    var t = e.target;
    if (!t) return;
    if (t.id === "searchInput") {
      state.inputQuery = t.value;
      var btn = document.getElementById("searchBtn");
      if (btn && !state.loading) btn.disabled = !t.value.trim();
      return;
    }
    if (t.id === "maxPriceInput") {
      var cleaned = t.value.replace(/[^\d.]/g, "");
      if (cleaned !== t.value) t.value = cleaned;
      var n = parseFloat(cleaned);
      state.filters.maxPrice = (cleaned === "" || isNaN(n)) ? null : n;
      render();
      return;
    }
    if (t.id === "colSlider") {
      state.columns = Number(t.value) || 4;
      renderMain();
    }
  });

  document.addEventListener("change", function(e) {
    var t = e.target;
    if (!t) return;
    if (t.id === "sortSelect") { state.sort = t.value; render(); return; }
    if (t.id === "formatSelect") { state.filters.format = t.value; render(); return; }
    if (t.id === "licenseSelect") { state.filters.license = t.value; render(); return; }
  });

  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape") {
      if (state.compareOpen) { state.compareOpen = false; renderModal(); return; }
      if (state.preview) { state.preview = null; state.previewShowUrl = false; renderModal(); return; }
    }
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (state.preview || state.compareOpen) return;
      var inp = document.getElementById("searchInput");
      if (inp) { e.preventDefault(); inp.focus(); inp.select(); }
    }
  });

  document.addEventListener("click", function(e) {
    var el = e.target.closest("[data-tab],[data-site],[data-group],[data-preset],[data-suggest],[data-save],[data-cmp],[data-preview],[data-ext],[data-ext-idx],[data-cmp-rm],[data-cmp-open],[data-alt-open],#logoHome,#logoHomeMobile,#collapseBtn,#expandFromCount,#mobileFilterBtn,#switchServerBtn,#clearSearchBtn,#fFree,#fHideAi,#fMerge,#clearFiltersBtn,#clearHistBtn,#loadMoreBtn,#refreshFeatured,#exportSavedBtn,#clearOpenedBtn,#clearCmpBtn,#openCmpBtn,#closeModal,#modalBg,#modalSave,#modalOpen");
    if (!el) return;
    if (el.id === "modalBg" && e.target !== el) return;
    if (el.id === "closeModal" || el.id === "modalBg") {
      state.preview = null;
      state.compareOpen = false;
      renderModal();
      return;
    }
    if (el.id === "logoHome" || el.id === "logoHomeMobile") {
      state.tab = "search";
      state.searched = false;
      state.results = [];
      state.query = "";
      state.inputQuery = "";
      render();
      return;
    }
    if (el.id === "collapseBtn" || el.id === "expandFromCount") {
      state.collapsed = !state.collapsed;
      saveStorage("anystl.sidebarCollapsed", state.collapsed ? "1" : "0");
      renderSidebar();
      return;
    }
    if (el.id === "mobileFilterBtn") { state.mobileFilterOpen = !state.mobileFilterOpen; renderSidebar(); return; }
    if (el.id === "switchServerBtn" && BOOT.localOrigin) { window.location.replace(BOOT.localOrigin + "/"); return; }
    if (el.id === "clearSearchBtn") {
      state.inputQuery = "";
      renderMain();
      var inp = document.getElementById("searchInput");
      if (inp) inp.focus();
      return;
    }
    if (el.id === "fFree") { state.filters.freeOnly = !state.filters.freeOnly; render(); return; }
    if (el.id === "fHideAi") { state.filters.hideAI = !state.filters.hideAI; render(); return; }
    if (el.id === "fMerge") { state.filters.mergeDuplicates = !state.filters.mergeDuplicates; render(); return; }
    if (el.id === "clearFiltersBtn") { state.filters = Object.assign({}, DEFAULT_FILTERS); render(); return; }
    if (el.id === "clearHistBtn") { state.history = []; saveStorage("anystl.standalone.history", []); renderMain(); return; }
    if (el.id === "clearOpenedBtn") { state.opened = []; saveStorage("anystl.standalone.opened", []); render(); return; }
    if (el.id === "loadMoreBtn") { runSearch(state.query, state.page + 1); return; }
    if (el.id === "refreshFeatured") { loadFeatured(true); return; }
    if (el.id === "exportSavedBtn") { copyText(JSON.stringify(state.saved, null, 2), el); return; }
    if (el.id === "clearCmpBtn") { state.compare = []; state.compareOpen = false; render(); return; }
    if (el.id === "openCmpBtn") { if (state.compare.length >= 2) { state.compareOpen = true; renderModal(); } return; }
    if (el.id === "modalSave") { if (state.preview) toggleSaved(state.preview); return; }
    if (el.id === "modalOpen") { if (state.preview) openExternal(state.preview.url, state.preview); return; }

    if (el.hasAttribute("data-tab")) {
      state.tab = el.getAttribute("data-tab");
      state.mobileFilterOpen = false;
      if (state.tab === "featured") loadFeatured(false);
      render();
      return;
    }
    if (el.hasAttribute("data-preset")) {
      var pr = el.getAttribute("data-preset");
      if (pr === "all") state.enabled = AVAILABLE.slice();
      else if (pr === "cad") state.enabled = AVAILABLE.filter(function(k) { return BOOT.platforms[k].group === "cad"; });
      else if (pr === "assets") state.enabled = AVAILABLE.filter(function(k) { return BOOT.platforms[k].group === "general"; });
      else state.enabled = AVAILABLE.filter(function(k) { var g = BOOT.platforms[k].group; return g === "community" || g === "brand"; });
      if (!state.enabled.length) state.enabled = AVAILABLE.slice(0, 1);
      if (state.searched && state.tab === "search") {
        var missing = state.enabled.filter(function(p) { return !state.siteStatus[p]; });
        if (missing.length) { runSearch(state.query, 1, missing); return; }
      }
      render();
      return;
    }
    if (el.hasAttribute("data-group")) {
      var gid = el.getAttribute("data-group");
      var gSites = AVAILABLE.filter(function(k) { return BOOT.platforms[k].group === gid; });
      var allOn = gSites.every(function(k) { return state.enabled.indexOf(k) !== -1; });
      if (allOn) {
        var rem = state.enabled.filter(function(k) { return gSites.indexOf(k) === -1; });
        if (rem.length) state.enabled = rem;
      } else {
        var added = gSites.filter(function(k) { return state.enabled.indexOf(k) === -1; });
        state.enabled = state.enabled.concat(added);
        if (state.searched && state.tab === "search") {
          var toFetch = added.filter(function(p) { return !state.siteStatus[p]; });
          if (toFetch.length) { runSearch(state.query, 1, toFetch); return; }
        }
      }
      render();
      return;
    }
    if (el.hasAttribute("data-site")) {
      var p = el.getAttribute("data-site");
      if (state.enabled.indexOf(p) !== -1) {
        if (state.enabled.length > 1) state.enabled = state.enabled.filter(function(x) { return x !== p; });
      } else {
        state.enabled = state.enabled.concat([p]);
        if (state.searched && state.tab === "search" && !state.siteStatus[p]) {
          runSearch(state.query, 1, [p]);
          return;
        }
      }
      render();
      return;
    }
    if (el.hasAttribute("data-suggest")) { runSearch(el.getAttribute("data-suggest"), 1); return; }
    if (el.hasAttribute("data-ext")) { openExternal(el.getAttribute("data-ext")); return; }
    if (el.hasAttribute("data-ext-idx")) {
      var mExt = activeList[Number(el.getAttribute("data-ext-idx"))];
      if (mExt) openExternal(mExt.url, mExt);
      return;
    }
    if (el.hasAttribute("data-alt-open")) {
      var alt = state.preview && state.preview.alternates && state.preview.alternates[Number(el.getAttribute("data-alt-open"))];
      if (alt) openExternal(alt.url, alt);
      return;
    }
    if (el.hasAttribute("data-save")) { toggleSaved(activeList[Number(el.getAttribute("data-save"))]); return; }
    if (el.hasAttribute("data-cmp")) { toggleCompare(activeList[Number(el.getAttribute("data-cmp"))]); return; }
    if (el.hasAttribute("data-preview")) {
      var item = activeList[Number(el.getAttribute("data-preview"))];
      if (item) { state.preview = item; renderModal(); }
      return;
    }
    if (el.hasAttribute("data-cmp-rm")) { toggleCompare(state.compare[Number(el.getAttribute("data-cmp-rm"))]); return; }
    if (el.hasAttribute("data-cmp-open")) {
      var cm = state.compare[Number(el.getAttribute("data-cmp-open"))];
      if (cm) openExternal(cm.url, cm);
      return;
    }
  });

  function attachBridge() {
    if (!window.orca || typeof window.orca.onMessage !== "function") {
      setTimeout(attachBridge, 80);
      return;
    }
    window.orca.onMessage(function(msg) {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "search_chunk") {
        if (msg.reqId !== state.reqId) return;
        state.siteStatus[msg.platform] = msg.error ? "error" : "ok";
        if (msg.error) state.siteErrors[msg.platform] = msg.error;
        if (Array.isArray(msg.results) && msg.results.length) {
          var seen = Object.create(null);
          state.results.forEach(function(r) { seen[r.url] = true; });
          msg.results.forEach(function(r) { if (!seen[r.url]) { seen[r.url] = true; state.results.push(r); } });
        }
        render();
      } else if (msg.type === "search_done") {
        if (msg.reqId !== state.reqId) return;
        state.loading = false;
        state.searchTime = Math.max(0.1, (Date.now() - state.searchStart) / 1000);
        render();
      } else if (msg.type === "featured_data") {
        state.featuredLoading = false;
        state.featuredLoaded = true;
        state.featured = Array.isArray(msg.sections) ? msg.sections : [];
        render();
      } else if (msg.type === "saved_data") {
        if (Array.isArray(msg.items)) {
          if (msg.items.length || !state.saved.length) {
            state.saved = msg.items;
            saveStorage("anystl.standalone.saved", state.saved);
          } else if (state.saved.length) {
            postToPython({ type: "save_saved", items: state.saved });
          }
          render();
        }
      } else if (msg.type === "local_server_status" && msg.available && BOOT.localOrigin && BOOT.mode !== "standalone") {
        state.localServerAvailable = true;
        renderSidebar();
      }
    });
    postToPython({ type: "load_saved" });
    if (BOOT.localOrigin && BOOT.mode !== "standalone") postToPython({ type: "check_local_server" });
  }

  render();
  attachBridge();
})();
</script>
</body>
</html>"""


def _build_standalone_html(config_dict, local_origin, mode):
    cfg = config_dict or {}
    boot = {
        "groups": GROUPS,
        "platforms": PLATFORMS,
        "externalLinks": EXTERNAL_LINKS,
        "localOrigin": local_origin or "",
        "mode": mode or DEFAULT_MODE,
        "hasThingiverseToken": bool(str(cfg.get("thingiverse_token") or "").strip()),
        "hasMmfKey": bool(str(cfg.get("myminifactory_key") or "").strip()),
        "hasCults3dCreds": bool(
            str(cfg.get("cults3d_username") or "").strip()
            and str(cfg.get("cults3d_api_key") or "").strip()
        ),
    }
    boot_json = json.dumps(boot).replace("</", "<\\/")
    return STANDALONE_HTML.replace("__ANYSTL_BOOT_JSON__", boot_json)

class AnyStlPage(orca.pages.PagesPluginCapabilityBase):
    def get_name(self):
        return "AnyStl"

    def get_icon(self):
        # OrcaSlicer hides tab labels when the Prepare tools need more room.
        # Use its built-in search icon so the compact tab remains visible.
        return "search.svg"

    def get_default_config(self):
        return {
            "mode": DEFAULT_MODE,
            "server_url": DEFAULT_URL,
            "thingiverse_token": "",
            "myminifactory_key": "",
            "cults3d_username": "",
            "cults3d_api_key": "",
        }

    def _safe_post(self, payload):
        try:
            self.post_message(payload)
        except Exception:
            pass

    def get_ui(self):
        raw_cfg = self.get_config()
        cfg = parse_config(raw_cfg)
        origin = server_url(raw_cfg)
        mode = plugin_mode(raw_cfg)

        if cfg is None or origin is None:
            return """<!doctype html><html lang="en"><meta charset="utf-8">
<h2>Invalid AnyStl server URL</h2>
<p>Set <code>server_url</code> in Plugins → AnyStl → Config to a local origin, such as
<code>http://127.0.0.1:3000</code>, or set <code>"mode": "standalone"</code>. Then reload the plugin.</p></html>"""

        if mode == "server" or (mode == "auto" and probe_local_server(origin)):
            return f"""<!doctype html><html lang="en"><meta charset="utf-8">
<h2>AnyStl</h2>
<p>Start the local AnyStl server, then open <a href="{origin}/">{origin}</a>.</p>
<script>window.location.replace({json.dumps(origin + "/")});</script></html>"""

        return _build_standalone_html(cfg, origin, mode)

    def on_message(self, data):
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except ValueError:
                return
        if not isinstance(data, dict):
            return

        msg_type = data.get("type")
        cfg = parse_config(self.get_config()) or {}

        if msg_type == "open_external":
            url = data.get("url")
            if isinstance(url, str) and (url.startswith("https://") or url.startswith("http://")):
                launch_desktop_url(url)
            return

        if msg_type == "load_saved":
            items = load_saved_models()
            if items is not None:
                self._safe_post({"type": "saved_data", "items": items})
            return

        if msg_type == "save_saved":
            save_saved_models(data.get("items"))
            return

        if msg_type == "check_local_server":
            origin = server_url(self.get_config())
            if origin and plugin_mode(self.get_config()) != "standalone":
                threading.Thread(
                    target=lambda: self._safe_post(
                        {"type": "local_server_status", "available": probe_local_server(origin)}
                    ),
                    daemon=True,
                ).start()
            return

        if msg_type == "featured":
            force = bool(data.get("force"))

            def run_featured():
                try:
                    sections = load_featured(force=force)
                except Exception:
                    sections = []
                self._safe_post({"type": "featured_data", "sections": sections})

            threading.Thread(target=run_featured, daemon=True).start()
            return

        if msg_type == "search":
            query = str(data.get("query") or "").strip()
            try:
                page = max(1, int(data.get("page") or 1))
            except (TypeError, ValueError):
                page = 1
            req_id = data.get("reqId")
            wanted = [p for p in (data.get("platforms") or []) if p in PROVIDERS]
            if not query or not wanted:
                self._safe_post({"type": "search_done", "reqId": req_id})
                return

            def run_search():
                with ThreadPoolExecutor(max_workers=min(8, len(wanted))) as pool:
                    futures = {pool.submit(PROVIDERS[p], query, page, cfg): p for p in wanted}
                    for fut in as_completed(futures):
                        plat = futures[fut]
                        try:
                            res = fut.result()
                            self._safe_post(
                                {"type": "search_chunk", "reqId": req_id, "platform": plat, "results": res}
                            )
                        except Exception as err:
                            self._safe_post(
                                {
                                    "type": "search_chunk",
                                    "reqId": req_id,
                                    "platform": plat,
                                    "results": [],
                                    "error": str(err),
                                }
                            )
                self._safe_post({"type": "search_done", "reqId": req_id})

            threading.Thread(target=run_search, daemon=True).start()
            return


@orca.plugin
class AnyStlPlugin(orca.base):
    def register_capabilities(self):
        if hasattr(orca, "request_permissions"):
            orca.request_permissions(
                network=ALLOWED_NETWORK_HOSTS,
                process=[_opener_command()],
                threading=True,
            )
        orca.register_capability(AnyStlPage)
