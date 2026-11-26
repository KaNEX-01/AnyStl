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
    if !matches!(parsed.scheme(), "http" | "https" | "orcaslicer") {
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

fn npm_command() -> &'static str {
    #[cfg(windows)]
    {
        "npm.cmd"
    }
    #[cfg(not(windows))]
    {
        "npm"
    }
}

fn check_node_available() -> Result<(), String> {
    let mut cmd = Command::new("node");
    cmd.arg("-v").stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    match cmd.status() {
        Ok(s) if s.success() => Ok(()),
        _ => Err("Node.js 20+ is required to run AnyStl.\nInstall it from https://nodejs.org and launch AnyStl again.".into()),
    }
}

fn run_step(project_dir: &Path, program: &str, args: &[&str], label: &str) -> Result<(), String> {
    let mut cmd = Command::new(program);
    cmd.args(args)
        .current_dir(project_dir)
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to start {label}: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail: String = stderr
            .lines()
            .rev()
            .take(10)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n");
        Err(format!("{label} failed:\n{tail}"))
    }
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

fn bootstrap_server(
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

    let Some(project_dir) = find_project_dir() else {
        set_splash_error(
            &window,
            "Could not locate the AnyStl project folder.\nPlace this launcher inside the AnyStl folder or set ANYSTL_DIR.",
        );
        return;
    };

    if let Err(err) = check_node_available() {
        set_splash_error(&window, &err);
        return;
    }

    let next_bin = project_dir
        .join("node_modules")
        .join("next")
        .join("dist")
        .join("bin")
        .join("next");

    if !next_bin.is_file() {
        set_splash_status(
            &window,
            "Installing dependencies (first run)…",
            &project_dir.display().to_string(),
        );
        if let Err(err) = run_step(&project_dir, npm_command(), &["install"], "npm install") {
            set_splash_error(&window, &err);
            return;
        }
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
        if let Err(err) = run_step(&project_dir, npm_command(), &["run", "build"], "npm run build") {
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
    *allowed_port.lock().unwrap() = Some(port);

    set_splash_status(
        &window,
        "Starting AnyStl server…",
        &format!("http://127.0.0.1:{port}"),
    );

    let xvfb_display = if let Some((xvfb, disp)) = start_xvfb() {
        procs.lock().unwrap().xvfb_child = Some(xvfb);
        Some(disp)
    } else {
        None
    };

    let mut cmd = Command::new("node");
    cmd.arg(&next_bin)
        .args(["start", "--hostname", "127.0.0.1", "--port", &port.to_string()])
        .current_dir(&project_dir)
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .env("ANYSTL_DESKTOP", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

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
            set_splash_error(&window, &format!("Failed to start Next.js server: {err}"));
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
                    &window,
                    &format!("AnyStl server exited unexpectedly (status: {status}).{logs}"),
                );
                return;
            }
        }
        thread::sleep(Duration::from_millis(180));
    }

    let logs = format_recent_logs(&stderr_tail);
    set_splash_error(
        &window,
        &format!("Timed out waiting for the local AnyStl server to respond.{logs}"),
    );
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
                    bootstrap_server(win, procs_bg, port_bg);
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
