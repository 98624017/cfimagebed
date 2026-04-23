# cfimagebed 鉴权、管理后台与双存储后端设计

- 日期：2026-04-23
- 状态：已确认，待评审
- 适用范围：`cfimagebed` Cloudflare Worker 项目

## 1. 背景

当前项目通过请求第三方模型接口来验证 `Authorization: Bearer sk-xxx` 的有效性，再决定是否转发上传到 uguu。这个方案存在几个问题：

1. 鉴权依赖外部服务，不可控。
2. 下游开发者会继续把自己的客户端分发给终端用户，长期 API Key 不适合硬编码进客户端。
3. 当前没有直观的管理界面，运维依赖环境变量和手工改配置。
4. 上传后端只有 uguu，一旦 uguu 不可用，没有系统内的兜底路径。

本次改造的目标，是把系统重构为一个“轻量、防滥用优先、单请求上传”的图床代理，并补上管理员后台与 R2 存储能力。

## 2. 目标与非目标

### 2.1 目标

1. 去除第三方模型接口鉴权，改为 Worker 自己处理鉴权与风控。
2. 保持下游接入轻量，终端仍使用单请求上传。
3. 通过 `client_id + install_id` 建立轻量身份模型。
4. 支持按下游开发者和按终端安装实例的管理、限流、封禁。
5. 提供仅管理员使用的后台界面，完成日常配置与运维操作。
6. 支持三种全局上传模式：
   - `uguu_only`
   - `uguu_failover_r2`
   - `r2_only`
7. 在 R2 场景下仍向下游返回 uguu 风格的响应结构。

### 2.2 非目标

1. 不追求强安全或防逆向。
2. 不做终端账号体系、登录体系、注册码体系。
3. 不做下游开发者自助后台。
4. 不做复杂 BI、图表分析或细粒度 RBAC。
5. 第一版不引入 D1、Durable Objects 等更重的持久层。

## 3. 总体思路

系统从“校验 Bearer Key”改为“校验轻量身份 + 状态 + 限流”。

### 3.1 身份模型

每次上传请求必须携带两个字段：

- `client_id`：标识下游开发者，由管理员分配。
- `install_id`：标识终端安装实例，由下游客户端首次启动时随机生成并持久化。

推荐通过请求头传递：

```http
X-Client-Id: <client_id>
X-Install-Id: <install_id>
```

不再使用 `Authorization` 作为正式鉴权入口。

### 3.2 鉴权定位

这套体系的定位是“轻量防滥用”，不是“强身份证明”。

Worker 的放行依据不再是“请求者持有某个秘密”，而是：

1. `client_id` 是否存在且启用。
2. `install_id` 是否允许使用。
3. 请求是否命中限流、冷却、封禁规则。

## 4. 核心架构

### 4.1 组件划分

1. 上传入口
   负责解析请求、校验请求头、走鉴权与限流流程、转发到最终存储后端。

2. 身份与风控层
   负责读取 `client_id` 配置、安装实例状态、限流计数、封禁状态。

3. 存储后端路由层
   负责根据全局模式决定是写 uguu、写 R2，还是 uguu 失败后回退到 R2。

4. 管理后台
   负责管理员登录、配置变更、开发者管理、安装实例管理、全局模式切换。

5. KV 存储层
   负责保存开发者配置、安装实例记录、会话、限流状态、全局配置等。

### 4.2 请求主流程

```text
请求进入
  -> 校验路径 /upload
  -> 读取 X-Client-Id / X-Install-Id
  -> 读取 client 配置
  -> 处理 install 自动注册 / 查状态
  -> 检查封禁 / 冷却 / 限流
  -> 按全局上传模式选择 uguu / R2 / failover
  -> 返回统一的 uguu 风格响应
  -> 更新 install 活跃信息与计数
```

## 5. 数据模型与 KV 设计

第一版继续使用 Cloudflare KV，不引入 D1。

### 5.1 下游开发者配置

