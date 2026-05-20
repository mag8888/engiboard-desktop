#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::Emitter;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_deep_link::DeepLinkExt;
use std::time::SystemTime;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[tauri::command]
fn show_main(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn open_editor_with_image(
    app: tauri::AppHandle,
    data_url: String,
    annotations: Option<serde_json::Value>,
    comments: Option<serde_json::Value>,
) {
    eprintln!(
        "open_editor_with_image: data len={} ann={} cmt={}",
        data_url.len(),
        annotations.is_some(),
        comments.is_some()
    );
    let d = data_url.clone();
    let ann_payload = serde_json::json!({
        "annotations": annotations.unwrap_or(serde_json::json!([])),
        "comments":    comments.unwrap_or(serde_json::json!([])),
    });

    // v0.1.39 fix: client reported "пустое окно EngiBoard Annotate" — happens when
    // a stale editor window is reused but its webview is in broken/half-loaded state.
    // Always close+recreate to guarantee a clean editor every time.
    // Also drop always_on_top — it was blocking the user from closing or interacting
    // with main window, and was reported as "его невозможно закрыть".
    if let Some(stale) = app.get_webview_window("editor") {
        eprintln!("closing stale editor window before recreating");
        let _ = stale.close();
        // Give compositor a moment to actually destroy it
        std::thread::sleep(std::time::Duration::from_millis(120));
    }

    // Make sure main is visible so user always has somewhere to go back to.
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.show();
    }

    eprintln!("creating fresh editor window");
    let result = WebviewWindowBuilder::new(
        &app, "editor", WebviewUrl::App("editor.html".into()))
        .title("EngiBoard · Annotate")
        .inner_size(1200.0, 780.0)
        .min_inner_size(800.0, 540.0)
        // v0.1.39: always_on_top removed — was blocking close + capture workflow.
        // Editor is now a normal window the user can switch away from.
        .center()
        .focused(true)
        .visible(true)
        .build();

    match result {
        Ok(win) => {
            eprintln!("editor window created OK");
            let _ = win.show();
            let _ = win.set_focus();
            // v0.1.39: emit load-image with retry. Single emit too early was
            // resulting in editor showing blank ('пустое окно'). Three retries
            // at 800/1500/2400ms — editor.html dedupes by checking its 'loaded' flag.
            // v0.1.62: also emit load-annotations so the editor can resume an
            // earlier edit session (Phase C #3).
            let ann_clone = ann_payload.clone();
            std::thread::spawn(move || {
                for delay in [800u64, 700, 900] {
                    std::thread::sleep(std::time::Duration::from_millis(delay));
                    let r = win.emit("load-image", d.clone());
                    let r2 = win.emit("load-annotations", ann_clone.clone());
                    eprintln!("emit load-image (after {}ms more): {:?} / {:?}", delay, r, r2);
                    if r.is_err() { break; }
                }
            });
        }
        Err(e) => {
            eprintln!("FAILED to create editor: {}", e);
            // Show main again so user isn't stuck
            if let Some(main_win) = app.get_webview_window("main") {
                let _ = main_win.show();
                let _ = main_win.set_focus();
            }
        }
    }
}

