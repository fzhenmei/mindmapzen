// src-tauri/src/ai_stream.rs —— AI 对话流式哑管道（spec §2.1）：
// 只做 POST + SSE 字节流转发，不懂 OpenAI 协议（chunk 解析在前端 client.ts）。
// 工程约束沿用 git_exec 教训：async 不阻塞消息泵；连接超时 10s + 空闲超时 120s
// （不设总超时——流式长回答会被误杀）；api_key 不进日志。
use crate::sse::SseParser;
use futures_util::StreamExt;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::ipc::Channel;

/// 事件出口抽象：生产为 Channel，测试为收集器（Channel 绑 ipc 无法单测构造）
pub trait EventSink: Send + Sync + 'static {
    fn send(&self, v: serde_json::Value);
}

impl EventSink for Channel<serde_json::Value> {
    fn send(&self, v: serde_json::Value) {
        // Channel 发送失败仅意味着前端已离开（窗口关闭），静默丢弃是预期路径
        let _ = Channel::send(self, v);
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatRequest {
    /// 完整 endpoint（前端拼好 base_url + /chat/completions）
    pub url: String,
    pub api_key: String,
    pub body: serde_json::Value,
}

static AI_STREAM_SEQ: AtomicU32 = AtomicU32::new(1);
static AI_ABORTS: Mutex<Option<HashMap<u32, tokio::task::AbortHandle>>> = Mutex::new(None);

fn registry_remove(id: u32) {
    let mut g = match AI_ABORTS.lock() {
        Ok(g) => g,
        Err(e) => {
            eprintln!("AI abort 注册表锁中毒: {e}"); // 显式出口：不静默吞
            return;
        }
    };
    if let Some(map) = g.as_mut() {
        map.remove(&id);
    }
}

/// 发起一次流式请求；spawn 后台任务消费流，立即返回句柄 id
#[tauri::command]
pub async fn ai_chat_start(
    channel: Channel<serde_json::Value>,
    request: AiChatRequest,
) -> Result<u32, String> {
    let id = AI_STREAM_SEQ.fetch_add(1, Ordering::Relaxed);
    let handle = tokio::spawn(async move {
        // channel 先 clone 再move入 run_chat_stream：Err 分支还要用同一 channel 收尾
        // （Channel 的 Clone 是同一 ipc 通道的廉价引用，前端回调不因 clone 而变）
        if let Err(msg) =
            run_chat_stream(channel.clone(), request.url, request.api_key, request.body).await
        {
            // 传输级错误也要送达前端（吞异常红线）；end 由本包装统一收尾一次
            let _ = channel.send(serde_json::json!({ "type": "error", "message": msg }));
            let _ = channel.send(serde_json::json!({ "type": "end" }));
        }
        registry_remove(id);
    });
    let mut g = AI_ABORTS.lock().map_err(|e| e.to_string())?;
    g.get_or_insert_with(HashMap::new).insert(id, handle.abort_handle());
    Ok(id)
}

/// 停止按钮：中止后台流任务。被中止的任务不会发 end——前端 abort 后自行收尾（client.ts 契约）
#[tauri::command]
pub fn ai_chat_abort(id: u32) -> Result<(), String> {
    let mut g = AI_ABORTS.lock().map_err(|e| e.to_string())?;
    if let Some(h) = g.as_mut().and_then(|m| m.remove(&id)) {
        h.abort();
    }
    Ok(())
}

/// 流主体：HTTP 错误发 error+end；正常路径 delta×N → done → end；
/// 流断而未见 [DONE] 按 error 收尾（spec §8 流中断口径）。end 恒为最后一条。
pub async fn run_chat_stream(
    sink: impl EventSink,
    url: String,
    api_key: String,
    body: serde_json::Value,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("AI_CLIENT_BUILD_FAILED: {e}"))?;
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("AI_REQUEST_FAILED: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        sink.send(
            serde_json::json!({ "type": "error", "message": truncate(&text, 2048), "status": status.as_u16() }),
        );
        sink.send(serde_json::json!({ "type": "end" }));
        return Ok(());
    }
    let mut parser = SseParser::new();
    let mut stream = resp.bytes_stream();
    loop {
        let chunk = tokio::time::timeout(Duration::from_secs(120), stream.next())
            .await
            .map_err(|_| "AI_IDLE_TIMEOUT".to_string())?
            // transpose：Option<Result<Bytes,E>> → Result<Option<Bytes>,E>，
            // EOF(None) 走 break、传输错走 map_err，两层各自有出口
            .transpose()
            .map_err(|e| format!("AI_STREAM_FAILED: {e}"))?;
        let Some(bytes) = chunk else { break };
        for data in parser.feed(&String::from_utf8_lossy(&bytes)) {
            if data == "[DONE]" {
                sink.send(serde_json::json!({ "type": "done" }));
                sink.send(serde_json::json!({ "type": "end" }));
                return Ok(());
            }
            sink.send(serde_json::json!({ "type": "delta", "data": data }));
        }
    }
    sink.send(serde_json::json!({ "type": "error", "message": "AI_STREAM_ENDED_WITHOUT_DONE" }));
    sink.send(serde_json::json!({ "type": "end" }));
    Ok(())
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    // 按字节切 max 可能落在多字节字符内部（中文错误体即命中）导致 panic——
    // 后台任务 panic 后前端将收不到 error/end，故回退到最近的 char boundary
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…(截断)", &s[..end])
}

