# cfimagebed 重构实现计划

> 说明：当前会话未提供 `writing-plans` skill，本文件作为等价的正式实现计划使用。

**Goal:** 将当前基于第三方模型接口鉴权的图床 Worker，重构为基于 `client_id + install_id` 的轻量防滥用体系，并新增仅管理员使用的后台、R2 双后端支持，以及 `uguu_only / uguu_failover_r2 / r2_only` 三种全局上传模式。

**Architecture:** 入口 Worker 拆分为上传路由与后台路由；上传路由负责 `client_id + install_id` 校验、自动注册、封禁、限流与存储后端路由；后台路由负责管理员登录、Session、开发者管理、安装实例管理和全局配置；数据主存储使用 Cloudflare KV，上传后端支持 uguu 与 R2，必要时从 uguu 自动回退到 R2，并统一返回 uguu 风格响应。

**Tech Stack:** Cloudflare Workers, Cloudflare KV, Cloudflare R2, JavaScript ESM, Node built-in test runner, 最小化原生后台页面

---

### Task 1: 重构入口与测试骨架

**Files:**
- Update: `src/index.js`
- Create: `src/app.js`
- Create: `src/routes/upload.js`
- Create: `src/routes/admin.js`
- Create: `src/lib/http.js`
- Create: `src/lib/env.js`
- Update: `tests/index.test.js`
- Create: `tests/upload-auth.test.js`
- Create: `tests/admin-auth.test.js`

**Step 1: Write the failing test**

补充失败测试，先锁定新的基本协议和路由边界：
- `/upload` 缺少 `X-Client-Id` 返回 `400 missing_client_id`
- `/upload` 缺少 `X-Install-Id` 返回 `400 missing_install_id`
- `/admin/*` 未登录访问返回拒绝
- 旧 `Authorization` 鉴权路径不再作为正式鉴权入口

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL，原因是当前代码仍使用 Bearer 鉴权且没有后台路由

**Step 3: Write minimal implementation**

做最小重构，不引入新业务逻辑，只先建立边界：
- 将 `src/index.js` 收敛成 Worker 入口
- 将上传逻辑与后台逻辑拆成独立路由模块
- 提供统一错误响应与路由分发

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS，且上传入口与后台入口边界已固定

---

### Task 2: 实现新的身份模型、KV 模型与风控流程

**Files:**
- Update: `src/routes/upload.js`
- Create: `src/services/client-registry.js`
- Create: `src/services/install-registry.js`
- Create: `src/services/rate-limit.js`
- Create: `src/services/global-config.js`
- Create: `src/lib/kv-keys.js`
- Create: `tests/upload-identity.test.js`
- Create: `tests/upload-rate-limit.test.js`

**Step 1: Write the failing test**

补充并拆分以下失败测试：
- `client_id` 不存在时返回 `403 invalid_client`
- `client_id` 停用时返回 `403 client_disabled`
- 未知 `install_id` 在允许自动注册时自动创建记录并放行
- 未知 `install_id` 在关闭自动注册时被拒绝
- `install_id` 处于 `cooldown / blocked_temp / blocked_perm` 时返回 `403 install_blocked`
- `client_id` 级限流命中时返回 `429 rate_limited`
- `install_id` 级限流命中时返回 `429 rate_limited`

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL，原因是新的 KV 结构、状态机与限流尚未实现

**Step 3: Write minimal implementation**

实现：
- `client:{client_id}` 与 `install:{client_id}:{install_id}` KV 模型
- `config:global` 的读取与默认值合并
- 安装实例自动注册
- 两层限流短 TTL 键
- 冷却、临时封禁、永久封禁判定
- 上传成功 / 失败后对 install 计数和活跃时间更新

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS，新的上传鉴权链路已完全脱离第三方 Bearer 校验

---

### Task 3: 实现管理员登录、Session 与后台 API

**Files:**
- Update: `src/routes/admin.js`
- Create: `src/services/admin-session.js`
- Create: `src/services/admin-auth.js`
- Create: `src/services/admin-clients.js`
- Create: `src/services/admin-installs.js`
- Create: `src/services/admin-config.js`
- Create: `tests/admin-session.test.js`
- Create: `tests/admin-api.test.js`

**Step 1: Write the failing test**

编写失败测试覆盖：
- 登录成功后设置 HttpOnly Cookie
- 登录失败被拒绝，连续失败触发基础限速
- 未登录访问 `/admin/api/*` 被拒绝
- 登出后 Session 失效
- 创建 / 更新 / 停用 `client_id`
- 更新 `allow_auto_register`
- 临时封禁 / 永久封禁 / 解封 `install_id`
- 更新全局配置，包括上传模式

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL，原因是后台 API、Session 与管理员校验未实现

**Step 3: Write minimal implementation**