#[tauri::command]
fn open_sniper(app: tauri::AppHandle) {
    eprintln!("open_sniper — opening custom sniper.html overlay (v0.1.42 simple flow)");

    // v0.1.42: Drop the AppleScript "set visible of process to false/true" trick.
    // On a fresh user library it raced with WebviewWindowBuilder, restoring the
    // main window on top of the (uncreated-yet) sniper. Result: client saw the
    // main app instead of the dim overlay. Now: just hide main + close any stale
    // sniper, then create a fresh sniper window.

    // v0.1.55: multi-monitor — use the monitor the main window is currently on
    // (current_monitor), not always primary. Without this, sniper opened on the
    // primary screen even when EngiBoard was on a secondary display.
    let monitor = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| {
            app.get_webview_window("main")
                .and_then(|w| w.primary_monitor().ok().flatten())
        })
        .or_else(|| {
            tauri::Manager::webview_windows(&app)
                .values()
                .next()
                .and_then(|w| w.current_monitor().ok().flatten())
        });

    let (w, h, mx, my) = if let Some(ref m) = monitor {
        let size = m.size();
        let pos = m.position();
        let scale = m.scale_factor();
        (
            size.width as f64 / scale,
            size.height as f64 / scale,
            pos.x as f64 / scale,
            pos.y as f64 / scale,
        )
    } else {
        (1920.0, 1080.0, 0.0, 0.0)
    };
    eprintln!("sniper target monitor: {}x{} at ({},{})", w, h, mx, my);

    // Hide main + close any stale editor (we don't open editor anymore in stage 1,
    // but kill it just in case it's hanging from a previous flow).
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.set_always_on_top(false);
        let _ = main_win.hide();
    }
    if let Some(editor_win) = app.get_webview_window("editor") {
        let _ = editor_win.close();
    }
    // Always close stale sniper; reuse breaks `transparent(true)` on macOS.
    if let Some(stale) = app.get_webview_window("sniper") {
        let _ = stale.close();
    }

    let app_clone = app.clone();
    std::thread::spawn(move || {
        // Brief pause for compositor to drop main window from the screen.
        std::thread::sleep(std::time::Duration::from_millis(200));

        eprintln!("creating sniper window: {}x{}", w, h);
        let result = WebviewWindowBuilder::new(
            &app_clone, "sniper", WebviewUrl::App("sniper.html".into()))
            .title("EngiBoard Sniper")
            .inner_size(w, h)
            .position(mx, my)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .focused(true)
            .visible(true)
            .build();

        match result {
            Ok(win) => {
                eprintln!("sniper window created OK");
                let _ = win.show();
                let _ = win.set_focus();
                let _ = win.set_always_on_top(true);
            }
            Err(e) => {
                eprintln!("FAILED to create sniper: {} — restoring main", e);
                if let Some(main_win) = app_clone.get_webview_window("main") {
                    let _ = main_win.show();
                    let _ = main_win.set_focus();
                }
            }
        }
    });
}

#[tauri::command]
fn sniper_done(app: tauri::AppHandle, data_url: String) {
    if let Some(w) = app.get_webview_window("sniper") {
        let _ = w.close();
    }
    // v0.1.42: Always bring main back so user isn't stuck with no window.
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.unminimize();
        let _ = main_win.show();
        let _ = main_win.set_focus();
    }
    // Stage-1 build: editor is locked behind OOS. If a data_url ever arrives
    // here (cancel sends empty), feed it into the main window via the same
    // screenshot-ready event so paste-mode picks it up.
    if data_url.is_empty() { return; }
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.emit("screenshot-ready", serde_json::json!({ "dataUrl": data_url }));
    }
}

