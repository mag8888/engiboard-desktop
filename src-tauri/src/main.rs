#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::Emitter;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
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

    // Если редактор уже открыт — переиспользуем
    if let Some(win) = app.get_webview_window("editor") {
        eprintln!("editor exists — reusing");
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.set_always_on_top(true);
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(150));
            let r = win.emit("load-image", d);
            eprintln!("emit load-image to existing: {:?}", r);
        });
        return;
    }

    // Создаём новое окно
    eprintln!("creating new editor window");
    let result = WebviewWindowBuilder::new(
        &app, "editor", WebviewUrl::App("editor.html".into()))
        .title("EngiBoard · Annotate")
        .inner_size(1200.0, 780.0)
        .min_inner_size(800.0, 540.0)
        .always_on_top(true)
        .center()
        .focused(true)
        .visible(true)
        .build();

    match result {
        Ok(win) => {
            eprintln!("editor window created OK");
            let _ = win.show();
            let _ = win.set_focus();
            std::thread::spawn(move || {
                // Ждём загрузки страницы дольше для нового окна
                std::thread::sleep(std::time::Duration::from_millis(1200));
                let r = win.emit("load-image", d);
                eprintln!("emit load-image to new: {:?}", r);
            });
        }
        Err(e) => {
            eprintln!("FAILED to create editor: {}", e);
        }
    }
}

#[tauri::command]
fn open_sniper(app: tauri::AppHandle) {
    eprintln!("open_sniper — using native macOS screencapture -i");

    // НАТИВНЫЙ macOS interactive screencapture (как ⌘⇧4)
    // Полностью обходит проблему задвоения и прозрачных окон —
    // никакого нашего window не создаём, всё делает macOS.
    std::thread::spawn(move || {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        let _ = std::fs::create_dir_all(format!("{}/Pictures", home));
        let tmp = format!("{}/Pictures/engiboard_capture.png", home);
        let _ = std::fs::remove_file(&tmp);

        eprintln!("Running: /usr/sbin/screencapture -i -x -t png {}", tmp);

        // -i interactive, -x silent, -t png
        let status = std::process::Command::new("/usr/sbin/screencapture")
            .args(["-i", "-x", "-t", "png", &tmp])
            .status();

        eprintln!("screencapture status: {:?}", status);

        let size = std::fs::metadata(&tmp).map(|m| m.len()).unwrap_or(0);
        eprintln!("file size: {} bytes", size);

        if size > 0 {
            if let Ok(bytes) = std::fs::read(&tmp) {
                let _ = std::fs::remove_file(&tmp);
                let url = format!("data:image/png;base64,{}", base64_encode(&bytes));
                eprintln!("opening editor with image, len={}", url.len());
                open_editor_with_image(app, url);
            }
        } else {
            eprintln!("Screenshot cancelled");
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

    // ШАГ 1: УНИЧТОЖАЕМ sniper окно — двумя способами (hide + close)
    // close() сам по себе асинхронный — окно может ещё быть в macOS compositor
    if let Some(win) = app.get_webview_window("sniper") {
        let _ = win.hide();           // 1. Скрыть из видимости немедленно
        let _ = win.close();          // 2. Закрыть полностью
    }

    std::thread::spawn(move || {
        // ШАГ 2: Ждём пока окно ТОЧНО исчезнет из композитора
        for i in 0..40 {
            if app.get_webview_window("sniper").is_none() {
                eprintln!("sniper destroyed after {}ms", i * 50);
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        // ШАГ 3: ДОЛГАЯ пауза для composite redraw
        // На Retina + Figma + Chrome + Vivox любые GPU apps требуют 1-1.5 сек
        // чтобы macOS гарантированно перерисовал screen без нашего sniper
        std::thread::sleep(std::time::Duration::from_millis(1200));

        // ШАГ 3: Делаем скриншот (sniper уже исчез)
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        let _ = std::fs::create_dir_all(format!("{}/Pictures", home));
        let tmp = format!("{}/Pictures/engiboard_capture.png", home);
        let _ = std::fs::remove_file(&tmp);

        // ВАЖНО: используем CSS pixels (logical) — screencapture сам разберётся с Retina
        let region = format!("{},{},{},{}", x, y, w, h);
        eprintln!("screencapture -R {} (logical pixels) -> {}", region, tmp);

        // -R region, -x silent, -t png format
        // Прямой вызов screencapture с absolute path
        eprintln!("screencapture -R {} -t png {}", region, tmp);
        let status = std::process::Command::new("/usr/sbin/screencapture")
            .args(["-R", &region, "-x", "-t", "png", &tmp])
            .status();
        eprintln!("screencapture status: {:?}", status);

        // КРИТИЧНО: Проверяем что файл реально содержит данные другого приложения
        // Если screencapture вернул успех но файл маленький (<5KB) — скорее всего нет разрешения
        let initial_size = std::fs::metadata(&tmp).map(|m| m.len()).unwrap_or(0);
        if initial_size > 0 && initial_size < 5000 {
            eprintln!("⚠️  Screenshot is suspiciously small ({} bytes)", initial_size);
            eprintln!("   This usually means EngiBoard lacks Screen Recording permission.");
            eprintln!("   Open: System Settings → Privacy & Security → Screen Recording");
        }

        // ШАГ 4: Ждём пока файл запишется (Figma и Metal apps требуют больше времени)
        std::thread::sleep(std::time::Duration::from_millis(500));

        let size = std::fs::metadata(&tmp).map(|m| m.len()).unwrap_or(0);
        eprintln!("file: {} = {} bytes", tmp, size);

        // Если файл маленький (<500 bytes) — скорее всего пустой/белый
        if size > 0 && size < 500 {
            eprintln!("WARNING: file too small, may be empty/white");
        }

        if size > 0 {
            if let Ok(bytes) = std::fs::read(&tmp) {
                let _ = std::fs::remove_file(&tmp);
                let url = format!("data:image/png;base64,{}", base64_encode(&bytes));
                eprintln!("opening editor with image, len={}", url.len());
                open_editor_with_image(app, url);
                return;
            }
        }
        eprintln!("FAILED to read capture, showing main");
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.show();
        }
    });
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
        .setup(|app| {
            let h = app.handle();
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
