# cfimagebed 首批 Client 初始化方案

- 日期：2026-04-23
- 目标：为首批下游开发者创建一组可控、可灰度、可回滚的 `client_id`

---

## 一、初始化原则

首批 `client_id` 不应追求多，而应追求：

1. **容易识别**
2. **方便停用**
3. **方便限流**
4. **适合灰度**

因此建议首批不要超过 **3 个** 下游开发者。

---

## 二、推荐命名规则

`client_id` 不是密钥，它会出现在下游客户端里，所以应当：

- 可读
- 稳定
- 不依赖保密

推荐格式：

```text
cl_<partner-slug>_<env>_<seq>
```

示例：

```text
cl_partner_a_prod_01
cl_partner_b_prod_01
cl_partner_c_prod_01
```

命名建议：

- `partner-slug`：下游开发者简称
- `env`：一般直接用 `prod`
- `seq`：同一个下游需要第二套时再递增

不要用这些形式：

- 纯随机不可读 ID
- 带空格、中文、特殊符号的 ID
- 让人误以为是 secret 的长 token 风格字符串

---

## 三、首批分层策略

建议首批 client 分成 3 档，而不是所有人都给一样的限流。

### 档位 A：灰度试点

适合：

- 最先接入的合作方
- 愿意配合调试的下游

建议配置：

- 状态：`active`
- 自动注册：`true`
- 每分钟：`30`
- 每小时：`600`


### 档位 B：标准接入

适合：

- 正常规模的客户端
- 无需特别保守的合作方

建议配置：

- 状态：`active`
- 自动注册：`true`
- 每分钟：`60`
- 每小时：`1500`


### 档位 C：受信任大流量

适合：

- 你明确知道用户量更高的下游
- 你愿意承担更大瞬时吞吐的合作方

建议配置：

- 状态：`active`
- 自动注册：`true`
- 每分钟：`120`
- 每小时：`3000`

---

## 四、推荐首批初始化表

你可以直接照这个模板建第一批：

```text
client_id             名称             档位   自动注册   每分钟   每小时
cl_partner_a_prod_01  Partner A 客户端 A      true       30       600
cl_partner_b_prod_01  Partner B 客户端 B      true       60       1500
cl_partner_c_prod_01  Partner C 客户端 A      true       30       600
```

如果你暂时还没定 3 家，就先建 1 到 2 家试点也完全可以。

---

## 五、后台初始化步骤

### 方式一：后台页面

进入：

```text
/admin/clients
```

依次填写：

- `client_id`
- 名称
- 备注
- 状态：`active`
- 自动注册：`true`
- 每分钟 / 每小时限流


### 方式二：后台 API

如果你想脚本化，也可以走：

```http
POST /admin/api/clients
Content-Type: application/json
```

示例：

```json
{
  "client_id": "cl_partner_a_prod_01",
  "name": "Partner A 客户端",
  "remark": "首批灰度",
  "status": "active",
  "allow_auto_register": true,
  "rate_limit": {
    "per_minute": 30,
    "per_hour": 600
  }
}
```

---

## 六、首批下游接入要求

发给首批下游时，只需要他们做两件事：

1. 把固定的 `client_id` 带上
2. 客户端首次启动生成并持久化 `install_id`

请求头示例：

```http
X-Client-Id: cl_partner_a_prod_01
X-Install-Id: local-generated-install-id
```

不要求：

- 下游自建服务端
- 账号体系
- 激活码体系
- 二次换票据

---

## 七、灰度观察建议

首批上线后，建议重点观察：

1. 是否有大量 `invalid_client`
2. 是否有大量 `rate_limited`
3. install 自动注册是否符合预期
4. `uguu_failover_r2` 下是否频繁回退
5. 是否有某个下游明显流量异常

如果某一批客户端异常：

- 先停这个 `client_id`
- 不要影响其他下游

这正是分配独立 `client_id` 的价值。

---

## 八、建议的执行顺序

1. 先创建 1 到 3 个首批 `client_id`
2. 每个 `client_id` 都使用独立限流
3. 先只接少量真实下游
4. 观察 1 到 3 天
5. 稳定后再继续扩容

---

## 九、最终建议

如果你现在就要开始首批初始化，我建议直接从这 2 个开始：

```text
cl_partner_a_prod_01   每分钟 30   每小时 600
cl_partner_b_prod_01   每分钟 60   每小时 1500
```

这样你可以同时覆盖：

- 一个更保守的试点 client
- 一个标准流量 client

先用这两个验证后台、限流、install 自动注册和上传链路，通常就足够判断系统是否进入可扩量状态。
