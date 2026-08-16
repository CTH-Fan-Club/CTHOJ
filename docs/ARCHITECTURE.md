# 架构

浏览器只访问 `CTHOJ API`。API 负责认证、资源权限和数据脱敏，并将不可信代码交给 `ExecutionProvider`。生产 Provider 为 Judge0，API 进程不编译或运行用户代码。异步任务目标架构为 Redis + BullMQ 独立 Worker；当前开发模式用同进程队列保持无需外部依赖的闭环。

AI 使用 OpenAI-compatible HTTP 适配器。题面和代码被标记为不可信内容，隐藏测试数据不进入 Prompt。AI 失败不影响判题。

开发元数据当前持久化到 JSON；隐藏测试数据按测试点独立保存到 `TEST_DATA_DIR`，JSON 只保存文件引用和字节数，评测时逐个读取。`packages/database/prisma/schema.prisma` 定义 PostgreSQL 目标模型；迁移到 Prisma 后，大型测试数据将转移到 MinIO，数据库仅保存对象 Key、哈希与元数据。
