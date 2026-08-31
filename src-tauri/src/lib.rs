#[tauri::command]
fn trash_delete(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}

/// git 命令执行（M20 版本管理）：cwd 限定调用方传入的工作区目录，args 为 git 子命令。
/// v2.4 性能修复：
///  ① async + tokio::process——不阻塞线程（同步 output() 冻结消息泵，UI 全卡，验收实案）；
///  ② Windows CREATE_NO_WINDOW——git.exe 是控制台程序，默认会闪黑色 cmd 窗口（验收实案）；
///  ③ 30s 超时——防异常仓库（如巨型 status）把会话挂死。
/// 单用户桌面应用，信任本地图；输出与退出码整体回传（服务层按 ok/out 解析状态）
#[tauri::command]
async fn git_exec(cwd: String, args: Vec<String>) -> Result<GitResult, String> {
    use std::time::Duration;
    use tokio::process::Command as TokioCommand;

    let mut cmd = TokioCommand::new("git");
    cmd.args(&args).current_dir(&cwd);
    #[cfg(windows)]
    {
        // tokio Command 自带 creation_flags（Windows）：控制台子进程不创建新窗口
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = tokio::time::timeout(Duration::from_secs(30), cmd.output())
        .await
        .map_err(|_| "git 命令超时（30 秒）".to_string())?
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
        // 运行时窗口图标（v2.4 验收：任务栏先 logo 后变 Windows 默认）——Windows 任务栏
        // 图标查询窗口类/进程资源，显式 set_icon 钉住（icons/128x128.png 与应用图标同源）
        .setup(|app| {
            use tauri::Manager;
            if let Some(win) = app.get_webview_window("main") {
                let img = tauri::image::Image::from_bytes(include_bytes!("../icons/128x128.png"))?;
                let _ = win.set_icon(img); // 失败不阻断启动（图标缺失仅视觉）
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![trash_delete, git_exec])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
