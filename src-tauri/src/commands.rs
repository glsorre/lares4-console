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
    "sessions",
    "repl",
];

const MIGRATED_SLOT: &str = "_migrated";

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

    let mut map = match load_bundle() {
        Ok(map) => map,
        Err(e) => return VerifyResult::err(leak_static(e)),
    };

    if payload.f == "*" {
        map.insert("bundle".to_string(), raw.clone());
        if feature_id != "bundle" {
            map.remove(feature_id.as_str());
        }
    } else {
        let Some(slot) = keychain::slot_for_feature(&payload.f) else {
            return VerifyResult::err("malformed-payload");
        };
        map.insert(slot.to_string(), raw.clone());
    }

    if let Err(e) = store_bundle(&map) {
        return VerifyResult::err(leak_static(e));
    }
    result
}

#[tauri::command]
pub fn read_all_licenses() -> Result<HashMap<String, String>, String> {
    load_bundle()
}

#[tauri::command]
pub fn clear_license(feature_id: String) -> Result<(), String> {
    let Some(slot) = keychain::slot_for_feature(&feature_id) else {
        return Err(format!("Unknown feature id: {feature_id}"));
    };
    let mut map = load_bundle()?;
    map.remove(slot);
    store_bundle(&map)
}

#[tauri::command]
pub fn complete_license_migration() -> Result<(), String> {
    let mut map = load_bundle()?;
    map.insert(MIGRATED_SLOT.to_string(), "1".to_string());
    store_bundle(&map)
}

/// Load the aggregated license map. Reads the v2 bundle entry if it exists,
/// otherwise performs a one-shot migration from the legacy per-feature entries
/// (collected into the bundle, then the legacy entries are deleted so future
/// launches hit at most one keychain ACL prompt).
fn load_bundle() -> Result<HashMap<String, String>, String> {
    if let Some(raw) = keychain::read_bundle()? {
        return Ok(parse_bundle(&raw));
    }

    let mut map: HashMap<String, String> = HashMap::new();
    for account in keychain::LEGACY_ACCOUNTS {
        if let Some(secret) = keychain::read(account)? {
            if let Some(slot) = keychain::slot_from_legacy_account(account) {
                map.insert(slot.to_string(), secret);
            }
        }
    }
    if let Some(marker) = keychain::read(keychain::LEGACY_MIGRATED_MARKER)? {
        map.insert(MIGRATED_SLOT.to_string(), marker);
    }

    if !map.is_empty() {
        keychain::write_bundle(&serialize_bundle(&map))?;
        for account in keychain::LEGACY_ACCOUNTS {
            let _ = keychain::delete(account);
        }
        let _ = keychain::delete(keychain::LEGACY_MIGRATED_MARKER);
    }

    Ok(map)
}

fn store_bundle(map: &HashMap<String, String>) -> Result<(), String> {
    if map.is_empty() {
        keychain::delete_bundle()
    } else {
        keychain::write_bundle(&serialize_bundle(map))
    }
}

fn parse_bundle(raw: &str) -> HashMap<String, String> {
    serde_json::from_str(raw).unwrap_or_default()
}

fn serialize_bundle(map: &HashMap<String, String>) -> String {
    serde_json::to_string(map).unwrap_or_else(|_| "{}".to_string())
}

/// Best-effort conversion of a runtime keychain error into one of the
/// `VerifyFailureReason` strings the JS side recognises. We surface the raw
/// keychain message via `eprintln!` so the developer can still see it in
/// `tauri dev`, but the JS shell only needs a stable reason code.
fn leak_static(error: String) -> &'static str {
    eprintln!("license keychain error: {error}");
    "storage-failed"
}
