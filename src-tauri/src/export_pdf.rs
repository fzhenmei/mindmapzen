// src-tauri/src/export_pdf.rs —— PDF 导出：Edge 无头打印（2026-09-23 导出 Word/PDF spec §4.2）。
// 前端经 runEdgePrint 端口 invoke；HTML 内容直传（前端不落盘），临时文件本命令自管。
// Edge 单实例语义：默认 profile 已在跑时新进程会挂回既有实例直接退出（不打印），故必须
// 独立 --user-data-dir 隔离；--no-first-run/--no-default-browser-check 压首次运行行为。
// 图片全 dataURL 内联、字体走系统，无异步外部资源，无需等待预算
use std::fs;
use std::path::{Path, PathBuf};

/// 路径 → file:// URI：反斜杠转正斜杠，空格/保留字符/非 ASCII 字节百分号编码。
/// 纯函数（单测覆盖）；UTF-8 按字节编码，合法 file URI
fn to_file_uri(path: &Path) -> String {
    let s = path.to_string_lossy().replace('\\', "/");
    let mut out = String::from("file:///");
    for b in s.bytes() {
        match b {
            b' ' | b'%' | b'#' | b'?' | b'<' | b'>' | b'"' | b'\'' | b'{' | b'}' | b'|' | b'^' | b'`' | b'\\' => {
                out.push_str(&format!("%{b:02X}"))
            }
            0x21..=0x7E => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// 定位 msedge.exe：注册表 App Paths（HKLM）优先，标准安装路径兜底。None = 未找到
fn find_msedge() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_LOCAL_MACHINE;
        use winreg::RegKey;
        if let Ok(key) = RegKey::predef(HKEY_LOCAL_MACHINE)
            .open_subkey(r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe")
        {
            if let Ok(path) = key.get_value::<String, _>("") {
                let p = PathBuf::from(&path);
                if p.is_file() {
                    return Some(p);
                }
            }
        }
        for env in ["ProgramFiles(x86)", "ProgramFiles"] {
            if let Ok(base) = std::env::var(env) {
                let p = PathBuf::from(base).join(r"Microsoft\Edge\Application\msedge.exe");
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    None
}

/// 异步命令：打印耗时秒级，async 走 tokio 不冻结主线程（同 ai_stream 惯例）
#[cfg(windows)]
#[tauri::command]
pub async fn export_pdf_via_edge(html: String, pdf_path: String) -> Result<(), String> {
    let edge = find_msedge().ok_or("未找到 Microsoft Edge，无法导出 PDF")?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let html_path = std::env::temp_dir().join(format!("mind-map-zen-export-{stamp}.html"));
    let profile_dir = std::env::temp_dir().join(format!("mind-map-zen-edge-profile-{stamp}"));
    fs::write(&html_path, &html).map_err(|e| format!("写入临时 HTML 失败：{e}"))?;

    let run = || {
        tokio::process::Command::new(&edge).args([
            "--headless=new",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            "--no-pdf-header-footer",
        ])
        .arg(format!("--user-data-dir={}", profile_dir.display()))
        .arg(format!("--print-to-pdf={pdf_path}"))
        .arg(to_file_uri(&html_path))
        .status()
    };
    let status = run().await.map_err(|e| format!("启动 Edge 失败：{e}"))?;

    // 临时产物清理：失败仅日志（系统临时目录无害，OS 周期清理），不阻塞导出结果——
    // 此处可安全忽略删除错误的原因：残留只是临时文件，无功能/隐私影响
    let cleanup = || {
        let _ = fs::remove_file(&html_path);
        let _ = fs::remove_dir_all(&profile_dir);
    };

    if !status.success() {
        cleanup();
        return Err(format!("Edge 打印失败（退出码 {}）", status.code().unwrap_or(-1)));
    }
    let ok = fs::metadata(&pdf_path).map(|m| m.len() > 0).unwrap_or(false);
    cleanup();
    if !ok {
        return Err("未生成 PDF 文件".into());
    }
    Ok(())
}

/// 非 Windows 无 Edge 无头链路，显式错误（前端 toast 出口）
#[cfg(not(windows))]
#[tauri::command]
pub async fn export_pdf_via_edge(_html: String, _pdf_path: String) -> Result<(), String> {
    Err("PDF 导出仅支持 Windows".into())
}

#[cfg(test)]
mod tests {
    use super::to_file_uri;
    use std::path::Path;

    #[test]
    fn 纯_ascii_路径直通() {
        assert_eq!(to_file_uri(Path::new(r"C:\Temp\a.html")), "file:///C:/Temp/a.html");
    }

    #[test]
    fn 空格与中文编码() {
        // 张=E5 BC A0，三=E4 B8 89
        assert_eq!(
            to_file_uri(Path::new(r"C:\Users\张 三\a.html")),
            "file:///C:/Users/%E5%BC%A0%20%E4%B8%89/a.html"
        );
    }
}
