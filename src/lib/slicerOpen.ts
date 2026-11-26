import { spawn } from "node:child_process";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isLoopbackOrigin(value: string | null): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && LOOPBACK_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function isLoopbackHost(host: string | null): boolean {
  if (!host) return false;
  return isLoopbackOrigin(`http://${host}`);
}

export interface DesktopOpenResult {
  opened: boolean;
  error?: string;
}

/**
 * Hands a validated `orcaslicer://open?file=...` URI to the host OS desktop
 * handler so the embedded OrcaSlicer plugin tab can open models without
 * navigating its WebView to a custom scheme.
 */
export async function openInDesktopSlicer(link: string): Promise<DesktopOpenResult> {
  if (!link.startsWith("orcaslicer://open?file=")) {
    return { opened: false, error: "Invalid OrcaSlicer link" };
  }

  let command: string;
  let args: string[];
  if (process.platform === "darwin") {
    command = "open";
    args = [link];
  } else if (process.platform === "win32") {
    command = "rundll32";
    args = ["url.dll,FileProtocolHandler", link];
  } else {
    if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
      return { opened: false, error: "No desktop display is available to open OrcaSlicer directly." };
    }
    command = "xdg-open";
    args = [link];
  }

  return new Promise<DesktopOpenResult>((resolve) => {
    let settled = false;
    const finish = (result: DesktopOpenResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const child = spawn(command, args, {
      shell: false,
      detached: true,
      stdio: "ignore",
    });

    child.once("error", (err) => {
      finish({ opened: false, error: `Could not launch ${command}: ${err.message}` });
    });

    child.once("exit", (code) => {
      if (code === 0) finish({ opened: true });
      else finish({ opened: false, error: `${command} exited with status ${code ?? "unknown"}` });
    });

    // Desktop handlers often keep the target app attached or stay open briefly.
    const timer = setTimeout(() => {
      child.unref();
      finish({ opened: true });
    }, 1500);
  });
}
