# 漫想+ 图床接入整合说明

- 日期：2026-04-23
- 适用对象：漫想+ 开发团队、下游协作方，以及他们使用的 AI 编程助手
- 当前正式接入地址：由上游单独提供，不写入公开仓库
- 用途：这一份文档同时用于人工接入说明和 AI 编程助手提示，不再拆成多份

---

## 一、先说结论

你们只需要完成 4 件事：

1. 在客户端里调用上游单独提供的 `POST /upload` 地址
2. 请求头里带上 `X-Client-Id`
3. 客户端首次启动时生成并持久化 `X-Install-Id`
4. 用 `multipart/form-data` 提交文件字段 `files[]`

这个图床**不需要你们再做服务端鉴权中转**，也**不需要账号体系、激活码体系、签名体系**。

---

## 二、你们开始接入前，需要我提供给你们什么

你们真正开始开发前，只需要从上游拿到这 3 项：

1. 固定的 `client_id`
2. 生产上传地址
3. 媒体限制规则

其中：

- `client_id` 不是 secret，它会出现在你们客户端代码里
- `install_id` 由你们自己的客户端本地生成并持久化
- 不需要找我要 Bearer Token，也不需要 API Key

---

## 三、协议要求

### 1. 请求方法

```http
POST /upload
Content-Type: multipart/form-data
```

### 2. 必填请求头

```http
X-Client-Id: 由上游分配给漫想+的 client_id
X-Install-Id: 客户端本地生成并持久化的 install_id
```

### 3. 表单字段

```text
files[]
output=json
```

说明：

- `files[]` 是文件字段名，保持 uguu 风格
- `output=json` 建议带上，便于统一解析

---

## 四、install_id 应该怎么做

`install_id` 的目标不是强安全，而是为了区分每个真实安装实例，方便自动注册、限流、封禁和排查问题。

推荐规则：

1. 客户端第一次启动时生成一次
2. 保存到本地配置或数据库
3. 之后每次上传都复用同一个值
4. 不要每次请求都重新生成

推荐形式：

```text
mxplus-<uuid>
```

例如：

```text
mxplus-7f8364ea-6d23-4f33-aed0-7c2c0f1a1d18
```

不建议：

- 每次上传随机生成一个新的 install_id
- 用用户昵称、手机号、邮箱当 install_id
- 用设备敏感标识直接明文上传

---

## 五、支持的媒体类型与大小限制

当前 Worker 代理层只允许常见图片、视频、音频。

### 图片

- 最大：`25 MB`
- 常见格式：`jpg` `jpeg` `png` `gif` `webp` `avif` `svg`

### 视频

- 最大：`150 MB`
- 常见格式：`mp4` `webm` `mov` `m4v`

### 音频

- 最大：`15 MB`
- 常见格式：`mp3` `wav` `ogg` `m4a` `aac` `flac`

如果你们上传：

- `txt`、`zip`、`exe`、`apk`、`7z`
- 或者文件超出上面大小

Worker 会直接拒绝。

---

## 六、成功响应格式

无论最终后端走 uguu 还是 R2，都会尽量保持 uguu 风格：

```json
{
  "success": true,
  "files": [
    {
      "hash": "2026/04/23/abcd1234ef56.png",
      "filename": "demo.png",
      "url": "https://<your-r2-public-domain>/2026/04/23/abcd1234ef56.png",
      "size": 12345,
      "dupe": false
    }
  ]
}
```

你们客户端通常只要关心：

1. `success`
2. `files[0].url`
3. `files[0].filename`
4. `files[0].size`

---

## 七、错误码说明

你们至少要对这些错误做基本处理：

- `missing_client_id`
  你们请求头没带 `X-Client-Id`
- `missing_install_id`
  你们请求头没带 `X-Install-Id`
- `invalid_client`
  你们使用了错误或未开通的 `client_id`
- `client_disabled`
  这个 `client_id` 被停用了
- `install_blocked`
  某个安装实例被封禁了
- `rate_limited`
  当前 client 或 install 命中限流
- `unsupported_media_type`
  文件类型不在允许范围
- `file_too_large`
  文件超过大小限制
- `internal_error`
  服务端异常

推荐客户端处理策略：

1. `rate_limited`
   提示“上传过于频繁，请稍后再试”
2. `unsupported_media_type`
   提示“仅支持图片、视频、音频”
