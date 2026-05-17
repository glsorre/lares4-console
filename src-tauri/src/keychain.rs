use keyring::{Entry, Error as KeyringError};

const SERVICE: &str = "me.rightright.lares4console";

/// Single aggregated keychain entry. All license tokens (and the migration
/// marker) are stored as a JSON map under this account so a fresh DMG install
/// triggers at most one macOS keychain ACL prompt on first launch.
pub const BUNDLE_ACCOUNT: &str = "licenses:v2";

/// Legacy per-feature accounts. Read once on first run for migration into the
/// v2 bundle entry, then deleted. Do not write to these after migration.
pub const LEGACY_ACCOUNTS: &[&str] = &[
    "license:bundle",
    "license:macros",
    "license:tabs",
    "license:triggers",
    "license:annotations",
    "license:multiwindow",
];

pub const LEGACY_MIGRATED_MARKER: &str = "license:_migrated";

/// Short slot name embedded in the bundle JSON map. Matches the keys the JS
/// layer expects from `read_all_licenses`.
pub fn slot_for_feature(feature_id: &str) -> Option<&'static str> {
    match feature_id {
        "bundle" => Some("bundle"),
        "macros" => Some("macros"),
        "tabs" => Some("tabs"),
        "triggers" => Some("triggers"),
        "annotations" => Some("annotations"),
        "multiwindow" => Some("multiwindow"),
        _ => None,
    }
}

pub fn slot_from_legacy_account(account: &str) -> Option<&'static str> {
    match account {
        "license:bundle" => Some("bundle"),
        "license:macros" => Some("macros"),
        "license:tabs" => Some("tabs"),
        "license:triggers" => Some("triggers"),
        "license:annotations" => Some("annotations"),
        "license:multiwindow" => Some("multiwindow"),
        _ => None,
    }
}

fn entry(account: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, account).map_err(|e| format!("keychain entry init failed: {e}"))
}

pub fn read(account: &str) -> Result<Option<String>, String> {
    let entry = entry(account)?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(format!("keychain read failed: {e}")),
    }
}

pub fn write(account: &str, secret: &str) -> Result<(), String> {
    let entry = entry(account)?;
    entry
        .set_password(secret)
        .map_err(|e| format!("keychain write failed: {e}"))
}

pub fn delete(account: &str) -> Result<(), String> {
    let entry = entry(account)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(format!("keychain delete failed: {e}")),
    }
}

pub fn read_bundle() -> Result<Option<String>, String> {
    read(BUNDLE_ACCOUNT)
}

pub fn write_bundle(payload: &str) -> Result<(), String> {
    write(BUNDLE_ACCOUNT, payload)
}

pub fn delete_bundle() -> Result<(), String> {
    delete(BUNDLE_ACCOUNT)
}

#[cfg(all(test, feature = "keychain-it"))]
mod it_tests {
    use super::*;

    #[test]
    fn write_read_delete_round_trip() {
        let account = "license:_it_round_trip";
        let _ = delete(account);
        assert_eq!(read(account).unwrap(), None);
        write(account, "secret-value").unwrap();
        assert_eq!(read(account).unwrap(), Some("secret-value".to_string()));
        delete(account).unwrap();
        assert_eq!(read(account).unwrap(), None);
    }

    #[test]
    fn bundle_round_trip() {
        let _ = delete_bundle();
        assert_eq!(read_bundle().unwrap(), None);
        write_bundle("{\"bundle\":\"LARES4-test\"}").unwrap();
        assert_eq!(
            read_bundle().unwrap(),
            Some("{\"bundle\":\"LARES4-test\"}".to_string())
        );
        delete_bundle().unwrap();
        assert_eq!(read_bundle().unwrap(), None);
    }
}
