use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

pub const TOKEN_PREFIX: &str = "LARES4-";
pub const PAYLOAD_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LicensePayload {
    pub v: u32,
    pub f: String,
    pub sub: String,
    pub iat: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exp: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct VerifyResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<LicensePayload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<&'static str>,
}

impl VerifyResult {
    pub fn ok(payload: LicensePayload) -> Self {
        Self { ok: true, payload: Some(payload), reason: None }
    }

    pub fn err(reason: &'static str) -> Self {
        Self { ok: false, payload: None, reason: Some(reason) }
    }
}

fn is_valid_feature_claim(value: &str) -> bool {
    matches!(
        value,
        "macros" | "tabs" | "triggers" | "annotations" | "multiwindow" | "*"
    )
}

fn decode_b64_url(input: &str) -> Result<Vec<u8>, ()> {
    let stripped: &str = input.trim_end_matches('=');
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(stripped)
        .map_err(|_| ())
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Configured Ed25519 verifying keys, parsed from the LARES4_LICENSE_PUBKEYS
/// compile-time env (set by build.rs).
pub fn configured_pubkeys() -> Vec<[u8; 32]> {
    parse_pubkey_list(env!("LARES4_LICENSE_PUBKEYS"))
}

fn parse_pubkey_list(src: &str) -> Vec<[u8; 32]> {
    src.split(',')
        .map(str::trim)
        .filter(|s| s.len() == 64)
        .filter_map(|s| hex::decode(s).ok())
        .filter_map(|v| <[u8; 32]>::try_from(v).ok())
        .collect()
}

/// Verify a `LARES4-...` token against the supplied verifying keys. Mirrors
/// the JS implementation that previously lived in `license-verify.ts`:
/// signature first, then payload parse, then version, then expiry, then
/// feature claim.
pub fn verify_token(raw: &str, feature_id: &str, pubkeys: &[[u8; 32]]) -> VerifyResult {
    if raw.is_empty() {
        return VerifyResult::err("malformed-structure");
    }
    if pubkeys.is_empty() {
        return VerifyResult::err("pubkey-unconfigured");
    }
    if !raw.starts_with(TOKEN_PREFIX) {
        return VerifyResult::err("malformed-prefix");
    }
    let body = &raw[TOKEN_PREFIX.len()..];
    let Some(dot_idx) = body.find('.') else {
        return VerifyResult::err("malformed-structure");
    };
    if dot_idx == 0 || dot_idx == body.len() - 1 {
        return VerifyResult::err("malformed-structure");
    }
    let payload_enc = &body[..dot_idx];
    let sig_enc = &body[dot_idx + 1..];

    let Ok(payload_bytes) = decode_b64_url(payload_enc) else {
        return VerifyResult::err("malformed-base64");
    };
    let Ok(sig_bytes) = decode_b64_url(sig_enc) else {
        return VerifyResult::err("malformed-base64");
    };
    let Ok(sig_array): Result<[u8; 64], _> = sig_bytes.try_into() else {
        return VerifyResult::err("malformed-base64");
    };
    let signature = Signature::from_bytes(&sig_array);

    let signed = payload_enc.as_bytes();
    let mut sig_valid = false;
    for candidate in pubkeys {
        let Ok(vk) = VerifyingKey::from_bytes(candidate) else { continue };
        if vk.verify(signed, &signature).is_ok() {
            sig_valid = true;
            break;
        }
    }
    if !sig_valid {
        return VerifyResult::err("bad-signature");
    }

    let payload: LicensePayload = match serde_json::from_slice(&payload_bytes) {
        Ok(p) => p,
        Err(_) => return VerifyResult::err("malformed-payload"),
    };
    if !is_valid_feature_claim(&payload.f) {
        return VerifyResult::err("malformed-payload");
    }
    if payload.v != PAYLOAD_VERSION {
        return VerifyResult::err("unsupported-version");
    }
    if let Some(exp) = payload.exp {
        if exp <= now_secs() {
            return VerifyResult::err("expired");
        }
    }
    if payload.f != "*" && payload.f != feature_id {
        return VerifyResult::err("feature-mismatch");
    }
    VerifyResult::ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use ed25519_dalek::{Signer, SigningKey};

    fn signing_key() -> SigningKey {
        SigningKey::from_bytes(&[7u8; 32])
    }

    fn pubkey_bytes() -> [u8; 32] {
        signing_key().verifying_key().to_bytes()
    }

    fn keys() -> Vec<[u8; 32]> {
        vec![pubkey_bytes()]
    }

    fn mint(payload: &LicensePayload) -> String {
        let json = serde_json::to_vec(payload).unwrap();
        let enc = URL_SAFE_NO_PAD.encode(&json);
        let sig = signing_key().sign(enc.as_bytes());
        format!("{TOKEN_PREFIX}{enc}.{}", URL_SAFE_NO_PAD.encode(sig.to_bytes()))
    }

    fn payload(feature: &str, exp: Option<i64>) -> LicensePayload {
        LicensePayload {
            v: 1,
            f: feature.to_string(),
            sub: "test@example.com".to_string(),
            iat: now_secs(),
            exp,
        }
    }

    #[test]
    fn accepts_well_formed_token_for_matching_feature() {
        let token = mint(&payload("macros", None));
        let r = verify_token(&token, "macros", &keys());
        assert!(r.ok);
        assert_eq!(r.payload.unwrap().f, "macros");
    }

    #[test]
    fn rejects_feature_mismatch() {
        let token = mint(&payload("tabs", None));
        let r = verify_token(&token, "macros", &keys());
        assert!(!r.ok);
        assert_eq!(r.reason, Some("feature-mismatch"));
    }

    #[test]
    fn bundle_token_unlocks_any_feature() {
        let token = mint(&payload("*", None));
        for f in ["macros", "tabs", "triggers", "annotations", "multiwindow"] {
            let r = verify_token(&token, f, &keys());
            assert!(r.ok, "bundle should unlock {f}");
        }
    }

    #[test]
    fn rejects_expired_token() {
        let token = mint(&payload("macros", Some(now_secs() - 60)));
        let r = verify_token(&token, "macros", &keys());
        assert!(!r.ok);
        assert_eq!(r.reason, Some("expired"));
    }

    #[test]
    fn rejects_tampered_signature() {
        let token = mint(&payload("macros", None));
        let dot = token.rfind('.').unwrap();
        let mut bytes: Vec<u8> = token.into_bytes();
        bytes[dot + 1] = if bytes[dot + 1] == b'A' { b'B' } else { b'A' };
        let flipped = String::from_utf8(bytes).unwrap();
        let r = verify_token(&flipped, "macros", &keys());
        assert!(!r.ok);
        assert_eq!(r.reason, Some("bad-signature"));
    }

    #[test]
    fn rejects_missing_prefix() {
        let r = verify_token("not-a-token", "macros", &keys());
        assert!(!r.ok);
        assert_eq!(r.reason, Some("malformed-prefix"));
    }

    #[test]
    fn rejects_malformed_base64() {
        let r = verify_token("LARES4-not!base64.also$bad", "macros", &keys());
        assert!(!r.ok);
        assert_eq!(r.reason, Some("malformed-base64"));
    }

    #[test]
    fn rejects_missing_dot() {
        let r = verify_token("LARES4-AAAA", "macros", &keys());
        assert!(!r.ok);
        assert_eq!(r.reason, Some("malformed-structure"));
    }

    #[test]
    fn rejects_unsupported_version() {
        let mut p = payload("macros", None);
        p.v = 99;
        let token = mint(&p);
        let r = verify_token(&token, "macros", &keys());
        assert!(!r.ok);
        assert_eq!(r.reason, Some("unsupported-version"));
    }

    #[test]
    fn reports_pubkey_unconfigured_when_empty() {
        let token = mint(&payload("macros", None));
        let r = verify_token(&token, "macros", &[]);
        assert!(!r.ok);
        assert_eq!(r.reason, Some("pubkey-unconfigured"));
    }

    #[test]
    fn parse_pubkey_list_filters_invalid_entries() {
        let one = "887772be1db8c3232aa315d5e9f37d198ea2c102b61d01410e4b7f7b785e8250";
        let two = "aabbccdd"; // too short
        let parsed = parse_pubkey_list(&format!("{one},{two}"));
        assert_eq!(parsed.len(), 1);
    }
}
