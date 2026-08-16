# 安全设计

- 用户代码、标程、暴力程序、Validator、Generator 和 Checker 全部是不可信代码，只能交给隔离执行服务。
- API 不返回隐藏测试数据，不把隐藏数据写入普通日志或 AI Prompt。
- 密码使用 Node `scrypt` 加盐哈希；生产迁移计划采用 Argon2id。
- Cookie 为 HttpOnly + SameSite=Lax；生产 HTTPS 下必须增加 Secure。
- 登录和提交接口包含速率限制；所有管理员资源实施 RBAC。
- 响应设置 CSP、nosniff、Referrer-Policy 和请求 ID。
- ZIP 审计只读取中央目录，不解压或执行内容；拒绝绝对路径、路径穿越、符号链接、加密条目、不支持的压缩方式、ZIP64 超限、超大条目和压缩炸弹，并对脚本/可执行文件给出人工复核告警。
- 数据实验室生成器、Validator、标程和暴力程序仅通过 `ExecutionProvider` 运行。运行记录只保存输入预览、大小和短哈希；判题输出与凭据不会进入日志或 AI Prompt。
- AI 仅由 API 服务端调用；浏览器只能收到策略结果、配额计数和提示词元数据，不能获得 AI 密钥。AI 关闭或超额时必须显示确定性降级，不得伪装成模型结果。
- 生产环境不得直接暴露 PostgreSQL、Redis、MinIO 管理端口或任何外部服务密钥。
