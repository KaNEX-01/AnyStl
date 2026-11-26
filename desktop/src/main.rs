#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::VecDeque;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime};

use tauri::webview::NewWindowResponse;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use url::Url;

#[cfg(unix)]
use std::os::unix::process::CommandExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct ManagedProcesses {
    next_child: Option<Child>,
    xvfb_child: Option<Child>,
}

impl ManagedProcesses {
    fn shutdown(&mut self) {
        if let Some(mut child) = self.next_child.take() {
            terminate_process_tree(&mut child);
        }
        if let Some(mut xvfb) = self.xvfb_child.take() {
            let _ = xvfb.kill();
            let _ = xvfb.wait();
        }
    }
}

fn terminate_process_tree(child: &mut Child) {
    let pid = child.id();
    #[cfg(windows)]
    {
        let mut cmd = Command::new("taskkill");
        cmd.args(["/T", "/F", "/PID", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW);
        let _ = cmd.status();
        let _ = child.wait();
    }
    #[cfg(unix)]
    {
        // Signal the entire process group started by `process_group(0)`.
        let _ = Command::new("kill")
            .args(["-TERM", &format!("-{pid}")])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            match child.try_wait() {
                Ok(Some(_)) => return,
                Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(80)),
                _ => break,
            }
        }
        let _ = Command::new("kill")
            .args(["-KILL", &format!("-{pid}")])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = child.wait();
    }
}

fn open_external(target: &str) {
    let Ok(parsed) = Url::parse(target) else {
        return;
    };
    if !matches!(
        parsed.scheme(),
        "http" | "https" | "orcaslicer" | "bambustudio" | "prusaslicer" | "elegooslicer"
    ) {
        return;
    }

    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg(parsed.as_str()).spawn();
    }
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("rundll32");
        cmd.args(["url.dll,FileProtocolHandler", parsed.as_str()])
            .creation_flags(CREATE_NO_WINDOW);
        let _ = cmd.spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = Command::new("xdg-open")
            .arg(parsed.as_str())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    }
}

fn is_project_dir(dir: &Path) -> bool {
    let pkg = dir.join("package.json");
    if !pkg.is_file() {
        return false;
    }
    dir.join("src").join("app").join("page.tsx").is_file()
        || dir.join(".next").join("BUILD_ID").is_file()
        || dir.join("next.config.ts").is_file()
}

fn find_project_dir() -> Option<PathBuf> {
    if let Ok(explicit) = env::var("ANYSTL_DIR") {
        let p = PathBuf::from(explicit);
        if is_project_dir(&p) {
            return Some(p);
        }
    }

    if let Ok(exe) = env::current_exe() {
        let resolved = exe.canonicalize().unwrap_or(exe);
        let mut cur = resolved.parent().map(Path::to_path_buf);
        for _ in 0..5 {
            if let Some(dir) = cur {
                if is_project_dir(&dir) {
                    return Some(dir);
                }
                cur = dir.parent().map(Path::to_path_buf);
            } else {
                break;
            }
        }
    }

    if let Ok(cwd) = env::current_dir() {
        let mut cur = Some(cwd);
        for _ in 0..4 {
            if let Some(dir) = cur {
                if is_project_dir(&dir) {
                    return Some(dir);
                }
                cur = dir.parent().map(Path::to_path_buf);
            } else {
                break;
            }
        }
    }

    None
}

fn probe_http(port: u16) -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().unwrap(),
        Duration::from_millis(350),
    ) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(600)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(600)));
    let req = format!("HEAD / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 64];
    match stream.read(&mut buf) {
        Ok(n) if n > 12 => {
            let line = String::from_utf8_lossy(&buf[..n]);
            line.starts_with("HTTP/1.") && !line.contains(" 5")
        }
        _ => false,
    }
}

