# cfimagebed 重构上线检查清单

## 目标

用于把 `cfimagebed` 从旧的 Bearer 鉴权版本，切换到新的：

- `client_id + install_id` 轻量鉴权
- 管理后台
- `uguu_only / uguu_failover_r2 / r2_only`
- R2 兜底与统一响应

上线时按此清单逐项确认，避免“代码已改完，但配置、资源、下游接入和回滚方案没准备好”。

---

## 一、部署前资源检查

### 1. Cloudflare 资源

- [ ] `IMAGEBED_KV` 已创建
- [ ] `wrangler.jsonc` 中的 `IMAGEBED_KV` 生产 / 预览 ID 已填写
- [ ] 如需启用 `r2_only` 或 `uguu_failover_r2`，`IMAGEBED_R2` 对应的 bucket 已创建
- [ ] R2 bucket 的公开域名已准备好
- [ ] `R2_PUBLIC_BASE_URL` 已配置成真实可访问域名

### 2. 环境变量 / Secret

- [ ] `ADMIN_PASSWORD_HASH` 已注入
- [ ] `UGUU_API_BASE_URL` 已确认
- [ ] `R2_PUBLIC_BASE_URL` 已确认
- [ ] `R2_OBJECT_PREFIX` 已确认是否留空
- [ ] `UPLOAD_CACHE_TTL_SECONDS` 已确认
- [ ] 如需自定义 Worker 域名，`CF_WORKER_CUSTOM_DOMAIN` 已确认

### 3. 后端模式决策

上线前先确定本次要用哪种模式：

- [ ] `uguu_only`
- [ ] `uguu_failover_r2`
- [ ] `r2_only`

建议：

- 初次切换时优先考虑 `uguu_failover_r2`
- 等 R2 路径稳定后，再考虑切到 `r2_only`

---

## 二、下游接入切换检查

### 1. 协议切换

- [ ] 下游已知晓旧 `Authorization: Bearer ...` 不再作为正式鉴权协议
- [ ] 下游客户端改为发送 `X-Client-Id`
- [ ] 下游客户端改为发送 `X-Install-Id`
- [ ] 下游客户端首次启动会生成并持久化 `install_id`

### 2. 首批 `client_id`

- [ ] 已在后台或后台 API 中创建首批 `client_id`
- [ ] 每个下游开发者已拿到对应 `client_id`
- [ ] 已确认哪些 `client` 允许自动注册 install

### 3. 兼容性确认

- [ ] 下游仍使用 `multipart/form-data`
- [ ] 文件字段仍为 `files[]`
- [ ] 下游不依赖旧 Bearer 鉴权返回结构
- [ ] 下游只依赖 uguu 风格成功响应字段

---

## 三、后台初始化检查

### 1. 管理员后台

- [ ] `/admin/login` 可访问
- [ ] 管理员密码可正常登录
- [ ] `/admin` 可正常打开
- [ ] `/admin/clients` 可创建 client
- [ ] `/admin/config` 可修改上传模式
- [ ] `/admin/installs` 可按 `client_id` 查询 install

### 2. 基础配置

- [ ] 已确认默认 `default_allow_auto_register`
- [ ] 已确认默认 `client` 限流
- [ ] 已确认默认 `install` 限流
- [ ] 已确认默认冷却时长

---

## 四、上线前验证

### 1. 本地 / CI

- [ ] `npm test` 全部通过
- [ ] `npm run deploy -- --dry-run` 通过

### 2. 预发布验证

- [ ] 使用真实 `client_id + install_id` 上传成功
- [ ] 未知 `client_id` 会被拒绝
- [ ] 被停用的 `client_id` 会被拒绝
- [ ] 自动注册开启时，新 `install_id` 可自动登记
- [ ] 自动注册关闭时，新 `install_id` 会被拒绝
- [ ] 限流命中时返回 `429 rate_limited`
- [ ] 被封禁 install 返回 `403 install_blocked`

### 3. 后端模式验证

#### 若使用 `uguu_only`

- [ ] 上传成功时正常透传 uguu 响应
- [ ] uguu 异常时按预期返回失败

#### 若使用 `uguu_failover_r2`

- [ ] uguu 正常时不触发 R2
- [ ] 人工制造 uguu 失败后，可自动回退到 R2
- [ ] 回退后，下游仍收到成功的 uguu 风格响应

#### 若使用 `r2_only`

- [ ] 文件可直接写入 R2
- [ ] 返回 URL 使用的是公开 R2 域名

### 4. 缓存验证

- [ ] 开启 `UPLOAD_CACHE_TTL_SECONDS` 后，相同文件可命中缓存
- [ ] 命中缓存时响应头包含 `X-Imagebed-Cache: HIT`

---

## 五、正式上线步骤

建议顺序：

1. [ ] 先部署到预期环境，保持上传模式为保守值
2. [ ] 登录后台，确认配置读写正常
3. [ ] 创建首批 `client_id`
4. [ ] 通知首批下游切换到新请求头协议
5. [ ] 先用少量真实流量验证
6. [ ] 观察上传成功率、限流和回退行为
7. [ ] 确认无异常后，再扩大流量范围

如果担心 uguu 稳定性，建议先走：

1. [ ] `uguu_failover_r2`
2. [ ] 观察一段时间
3. [ ] 再决定是否切到 `r2_only`

---

## 六、回滚预案

出现以下任一情况，应准备回滚：

- [ ] 大量正常上传失败
- [ ] 下游客户端未按时切到新请求头协议
- [ ] 后台无法登录或无法修改配置
- [ ] R2 公开域名不可访问
- [ ] `uguu_failover_r2` 下回退路径异常

回滚思路：

### 方案 A：配置级回滚

- [ ] 把上传模式切回 `uguu_only`
- [ ] 暂时关闭或调宽限流
- [ ] 暂时开启自动注册，减少误伤

### 方案 B：版本级回滚

- [ ] 回滚到旧部署版本
- [ ] 同时通知下游恢复旧接入方式

注意：

- 如果已经要求下游切到 `X-Client-Id + X-Install-Id`，版本级回滚前要确认是否保留兼容路径
- 当前代码设计不建议长期双轨共存，因此回滚应尽量是短时应急，不应变成长期状态

---

## 七、上线后观察项

上线后至少关注：

- [ ] 上传成功率
- [ ] `invalid_client` 比例
- [ ] `install_blocked` 比例
- [ ] `rate_limited` 比例
- [ ] `uguu_failover_r2` 下的 R2 回退频次
- [ ] R2 公开 URL 可访问性
- [ ] 后台登录与配置修改是否正常

---

## 八、当前结论

如果下面这些都已经勾选：

- [ ] 单测通过
- [ ] dry-run 通过
- [ ] 后台可登录
- [ ] 首批 `client_id` 已创建
- [ ] 下游已完成协议切换
- [ ] 目标上传模式已确认
- [ ] R2 资源和域名准备完成

就可以进入正式上线窗口。
