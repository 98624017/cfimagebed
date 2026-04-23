# Auth Cache Concurrency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Worker 增加鉴权内存缓存与同 token 并发合并，减少热点 token 的重复鉴权成本。

**Architecture:** 在 `src/index.js` 内维护 isolate 级内存 Map，并把鉴权慢路径收敛到单个共享 Promise。测试通过并发请求和热 token 回访验证行为。

**Tech Stack:** Cloudflare Worker, Node.js test runner, Web Fetch API

---

### Task 1: 为内存缓存命中路径补测试

**Files:**
- Modify: `tests/index.test.js`
- Test: `tests/index.test.js`

**Step 1: Write the failing test**

增加测试，验证相同 token 第二次请求命中内存缓存后不再查 KV，也不再请求鉴权上游。

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL，因为当前实现只查 KV，不支持 isolate 内存缓存

**Step 3: Write minimal implementation**

在 `src/index.js` 中新增鉴权内存缓存读取和写入逻辑。

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: 新测试 PASS

### Task 2: 为同 token 并发合并补测试

**Files:**
- Modify: `tests/index.test.js`
- Test: `tests/index.test.js`

**Step 1: Write the failing test**

增加测试，验证两个并发相同 token 请求只发起一次鉴权上游请求。

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL，因为当前实现会发起两次鉴权上游请求

**Step 3: Write minimal implementation**

在 `src/index.js` 中新增 in-flight Promise Map，并在鉴权慢路径复用 Promise。

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: 新测试 PASS

### Task 3: 回归验证与文档同步

**Files:**
- Modify: `README.md`
- Test: `tests/index.test.js`

**Step 1: Update docs**

在 `README.md` 中补充说明 Worker 现在包含 isolate 级鉴权热缓存和同 token 并发合并。

**Step 2: Run full verification**

Run: `npm test`
Expected: 全量 PASS