3. `file_too_large`
   按媒体类别提示大小限制
4. `invalid_client` / `client_disabled`
   视为配置错误，提示联系漫想+开发团队
5. `internal_error`
   提示稍后重试

---

## 八、最小 curl 示例

```bash
curl 'https://<your-worker-domain>/upload' \
  -X POST \
  -H 'X-Client-Id: 替换成实际client_id' \
  -H 'X-Install-Id: mxplus-local-install-id' \
  -F 'files[]=@/path/to/demo.png' \
  -F 'output=json'
```

---

## 九、JavaScript / TypeScript 最小示例

```ts
async function uploadFile(file: File, clientId: string, installId: string) {
  const form = new FormData();
  form.append('files[]', file);
  form.append('output', 'json');

  const response = await fetch('https://<your-worker-domain>/upload', {
    method: 'POST',
    headers: {
      'X-Client-Id': clientId,
      'X-Install-Id': installId,
    },
    body: form,
  });

  const payload = await response.json();

  if (!response.ok || !payload.success) {
    throw new Error(payload?.error?.message || 'upload failed');
  }

  return payload.files[0].url;
}
```

---

## 十、Python 最小示例

```python
import requests

def upload_file(file_path: str, client_id: str, install_id: str) -> str:
    with open(file_path, "rb") as f:
        resp = requests.post(
            "https://<your-worker-domain>/upload",
            headers={
                "X-Client-Id": client_id,
                "X-Install-Id": install_id,
            },
            files={
                "files[]": f,
            },
            data={
                "output": "json",
            },
            timeout=120,
        )

    payload = resp.json()
    if resp.status_code >= 400 or not payload.get("success"):
        raise RuntimeError(payload.get("error", {}).get("message", "upload failed"))

    return payload["files"][0]["url"]
```

---

## 十一、给 AI 编程助手的固定提示词

如果你们让 Claude、ChatGPT、Cursor、Windsurf、Trae、Copilot 一类 AI 编程助手直接帮你们接入，请把下面这段原样贴给它：

```text
你正在为“漫想+”客户端接入一个 Cloudflare Worker 图床。

请严格按以下协议实现，不要自行发明新的鉴权方式：

1. 上传地址固定为上游单独提供的 https://<your-worker-domain>/upload
2. 请求方法必须是 POST
3. Content-Type 必须是 multipart/form-data
4. 文件字段名必须是 files[]
5. 额外带上 output=json
6. 请求头必须包含：
   X-Client-Id: <由上游提供>
   X-Install-Id: <客户端首次启动生成并持久化的install_id>
7. 不要使用 Authorization Bearer
8. 不要要求服务端签名
9. 不要把 install_id 做成每次请求都变化
10. 成功时解析 JSON 中 files[0].url
11. 错误时处理这些 code：
    missing_client_id
    missing_install_id
    invalid_client
    client_disabled
    install_blocked
    rate_limited
    unsupported_media_type
    file_too_large
    internal_error
12. 文件限制：
    图片 < 25MB
    视频 < 150MB
    音频 < 15MB

请优先给我最小可运行实现，不要引入额外后端，不要设计新的账号体系。
```

---

## 十二、漫想+开发团队内部注意事项

你们自己的客户端代码里，真正应该持久化的是：

1. `client_id`
2. `install_id`

不要持久化这些东西：

1. Bearer Token
2. 动态签名密钥
3. 用户密码
4. 上游后台密码

因为这个图床方案本来就是轻量接入，不是重安全签名网关。

---

## 十三、建议的接入顺序

1. 先拿到漫想+专属 `client_id`
2. 客户端里补 `install_id` 的生成与持久化
3. 先用一张小图片跑通上传
4. 再测视频和音频
5. 再做错误提示和重试
6. 最后再接入你们的 AI 编程助手一起批量改代码

---

## 十四、上线后排查时优先看什么

如果你们反馈“上传失败”，请先自查这 6 项：

1. 是否请求到了 `/upload`
2. 是否带了 `X-Client-Id`
3. 是否带了稳定的 `X-Install-Id`
4. 文件字段名是否真的是 `files[]`
5. 文件是否超出大小或类型限制
6. 是否正确解析了 JSON 的 `error.code`

---

## 十五、给漫想+的最终一句话版

你们把它当成一个“带 `client_id + install_id` 的 uguu 兼容上传接口”就行，不需要自己再包一层复杂鉴权。
