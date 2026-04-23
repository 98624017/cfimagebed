# cfimagebed 真实环境清点结果

- 日期：2026-04-23
- 目标：为 `cfimagebed` 正式上线前，确认 Cloudflare 账号权限、Worker 配置、KV / R2 绑定、后台初始化条件和当前阻塞项

---

## 一、已确认项

### 1. Cloudflare 账号与权限

通过 `wrangler whoami` 已确认当前账号可用，且具备以下关键权限：

- `workers (write)`
- `workers_kv (write)`
- `workers_routes (write)`
- `workers_scripts (write)`
- `zone (read)`
- `secrets_store (write)`

这意味着从权限面看，当前账号**具备上线 Worker、管理 KV、路由与 Secret 的基础权限**。


### 2. 本地代码与部署校验

已确认：

- `npm test` 通过
- `npm run deploy -- --dry-run` 通过

`dry-run` 已识别到这些绑定和变量：

- `IMAGEBED_KV`
- `IMAGEBED_R2`
- `UGUU_API_BASE_URL`
- `R2_PUBLIC_BASE_URL`
- `R2_OBJECT_PREFIX`
- `UPLOAD_CACHE_TTL_SECONDS`

说明当前项目代码和 `wrangler.jsonc` 的结构已经进入可部署状态。


### 3. 当前代码已具备的上线能力

已具备：

- 新协议：`X-Client-Id + X-Install-Id`
- `client / install` 校验
- 自动注册
- 两层限流
- 安装实例封禁 / 解封
- 管理后台
- `uguu_only`
- `uguu_failover_r2`
- `r2_only`
- 上传缓存

因此从代码完成度看，**主功能已经达到可上线级别**。

---

## 二、待确认项

### 1. 真实 Secret 状态

需要确认：

- `ADMIN_PASSWORD_HASH` 是否已经在目标环境注入

当前未能自动核实，原因不是权限不足，而是：

- 在当前非交互环境下，`wrangler secret list` 需要显式提供 `CLOUDFLARE_API_TOKEN`


### 2. 真实 KV / R2 资源状态

需要确认：

- `wrangler.jsonc` 中的 `IMAGEBED_KV` 对应的生产 KV 是否确实存在且可用
- `IMAGEBED_R2` 指向的 bucket 是否真实存在
- `R2_PUBLIC_BASE_URL` 对应的公开域名是否已经可访问

当前未能自动核实，原因同上：

- `wrangler kv namespace list`
- `wrangler r2 bucket list`

在当前非交互环境下都因为缺少 `CLOUDFLARE_API_TOKEN` 而未完成。


### 3. 目标上线模式

还需要你最终拍板：

- `uguu_only`
- `uguu_failover_r2`
- `r2_only`

当前推荐：

- **首发建议使用 `uguu_failover_r2`**

原因：

- uguu 仍作为主路径
- 一旦 uguu 波动，系统能自动落到 R2
- 下游完全透明
- 风险低于一开始就切 `r2_only`

---

## 三、当前阻塞项

### 阻塞 1：缺少非交互式 API Token

虽然本机 `wrangler whoami` 能识别当前登录态，但资源类命令在当前终端环境里仍要求显式设置：

```bash
CLOUDFLARE_API_TOKEN=...
```

否则以下命令无法完整执行：

- `wrangler secret list`
- `wrangler kv namespace list`
- `wrangler r2 bucket list`

这意味着：

- **代码可部署**
- **但真实资源存在性与 Secret 状态还未被命令式核实**


### 阻塞 2：首批 client 尚未创建

虽然后台和后台 API 已经具备创建能力，但当前还没有证据表明：

- 首批 `client_id` 已创建
- 各下游已分配到对应 `client_id`
- 首批默认限流策略已落盘

---

## 四、建议的上线前最后动作

### 1. 先解决资源核实阻塞

建议你在同一终端先导出可用 Token：

```bash
export CLOUDFLARE_API_TOKEN=你的Token
```

然后依次执行：

```bash
wrangler secret list
wrangler kv namespace list
wrangler r2 bucket list
```

目标是把下面三件事确认下来：

- `ADMIN_PASSWORD_HASH` 已存在
- `IMAGEBED_KV` 真实存在
- `IMAGEBED_R2` bucket 真实存在


### 2. 先以 `uguu_failover_r2` 上线

除非你已经明确准备完全切 R2，否则建议首发时把后台全局模式先设成：

```text
uguu_failover_r2
```

这样既能利用原有 uguu 路径，也能在异常时自动兜底。


### 3. 先只创建首批有限 client

不要一口气把所有下游全部切入。

建议先做一轮“小批量灰度”：

- 1 到 3 个下游开发者
- 每个下游一套独立 `client_id`
- 观察上传成功率、限流与 R2 回退情况

---

## 五、当前结论

### 可以确认的结论

1. 代码已经具备上线能力
2. 本地测试和 `dry-run` 都通过
3. Cloudflare 账号权限足够

### 还需要你补上的最后一层确认

1. 提供可用的 `CLOUDFLARE_API_TOKEN` 做资源核查
2. 拍板首发上传模式，推荐 `uguu_failover_r2`
3. 执行首批 `client_id` 初始化

一旦这 3 件事完成，就可以进入真实上线窗口。