键：

```text
client:{client_id}
```

值示例：

```json
{
  "client_id": "demo-client",
  "name": "演示客户",
  "remark": "渠道 A",
  "status": "active",
  "allow_auto_register": true,
  "rate_limit": {
    "per_minute": 120,
    "per_hour": 3000
  },
  "created_at": "2026-04-23T10:00:00.000Z",
  "updated_at": "2026-04-23T10:00:00.000Z"
}
```

状态枚举：

- `active`
- `disabled`

### 5.2 安装实例记录

键：

```text
install:{client_id}:{install_id}
```

值示例：

```json
{
  "client_id": "demo-client",
  "install_id": "c8f8f0b7-xxxx",
  "status": "active",
  "first_seen_at": "2026-04-23T10:00:00.000Z",
  "last_seen_at": "2026-04-23T10:10:00.000Z",
  "request_count": 20,
  "upload_count": 18,
  "error_count": 2,
  "temporary_block_until": null,
  "updated_at": "2026-04-23T10:10:00.000Z"
}
```

状态枚举：

- `active`
- `cooldown`
- `blocked_temp`
- `blocked_perm`

说明：

- `cooldown` 主要由系统自动触发。
- `blocked_temp` / `blocked_perm` 主要由管理员手动操作。

### 5.3 限流与冷却辅助键

短 TTL 键：

```text
rate:client:{client_id}:{window}
rate:install:{client_id}:{install_id}:{window}
cooldown:{client_id}:{install_id}
```

说明：

- 这些键只用于快速防滥用，不追求严格计数精确度。
- TTL 由对应时间窗口决定。

### 5.4 全局配置

键：

```text
config:global
```

值示例：

```json
{
  "upload_mode": "uguu_failover_r2",
  "default_allow_auto_register": true,
  "default_client_rate_limit": {
    "per_minute": 120,
    "per_hour": 3000
  },
  "default_install_rate_limit": {
    "per_minute": 20
  },
  "default_cooldown_seconds": 300,
  "updated_at": "2026-04-23T10:00:00.000Z"
}
```

上传模式枚举：

- `uguu_only`
- `uguu_failover_r2`
- `r2_only`

### 5.5 管理员配置与会话

键：

```text
admin:session:{session_id}
```

值示例：

```json
{
  "created_at": "2026-04-23T10:00:00.000Z",
  "expires_at": "2026-04-23T18:00:00.000Z",
  "last_seen_at": "2026-04-23T10:15:00.000Z"
}
```

管理员密码哈希仍保留在环境变量：

- `ADMIN_PASSWORD_HASH`

原因是它是系统启动级密钥，仍适合放在环境变量中；而频繁变动的业务配置转移到后台。

## 6. 上传协议与 Worker 行为

### 6.1 请求要求

上传请求必须满足：

1. 路径为 `/upload`
2. 方法为 `POST`
3. 请求头包含：
   - `X-Client-Id`
   - `X-Install-Id`
4. 请求体保持当前与 uguu 兼容的 `multipart/form-data`

### 6.2 请求校验顺序

1. 校验路径
2. 校验 `client_id`
3. 校验 `install_id`
4. 读取全局配置
5. 读取 `client:{client_id}`
6. 若 client 不存在或停用，直接拒绝
7. 读取 `install:{client_id}:{install_id}`
8. 若 install 不存在：
   - client 允许自动注册：自动创建记录并继续
   - 否则直接拒绝
9. 检查 install 是否封禁或处于冷却
10. 检查 client 与 install 两级限流
11. 通过后执行上传
12. 更新 install 活跃时间和计数

### 6.3 错误码

Worker 本地错误码统一为：

- `missing_client_id`
- `missing_install_id`
- `invalid_client`
- `client_disabled`
- `install_blocked`
- `rate_limited`
- `unsupported_path`
- `internal_error`

返回建议：