fn pick_free_port(preferred: u16) -> Result<u16, String> {
    if TcpListener::bind(("127.0.0.1", preferred)).is_ok() {
        return Ok(preferred);
    }
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| format!("Could not find a free local port: {e}"))?;
    Ok(listener
        .local_addr()
        .map_err(|e| format!("Could not read local port: {e}"))?
        .port())
}

struct NodeToolchain {
    node_exe: PathBuf,
    npm_exe: PathBuf,
    extra_path_dir: Option<PathBuf>,
}

fn node_major_version(node_exe: &Path) -> Option<u32> {
    let mut cmd = Command::new(node_exe);
    cmd.args(["-p", "parseInt(process.versions.node.split('.')[0], 10)"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout).trim().parse::<u32>().ok()
}

fn prepend_path_env(dir: &Path) -> std::ffi::OsString {
    let mut paths = vec![dir.to_path_buf()];
    if let Some(existing) = env::var_os("PATH") {
        paths.extend(env::split_paths(&existing));
    }
    env::join_paths(paths).unwrap_or_else(|_| dir.as_os_str().to_os_string())
}

fn configure_tool_env(cmd: &mut Command, tools: &NodeToolchain) {
    if let Some(ref dir) = tools.extra_path_dir {
        cmd.env("PATH", prepend_path_env(dir));
    }
}

#[cfg(windows)]
fn resolve_windows_node_in_dir(dir: &Path) -> Option<NodeToolchain> {
    let node_exe = dir.join("node.exe");
    let npm_exe = dir.join("npm.cmd");
    if node_exe.is_file() && npm_exe.is_file() && node_major_version(&node_exe).unwrap_or(0) >= 20 {
        return Some(NodeToolchain {
            node_exe,
            npm_exe,
            extra_path_dir: Some(dir.to_path_buf()),
        });
    }
    None
}

#[cfg(windows)]
fn ensure_node_toolchain(window: &WebviewWindow, project_dir: &Path) -> Result<NodeToolchain, String> {
    if node_major_version(Path::new("node")).unwrap_or(0) >= 20 {
        return Ok(NodeToolchain {
            node_exe: PathBuf::from("node"),
            npm_exe: PathBuf::from("npm.cmd"),
            extra_path_dir: None,
        });
    }

    let local_app_data = env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(|p| PathBuf::from(p).join("AppData").join("Local")));

    let mut candidates = Vec::new();
    if let Some(ref lad) = local_app_data {
        candidates.push(lad.join("AnyStl").join("node"));
        candidates.push(lad.join("Programs").join("nodejs"));
    }
    if let Some(pf) = env::var_os("ProgramFiles") {
        candidates.push(PathBuf::from(pf).join("nodejs"));
    }
    for dir in &candidates {
        if let Some(found) = resolve_windows_node_in_dir(dir) {
            return Ok(found);
        }
    }

    set_splash_status(
        window,
        "Downloading Node.js LTS (first run)…",
        "Installing a private Node.js runtime into %LOCALAPPDATA%\\AnyStl\\node.",
    );

    let script_path = project_dir.join("scripts").join("ensure-node.ps1");
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass"]);
    if script_path.is_file() {
        cmd.arg("-File").arg(&script_path);
    } else {
        // Fallback inline bootstrap if scripts/ensure-node.ps1 is not present.
        let inline = r#"
$ErrorActionPreference = 'Stop'
$lad = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE 'AppData\Local' }
$dest = Join-Path $lad 'AnyStl\node'
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$idx = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 30
$lts = $idx | Where-Object { $_.lts -and ([int]($_.version.TrimStart('v').Split('.')[0]) -ge 20) -and ($_.files -contains "win-$arch-zip") } | Select-Object -First 1
if (-not $lts) { throw "No Node.js LTS build found for win-$arch" }
$name = "node-$($lts.version)-win-$arch"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("anystl-node-" + [Guid]::NewGuid().ToString('N'))
$zip = Join-Path $tmp "$name.zip"
$ext = Join-Path $tmp 'ext'
try {
  New-Item -ItemType Directory -Path $ext -Force | Out-Null
  Invoke-WebRequest -Uri "https://nodejs.org/dist/$($lts.version)/$name.zip" -OutFile $zip -UseBasicParsing -TimeoutSec 180
  Expand-Archive -Path $zip -DestinationPath $ext -Force
  if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
  New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
  Move-Item -LiteralPath (Join-Path $ext $name) -Destination $dest -Force
} finally {
  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Output $dest
"#;
        cmd.args(["-Command", inline]);
    }
    cmd.current_dir(project_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("Could not launch PowerShell to install Node.js: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail = tail_lines(&stderr, 10);
        return Err(format!(
            "Automatic Node.js installation failed.\nInstall Node.js 20+ manually from https://nodejs.org and launch AnyStl again.\n\n{tail}"
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    if let Some(last_line) = stdout.lines().rev().find(|l| !l.trim().is_empty()) {
        if let Some(found) = resolve_windows_node_in_dir(Path::new(last_line.trim())) {
            return Ok(found);
        }
    }
    if let Some(ref lad) = local_app_data {
        if let Some(found) = resolve_windows_node_in_dir(&lad.join("AnyStl").join("node")) {
            return Ok(found);
        }
    }
    Err("Node.js was downloaded, but node.exe could not be verified.\nInstall Node.js 20+ from https://nodejs.org and try again.".into())
}

#[cfg(not(windows))]
fn ensure_node_toolchain(_window: &WebviewWindow, _project_dir: &Path) -> Result<NodeToolchain, String> {
    if node_major_version(Path::new("node")).unwrap_or(0) >= 20 {
        Ok(NodeToolchain {
            node_exe: PathBuf::from("node"),
            npm_exe: PathBuf::from("npm"),
            extra_path_dir: None,
        })
    } else {
        Err("Node.js 20+ is required to run AnyStl.\nInstall it from https://nodejs.org and launch AnyStl again.".into())
    }
}

fn tail_lines(text: &str, count: usize) -> String {
    text.lines()
        .rev()
        .take(count)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n")
}

fn run_step(
    project_dir: &Path,
    tools: &NodeToolchain,
    program: &Path,
    args: &[&str],
    label: &str,
) -> Result<(), String> {
    let mut cmd = Command::new(program);
    cmd.args(args)
        .current_dir(project_dir)
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    configure_tool_env(&mut cmd, tools);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to start {label}: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail = tail_lines(&stderr, 10);
        Err(format!("{label} failed:\n{tail}"))
    }
}

fn env_no_browser(project_dir: &Path) -> bool {
    if env::var("ANYSTL_NO_BROWSER").ok().as_deref() == Some("1") {
        return true;
    }
    for file in [".env.local", ".env"] {
        if let Ok(content) = fs::read_to_string(project_dir.join(file)) {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('#') {
                    continue;
                }
                if let Some(val) = trimmed.strip_prefix("ANYSTL_NO_BROWSER=") {
                    if val.trim().trim_matches('"').trim_matches('\'') == "1" {
                        return true;
                    }
                }
            }
        }
    }
    false
}

fn playwright_chromium_installed(project_dir: &Path, tools: &NodeToolchain) -> bool {
    let pw_cli = project_dir
        .join("node_modules")
        .join("playwright")
        .join("cli.js");
    if !pw_cli.is_file() {
        return false;
    }
    let mut cmd = Command::new(&tools.node_exe);
    cmd.arg(&pw_cli)
        .args(["install", "--dry-run", "chromium"])
        .current_dir(project_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    configure_tool_env(&mut cmd, tools);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let Ok(output) = cmd.output() else {
        return false;
    };
    if !output.status.success() {
        return false;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut locations = Vec::new();
    for line in stdout.lines() {
        if let Some(rest) = line.split("Install location:").nth(1) {
            let loc = rest.trim();
            if !loc.is_empty() {
                locations.push(PathBuf::from(loc));
            }
        }
    }
    let full_chromium: Vec<&PathBuf> = locations
        .iter()
        .filter(|loc| {
            loc.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("chromium-"))
        })
        .collect();
    if !full_chromium.is_empty() {
        return full_chromium
            .iter()
            .all(|loc| loc.join("INSTALLATION_COMPLETE").is_file());
    }
    !locations.is_empty()
        && locations
            .iter()
            .all(|loc| loc.join("INSTALLATION_COMPLETE").is_file())
}

#[cfg(windows)]
fn has_windows_system_browser() -> bool {
    if env::var("ANYSTL_FORCE_PLAYWRIGHT_BROWSER").ok().as_deref() == Some("1") {
        return false;
    }
    let mut candidates = Vec::new();
    for var in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(root) = env::var_os(var).map(PathBuf::from) {
            candidates.push(root.join("Google").join("Chrome").join("Application").join("chrome.exe"));
            candidates.push(root.join("Microsoft").join("Edge").join("Application").join("msedge.exe"));
        }
    }
    if let Some(lad) = env::var_os("LOCALAPPDATA").map(PathBuf::from) {
        candidates.push(lad.join("Google").join("Chrome").join("Application").join("chrome.exe"));
    }
    candidates.iter().any(|p| p.is_file())
}

#[cfg(not(windows))]
fn has_windows_system_browser() -> bool {
    false
}

fn ensure_playwright_browser(
    window: &WebviewWindow,
    project_dir: &Path,
    tools: &NodeToolchain,
) -> Result<(), String> {
    if env_no_browser(project_dir)
        || has_windows_system_browser()
        || playwright_chromium_installed(project_dir, tools)
    {
        return Ok(());
    }
    set_splash_status(
        window,
        "Downloading Chromium for scrapers (first run)…",
        "Used for sites behind bot checks. This only happens once.",
    );

    #[cfg(windows)]
    {
        let script = project_dir.join("scripts").join("install-browsers.ps1");
        if script.is_file() {
            let script_arg = script.to_string_lossy().into_owned();
            return run_step(
                project_dir,
                tools,
                Path::new("powershell.exe"),
                &["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", &script_arg],
                "install Playwright Chromium",
            );
        }
    }

    #[cfg(not(windows))]
    {
        let script = project_dir.join("scripts").join("install-browsers.sh");
        if script.is_file() {
            return run_step(
                project_dir,
                tools,
                Path::new("bash"),
                &["scripts/install-browsers.sh"],
                "install Playwright Chromium",
            );
        }
    }

    let pw_cli = project_dir
        .join("node_modules")
        .join("playwright")
        .join("cli.js");
    let pw_arg = pw_cli.to_string_lossy().into_owned();
    run_step(
        project_dir,
        tools,
        &tools.node_exe,
        &[&pw_arg, "install", "chromium"],
        "playwright install chromium",
    )
}

#[cfg(target_os = "linux")]
fn start_xvfb() -> Option<(Child, String)> {
    if env::var("ANYSTL_NO_XVFB").ok().as_deref() == Some("1") {
        return None;
    }
    for n in 99..199 {
        let lock = format!("/tmp/.X{n}-lock");
        let sock = format!("/tmp/.X11-unix/X{n}");
        if Path::new(&lock).exists() || Path::new(&sock).exists() {
            continue;
        }
        let display = format!(":{n}");
        if let Ok(child) = Command::new("Xvfb")
            .args([&display, "-screen", "0", "1920x1080x24", "-nolisten", "tcp"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            return Some((child, display));
        }
        return None;
    }
    None
}

#[cfg(not(target_os = "linux"))]
fn start_xvfb() -> Option<(Child, String)> {
    None
}

fn set_splash_status(window: &WebviewWindow, msg: &str, detail: &str) {
    let m = serde_json::to_string(msg).unwrap_or_else(|_| "\"\"".into());
    let d = serde_json::to_string(detail).unwrap_or_else(|_| "\"\"".into());
    let _ = window.eval(&format!("window.__anystlStatus && window.__anystlStatus({m}, {d});"));
}

fn set_splash_error(window: &WebviewWindow, msg: &str) {
    let m = serde_json::to_string(msg).unwrap_or_else(|_| "\"Startup failed\"".into());
    let _ = window.eval(&format!("window.__anystlError && window.__anystlError({m});"));
}

fn is_local_anystl_url(url: &Url, allowed_port: &Arc<Mutex<Option<u16>>>) -> bool {
    if matches!(url.scheme(), "tauri" | "about" | "data" | "blob") {
        return true;
    }
    if url.host_str() == Some("tauri.localhost") {
        return true;
    }
    if url.scheme() == "http" {
        let port = *allowed_port.lock().unwrap();
        let is_loopback = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
        if is_loopback && port.is_some() && url.port_or_known_default() == port {
            return true;
        }
    }
    false
}

fn latest_mtime_in(path: &Path) -> Option<SystemTime> {
    let meta = fs::metadata(path).ok()?;
    let mut newest = meta.modified().ok();
    if meta.is_dir() {
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                if let Some(child_time) = latest_mtime_in(&entry.path()) {
                    newest = Some(match newest {
                        Some(cur) if cur >= child_time => cur,
                        _ => child_time,
                    });
                }
            }
        }
    }
    newest
}

fn needs_build(project_dir: &Path) -> bool {
    if env::var("ANYSTL_REBUILD").ok().as_deref() == Some("1") {
        return true;
    }
    let build_id = project_dir.join(".next").join("BUILD_ID");
    let Ok(build_mtime) = fs::metadata(&build_id).and_then(|m| m.modified()) else {
        return true;
    };
    let watch_paths = [
        project_dir.join("package.json"),
        project_dir.join("next.config.ts"),
        project_dir.join("src"),
    ];
    for p in &watch_paths {
        if let Some(mtime) = latest_mtime_in(p) {
            if mtime > build_mtime {
                return true;
            }
        }
    }
    false
}

fn format_recent_logs(buf: &Arc<Mutex<VecDeque<String>>>) -> String {
    let lines = buf.lock().unwrap();
    if lines.is_empty() {
        return String::new();
    }
    let joined: String = lines.iter().cloned().collect::<Vec<_>>().join("\n");
    format!("\n\nServer log:\n{joined}")
}

struct BundledRuntime {
    app_dir: PathBuf,
    server_js: PathBuf,
    node_exe: PathBuf,
}

fn find_bundled_runtime(app_handle: &tauri::AppHandle) -> Option<BundledRuntime> {
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Ok(res_dir) = app_handle.path().resource_dir() {
        roots.push(res_dir.join("resources"));
        roots.push(res_dir);
    }
    if let Ok(exe) = env::current_exe() {
        let resolved = exe.canonicalize().unwrap_or(exe);
        if let Some(parent) = resolved.parent() {
            roots.push(parent.join("resources"));
            roots.push(parent.to_path_buf());
        }
    }

    let node_name = if cfg!(windows) { "node.exe" } else { "node" };
    for root in roots {
        let app_dir = root.join("app");
        let server_js = app_dir.join("server.js");
        if !server_js.is_file() {
            continue;
        }
        let bundled_node = root.join("node").join(node_name);
        let node_exe = if bundled_node.is_file() {
            bundled_node
        } else {
            PathBuf::from(node_name)
        };
        return Some(BundledRuntime {
            app_dir,
            server_js,
            node_exe,
        });
    }
    None
}

fn spawn_and_wait_server(
    window: &WebviewWindow,
    procs: &Arc<Mutex<ManagedProcesses>>,
    allowed_port: &Arc<Mutex<Option<u16>>>,
    port: u16,
    mut cmd: Command,
) {
    *allowed_port.lock().unwrap() = Some(port);

    set_splash_status(
        window,
        "Starting AnyStl server…",
        &format!("http://127.0.0.1:{port}"),
    );

    let xvfb_display = if let Some((xvfb, disp)) = start_xvfb() {
        procs.lock().unwrap().xvfb_child = Some(xvfb);
        Some(disp)
    } else {
        None
    };

    if let Some(disp) = xvfb_display {
        cmd.env("ANYSTL_XVFB_DISPLAY", disp);
    }

    #[cfg(unix)]
    cmd.process_group(0);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(err) => {
            set_splash_error(window, &format!("Failed to start AnyStl server: {err}"));
            return;
        }
    };

    let stderr_tail: Arc<Mutex<VecDeque<String>>> = Arc::new(Mutex::new(VecDeque::with_capacity(20)));
    if let Some(stderr) = child.stderr.take() {
        let tail_bg = Arc::clone(&stderr_tail);
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let mut guard = tail_bg.lock().unwrap();
                if guard.len() >= 15 {
                    guard.pop_front();
                }
                guard.push_back(trimmed.to_string());
            }
        });
    }

    procs.lock().unwrap().next_child = Some(child);

    let deadline = Instant::now() + Duration::from_secs(45);
    while Instant::now() < deadline {
        if probe_http(port) {
            let url = format!("http://127.0.0.1:{port}/");
            let _ = window.navigate(Url::parse(&url).unwrap());
            return;
        }
        // Check if Next.js crashed early.
        if let Some(ref mut c) = procs.lock().unwrap().next_child {
            if let Ok(Some(status)) = c.try_wait() {
                thread::sleep(Duration::from_millis(80));
                let logs = format_recent_logs(&stderr_tail);
                set_splash_error(
                    window,
                    &format!("AnyStl server exited unexpectedly (status: {status}).{logs}"),
                );
                return;
            }
        }
        thread::sleep(Duration::from_millis(180));
    }

    let logs = format_recent_logs(&stderr_tail);
    set_splash_error(
        window,
        &format!("Timed out waiting for the local AnyStl server to respond.{logs}"),
    );
}