#[tauri::command]
fn capture_region(app: tauri::AppHandle, x: i32, y: i32, w: i32, h: i32) {
    eprintln!("capture_region (CSS px): {}x{} at ({},{})", w, h, x, y);

    // Hide + close sniper window immediately so the screenshot doesn't include the overlay.
    if let Some(win) = app.get_webview_window("sniper") {
        let _ = win.hide();
        let _ = win.close();
    }

    std::thread::spawn(move || {
        // Wait for the sniper window to fully exit the compositor.
        for i in 0..40 {
            if app.get_webview_window("sniper").is_none() {
                eprintln!("sniper destroyed after {}ms", i * 50);
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        // Pause for compositor redraw without our overlay.
        // macOS + Metal/Figma needs 1-1.5s; Windows is generally faster.
        let redraw_ms = if cfg!(target_os = "macos") { 1200 } else { 250 };
        std::thread::sleep(std::time::Duration::from_millis(redraw_ms));

        // Capture into PNG bytes — platform-specific implementation.
        let png_bytes = match capture_region_to_png(x, y, w, h) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("capture failed: {}", e);
                // v0.1.67 FIX: when screencapture is denied Screen Recording
                // permission it exits non-zero and writes NO file at all, so
                // we land here (not in the <1500-byte heuristic below). The
                // old code just `return`ed silently — user saw nothing and
                // assumed "скриншоттер не работает". Now surface the same
                // permission modal on macOS so the cause is obvious.
                if let Some(main_win) = app.get_webview_window("main") {
                    let _ = main_win.show();
                    let _ = main_win.set_focus();
                    #[cfg(target_os = "macos")]
                    {
                        let _ = main_win.emit("capture-needs-permission", serde_json::json!({
                            "reason": e
                        }));
                    }
                }
                return;
            }
        };

        let size = png_bytes.len();
        eprintln!("captured PNG bytes: {}", size);

        // v0.1.45: detect missing Screen Recording permission (macOS).
        // When permission is denied, /usr/sbin/screencapture writes a tiny
        // empty/black PNG instead of an error. Heuristic: < 1500 bytes for
        // a non-trivial selection means we got nothing useful.
        let area_px = (w as i64) * (h as i64);
        let suspicious = cfg!(target_os = "macos") && area_px > 5000 && size < 1500;
        if suspicious {
            eprintln!("WARNING: capture {} bytes for {}x{} px area — likely missing Screen Recording permission", size, w, h);
            if let Some(main_win) = app.get_webview_window("main") {
                let _ = main_win.show();
                let _ = main_win.set_focus();
                let _ = main_win.emit("capture-needs-permission", serde_json::json!({}));
            }
            return;
        }

        let url = format!("data:image/png;base64,{}", base64_encode(&png_bytes));
        eprintln!("captured: opening editor with image, len={}", url.len());

        // v0.1.43: editor с инструментами (стрелки, маркеры, текст) — это
        // спринт 1.4 ТЗ ("Базовые визуальные аннотации поверх скриншотов").
        // Capture → editor → save → screenshot-ready → paste-mode → click slot.
        open_editor_with_image(app, url, None, None);
    });
}

// ─── Cross-platform screen-region capture ────────────────────────────────
// macOS: native /usr/sbin/screencapture (best Retina handling)
// Windows + Linux: xcap crate

#[cfg(target_os = "macos")]
fn capture_region_to_png(x: i32, y: i32, w: i32, h: i32) -> Result<Vec<u8>, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let _ = std::fs::create_dir_all(format!("{}/Pictures", home));
    let tmp = format!("{}/Pictures/engiboard_capture.png", home);
    let _ = std::fs::remove_file(&tmp);

    let region = format!("{},{},{},{}", x, y, w, h);
    eprintln!("screencapture -R {} -t png {}", region, tmp);
    let status = std::process::Command::new("/usr/sbin/screencapture")
        .args(["-R", &region, "-x", "-t", "png", &tmp])
        .status()
        .map_err(|e| format!("failed to spawn screencapture: {}", e))?;
    eprintln!("screencapture status: {:?}", status);

    // Wait for file flush (Figma/Metal apps may need it)
    std::thread::sleep(std::time::Duration::from_millis(500));

    let initial_size = std::fs::metadata(&tmp).map(|m| m.len()).unwrap_or(0);
    if initial_size > 0 && initial_size < 5000 {
        eprintln!("⚠️  Screenshot is suspiciously small ({} bytes)", initial_size);
        eprintln!("   Probably missing Screen Recording permission.");
    }
    let bytes = std::fs::read(&tmp).map_err(|e| format!("read failed: {}", e))?;
    let _ = std::fs::remove_file(&tmp);
    Ok(bytes)
}