- 参数缺失：`400`
- client 不存在或停用：`403`
- install 被封禁：`403`
- 触发限流：`429`
- 路径错误：`404`
- 内部错误：`500`

## 7. 存储后端设计

### 7.1 能力与配置边界

环境变量和绑定只负责声明能力：

- `UGUU_API_BASE_URL`
- `R2_PUBLIC_BASE_URL`
- `R2_OBJECT_PREFIX`（可选）
- R2 bucket binding

后台全局配置负责决定当前上传模式：

- `uguu_only`
- `uguu_failover_r2`
- `r2_only`

### 7.2 模式行为

#### `uguu_only`

- 始终转发到 uguu
- 若 uguu 失败，直接向下游返回失败

#### `uguu_failover_r2`

- 先尝试写 uguu
- 若 uguu 成功，按原响应透传
- 若 uguu 失败，自动写入 R2
- 这里的“失败”统一定义为：
  - 请求 uguu 时发生网络异常
  - 请求 uguu 超时
  - uguu 返回任意非 2xx 状态码
- 对下游仍返回 uguu 风格成功响应
- 对下游不显式标记“这是 R2 回退”
- 后台日志或后台展示中记录本次使用了 R2 回退

#### `r2_only`

- 直接写入 R2
- 不再调用 uguu
- 对下游返回 uguu 风格成功响应

### 7.3 R2 对象命名

对象 key 规则：

```text
YYYY/MM/DD/<random>.<ext>
```

例如：

```text
2026/04/23/a8f3c1d9e2ab.png
```

扩展名确定顺序：

1. 原始文件名扩展名
2. MIME type 推断
3. 保底 `.bin`

最终公开 URL 规则：

```text
https://<r2-public-domain>/<object-key>
```

不向下游暴露 bucket 内部信息。

### 7.4 统一响应格式

无论文件最终存到 uguu 还是 R2，返回体都统一为 uguu 风格结构。

R2 场景至少保证以下字段可用：

- `success`
- `files`
- `files[0].url`
- `files[0].filename`
- `files[0].size`

要求是“结构兼容优先”，不要求与 uguu 响应字节级完全一致。

## 8. 上传缓存与兼容性

当前已有按文件摘要做上传结果缓存的能力。改造后，缓存保存的应该是“最终统一响应”，而不是只缓存 uguu 响应。

这样可保证：

1. `uguu_only` 命中缓存时行为不变。
2. `uguu_failover_r2` 若首次走了 R2 回退，后续命中缓存时可直接返回统一响应。
3. `r2_only` 也能复用同一套缓存结构。

缓存键仍可沿用当前按文件摘要生成的思路，不需要额外引入复杂索引。

## 9. 管理后台设计

### 9.1 定位

后台只给你自己或极少数管理员使用，不给下游开发者开放。

### 9.2 页面范围

第一版包含 5 个模块：

1. 登录页
2. 概览页
3. 开发者管理页
4. 安装实例管理页
5. 全局配置页

### 9.3 功能范围

#### 登录页

- 管理员密码登录
- 登录成功后写入 HttpOnly Session Cookie
- 支持登出

#### 概览页

- client 总数
- 启用 / 停用数量
- 最近活跃 install 数
- 最近限流或封禁数量
- 最近上传模式

#### 开发者管理页

- 新建 `client_id`
- 编辑名称与备注
- 启用 / 停用
- 配置是否允许自动注册
- 配置 client 限流参数

#### 安装实例管理页

- 按 `client_id` 查看 install 列表
- 搜索 `install_id`
- 查看首次出现时间、最近活跃时间、计数
- 临时封禁 / 永久封禁 / 解封

#### 全局配置页

- 设置默认限流
- 设置默认冷却时长
- 设置上传模式
- 查看 R2 能力是否已配置可用

### 9.4 第一版明确不做

- 多管理员账号
- 下游开发者自助后台
- 图表分析大盘
- 精细权限控制
- 消息通知

## 10. 后台安全边界

