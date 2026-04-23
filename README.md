# cfimagebed

一个基于 Cloudflare Workers 的轻量图床代理。

## 仓库说明

本仓库已在 `2026-04-23` 做过一次历史重置，用于清理旧历史中的敏感部署痕迹。

如果你本地还有更早时期 clone 下来的旧副本，建议直接重新 clone，不要在旧历史上继续 `git pull`。

当前版本已经不再依赖第三方模型接口来校验 API Key，而是改成 Worker 自己维护一套轻量身份模型：

- 下游开发者身份：`client_id`
- 终端安装实例身份：`install_id`

系统目标不是“强安全”，而是“**单请求、低接入成本、防滥用优先**”。


## 核心能力

1. 上传接口强制使用 `X-Client-Id + X-Install-Id`
2. 支持自动注册新的安装实例
3. 支持按 `client` 和 `install` 两层限流
4. 支持封禁 / 冷却 / 停用
5. 提供仅管理员使用的后台页面和后台 API
6. 支持三种全局上传模式：
   - `uguu_only`
   - `uguu_failover_r2`
   - `r2_only`
7. 若启用 R2，仍向下游返回 uguu 风格的 JSON 结构
8. 支持基于文件内容摘要的上传结果缓存


## 上传协议

如果你要直接把接入资料发给下游客户或他们的 AI 编程助手，优先使用这份整合说明：

- `docs/guides/2026-04-23-mxplus-downstream-integration-guide.md`

真实生产域名、私有 client 配置和定向下游说明，建议只保存在本地私有文档或忽略文件里，不要提交到 GitHub。

### 接口地址

- 生产上传地址：`https://<your-worker-domain>/upload`
- 管理后台地址：`https://<your-worker-domain>/admin/login`
- 上传路径：`https://<your-worker-domain>/upload`
- 请求方法：`POST`
- `Content-Type`：`multipart/form-data`

如果部署时设置了 `CF_WORKER_CUSTOM_DOMAIN`，这里的域名就是该值。  
如果没有设置，则默认使用 Cloudflare 分配的 `workers.dev` 地址。


### 必填请求头

```http
X-Client-Id: your-client-id
X-Install-Id: your-install-id
```

说明：

- `client_id`：由管理员为下游开发者分配
- `install_id`：由下游客户端首次启动时生成并持久化

当前上传接口**不再使用** `Authorization: Bearer ...` 作为正式鉴权协议。


### 表单字段

继续兼容 uguu 风格上传：

- 文件字段：`files[]`
- 推荐字段：`output=json`


### 媒体类型与大小限制

Worker 当前只允许常见图片、视频、音频上传。

- 图片：小于 `25 MB`
- 视频：小于 `150 MB`
- 音频：小于 `15 MB`

不符合要求时，Worker 会在代理层直接拒绝：

- 非支持类型：`415 unsupported_media_type`
- 超过大小限制：`413 file_too_large`


### 最小请求示例

```bash
curl 'https://<your-worker-domain>/upload' \
  -X POST \
  -H 'X-Client-Id: demo-client' \
  -H 'X-Install-Id: device-001' \
  -F 'files[]=@/path/to/demo.png' \
  -F 'output=json'
```


### 成功响应示例

无论最终上传到了 uguu 还是 R2，都会尽量保持 uguu 风格：

```json
{
  "success": true,
  "files": [
    {
      "hash": "2026/04/23/abcd1234ef56.png",
      "filename": "demo.png",
      "url": "https://cdn.example.com/2026/04/23/abcd1234ef56.png",
      "size": 12345,
      "dupe": false
    }
  ]
}
```


### 代理层错误码

当前本地错误码包括：

- `missing_client_id`
- `missing_install_id`
- `missing_file`
- `invalid_client`
- `client_disabled`
- `install_blocked`
- `rate_limited`
- `unsupported_media_type`
- `file_too_large`
- `unsupported_path`
- `internal_error`

如果是 `uguu_only` 模式下的上游错误，Worker 会尽量透传上游状态码与响应体。  
如果是 `uguu_failover_r2` 模式，上游非 2xx、超时或网络异常会自动回退到 R2，对下游透明。


## 上传模式

上传模式由后台全局配置控制，不再通过代码切换。

### `uguu_only`

- 只上传到 uguu
- uguu 失败时直接返回失败

### `uguu_failover_r2`

