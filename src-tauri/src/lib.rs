use std::fs;
use std::path::PathBuf;

fn app_config_dir() -> Result<PathBuf, String> {
  let base = dirs::config_dir().ok_or_else(|| String::from("Unable to resolve config directory"))?;
  Ok(base.join("lares4-console"))
}

fn profiles_path() -> Result<PathBuf, String> {
  Ok(app_config_dir()?.join("profiles.json"))
}

#[tauri::command]
fn read_profiles_file() -> Result<Option<String>, String> {
  let path = profiles_path()?;
  if !path.exists() {
    return Ok(None);
  }
  fs::read_to_string(path)
    .map(Some)
    .map_err(|error| format!("Failed to read profiles file: {error}"))
}

#[tauri::command]
fn write_profiles_file(content: String) -> Result<(), String> {
  let path = profiles_path()?;
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| format!("Failed to create profiles directory: {error}"))?;
  }
  fs::write(path, content).map_err(|error| format!("Failed to write profiles file: {error}"))
}

#[tauri::command]
fn read_utf8_file(path: String) -> Result<String, String> {
  fs::read_to_string(path).map_err(|error| format!("Failed to read file: {error}"))
}

#[tauri::command]
fn write_utf8_file(path: String, content: String) -> Result<(), String> {
  let target = PathBuf::from(path);
  if let Some(parent) = target.parent() {
    fs::create_dir_all(parent).map_err(|error| format!("Failed to create target directory: {error}"))?;
  }
  fs::write(target, content).map_err(|error| format!("Failed to write file: {error}"))
}

#[tauri::command]
fn resolve_default_session_path(prefix: String, ext: String) -> Result<String, String> {
  let dir = std::env::current_dir()
    .map_err(|error| format!("Failed to read current directory: {error}"))?
    .join(".sessions");
  fs::create_dir_all(&dir).map_err(|error| format!("Failed to create sessions directory: {error}"))?;
  let millis = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map_err(|error| format!("Failed to resolve timestamp: {error}"))?
    .as_millis();
  Ok(dir.join(format!("{prefix}-{millis}{ext}")).to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      read_profiles_file,
      write_profiles_file,
      read_utf8_file,
      write_utf8_file,
      resolve_default_session_path
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
