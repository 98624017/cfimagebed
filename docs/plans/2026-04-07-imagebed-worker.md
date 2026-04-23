# Imagebed Worker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建一个 Cloudflare Worker，先用用户 `Bearer sk-xxx` 访问鉴权接口验证，再无鉴权转发到 uguu，并对鉴权结果和图片上传结果做 KV 缓存。

**Architecture:** Worker 从请求头提取 Bearer token，先查 KV 中 `sha256(token)` 是否已授权，未命中时请求 `https://api.xinbao-ai.com/v1/models` 验证。上传请求解析 `multipart/form-data`，对文件内容计算 `md5`，命中 `upload:{md5}` 时直接返回缓存的 uguu 结果，否则原样转发到 uguu 并写入 KV，缓存 9000 秒。

**Tech Stack:** Cloudflare Workers, Cloudflare KV, JavaScript ESM, Node built-in test runner

---

### Task 1: 建立项目骨架与失败测试

**Files:**
- Create: `package.json`
- Create: `wrangler.jsonc`
- Create: `tests/index.test.js`

**Step 1: Write the failing test**

编写以下场景的失败测试：
- 缺失 `Authorization` 时返回 401
- 首次有效 key 触发远端鉴权并写入授权 KV
- 无效 key 返回 401 且不转发到 uguu
- 相同图片二次上传直接命中缓存，不再请求鉴权接口和 uguu

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL，原因是 `src/index.js` 尚未实现

### Task 2: 实现最小可用 Worker

**Files:**
- Create: `src/index.js`

**Step 1: Write the failing test**

补充或收紧断言：
- 转发到 uguu 时移除原始 `Authorization`
- 保留其余 multipart 请求体与路径
- 缓存命中时响应包含调试头 `X-Imagebed-Cache: HIT`

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL，原因是鉴权 / 去重 / 转发逻辑尚未完整实现

**Step 3: Write minimal implementation**

实现：
- Bearer token 解析
- `sha256(token)` 持久化鉴权缓存
- `multipart/form-data` 文件提取与 `md5`
- uguu 转发与 2.5h KV 缓存
- JSON 错误响应和基础透传

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

### Task 3: 文档与交付

**Files:**
- Create: `README.md`

**Step 1: Write the failing test**

无需额外自动化测试；改为人工核对 README 是否覆盖：
- Wrangler 配置
- KV 绑定
- 部署变量
- 请求示例

**Step 2: Write minimal implementation**

补充 README，说明鉴权缓存和上传去重缓存的行为、限制与部署方式。

**Step 3: Run verification**

Run: `npm test`
Expected: PASS
