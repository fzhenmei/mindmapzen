// src-tauri/src/sse.rs —— SSE 增量解析（AI 对话流，spec §2.1）：
// OpenAI 兼容流只用 data: 行、事件以空行分隔；逐块喂入，产出完整 data 载荷串。
// \r\n 归一为 \n；跨块断裂的孤立 \r 极罕见（各家实现均 \n 分隔），注释明示局限不再处理。
pub struct SseParser {
    buf: String,
}

impl SseParser {
    pub fn new() -> Self {
        Self { buf: String::new() }
    }

    /// 喂入一段解码后的文本块，返回其中所有完整事件的 data 载荷（已剥 "data:" 前缀与引导空格）
    pub fn feed(&mut self, chunk: &str) -> Vec<String> {
        self.buf.push_str(&chunk.replace("\r\n", "\n"));
        let mut out = Vec::new();
        while let Some(pos) = self.buf.find("\n\n") {
            let block: String = self.buf.drain(..pos + 2).collect();
            for line in block.lines() {
                if let Some(data) = line.strip_prefix("data:") {
                    out.push(data.trim_start().to_string());
                }
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::SseParser;

    #[test]
    fn 单块多事件() {
        let mut p = SseParser::new();
        let out = p.feed("data: {\"a\":1}\n\ndata: {\"b\":2}\n\n");
        assert_eq!(out, vec!["{\"a\":1}".to_string(), "{\"b\":2}".to_string()]);
    }

    #[test]
    fn 跨块分片重组() {
        let mut p = SseParser::new();
        assert!(p.feed("data: {\"a\"").is_empty());
        assert_eq!(p.feed(":1}\n\n"), vec!["{\"a\":1}".to_string()]);
    }

    #[test]
    fn done_哨兵与crlf() {
        let mut p = SseParser::new();
        let out = p.feed("data: [DONE]\r\n\r\ndata: x\n\n");
        assert_eq!(out, vec!["[DONE]".to_string(), "x".to_string()]);
    }
}