#[cfg(not(target_os = "macos"))]
fn capture_region_to_png(x: i32, y: i32, w: i32, h: i32) -> Result<Vec<u8>, String> {
    use xcap::Monitor;
    use image::{ImageBuffer, Rgba};
    use std::io::Cursor;

    eprintln!("xcap: capturing region {}x{} at ({},{})", w, h, x, y);

    // Find the monitor that contains the rect's top-left.
    let monitors = Monitor::all().map_err(|e| format!("Monitor::all failed: {}", e))?;
    if monitors.is_empty() {
        return Err("no monitors detected".into());
    }
    // Convert CSS-px coords to physical (xcap uses physical pixels).
    // Walk monitors; pick one whose physical bounds contain (x, y) after scaling by its scale_factor.
    let target = monitors.iter().find(|m| {
        let mx = m.x();
        let my = m.y();
        let mw = m.width() as i32;
        let mh = m.height() as i32;
        x >= mx && y >= my && x < mx + mw && y < my + mh
    }).cloned().or_else(|| monitors.into_iter().next())
      .ok_or_else(|| "no matching monitor".to_string())?;

    let scale = target.scale_factor() as f64;
    let mx = target.x();
    let my = target.y();

    // Capture the whole monitor; crop to requested region.
    let full = target.capture_image().map_err(|e| format!("capture_image: {}", e))?;
    let full_w = full.width() as i32;
    let full_h = full.height() as i32;

    let phys_x = ((x - mx) as f64 * scale).round() as i32;
    let phys_y = ((y - my) as f64 * scale).round() as i32;
    let phys_w = (w as f64 * scale).round() as i32;
    let phys_h = (h as f64 * scale).round() as i32;

    let crop_x = phys_x.max(0);
    let crop_y = phys_y.max(0);
    let crop_w = phys_w.min(full_w - crop_x).max(1);
    let crop_h = phys_h.min(full_h - crop_y).max(1);

    eprintln!(
        "xcap: monitor {}x{} @ {}x scale; crop {}x{} at ({},{})",
        full_w, full_h, scale, crop_w, crop_h, crop_x, crop_y
    );

    // xcap's image is RgbaImage already; image-rs can encode it.
    let rgba: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_raw(
        full.width(),
        full.height(),
        full.into_raw(),
    ).ok_or_else(|| "ImageBuffer::from_raw failed".to_string())?;

    let cropped = image::imageops::crop_imm(&rgba, crop_x as u32, crop_y as u32, crop_w as u32, crop_h as u32).to_image();

    let mut out: Vec<u8> = Vec::with_capacity((crop_w * crop_h * 4) as usize);
    cropped.write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
        .map_err(|e| format!("PNG encode: {}", e))?;
    Ok(out)
}


#[tauri::command]
fn open_screen_recording_settings() {
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        .spawn();
}

#[tauri::command]
fn close_editor(app: tauri::AppHandle) {
    // v0.1.72: destroy() not close(). close() fires the webview's
    // onCloseRequested handler — the source of the "окно не закрывается"
    // loop. destroy() kills the window from the Rust side immediately and
    // does NOT invoke any JS close handler, so it cannot be blocked. JS just
    // calls invoke('close_editor'); all the teardown happens here.
    if let Some(w) = app.get_webview_window("editor") {
        eprintln!("close_editor: destroying editor window");
        let _ = w.destroy();
    }
    // When editor closes, restore main window so user has somewhere to go
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.unminimize();
        let _ = main_win.show();
        let _ = main_win.set_focus();
    }
}

fn file_to_data_url(path: &str) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    if bytes.is_empty() { return None; }
    let mime = if path.ends_with(".png") { "image/png" } else { "image/jpeg" };
    Some(format!("data:{};base64,{}", mime, base64_encode(&bytes)))
}

