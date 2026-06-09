// src-tauri/src/license.rs
// Phase 2 из docs/SECURITY_PLAN.md — серверная привязка лицензии к
// конкретной машине. ЭТОТ МОДУЛЬ ПОКА НЕ ВКЛЮЧЁН в main.rs (нет
// зависимостей `keyring`, `sha2`, `hex` в Cargo.toml). Готовая
// заготовка, чтобы после согласования включить одним `mod license;` +
// добавлением crates.
//
// Контракт:
//   - get_machine_fingerprint() — SHA-256 от (machine_id || hostname || arch);
//     machine_id зависит от OS.
//   - keychain_store_jwt / keychain_load_jwt / keychain_clear_jwt — обёртка
//     над `keyring` crate (на macOS Keychain, Windows Credential Manager,
//     Linux Secret Service).
//   - Tauri-команды для JS-стороны: activate_license, get_license_state,
//     deactivate.
//
// JS НЕ ИМЕЕТ доступа к fingerprint напрямую — только через invoke,
// чтобы пиратская копия не могла подделать значение без пересборки
// Rust-бинаря.

use sha2::{Digest, Sha256};

const KEYCHAIN_SERVICE: &str = "com.engiboard.desktop";
const KEYCHAIN_ACCOUNT_JWT: &str = "license_jwt";

/// Собираем стабильный fingerprint машины.
/// Источники:
/// - macOS: `IOPlatformUUID`
/// - Windows: `wmic csproduct get uuid` (или GUID Win32_ComputerSystemProduct)
/// - Linux: `/etc/machine-id`
/// Плюс hostname и arch — чтобы клон диска на другое железо не прошёл.
pub fn get_machine_fingerprint() -> String {
    let machine_id = read_machine_id().unwrap_or_else(|| "unknown_machine".to_string());
    let host = hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "unknown_host".to_string());
    let arch = std::env::consts::ARCH;

    let mut hasher = Sha256::new();
    hasher.update(machine_id.as_bytes());
    hasher.update(b"|");
    hasher.update(host.as_bytes());
    hasher.update(b"|");
    hasher.update(arch.as_bytes());
    let hash = hasher.finalize();
    hex::encode(hash)
}

#[cfg(target_os = "macos")]
fn read_machine_id() -> Option<String> {
    use std::process::Command;
    let out = Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout);
    for line in s.lines() {
        if line.contains("IOPlatformUUID") {
            if let Some(start) = line.find("\"=") {
                let tail = &line[start + 2..];
                let id = tail.trim().trim_matches('"').to_string();
                if !id.is_empty() {
                    return Some(id);
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn read_machine_id() -> Option<String> {
    use std::process::Command;
    let out = Command::new("wmic")
        .args(["csproduct", "get", "uuid"])
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout);
    s.lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty() && !l.starts_with("UUID"))
        .map(|l| l.to_string())
}

#[cfg(target_os = "linux")]
fn read_machine_id() -> Option<String> {
    std::fs::read_to_string("/etc/machine-id")
        .ok()
        .map(|s| s.trim().to_string())
}

// === keychain wrappers ===

pub fn keychain_store_jwt(jwt: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_JWT)
        .map_err(|e| e.to_string())?;
    entry.set_password(jwt).map_err(|e| e.to_string())
}

pub fn keychain_load_jwt() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_JWT)
        .map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn keychain_clear_jwt() -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_JWT)
        .map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// === Tauri commands (JS bridge) ===

#[tauri::command]
pub fn license_machine_fingerprint() -> String {
    get_machine_fingerprint()
}

#[tauri::command]
pub fn license_get_jwt() -> Result<Option<String>, String> {
    keychain_load_jwt()
}

#[tauri::command]
pub fn license_set_jwt(jwt: String) -> Result<(), String> {
    keychain_store_jwt(&jwt)
}

#[tauri::command]
pub fn license_clear() -> Result<(), String> {
    keychain_clear_jwt()
}

// Что добавить в Cargo.toml при включении этого модуля:
//
// keyring  = "3"
// sha2     = "0.10"
// hex      = "0.4"
// hostname = "0.4"
//
// И в main.rs:
//   mod license;
//   .invoke_handler(tauri::generate_handler![
//       // ... существующие команды ...
//       license::license_machine_fingerprint,
//       license::license_get_jwt,
//       license::license_set_jwt,
//       license::license_clear,
//   ])
