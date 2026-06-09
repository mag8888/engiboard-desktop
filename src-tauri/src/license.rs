// src-tauri/src/license.rs
// Phase 2 из docs/SECURITY_PLAN.md — серверная привязка лицензии к
// конкретной машине.
//
// Что внутри:
//   - get_machine_fingerprint() — SHA-256 от (machine_id || hostname || arch);
//     machine_id зависит от OS.
//   - keychain_store_jwt / keychain_load_jwt / keychain_clear_jwt — обёртки
//     над `keyring` crate (macOS Keychain, Win Credential Manager, Linux Secret Service).
//   - HTTP-вызовы Supabase Edge Functions (license-activate, license-heartbeat).
//   - Tauri-команды для JS-стороны (license-gate.html).
//
// JS НЕ имеет прямого доступа к fingerprint и не дёргает Supabase напрямую
// для лицензии — только через invoke, чтобы пиратская копия не могла
// подделать значение без пересборки Rust-бинаря.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const KEYCHAIN_SERVICE: &str = "com.engiboard.desktop";
const KEYCHAIN_ACCOUNT_JWT: &str = "license_jwt";
const KEYCHAIN_ACCOUNT_EXP: &str = "license_jwt_exp";

// Supabase project — приклеен в коде, нет смысла прятать (всё равно
// торчит в трафике). Защита — серверная: без валидной auth + ключа
// просто 401/403.
const SUPABASE_URL: &str = "https://gselxucvcomqlfyogidz.supabase.co";
// Publishable key — тот же что в dist/index.html. RLS-защищён, в браузере
// безопасно. Edge Functions используют его для apikey-заголовка.
const SUPABASE_ANON_KEY: &str = "sb_publishable_aQQe78hYSZThsOSlJ9e7eQ_BDO5_bWo";

// ============================================================
// MACHINE FINGERPRINT
// ============================================================

/// Стабильный fingerprint машины.
/// macOS: IOPlatformUUID; Windows: wmic UUID; Linux: /etc/machine-id.
/// Плюс hostname и arch — клон диска на другое железо не пройдёт.
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
            if let Some(eq_pos) = line.find("\" = \"") {
                let tail = &line[eq_pos + 5..];
                if let Some(end) = tail.find('"') {
                    return Some(tail[..end].to_string());
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

// ============================================================
// KEYCHAIN
// ============================================================

pub fn keychain_store(account: &str, value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, account).map_err(|e| e.to_string())?;
    entry.set_password(value).map_err(|e| e.to_string())
}

pub fn keychain_load(account: &str) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, account).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn keychain_clear(account: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, account).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ============================================================
// HTTP CALLS to Supabase Edge Functions
// ============================================================

#[derive(Serialize)]
struct ActivateBody<'a> {
    license_key: &'a str,
    machine_fingerprint: &'a str,
    machine_label: &'a str,
    os: &'a str,
    app_version: &'a str,
}

#[derive(Serialize)]
struct HeartbeatBody<'a> {
    machine_fingerprint: &'a str,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct LicenseInfo {
    #[serde(default)]
    pub id: Option<String>,
    pub plan: String,
    #[serde(default)]
    pub seats: Option<i32>,
    pub expires_at: String,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct LicenseResponse {
    pub jwt: String,
    pub expires_at: String,
    #[serde(default)]
    pub license: Option<LicenseInfo>,
}

#[derive(Deserialize, Debug)]
struct ErrResponse {
    error: Option<String>,
    #[serde(default)]
    detail: Option<String>,
}

async fn call_supabase_fn(
    function_name: &str,
    auth_token: &str,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let url = format!("{}/functions/v1/{}", SUPABASE_URL, function_name);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&url)
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", auth_token))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("network: {}", e))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let parsed: Result<ErrResponse, _> = serde_json::from_str(&text);
        let msg = match parsed {
            Ok(e) => e.error.unwrap_or_else(|| format!("http_{}", status.as_u16())),
            Err(_) => format!("http_{}", status.as_u16()),
        };
        return Err(msg);
    }
    serde_json::from_str(&text).map_err(|e| format!("bad_response: {}", e))
}

// ============================================================
// TAURI COMMANDS — bridge to JS
// ============================================================

