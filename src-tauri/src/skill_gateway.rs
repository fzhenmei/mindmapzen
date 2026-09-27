// src-tauri/src/skill_gateway.rs —— skill 网关非流式转发(spec §4.4):与 ai_stream
// 同为哑管道,但单次 JSON 请求/响应(无 SSE/无 abort 注册表);非流式必须设总超时
// (30s);api_key 不进日志(与 ai_stream 同纪律)。
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillGatewayRequest {
    pub url: String,
    pub api_key: String,
    pub body: serde_json::Value,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillGatewayResponse {
    pub json: serde_json::Value,
}

/// 单次 POST:URL 与凭据由前端 manifest 组装(AI 不接触 URL,见 spec §4.2 安全节)
#[tauri::command]
pub async fn skill_gateway_post(request: SkillGatewayRequest) -> Result<SkillGatewayResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {e}"))?;
    let resp = client
        .post(&request.url)
        .bearer_auth(&request.api_key)
        .json(&request.body)
        .send()
        .await
        .map_err(|e| format!("请求技能网关失败: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("读取网关响应失败: {e}"))?;
    if !status.is_success() {
        // 错误带状态码与回包头部摘要(前端原样回传 AI 自纠)
        let head: String = text.chars().take(512).collect();
        return Err(format!("HTTP {status}: {head}"));
    }
    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("网关响应不是有效 JSON: {e}"))?;
    Ok(SkillGatewayResponse { json })
}