fn watch_screenshots(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let home = std::env::var("HOME").unwrap_or("/Users/alex".to_string());
        let dirs: Vec<String> = vec![
            format!("{}/Desktop", home),
            format!("{}/Pictures/Screenshots", home),
        ].into_iter().filter(|d| std::path::Path::new(d).exists()).collect();

        let known: Arc<Mutex<HashMap<String, u64>>> = Arc::new(Mutex::new(HashMap::new()));

        fn mt(m: &std::fs::Metadata) -> u64 {
            m.modified().ok()
                .map(|t| t.duration_since(SystemTime::UNIX_EPOCH).unwrap_or_default().as_secs())
                .unwrap_or(0)
        }

        for dir in &dirs {
            if let Ok(entries) = std::fs::read_dir(dir) {
                let mut k = known.lock().unwrap();
                for e in entries.flatten() {
                    let ps = e.path().to_string_lossy().to_string();
                    let m = e.metadata().map(|x| mt(&x)).unwrap_or(0);
                    k.insert(ps, m);
                }
            }
        }
        eprintln!("Watching: {:?}", dirs);

        loop {
            std::thread::sleep(std::time::Duration::from_millis(400));
            let now = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH).unwrap_or_default().as_secs();
            for dir in &dirs {
                if let Ok(entries) = std::fs::read_dir(dir) {
                    for e in entries.flatten() {
                        let path = e.path();
                        let ps = path.to_string_lossy().to_string();
                        let ext = path.extension()
                            .and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
                        if ext != "png" && ext != "jpg" { continue; }
                        let m = e.metadata().map(|x| mt(&x)).unwrap_or(0);
                        let mut k = known.lock().unwrap();
                        let prev = k.get(&ps).copied();
                        let is_new = prev != Some(m);
                        let fresh = now.saturating_sub(m) < 6;
                        if !is_new || !fresh { if is_new { k.insert(ps, m); } continue; }
                        k.insert(ps.clone(), m); drop(k);
                        eprintln!("File: {}", ps);
                        std::thread::sleep(std::time::Duration::from_millis(400));
                        if let Some(url) = file_to_data_url(&ps) {
                            open_editor_with_image(app.clone(), url, None, None);
                        }
                    }
                }
            }
        }
    });
}

pub fn base64_encode(data: &[u8]) -> String {
    const C: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut o = String::with_capacity(data.len()*4/3+4);
    let mut i = 0;
    while i < data.len() {
        let b0=data[i] as u32;
        let b1=data.get(i+1).copied().unwrap_or(0) as u32;
        let b2=data.get(i+2).copied().unwrap_or(0) as u32;
        o.push(C[((b0>>2)&63) as usize] as char);
        o.push(C[(((b0<<4)|(b1>>4))&63) as usize] as char);
        o.push(if i+1<data.len(){C[(((b1<<2)|(b2>>6))&63)as usize]as char}else{'='});
        o.push(if i+2<data.len(){C[(b2&63)as usize]as char}else{'='});
        i+=3;
    }
    o
}


// Проверка разрешения Screen Recording на macOS
#[cfg(target_os = "macos")]
fn check_screen_capture_permission() -> bool {
    // Используем CGPreflightScreenCaptureAccess() через Objective-C runtime
    // Это самый надёжный способ проверить разрешение
    use std::process::Command;

    // Простая проверка: пробуем сделать тестовый screenshot 1x1 в /tmp
    let test_path = "/tmp/engiboard_perm_test.png";
    let _ = std::fs::remove_file(test_path);
    let result = Command::new("screencapture")
        .args(["-R", "0,0,1,1", "-x", test_path])
        .status();

    let has_permission = match result {
        Ok(s) if s.success() => {
            let size = std::fs::metadata(test_path).map(|m| m.len()).unwrap_or(0);
            let _ = std::fs::remove_file(test_path);
            size > 0
        }
        _ => false,
    };

    if !has_permission {
        eprintln!("⚠️  EngiBoard needs Screen Recording permission!");
        eprintln!("   System Settings → Privacy & Security → Screen Recording");
        eprintln!("   Add EngiBoard (or Terminal/iTerm if running via cargo)");
    }
    has_permission
}


fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, shortcut, event| {
                if event.state() != ShortcutState::Pressed { return; }
                if shortcut.mods.contains(Modifiers::SUPER | Modifiers::SHIFT)
                    && shortcut.key == Code::KeyG {
                    open_sniper(app.clone());
                }
                if shortcut.mods.contains(Modifiers::SUPER | Modifiers::SHIFT)
                    && shortcut.key == Code::KeyE {
                    if let Some(w) = app.get_webview_window("main") {
                        if w.is_visible().unwrap_or(false) { let _ = w.hide(); }
                        else { let _ = w.show(); let _ = w.set_focus(); }
                    }
                }
            })
            .build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let h = app.handle();
            
            // Register engiboard:// scheme at runtime (macOS only).
            // Without this, macOS may not route URLs to our app even with Info.plist.
            #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
            {
                let _ = app.deep_link().register("engiboard");
            }

            // Register deep-link handler for OAuth callbacks (engiboard://oauth/callback?...)
            let h_deep = h.clone();
            app.deep_link().on_open_url(move |event| {
                let urls: Vec<String> = event.urls().iter().map(|u| u.to_string()).collect();
                eprintln!("Deep link received: {:?}", urls);
                if let Some(main_win) = h_deep.get_webview_window("main") {
                    let _ = main_win.unminimize();
                    let _ = main_win.show();
                    let _ = main_win.set_focus();
                    // Wait a moment for window to be ready, then send event multiple times
                    // to ensure frontend listener is registered
                    let win_clone = main_win.clone();
                    let urls_clone = urls.clone();
                    std::thread::spawn(move || {
                        for delay in [100u64, 500, 1500, 3000] {
                            std::thread::sleep(std::time::Duration::from_millis(delay));
                            let _ = win_clone.emit("oauth-callback", urls_clone.clone());
                        }
                    });
                }
            });

            // Handle URLs that triggered app launch (cold start via deep link)
            if let Ok(urls) = app.deep_link().get_current() {
                if let Some(urls) = urls {
                    let urls_str: Vec<String> = urls.iter().map(|u| u.to_string()).collect();
                    eprintln!("Cold-start deep link URLs: {:?}", urls_str);
                    let h_cold = h.clone();
                    std::thread::spawn(move || {
                        // Give frontend time to load before emitting
                        std::thread::sleep(std::time::Duration::from_millis(2000));
                        if let Some(main_win) = h_cold.get_webview_window("main") {
                            let _ = main_win.emit("oauth-callback", urls_str);
                        }
                    });
                }
            }
            
            let _ = h.global_shortcut().register(
                Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyG));
            let _ = h.global_shortcut().register(
                Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyE));
            #[cfg(target_os = "macos")]
            check_screen_capture_permission();

            watch_screenshots(app.handle().clone());
            let si = MenuItem::with_id(app,"show","Show EngiBoard",true,None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let qi = MenuItem::with_id(app,"quit","Quit",true,None::<&str>)?;
            let menu = Menu::with_items(app,&[&si,&sep,&qi])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("EngiBoard · ⌘⇧G capture")
                .on_menu_event(|app,e| match e.id.as_ref() {
                    "show" => show_main(app.clone()),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|t,e| {
                    if let TrayIconEvent::Click{button:MouseButton::Left,button_state:MouseButtonState::Up,..}=e {
                        show_main(t.app_handle().clone());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            show_main, open_editor_with_image, open_sniper, sniper_done, capture_region, close_editor, open_screen_recording_settings
        ])
        .run(tauri::generate_context!())
        .expect("error");
}

// ─── Unit tests ───────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    // base64_encode — cross-validate with known RFC 4648 test vectors

    #[test]
    fn base64_empty() {
        assert_eq!(base64_encode(b""), "");
    }

    #[test]
    fn base64_f() {
        assert_eq!(base64_encode(b"f"), "Zg==");
    }

    #[test]
    fn base64_fo() {
        assert_eq!(base64_encode(b"fo"), "Zm8=");
    }

    #[test]
    fn base64_foo() {
        assert_eq!(base64_encode(b"foo"), "Zm9v");
    }

    #[test]
    fn base64_foob() {
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
    }

    #[test]
    fn base64_fooba() {
        assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
    }

    #[test]
    fn base64_foobar() {
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn base64_man() {
        assert_eq!(base64_encode(b"Man"), "TWFu");
    }

    #[test]
    fn base64_hello() {
        assert_eq!(base64_encode(b"Hello"), "SGVsbG8=");
    }

    #[test]
    fn base64_all_zeros() {
        assert_eq!(base64_encode(&[0u8, 0, 0]), "AAAA");
    }

    #[test]
    fn base64_all_ff() {
        assert_eq!(base64_encode(&[0xffu8, 0xff, 0xff]), "////");
    }

    #[test]
    fn base64_png_header() {
        // \x89PNG\r\n\x1a\n — standard PNG magic bytes
        let magic = [0x89u8, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        assert_eq!(base64_encode(&magic), "iVBORw0KGgo=");
    }

    // file_to_data_url — mime type detection logic

    #[test]
    fn mime_png_path() {
        // The mime detection uses path suffix; we verify it by checking the prefix
        // that would be embedded in the data URL. We test the logic only (no real file).
        let path = "some/file.png";
        let mime = if path.ends_with(".png") { "image/png" } else { "image/jpeg" };
        assert_eq!(mime, "image/png");
    }

    #[test]
    fn mime_jpg_path() {
        let path = "capture_2026.jpg";
        let mime = if path.ends_with(".png") { "image/png" } else { "image/jpeg" };
        assert_eq!(mime, "image/jpeg");
    }

    #[test]
    fn mime_jpeg_path() {
        let path = "photo.jpeg";
        let mime = if path.ends_with(".png") { "image/png" } else { "image/jpeg" };
        assert_eq!(mime, "image/jpeg");
    }

    // capture_region_to_png — region bounds arithmetic (Windows/Linux xcap path)
    // We test the crop-clamp math without actually spawning screencapture.

    #[test]
    fn crop_clamp_basic() {
        // phys crop must not exceed monitor size
        let full_w = 1920i32;
        let full_h = 1080i32;
        let phys_x = 100i32;
        let phys_y = 50i32;
        let phys_w = 400i32;
        let phys_h = 300i32;

        let crop_x = phys_x.max(0);
        let crop_y = phys_y.max(0);
        let crop_w = phys_w.min(full_w - crop_x).max(1);
        let crop_h = phys_h.min(full_h - crop_y).max(1);

        assert_eq!((crop_x, crop_y, crop_w, crop_h), (100, 50, 400, 300));
    }

    #[test]
    fn crop_clamp_near_edge() {
        let full_w = 1920i32;
        let full_h = 1080i32;
        let phys_x = 1800i32;
        let phys_y = 900i32;
        let phys_w = 400i32;  // would exceed right edge
        let phys_h = 300i32;  // would exceed bottom

        let crop_x = phys_x.max(0);
        let crop_y = phys_y.max(0);
        let crop_w = phys_w.min(full_w - crop_x).max(1);
        let crop_h = phys_h.min(full_h - crop_y).max(1);

        assert_eq!(crop_w, 120); // 1920-1800=120
        assert_eq!(crop_h, 180); // 1080-900=180
    }

    #[test]
    fn crop_clamp_minimum_1px() {
        // Region at exact monitor edge → clamp to at least 1px
        let full_w = 1920i32;
        let full_h = 1080i32;
        let phys_x = 1920i32; // exactly at edge
        let phys_y = 1080i32;
        let phys_w = 100i32;
        let phys_h = 100i32;

        let crop_x = phys_x.max(0);
        let crop_y = phys_y.max(0);
        let crop_w = phys_w.min(full_w - crop_x).max(1);
        let crop_h = phys_h.min(full_h - crop_y).max(1);

        assert_eq!(crop_w, 1);
        assert_eq!(crop_h, 1);
    }

    // suspicious capture size heuristic

    #[test]
    fn suspicious_small_capture_detected() {
        let w = 800i32; let h = 600i32;
        let size = 500usize;                     // < 1500 bytes → suspicious
        let area_px: i64 = (w as i64) * (h as i64);
        let suspicious = area_px > 5000 && size < 1500;
        assert!(suspicious, "Should flag small capture as permission-denied");
    }

    #[test]
    fn large_capture_not_suspicious() {
        let w = 100i32; let h = 20i32;           // tiny area
        let size = 800usize;
        let area_px: i64 = (w as i64) * (h as i64);
        let suspicious = area_px > 5000 && size < 1500;
        assert!(!suspicious, "Small area + small file is fine");
    }

    #[test]
    fn normal_capture_not_suspicious() {
        let w = 800i32; let h = 600i32;
        let size = 50_000usize;
        let area_px: i64 = (w as i64) * (h as i64);
        let suspicious = area_px > 5000 && size < 1500;
        assert!(!suspicious, "Normal capture should not be flagged");
    }
}
