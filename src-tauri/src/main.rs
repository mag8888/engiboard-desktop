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
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn open_editor_with_image(app: tauri::AppHandle, data_url: String) {
    eprintln!("open_editor_with_image: data len={}", data_url.len());
    let d = data_url.clone();

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
            std::thread::spawn(move || {
                for delay in [800u64, 700, 900] {
                    std::thread::sleep(std::time::Duration::from_millis(delay));
                    let r = win.emit("load-image", d.clone());
                    eprintln!("emit load-image (after {}ms more): {:?}", delay, r);
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
    eprintln!("open_sniper — opening custom sniper.html overlay");

    // STEP 1: Hide main and editor windows so they don't appear in screenshot
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.set_always_on_top(false);
        let _ = main_win.hide();
    }
    if let Some(editor_win) = app.get_webview_window("editor") {
        let _ = editor_win.set_always_on_top(false);
        let _ = editor_win.hide();
    }

    // STEP 2: AppleScript to hide the entire app process (covers all edge cases)
    let _ = std::process::Command::new("osascript")
        .args(["-e", "tell application \"System Events\" to set visible of process \"EngiBoard\" to false"])
        .status();

    // STEP 3: Reuse existing sniper window or create new one
    if let Some(win) = app.get_webview_window("sniper") {
        eprintln!("sniper exists — showing");
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.set_always_on_top(true);
        return;
    }

    // STEP 4: Create FULLSCREEN borderless transparent always-on-top window
    // for area selection. Must cover ENTIRE screen including menu bar and dock.
    let app_clone = app.clone();
    std::thread::spawn(move || {
        // Wait for compositor to redraw without main window
        std::thread::sleep(std::time::Duration::from_millis(400));

        // Show app process again (we need it for sniper window to render)
        let _ = std::process::Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to set visible of process \"EngiBoard\" to true"])
            .status();

        // Get primary monitor size
        let monitor = app_clone
            .get_webview_window("main")
            .and_then(|w| w.primary_monitor().ok().flatten())
            .or_else(|| {
                // Fallback: try to get from any window
                tauri::Manager::webview_windows(&app_clone)
                    .values()
                    .next()
                    .and_then(|w| w.primary_monitor().ok().flatten())
            });

        let (w, h) = if let Some(m) = monitor {
            let size = m.size();
            let scale = m.scale_factor();
            ((size.width as f64 / scale), (size.height as f64 / scale))
        } else {
            (1920.0, 1080.0)
        };

        eprintln!("Creating sniper window: {}x{}", w, h);

        let result = WebviewWindowBuilder::new(
            &app_clone, "sniper", WebviewUrl::App("sniper.html".into()))
            .title("EngiBoard Sniper")
            .inner_size(w, h)
            .position(0.0, 0.0)
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
                eprintln!("sniper window created");
                let _ = win.show();
                let _ = win.set_focus();
            }
            Err(e) => {
                eprintln!("FAILED to create sniper: {}", e);
                // Restore main on failure
                if let Some(main_win) = app_clone.get_webview_window("main") {
                    let _ = main_win.show();
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
    if data_url.is_empty() { return; }
    open_editor_with_image(app, data_url);
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
                if let Some(win) = app.get_webview_window("main") { let _ = win.show(); }
                return;
            }
        };

        let size = png_bytes.len();
        eprintln!("captured PNG bytes: {}", size);
        if size < 500 {
            eprintln!("WARNING: capture is suspiciously small, may be empty");
        }

        let url = format!("data:image/png;base64,{}", base64_encode(&png_bytes));
        eprintln!("opening editor with image, len={}", url.len());
        open_editor_with_image(app, url);
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
    if let Some(w) = app.get_webview_window("editor") {
        let _ = w.close();
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
                            open_editor_with_image(app.clone(), url);
                        }
                    }
                }
            }
        }
    });
}

fn base64_encode(data: &[u8]) -> String {
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
