fn main() {
    // Embed the Ed25519 verifying keys at compile time so the JS bundle no
    // longer needs to ship them. Override via the LARES4_LICENSE_PUBKEY env
    // var at Rust build time (comma-separated 32-byte hex keys); otherwise
    // we bake in the production key.
    //
    // fingerprint: 887772be
    const PRODUCTION_LICENSE_PUBKEYS: &str =
        "887772be1db8c3232aa315d5e9f37d198ea2c102b61d01410e4b7f7b785e8250";
    let keys = std::env::var("LARES4_LICENSE_PUBKEY")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| PRODUCTION_LICENSE_PUBKEYS.to_string());
    println!("cargo:rustc-env=LARES4_LICENSE_PUBKEYS={keys}");
    println!("cargo:rerun-if-env-changed=LARES4_LICENSE_PUBKEY");
    tauri_build::build();
}