#[tauri::command]
pub fn license_machine_fingerprint() -> String {
    get_machine_fingerprint()
}

#[tauri::command]
pub fn license_get_stored() -> Result<Option<LicenseStoredState>, String> {
    let jwt = keychain_load(KEYCHAIN_ACCOUNT_JWT)?;
    let exp = keychain_load(KEYCHAIN_ACCOUNT_EXP)?;
    match (jwt, exp) {
        (Some(jwt), Some(exp)) => Ok(Some(LicenseStoredState { jwt, expires_at: exp })),
        _ => Ok(None),
    }
}

#[derive(Serialize)]
pub struct LicenseStoredState {
    pub jwt: String,
    pub expires_at: String,
}

#[tauri::command]
pub async fn license_activate(
    license_key: String,
    machine_label: String,
    supabase_access_token: String,
    app_version: String,
) -> Result<LicenseResponse, String> {
    let fingerprint = get_machine_fingerprint();
    let os = std::env::consts::OS;
    let body = serde_json::json!({
        "license_key": license_key,
        "machine_fingerprint": fingerprint,
        "machine_label": machine_label,
        "os": os,
        "app_version": app_version,
    });
    let raw = call_supabase_fn("license-activate", &supabase_access_token, body).await?;
    let resp: LicenseResponse =
        serde_json::from_value(raw).map_err(|e| format!("bad_response: {}", e))?;
    keychain_store(KEYCHAIN_ACCOUNT_JWT, &resp.jwt)?;
    keychain_store(KEYCHAIN_ACCOUNT_EXP, &resp.expires_at)?;
    Ok(resp)
}

#[tauri::command]
pub async fn license_heartbeat() -> Result<LicenseResponse, String> {
    let jwt = keychain_load(KEYCHAIN_ACCOUNT_JWT)?
        .ok_or_else(|| "no_jwt_stored".to_string())?;
    let fingerprint = get_machine_fingerprint();
    let body = serde_json::json!({ "machine_fingerprint": fingerprint });
    let raw = call_supabase_fn("license-heartbeat", &jwt, body).await?;
    let resp: LicenseResponse =
        serde_json::from_value(raw).map_err(|e| format!("bad_response: {}", e))?;
    keychain_store(KEYCHAIN_ACCOUNT_JWT, &resp.jwt)?;
    keychain_store(KEYCHAIN_ACCOUNT_EXP, &resp.expires_at)?;
    Ok(resp)
}

#[tauri::command]
pub fn license_clear() -> Result<(), String> {
    let _ = keychain_clear(KEYCHAIN_ACCOUNT_JWT);
    let _ = keychain_clear(KEYCHAIN_ACCOUNT_EXP);
    Ok(())
}

// ============================================================
// HEARTBEAT TICKER
// ============================================================

/// Запускается из main() при старте; каждые 60 минут пингует сервер.
/// Если 3 промаха подряд — emit-ит событие "license:offline" в окно,
/// JS показывает баннер. На самом тикере НИЧЕГО не блокируем —
/// все блокировки делает экран license-gate на старте.
pub fn spawn_heartbeat_ticker(app_handle: tauri::AppHandle) {
    use tauri::Emitter;
    tauri::async_runtime::spawn(async move {
        let mut consecutive_failures = 0u32;
        // первый пинг через 5 минут после старта, чтобы не нагружать сразу
        tokio::time::sleep(std::time::Duration::from_secs(5 * 60)).await;
        loop {
            match license_heartbeat().await {
                Ok(_) => {
                    if consecutive_failures > 0 {
                        let _ = app_handle.emit("license:online", ());
                    }
                    consecutive_failures = 0;
                }
                Err(e) => {
                    // "no_jwt_stored" — пользователь ещё не активировал
                    // лицензию. Это нормально пока gate выключен (v0.1.160-
                    // v0.1.16x). Не считаем за failure и не шлём баннер.
                    if e == "no_jwt_stored" {
                        // спим обычный интервал и пробуем дальше
                    } else {
                        consecutive_failures += 1;
                        if consecutive_failures >= 3 {
                            let _ = app_handle.emit(
                                "license:offline",
                                serde_json::json!({
                                    "reason": e,
                                    "consecutive": consecutive_failures,
                                }),
                            );
                        }
                    }
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(60 * 60)).await;
        }
    });
}
