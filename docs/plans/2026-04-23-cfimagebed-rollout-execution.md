# cfimagebed 上线执行单

- 日期：2026-04-23
- 目标：把 rollout checklist 落成一份可执行的真实环境清点顺序，以及首批 `client_id` 初始化动作

---

## 一、当前已确认

- 代码分支干净，可直接继续上线准备
- `npm test` 已通过
- `npm run deploy -- --dry-run` 已通过
- Cloudflare 账号通过 `wrangler whoami` 已确认具备 Worker / KV / Secret / Route 相关权限
- 当前 `wrangler.jsonc` 已声明：
  - `IMAGEBED_KV`
  - `IMAGEBED_R2`
  - `UGUU_API_BASE_URL`
  - `R2_PUBLIC_BASE_URL`
  - `R2_OBJECT_PREFIX`
  - `UPLOAD_CACHE_TTL_SECONDS`

---

## 二、当前未闭环项

以下三项还没有被命令式核实：

1. `ADMIN_PASSWORD_HASH` 是否已注入
2. `IMAGEBED_KV` 对应生产 KV 是否真实存在
3. `IMAGEBED_R2` bucket 是否真实存在

当前阻塞原因：

- 当前终端环境未设置 `CLOUDFLARE_API_TOKEN`
- 在非交互环境下，`wrangler secret list`、`wrangler kv namespace list`、`wrangler r2 bucket list` 都需要显式 Token

另外，`wrangler.jsonc` 里仍有两处占位值，正式部署前必须替换：

- `r2_buckets[0].bucket_name = your-imagebed-bucket`
- `vars.R2_PUBLIC_BASE_URL = https://cdn.example.com`

---

## 三、真实环境清点命令

先在当前终端导出 Token：

```bash
export CLOUDFLARE_API_TOKEN=你的Token
```

然后依次执行：

```bash
wrangler secret list
wrangler kv namespace list
wrangler r2 bucket list
```

清点通过标准：

- `wrangler secret list` 中能看到 `ADMIN_PASSWORD_HASH`
- `wrangler kv namespace list` 中能看到 `314025dcbfda4fdfa16859b013b677f9`
- `wrangler r2 bucket list` 中能看到你实际要绑定的真实 bucket 名
- `R2_PUBLIC_BASE_URL` 已替换成真实 CDN 域名，且该域名可直接打开

如果首发要降低风险，上传模式建议先定为：

```text
uguu_failover_r2
```

---

## 四、首批 Client 方案

首批建议只放 2 个：

```text
cl_partner_a_prod_01  30/min   600/hour
cl_partner_b_prod_01  60/min   1500/hour
```

设计理由：

- 一个保守灰度档
- 一个标准接入档
- 足够验证自动注册、限流、R2 回退和后台管理链路

示例文件已提供：

```text
ops/bootstrap/initial-clients.example.json
```

你上线时可在本地私有目录准备：

```text
ops/private/initial-clients.private.json
```

然后按真实合作方名字和实际发放策略填写 `client_id` 与 `name`。

---

## 五、首批 Client 初始化方式

### 方式 A：先本地预览

```bash
npm run rollout:clients -- --config ops/bootstrap/initial-clients.example.json --dry-run
```

### 方式 B：直接写入后台

先准备两个环境变量：

```bash
export IMAGEBED_ADMIN_BASE_URL=https://你的worker域名
export IMAGEBED_ADMIN_PASSWORD=你的后台密码
```

然后执行：

```bash
npm run rollout:clients -- --config ops/private/initial-clients.private.json
```

脚本会自动：

1. 登录 `/admin/login`
2. 获取后台 Session Cookie
3. 逐个调用 `/admin/api/clients`
4. 输出每个 `client_id` 的写入结果

---

## 六、上线窗口建议顺序

1. 导出 `CLOUDFLARE_API_TOKEN`
2. 核实 Secret / KV / R2 三项资源
3. 部署正式版本
4. 后台把上传模式设为 `uguu_failover_r2`
5. 用 `rollout:clients` 写入首批 2 个 client
6. 让首批下游切到 `X-Client-Id + X-Install-Id`
7. 用真实文件做 1 次上传验证
8. 观察 `invalid_client`、`rate_limited`、R2 回退频次

---

## 七、现在的结论

当前距离真正可上线，还差最后三步：

1. 提供 `CLOUDFLARE_API_TOKEN` 完成资源核实
2. 把 R2 bucket 名与公开域名从占位值改成真实值
3. 部署后执行首批 `client_id` 初始化

这三步完成后，就可以进入真实流量灰度。