#[cfg(test)]
mod tests {
    use super::{run_chat_stream, EventSink};
    use std::sync::{Arc, Mutex};

    /// 收集型 sink（测试替身：Channel 绑 ipc 无法在单测构造）
    #[derive(Clone, Default)]
    struct VecSink(Arc<Mutex<Vec<serde_json::Value>>>);
    impl EventSink for VecSink {
        fn send(&self, v: serde_json::Value) {
            self.0.lock().expect("sink 锁").push(v);
        }
    }

    async fn serve_once(response: &'static str) -> String {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            let mut buf = [0u8; 4096];
            let _n = sock.read(&mut buf).await.unwrap(); // 读掉请求头（含 body 足够）
            let _ = sock.write_all(response.as_bytes()).await;
        });
        format!("http://{addr}/v1/chat/completions")
    }

    #[tokio::test]
    async fn 流式转发到事件序列() {
        let url = serve_once(
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n\
             data: {\"choices\":[{\"delta\":{\"content\":\"你\"}}]}\n\n\
             data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n\
             data: [DONE]\n\n",
        )
        .await;
        let sink = VecSink::default();
        run_chat_stream(sink.clone(), url, "k".into(), serde_json::json!({}))
            .await
            .unwrap();
        let got = sink.0.lock().unwrap();
        assert_eq!(got[0]["type"], "delta");
        assert_eq!(got[0]["data"], "{\"choices\":[{\"delta\":{\"content\":\"你\"}}]}");
        assert_eq!(got[1]["type"], "delta");
        assert_eq!(got[2]["type"], "done");
        assert_eq!(got[3]["type"], "end");
    }

    #[tokio::test]
    async fn 非200转错误事件() {
        let url = serve_once(
            "HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n\
             {\"error\":{\"message\":\"bad key\"}}",
        )
        .await;
        let sink = VecSink::default();
        run_chat_stream(sink.clone(), url, "k".into(), serde_json::json!({}))
            .await
            .unwrap();
        let got = sink.0.lock().unwrap();
        assert_eq!(got[0]["type"], "error");
        assert_eq!(got[0]["status"], 401);
        assert!(got[0]["message"].as_str().unwrap().contains("bad key"));
        assert_eq!(got[1]["type"], "end");
    }

    #[tokio::test]
    async fn 流中断无done按错误收尾() {
        let url = serve_once(
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n\
             data: {\"choices\":[{\"delta\":{\"content\":\"半\"}}]}\n\n", // 无 [DONE] 即断
        )
        .await;
        let sink = VecSink::default();
        run_chat_stream(sink.clone(), url, "k".into(), serde_json::json!({}))
            .await
            .unwrap();
        let got = sink.0.lock().unwrap();
        assert_eq!(got.last().unwrap()["type"], "end");
        assert!(got.iter().any(|v| v["type"] == "error"));
    }

    #[test]
    fn truncate多字节边界不panic() {
        // "ab你"=5 字节/周期，2048 mod 5 = 3，截断点落在"你"的中间字节——
        // 旧按字节切片在此 panic（中文错误体即命中）；char-boundary 回退后安全
        let s = "ab你".repeat(1500);
        let out = super::truncate(&s, 2048);
        assert!(out.len() < 2048 + 16);
        assert!(out.ends_with("(截断)"));
        // 对照：截断点恰为单字节字符起点（"a你"=4B/周期，2048 mod 4 = 0）不受影响
        assert!(super::truncate(&"a你".repeat(1500), 2048).ends_with("(截断)"));
        assert_eq!(super::truncate("short", 2048), "short");
    }
}
