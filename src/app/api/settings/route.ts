import { NextRequest, NextResponse } from "next/server";
import { isSearchPresetId, isSlicerId, AppSettings } from "@/lib/settings";
import { getSettings, saveSettings, settingsDataDir } from "@/lib/settingsStore";
import { isLoopbackHost, isLoopbackOrigin } from "@/lib/slicerOpen";

export const dynamic = "force-dynamic";

function configuredApis() {
  return {
    thingiverse: Boolean(process.env.THINGIVERSE_ACCESS_TOKEN?.trim()),
    myminifactory: Boolean(process.env.MYMINIFACTORY_API_KEY?.trim()),
    cgtrader: Boolean(process.env.CGTRADER_ACCESS_TOKEN?.trim()),
    cults3d: Boolean(process.env.CULTS3D_USERNAME?.trim() && process.env.CULTS3D_API_KEY?.trim()),
    traceparts: Boolean(
      process.env.TRACEPARTS_API_KEY?.trim() &&
        process.env.TRACEPARTS_TENANT_UID?.trim() &&
        process.env.TRACEPARTS_CLASSIFICATION_CODE?.trim() &&
        process.env.TRACEPARTS_EASYLINK_ID?.trim(),
    ),
    searxng: Boolean(process.env.SEARXNG_URL?.trim()),
    noBrowser: process.env.ANYSTL_NO_BROWSER?.trim() === "1",
  };
}

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({
    ...settings,
    dataDir: settingsDataDir(),
    apis: configuredApis(),
  });
}

export async function PUT(request: NextRequest) {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  if (!isLoopbackHost(host) || (origin !== null && !isLoopbackOrigin(origin))) {
    return NextResponse.json({ error: "Updating settings is only allowed from a local AnyStl session" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Expected a JSON object" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Partial<AppSettings> = {};
  if ("onboardingDone" in body) {
    if (typeof body.onboardingDone !== "boolean") {
      return NextResponse.json({ error: "Invalid 'onboardingDone'" }, { status: 400 });
    }
    patch.onboardingDone = body.onboardingDone;
  }
  if ("slicer" in body) {
    if (!isSlicerId(body.slicer)) {
      return NextResponse.json({ error: "Invalid 'slicer'" }, { status: 400 });
    }
    patch.slicer = body.slicer;
  }
  if ("defaultPreset" in body) {
    if (!isSearchPresetId(body.defaultPreset)) {
      return NextResponse.json({ error: "Invalid 'defaultPreset'" }, { status: 400 });
    }
    patch.defaultPreset = body.defaultPreset;
  }

  const updated = await saveSettings(patch);
  return NextResponse.json({
    ...updated,
    dataDir: settingsDataDir(),
    apis: configuredApis(),
  });
}
