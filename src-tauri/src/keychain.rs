use keyring::{Entry, Error as KeyringError};

const SERVICE: &str = "me.rightright.lares4console";

pub const ACCOUNTS: &[&str] = &[
    "license:bundle",
    "license:macros",
    "license:tabs",
    "license:triggers",
    "license:annotations",
    "license:multiwindow",
];

pub const MIGRATED_MARKER: &str = "license:_migrated";

pub fn account_for_feature(feature_id: &str) -> Option<&'static str> {
    match feature_id {
        "bundle" => Some("license:bundle"),
        "macros" => Some("license:macros"),
        "tabs" => Some("license:tabs"),
        "triggers" => Some("license:triggers"),
        "annotations" => Some("license:annotations"),
        "multiwindow" => Some("license:multiwindow"),
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
}