fn bootstrap_server(
    app_handle: tauri::AppHandle,
    window: WebviewWindow,
    procs: Arc<Mutex<ManagedProcesses>>,
    allowed_port: Arc<Mutex<Option<u16>>>,
) {
    let preferred_port: u16 = env::var("PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(3000);

    // If an AnyStl instance is already listening on the preferred port, connect right away.
    if probe_http(preferred_port) {
        *allowed_port.lock().unwrap() = Some(preferred_port);
        let url = format!("http://127.0.0.1:{preferred_port}/");
        set_splash_status(&window, "Connected to running AnyStl server", &url);
        let _ = window.navigate(Url::parse(&url).unwrap());
        return;
    }

    // Fast path for packaged end-user releases: bundled standalone server + Node.js runtime.
    if let Some(bundled) = find_bundled_runtime(&app_handle) {
        let port = match pick_free_port(preferred_port) {
            Ok(p) => p,
            Err(err) => {
                set_splash_error(&window, &err);
                return;
            }
        };
        let mut cmd = Command::new(&bundled.node_exe);
        cmd.arg(&bundled.server_js)
            .current_dir(&bundled.app_dir)
            .env("HOSTNAME", "127.0.0.1")
            .env("PORT", port.to_string())
            .env("NODE_ENV", "production")
            .env("NEXT_TELEMETRY_DISABLED", "1")
            .env("ANYSTL_DESKTOP", "1")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        spawn_and_wait_server(&window, &procs, &allowed_port, port, cmd);
        return;
    }

    let Some(project_dir) = find_project_dir() else {
        set_splash_error(
            &window,
            "Could not locate the AnyStl app bundle or project folder.\nReinstall AnyStl or set ANYSTL_DIR.",
        );
        return;
    };

    let tools = match ensure_node_toolchain(&window, &project_dir) {
        Ok(t) => t,
        Err(err) => {
            set_splash_error(&window, &err);
            return;
        }
    };

    let next_bin = project_dir
        .join("node_modules")
        .join("next")
        .join("dist")
        .join("bin")
        .join("next");
    let pw_cli = project_dir
        .join("node_modules")
        .join("playwright")
        .join("cli.js");

    if !next_bin.is_file() || !pw_cli.is_file() {
        set_splash_status(
            &window,
            "Installing dependencies (first run)…",
            &project_dir.display().to_string(),
        );
        if let Err(err) = run_step(&project_dir, &tools, &tools.npm_exe, &["install"], "npm install") {
            set_splash_error(&window, &err);
            return;
        }
    }

    if let Err(err) = ensure_playwright_browser(&window, &project_dir, &tools) {
        set_splash_error(&window, &err);
        return;
    }

    let had_build = project_dir.join(".next").join("BUILD_ID").is_file();
    if needs_build(&project_dir) {
        let heading = if had_build {
            "Rebuilding AnyStl after updates…"
        } else {
            "Building AnyStl for production (first run)…"
        };
        let detail = if had_build {
            "Source files changed since the last build."
        } else {
            "This only happens once."
        };
        set_splash_status(&window, heading, detail);
        if let Err(err) = run_step(&project_dir, &tools, &tools.npm_exe, &["run", "build"], "npm run build") {
            set_splash_error(&window, &err);
            return;
        }
    }

    let port = match pick_free_port(preferred_port) {
        Ok(p) => p,
        Err(err) => {
            set_splash_error(&window, &err);
            return;
        }
    };

    let mut cmd = Command::new(&tools.node_exe);
    cmd.arg(&next_bin)
        .args(["start", "--hostname", "127.0.0.1", "--port", &port.to_string()])
        .current_dir(&project_dir)
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .env("ANYSTL_DESKTOP", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    configure_tool_env(&mut cmd, &tools);

    spawn_and_wait_server(&window, &procs, &allowed_port, port, cmd);
}

fn main() {
    let procs = Arc::new(Mutex::new(ManagedProcesses {
        next_child: None,
        xvfb_child: None,
    }));
    let allowed_port: Arc<Mutex<Option<u16>>> = Arc::new(Mutex::new(None));

    let procs_setup = Arc::clone(&procs);
    let port_setup = Arc::clone(&allowed_port);
    let procs_exit = Arc::clone(&procs);

    let app = tauri::Builder::default()
        .setup(move |app| {
            let nav_port = Arc::clone(&port_setup);
            let win_port = Arc::clone(&port_setup);

            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("AnyStl")
                .inner_size(1380.0, 880.0)
                .min_inner_size(900.0, 620.0)
                .on_navigation(move |url| {
                    if is_local_anystl_url(url, &nav_port) {
                        true
                    } else {
                        open_external(url.as_str());
                        false
                    }
                })
                .on_new_window(move |url, _features| {
                    if is_local_anystl_url(&url, &win_port) {
                        NewWindowResponse::Allow
                    } else {
                        open_external(url.as_str());
                        NewWindowResponse::Deny
                    }
                })
                .build()?;

            let handle = app.handle().clone();
            let procs_bg = Arc::clone(&procs_setup);
            let port_bg = Arc::clone(&port_setup);
            thread::spawn(move || {
                // Brief pause so the splash HTML finishes initial paint.
                thread::sleep(Duration::from_millis(120));
                if let Some(win) = handle.get_webview_window("main") {
                    bootstrap_server(handle.clone(), win, procs_bg, port_bg);
                }
            });

            let _ = window;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Failed to initialize AnyStl desktop app");

    app.run(move |_app_handle, event| {
        if matches!(event, RunEvent::Exit) {
            procs_exit.lock().unwrap().shutdown();
        }
    });
}
