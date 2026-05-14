use std::collections::HashMap;

use crate::keychain;
use crate::license::{configured_pubkeys, verify_token, VerifyResult};

const ALLOWED_FEATURE_IDS: &[&str] = &[
    "bundle",
    "macros",
    "tabs",
    "triggers",
    "annotations",
    "multiwindow",
];

#[tauri::command]
pub fn verify_license_token(raw: String, feature_id: String) -> VerifyResult {
    let probe_feature = if feature_id == "bundle" {
        "macros".to_string()
    } else {
        feature_id
    };
    verify_token(&raw, &probe_feature, &configured_pubkeys())
}

#[tauri::command]
pub fn save_license_token(feature_id: String, raw: String) -> VerifyResult {
    if !ALLOWED_FEATURE_IDS.contains(&feature_id.as_str()) {
        return VerifyResult::err("malformed-payload");
    }
    let probe_feature = if feature_id == "bundle" {
        "macros".to_string()
    } else {
        feature_id.clone()
    };
    let result = verify_token(&raw, &probe_feature, &configured_pubkeys());
    if !result.ok {
        return result;
    }
    let payload = result.payload.as_ref().expect("ok result has payload");
    if payload.f == "*" {
        if let Err(e) = keychain::write("license:bundle", &raw) {
            return VerifyResult::err(leak_static(e));
        }
        if feature_id != "bundle" {
            if let Some(account) = keychain::account_for_feature(&feature_id) {
                let _ = keychain::delete(account);
            }
        }
    } else {
        let Some(account) = keychain::account_for_feature(&payload.f) else {
            return VerifyResult::err("malformed-payload");
        };
        if let Err(e) = keychain::write(account, &raw) {
            return VerifyResult::err(leak_static(e));
        }
    }
    result
}

#[tauri::command]
pub fn read_all_licenses() -> Result<HashMap<String, String>, String> {
    let mut out = HashMap::new();
    for account in keychain::ACCOUNTS {
        if let Some(secret) = keychain::read(account)? {
            let short = account.strip_prefix("license:").unwrap_or(account).to_string();
            out.insert(short, secret);
        }
    }
    if let Some(marker) = keychain::read(keychain::MIGRATED_MARKER)? {
        out.insert("_migrated".to_string(), marker);
    }
    Ok(out)
}

#[tauri::command]
pub fn clear_license(feature_id: String) -> Result<(), String> {
    let Some(account) = keychain::account_for_feature(&feature_id) else {
        return Err(format!("Unknown feature id: {feature_id}"));
    };
    keychain::delete(account)
}

#[tauri::command]
pub fn complete_license_migration() -> Result<(), String> {
    keychain::write(keychain::MIGRATED_MARKER, "1")
}

/// Best-effort conversion of a runtime keychain error into one of the
/// `VerifyFailureReason` strings the JS side recognises. We surface the raw
/// keychain message via `eprintln!` so the developer can still see it in
/// `tauri dev`, but the JS shell only needs a stable reason code.
fn leak_static(error: String) -> &'static str {
    eprintln!("license keychain error: {error}");
    "storage-failed"
}
