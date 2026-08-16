# CTHOJ API

所有接口以 `/api/v1` 开头。

- `GET /health`：服务、Judge Provider 和 AI 状态。
- `POST /auth/register|login|logout`：认证，访问令牌保存于 HttpOnly Cookie；注册校验用户名、邮箱和密码强度，并限制尝试频率。
- `GET /me`：当前用户。
- `GET|POST /problems`：公开题库；创建需要 SETTER/ADMIN。
- `GET /problems/:id/comments`、`POST /problems/:id/comments`：题目评论列表与发表评论；评论内容安全渲染 Markdown/LaTeX，并经过服务端违禁词和可选 AI 审核。
- `DELETE /comments/:id`：评论作者或管理员删除评论。
- `GET|POST /submissions`：提交列表和创建。
- `GET /submissions/:id`：提交详情，实施资源级鉴权。
- `GET /submissions/:id/events`：SSE 状态流。
- `POST /submissions/:id/diagnose`：AI 错误诊断。
- `GET|POST /contests`：比赛列表与管理员创建比赛。
- `GET|PATCH /contests/:id`：比赛详情与管理员编辑。
- `POST /contests/:id/register`：用户报名。
- `GET /contests/:id/scoreboard`：公开榜单；管理员可使用 `?full=1` 查看完整榜单。
- `POST /contests/:id/freeze`：管理员封榜或解封。
- `POST /contests/:id/roll`：管理员按冻结队列逐条滚榜。
- `GET /leaderboard`：全站 Rating 排行。
- `POST /admin/ai/test`：管理员在服务端测试已配置的 OpenAI-compatible 模型 API，只返回连通性、延迟和安全错误摘要。
- `GET|PATCH /admin/moderation`：管理员读取或修改评论违禁词、AI 审核开关和 AI 额外封禁关键词。
- `GET /admin/users`、`PATCH|DELETE /admin/users/:id/ban`：管理员查看用户、按 1-36500 天或永久封禁/解封账号；普通管理员不能处理管理员账号，admin/超级管理员可以。
- `PATCH /admin/users/:id/role`：管理员可将普通用户授予 ADMIN；撤销管理员权限只允许 admin 用户或超级管理员。
- `GET /admin/comments`、`POST /admin/comments/scan`：管理员查看评论并要求服务端 AI/关键词重新扫描，违规评论会软删除并从公开列表移除。
- `GET /admin/data-lab`、`POST /admin/data-lab/run`：管理员数据实验室；运行请求支持 `sizeMode`、`caseSizes`、`minSize`、`maxSize`、`density` 和逐组 `caseProfiles`。Generator 每组接收 `Seed Size Density Profile`，旧版只读取 Seed 的程序仍兼容；所有程序通过 `ExecutionProvider` 隔离执行。
- `DELETE /admin/data-lab/:runId`：删除管理员数据实验室运行记录，并清理该运行的索引产物和关联审计日志。
- `GET /admin/data-lab/:runId/export`：管理员下载完整测试数据 ZIP，包含配对的 `cases/*.in`、`cases/*.out` 和记录规模、密度、Corner Case、大小及哈希的 `manifest.json`。
- `GET|POST /admin/data-lab/prompts`：提示词版本列表与创建。
- `POST /admin/data-lab/strategy`：服务端 AI 测试策略生成；请求中的 `language` 限定 Generator 与 Validator 的目标语言，服务端清理代码围栏并拒绝明显的语言不匹配；AI 关闭或不可用时返回明确的确定性降级结果，并按管理员日配额计量。
- `POST /admin/data-lab/zip-audit`：上传 Base64 ZIP 中央目录审计，不解压、不执行文件，检查路径穿越、符号链接、加密条目、压缩方式、大小和压缩炸弹。

错误结构为 `{ "error": { "code", "message", "requestId" } }`。

比赛提交仍使用 `POST /submissions`，并额外传入 `contestId`。服务端会校验比赛时间、报名状态和赛题归属。ACM 按解题数与罚时排序，每次有效错误提交增加 20 分钟；OI 取每题最后一次提交分数；IOI 取每题历史最高分。OI/IOI 按通过测试点比例计算 0-100 的部分分。

比赛题目采用服务端权限控制：管理员/出题人始终可见；普通用户在比赛开始前不会收到 `problemIds`、题目详情或榜单中的题目标题，只有已报名用户在比赛开始后才会获得赛题列表。比赛详情中的 `problemsVisible` 表示当前会话是否可以查看赛题。
