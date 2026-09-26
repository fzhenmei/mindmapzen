// src-tauri/src/mobile_sync.rs —— 手机点子捕获(2026-09-26 spec):局域网同步服务。
// 本文件分层:配置/去重(本任务)→ API 纯函数(Task 2)→ 静态资源(Task 3)→
// 服务线程与 tauri 命令(Task 4)。纯函数与 IO 解耦,单测不起端口。
use std::collections::{HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const DEFAULT_PORT: u16 = 39871;
pub const MOBILE_IDEAS_EVENT: &str = "mobile-ideas";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct MobileSyncConfig {
    pub enabled: bool,
    pub port: u16,
    pub token: String,
}

pub fn config_path(data_dir: &Path) -> PathBuf {
    data_dir.join("mobile-sync.json")
}

/// 读配置;文件缺失/损坏 → 生成默认(enabled=false 默认关:绑端口监听须用户知情自选,
/// spec §5.1,同 quickCapture 拆分哲学)并立即落盘固化 token
pub fn load_config(data_dir: &Path) -> MobileSyncConfig {
    let p = config_path(data_dir);
    if let Ok(s) = fs::read_to_string(&p) {
        if let Ok(cfg) = serde_json::from_str::<MobileSyncConfig>(&s) {
            if !cfg.token.is_empty() {
                return cfg;
            }
        }
    }
    let cfg = MobileSyncConfig { enabled: false, port: DEFAULT_PORT, token: Uuid::new_v4().to_string() };
    // 落盘失败无法在此给用户出口(调用方 setup 时无 UI);token 退化到仅本次会话有效,
    // eprintln 留排查线索(零静默原则的最低线)
    if let Err(e) = save_config(data_dir, &cfg) {
        eprintln!("mobile-sync 配置落盘失败: {e}");
    }
    cfg
}

pub fn save_config(data_dir: &Path, cfg: &MobileSyncConfig) -> Result<(), String> {
    fs::create_dir_all(data_dir).map_err(|e| format!("创建目录失败: {e}"))?;
    let s = serde_json::to_string_pretty(cfg).map_err(|e| format!("序列化失败: {e}"))?;
    fs::write(config_path(data_dir), s).map_err(|e| format!("写配置失败: {e}"))
}

/// 已受理点子 id 去重(手机整批重推幂等,spec §5.3):容量上限,超限清最旧一半
pub struct DedupSet {
    order: VecDeque<String>,
    set: HashSet<String>,
    cap: usize,
}

impl DedupSet {
    pub fn new(cap: usize) -> Self {
        Self { order: VecDeque::new(), set: HashSet::new(), cap }
    }

    /// true = 新 id(已登记);false = 重复(不再受理)
    pub fn insert(&mut self, id: &str) -> bool {
        if self.set.contains(id) {
            return false;
        }
        if self.order.len() >= self.cap {
            // 清最旧一半(cap ≥ 2 时严格小于当前长度,循环必能腾位)
            let drop_n = self.cap / 2;
            for _ in 0..drop_n {
                if let Some(old) = self.order.pop_front() {
                    self.set.remove(&old);
                }
            }
        }
        self.order.push_back(id.to_string());
        self.set.insert(id.to_string());
        true
    }
}

// ---- API 纯函数(Task 2)----

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IdeaIn {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub captured_at: u64,
}

#[derive(Serialize)]
struct IdeaResult {
    id: String,
    ok: bool,
}

pub struct ApiResponse {
    pub status: u16,
    pub body: String,
}

fn json_resp(status: u16, body: String) -> ApiResponse {
    ApiResponse { status, body }
}

#[derive(Deserialize)]
struct IdeasPayload {
    ideas: Vec<IdeaIn>,
}

/// API 路由纯函数(与传输层解耦,单测直喂字符串):
/// - GET /api/health:免认证探测(spec §5.3)
/// - POST /api/ideas:Bearer 令牌 → 解析 → 上限防呆 → 去重 → 新受理项追加进 accepted
/// - OPTIONS *:CORS preflight(dev 模式手机直连 vite 5174,跨源POST必预检;
///   令牌即唯一凭证且无 cookie,Allow-Origin:* 无风险——spec §5.6 简化落地)
/// - 其余 404
pub fn handle_api(
    method: &str,
    path: &str,
    auth: Option<&str>,
    body: &str,
    cfg: &MobileSyncConfig,
    dedup: &mut DedupSet,
    accepted: &mut Vec<IdeaIn>,
) -> ApiResponse {
    if method == "OPTIONS" {
        return json_resp(204, String::new());
    }
    if path == "/api/health" && method == "GET" {
        let v = serde_json::json!({ "app": "mind-map-zen", "version": env!("CARGO_PKG_VERSION") });
        return json_resp(200, v.to_string());
    }
    if path == "/api/ideas" && method == "POST" {
        let ok = auth.map(|a| a == format!("Bearer {}", cfg.token)).unwrap_or(false);
        if !ok {
            return json_resp(401, r#"{"error":"unauthorized"}"#.into());
        }
        let payload: IdeasPayload = match serde_json::from_str(body) {
            Ok(p) => p,
            Err(_) => return json_resp(400, r#"{"error":"bad json"}"#.into()),
        };
        if payload.ideas.is_empty() || payload.ideas.len() > 100 {
            return json_resp(400, r#"{"error":"batch size 1..=100"}"#.into());
        }
        for it in &payload.ideas {
            if it.text.is_empty() || it.text.chars().count() > 2000 || it.body.chars().count() > 20000 {
                return json_resp(400, r#"{"error":"idea too long or empty"}"#.into());
            }
        }
        let mut results = Vec::new();
        for it in payload.ideas {
            let fresh = dedup.insert(&it.id);
            // 去重命中也算 ok:手机端据此删本地,幂等不卡同步(spec §5.3)
            results.push(IdeaResult { id: it.id.clone(), ok: true });
            if fresh {
                accepted.push(it);
            }
        }
        let body = serde_json::json!({ "results": results }).to_string();
        return json_resp(200, body);
    }
    json_resp(404, r#"{"error":"not found"}"#.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("mz-mobile-sync-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn 首次加载生成默认并落盘() {
        let d = tmp_dir();
        let cfg = load_config(&d);
        assert!(!cfg.enabled);
        assert_eq!(cfg.port, DEFAULT_PORT);
        assert!(!cfg.token.is_empty());
        // 落盘可回读,token 稳定
        let cfg2 = load_config(&d);
        assert_eq!(cfg, cfg2);
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn 损坏文件回退默认() {
        let d = tmp_dir();
        fs::write(config_path(&d), "{not json").unwrap();
        let cfg = load_config(&d);
        assert!(!cfg.enabled);
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn 去重器幂等() {
        let mut s = DedupSet::new(4);
        assert!(s.insert("a"));
        assert!(!s.insert("a"));
        assert!(s.insert("b"));
    }

    #[test]
    fn 去重器超限清旧() {
        let mut s = DedupSet::new(4);
        for id in ["a", "b", "c", "d"] {
            s.insert(id);
        }
        assert!(s.insert("e")); // 触发清最旧一半(a、b 出局)
        assert!(s.insert("a")); // a 已被清理,重新受理
        assert!(!s.insert("e"));
    }

    // ---- API 纯函数(Task 2)----

    #[test]
    fn health_免认证() {
        let cfg = MobileSyncConfig { enabled: true, port: 1, token: "t".into() };
        let mut dedup = DedupSet::new(10);
        let mut accepted = Vec::new();
        let r = handle_api("GET", "/api/health", None, "", &cfg, &mut dedup, &mut accepted);
        assert_eq!(r.status, 200);
        assert!(r.body.contains("mind-map-zen"));
    }

    #[test]
    fn ideas_令牌错误401() {
        let cfg = MobileSyncConfig { enabled: true, port: 1, token: "t".into() };
        let mut dedup = DedupSet::new(10);
        let mut accepted = Vec::new();
        let r = handle_api("POST", "/api/ideas", Some("Bearer wrong"), "{}", &cfg, &mut dedup, &mut accepted);
        assert_eq!(r.status, 401);
        assert!(accepted.is_empty());
    }

    #[test]
    fn ideas_正常受理与去重() {
        let cfg = MobileSyncConfig { enabled: true, port: 1, token: "t".into() };
        let mut dedup = DedupSet::new(10);
        let mut accepted = Vec::new();
        let body = r#"{"ideas":[{"id":"u1","text":"点子甲","body":"补充","capturedAt":1}]}"#;
        let r = handle_api("POST", "/api/ideas", Some("Bearer t"), body, &cfg, &mut dedup, &mut accepted);
        assert_eq!(r.status, 200);
        assert_eq!(accepted.len(), 1);
        assert_eq!(accepted[0].text, "点子甲");
        // 同 id 重推:受理列表不再新增,但响应仍 ok(幂等语义,spec §5.3)
        let mut accepted2 = Vec::new();
        let r2 = handle_api("POST", "/api/ideas", Some("Bearer t"), body, &cfg, &mut dedup, &mut accepted2);
        assert_eq!(r2.status, 200);
        assert!(accepted2.is_empty());
    }

    #[test]
    fn ideas_超限与坏json400() {
        let cfg = MobileSyncConfig { enabled: true, port: 1, token: "t".into() };
        let mut dedup = DedupSet::new(10);
        let mut a = Vec::new();
        assert_eq!(handle_api("POST", "/api/ideas", Some("Bearer t"), "not json", &cfg, &mut dedup, &mut a).status, 400);
        let long = "x".repeat(2001);
        let body = format!(r#"{{"ideas":[{{"id":"u1","text":"{long}"}}]}}"#);
        assert_eq!(handle_api("POST", "/api/ideas", Some("Bearer t"), &body, &cfg, &mut dedup, &mut a).status, 400);
        let many: Vec<String> = (0..101).map(|i| format!(r#"{{"id":"u{i}","text":"t"}}"#)).collect();
        let body2 = format!(r#"{{"ideas":[{}]}}"#, many.join(","));
        assert_eq!(handle_api("POST", "/api/ideas", Some("Bearer t"), &body2, &cfg, &mut dedup, &mut a).status, 400);
    }

    #[test]
    fn preflight_204与未知404() {
        let cfg = MobileSyncConfig { enabled: true, port: 1, token: "t".into() };
        let mut dedup = DedupSet::new(10);
        let mut a = Vec::new();
        assert_eq!(handle_api("OPTIONS", "/api/ideas", None, "", &cfg, &mut dedup, &mut a).status, 204);
        assert_eq!(handle_api("GET", "/api/nope", None, "", &cfg, &mut dedup, &mut a).status, 404);
    }
}