实现：
- 基于 `ADMIN_PASSWORD_HASH` 的登录
- `admin:session:{session_id}` KV Session
- Session Cookie 解析与过期处理
- 后台 API 的统一鉴权中间层
- 开发者、安装实例、全局配置的 CRUD API

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS，后台 API 可在无前端页面的情况下独立工作

---

### Task 4: 实现最小可用管理员后台页面

**Files:**
- Update: `src/routes/admin.js`
- Create: `src/views/layout.js`
- Create: `src/views/login-page.js`
- Create: `src/views/dashboard-page.js`
- Create: `src/views/clients-page.js`
- Create: `src/views/installs-page.js`
- Create: `src/views/config-page.js`
- Create: `tests/admin-pages.test.js`

**Step 1: Write the failing test**

补充失败测试或最小页面断言：
- `/admin/login` 能返回登录页
- 已登录后可访问概览、开发者、安装实例、全局配置页面
- 未登录访问页面会跳转登录
- 关键页面包含必要表单和关键操作入口

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL，原因是后台页面尚未渲染

**Step 3: Write minimal implementation**

实现一个最小但可用的原生后台：
- 登录页
- 概览页
- 开发者管理页
- 安装实例管理页
- 全局配置页
- 页面通过同源表单或最小内联脚本调用后台 API

要求：
- 不引入重型前端框架
- 保持后台页面结构简单、便于在 Worker 内维护

**Step 4: Run verification**

Run: `npm test`
Expected: PASS，后台具备实际运维可用性

---

### Task 5: 实现 R2、双后端路由与统一响应

**Files:**
- Update: `src/routes/upload.js`
- Create: `src/services/storage-router.js`
- Create: `src/services/storage-uguu.js`
- Create: `src/services/storage-r2.js`
- Create: `src/lib/file-meta.js`
- Create: `tests/storage-modes.test.js`
- Create: `tests/storage-cache.test.js`

**Step 1: Write the failing test**

补充失败测试覆盖：
- `uguu_only` 模式下成功转发 uguu
- `r2_only` 模式下成功写入 R2 并返回 uguu 风格响应
- `uguu_failover_r2` 模式下：
  - uguu 2xx 成功时不触发 R2
  - uguu 网络异常时回退到 R2
  - uguu 超时时回退到 R2
  - uguu 返回非 2xx 时回退到 R2
- R2 对象 key 使用 `YYYY/MM/DD/<random>.<ext>` 规则
- R2 返回 URL 使用 `R2_PUBLIC_BASE_URL`
- 命中上传缓存时能返回最终统一响应，而不是只返回 uguu 专属响应

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL，原因是当前代码只有 uguu 单后端

**Step 3: Write minimal implementation**

实现：
- 按 `config:global.upload_mode` 选择上传后端
- uguu 与 R2 的独立适配器
- R2 对象 key 生成与扩展名推断
- uguu 风格统一响应组装
- 上传缓存保存最终响应
- 后台可读的“是否发生过 R2 回退”记录字段

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS，三种上传模式全部可用

---

### Task 6: 文档、部署配置与迁移收尾

**Files:**
- Update: `README.md`
- Update: `wrangler.jsonc`
- Update: `package.json`
- Possibly Update: `scripts/deploy.mjs`
- Create: `docs/plans/2026-04-23-cfimagebed-redesign-rollout-checklist.md`

**Step 1: Write the failing test**

无需新增自动化单测，改为人工核对清单，确保文档覆盖：
- 新上传请求头协议
- KV / R2 绑定方式
- 管理员密码配置
- 后台入口与使用方式
- 三种上传模式的含义
- 从旧 Bearer 模式迁移到新模式的步骤

**Step 2: Write minimal implementation**

更新 README 与部署配置：
- 删除第三方 Bearer 鉴权文档
- 增加 `client_id + install_id` 协议说明
- 增加 R2 环境变量与部署说明
- 增加后台登录与初始化说明
- 增加下游接入迁移示例

同时补一份 rollout checklist，供真实切换时逐项确认。

**Step 3: Run verification**

Run:
- `npm test`
- `npm run deploy -- --dry-run`

Expected:
- 单测全部通过
- dry-run 可识别 Worker、KV、R2 绑定与相关配置

---

### Recommended Execution Order

1. Task 1: 入口拆分与测试骨架
2. Task 2: 新身份模型与风控
3. Task 3: 后台 API 与 Session
4. Task 4: 后台页面
5. Task 5: R2 与双后端
6. Task 6: 文档、迁移与 dry-run 验证

---

### Done Criteria

满足以下条件，才算这次重构完成：

1. 代码中不再依赖第三方模型接口鉴权。
2. `/upload` 正式以 `X-Client-Id + X-Install-Id` 为唯一正式鉴权协议。
3. 管理员可通过后台完成 client、install、全局模式配置与封禁操作。
4. `uguu_only / uguu_failover_r2 / r2_only` 三种模式都已测试通过。
5. R2 返回对下游保持 uguu 风格兼容结构。
6. README、部署脚本、迁移说明与真实实现保持一致。