- 先上传到 uguu
- 如果 uguu 返回非 2xx、超时或发生网络异常，则自动回退到 R2
- 对下游仍返回成功的 uguu 风格响应

### `r2_only`

- 直接写入 R2
- 不再调用 uguu
- 适合完全迁移到自有存储


## 后台

### 入口

- 登录页：`/admin/login`
- 后台首页：`/admin`
- 开发者列表：`/admin/clients`
- 全局配置页：`/admin/config`
- 安装实例页：`/admin/installs`


### 当前后台能力

当前已经具备：

- 管理员密码登录
- HttpOnly Session
- 后台概览页
- 开发者列表页
- 全局配置读取 API
- 开发者创建 / 列表 API

仍在持续补充：

- 页面内表单操作
- 安装实例搜索、封禁、解封
- 配置修改 UI


### 管理员登录配置

管理员密码哈希不写入 `wrangler.jsonc`，而是建议用 Secret 注入：

```bash
wrangler secret put ADMIN_PASSWORD_HASH
```

可以先本地生成一个 SHA-256 十六进制哈希，例如：

```bash
node -e "console.log(require('node:crypto').createHash('sha256').update('your-password').digest('hex'))"
```


## Cloudflare 配置

### KV

需要绑定一个 KV：

```bash
wrangler kv namespace create IMAGEBED_KV
wrangler kv namespace create IMAGEBED_KV --preview
```

然后把返回的 `id` / `preview_id` 填回 `wrangler.jsonc`。


### R2

如果要启用 `r2_only` 或 `uguu_failover_r2`，还需要绑定 R2 bucket：

```bash
wrangler r2 bucket create your-imagebed-bucket
```

并在 `wrangler.jsonc` 中配置：

- `IMAGEBED_R2` bucket binding
- `R2_PUBLIC_BASE_URL`
- 可选 `R2_OBJECT_PREFIX`


### 关键变量

当前 `wrangler.jsonc` 中会用到这些变量：

```json
{
  "UGUU_API_BASE_URL": "https://uguu.se",
  "R2_PUBLIC_BASE_URL": "https://<your-r2-public-domain>",
  "R2_PREVIEW_PUBLIC_BASE_URL": "https://<preview-r2-dev-url>",
  "R2_OBJECT_PREFIX": "",
  "UPLOAD_CACHE_TTL_SECONDS": "0"
}
```

说明：

- `UGUU_API_BASE_URL`
  uguu 上游地址
- `R2_PUBLIC_BASE_URL`
  生产 R2 自定义公开域名
- `R2_PREVIEW_PUBLIC_BASE_URL`
  preview / workers.dev 验证时使用的 preview R2 公网地址
- `R2_OBJECT_PREFIX`
  R2 对象 key 前缀，可留空
- `UPLOAD_CACHE_TTL_SECONDS`
  上传结果缓存 TTL；`0` 表示关闭


## 部署

```bash
npm run deploy
```

如果要绑定 Cloudflare 自定义域名：

```bash
CF_WORKER_CUSTOM_DOMAIN=upload.example.com \
IMAGEBED_R2_PUBLIC_BASE_URL=https://cdn.example.com \
IMAGEBED_R2_PREVIEW_PUBLIC_BASE_URL=https://preview.example.r2.dev \
npm run deploy
```

说明：

- `CF_WORKER_CUSTOM_DOMAIN` 只在部署时使用，不会写死在仓库里
- 不设置该变量时，脚本会只部署到 `workers.dev`
- 可以先预演：

```bash
npm run deploy -- --dry-run
```


## 测试

```bash
npm test
```

当前测试已经覆盖：

- 新上传头协议
- `client / install` 校验
- 自动注册
- 封禁
- 两层限流
- 管理员登录、Session、后台 API
- 后台基础页面
- `uguu_only / uguu_failover_r2 / r2_only`
- 上传结果缓存


## 当前实现边界

当前版本已经完成核心链路，但还有这些点会继续补：

- 后台页面内直接编辑和提交表单
- 安装实例搜索、封禁、解封页面操作
- 更完整的后台概览数据
- README 中更细的迁移清单

如果你要从旧版本迁移，请注意：

1. 下游客户端要改成发送 `X-Client-Id` 和 `X-Install-Id`
2. 旧的 Bearer 鉴权文档不再适用
3. 如果准备启用 R2，先完成 bucket binding 和公开域名配置