第一版采用“够用即可”的后台安全模型：

1. 路由隔离：
   - `/admin/login`
   - `/admin/*`
   - `/admin/api/*`
2. 使用 `ADMIN_PASSWORD_HASH` 校验登录密码
3. 登录成功后创建 KV Session
4. Session 通过 HttpOnly Cookie 传递
5. 后台 API 必须校验登录态
6. 登录失败做基础限速
7. Session 有过期时间
8. 修改类请求做 CSRF 防护或严格同源校验

这套模型不追求企业级 IAM，但足以覆盖当前场景。

## 11. 限流、封禁与自动注册策略

### 11.1 限流层级

两层限流：

1. `client_id` 级
2. `install_id` 级

前者控制某个下游整体吞吐，后者控制单个终端滥用。

### 11.2 自动注册

每个 client 可配置是否允许新的 `install_id` 自动注册。

默认建议：

- 全局默认开启
- client 可单独关闭

这样兼顾接入成本和可控性。

### 11.3 状态处理

- 高频触发后进入 `cooldown`
- 管理员可设置 `blocked_temp`
- 管理员可设置 `blocked_perm`

### 11.4 返回策略

- 超限：`429 rate_limited`
- install 被封：`403 install_blocked`
- client 不合法或停用：`403 invalid_client` / `403 client_disabled`

## 12. 测试策略

### 12.1 Worker 单元测试

覆盖场景：

1. 缺少 `client_id`
2. 缺少 `install_id`
3. `client_id` 不存在
4. `client_id` 已停用
5. 自动注册开启时创建 install
6. 自动注册关闭时拒绝未知 install
7. install 处于冷却 / 临时封禁 / 永久封禁
8. client 级限流
9. install 级限流
10. uguu 上传成功
11. uguu 失败后回退到 R2
12. `r2_only` 模式成功写入 R2
13. 返回体统一为 uguu 风格
14. 上传缓存与双后端逻辑可同时工作

### 12.2 后台 API 测试

覆盖场景：

1. 登录 / 登出
2. 未登录访问后台 API
3. 创建 / 编辑 / 停用 client
4. 封禁 / 解封 install
5. 修改全局配置与上传模式

### 12.3 页面验证

第一版不引入重型前端测试体系，但至少保证：

1. 后台页面能访问
2. 关键表单可提交
3. 关键操作成功后有明确反馈

## 13. 迁移方案

本次采用直接切换，不长期双轨共存。

步骤：

1. 实现新的 `client_id + install_id` 协议
2. 实现后台登录、基础配置、client 管理、install 管理
3. 实现上传模式切换与 R2 能力
4. 初始化管理员密码与全局配置
5. 通过后台创建首批 `client_id`
6. 通知下游客户端改为发送：
   - `X-Client-Id`
   - `X-Install-Id`
7. 下线旧的 Bearer 鉴权路径与第三方模型依赖

不建议长期双轨共存，原因是：

1. 增加逻辑复杂度
2. 文档和后台口径会变脏
3. 当前项目目标是保持轻量和可维护

## 14. 实现边界建议

为了避免把范围做散，实施时建议拆为以下顺序：

1. Worker 新鉴权模型
2. KV 数据结构与风控状态
3. 后台登录与后台 API
4. 后台基础页面
5. R2 上传与 failover
6. 缓存兼容与回归测试

## 15. 最终结论

本方案选择了一条明确的工程路线：

1. 放弃“强安全 API Key”幻想，转而采用轻量身份模型。
2. 通过 `client_id + install_id`、限流、封禁、自动注册，满足防滥用和运维管理需求。
3. 通过单管理员后台，把高频配置从环境变量迁移到可视化操作。
4. 通过 `uguu_only / uguu_failover_r2 / r2_only` 三种全局模式，提升系统可用性与可控性。

这套方案与当前项目规模、风险承受度和接入场景是匹配的，且能在不显著增加下游接入成本的前提下完成升级。
