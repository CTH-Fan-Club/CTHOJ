# CTHOJ 开发计划

1. 基础项目：Monorepo、认证、RBAC、健康检查、开发数据层、基础 UI、文档和测试。
2. OJ 闭环：题目、编辑器、Submission、ExecutionProvider、Judge0、异步状态和 SSE。
3. 竞赛与排行：报名、题目、ACM 罚时、封榜、Rating。
4. 用户 AI：OpenAI-compatible Provider、渐进提示、诊断、AC 后复盘、配额与审计。
5. AI 数据实验室 MVP：题意结构化、策略、对拍、冲突、缩小、审计和质量报告。
6. 生产化：Prisma/PostgreSQL、BullMQ/Redis、MinIO、上传安全、端到端和恢复测试。

每一阶段必须通过语法检查、Lint、测试和启动验证。真实 Judge0/AI 未连接时仅允许声称“适配器已实现，联机未验证”。
