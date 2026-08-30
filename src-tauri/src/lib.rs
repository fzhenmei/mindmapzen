#[tauri::command]
fn trash_delete(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}

/// git 命令执行（M20 版本管理）：cwd 限定调用方传入的工作区目录，args 为 git 子命令。
/// 单用户桌面应用，信任本地图；输出与退出码整体回传（服务层按 ok/out 解析状态）
#[tauri::command]
fn git_exec(cwd: String, args: Vec<String>) -> Result<GitResult, String> {
    use std::process::Command;
    let out = Command::new("git")
        .args(&args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;
    Ok(GitResult {
        ok: out.status.success(),
        out: String::from_utf8_lossy(&out.stdout).into_owned(),
        err: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

#[derive(serde::Serialize)]
struct GitResult {
    ok: bool,
    out: String,
    err: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![trash_delete, git_exec])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
