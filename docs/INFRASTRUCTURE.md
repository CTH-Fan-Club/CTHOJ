# PostgreSQL、Redis 与 Judge0 基础设施

CTHOJ 与 Judge0 使用完全独立的数据服务：

```text
main role
  cthoj-postgres  PostgreSQL 16.2，业务数据
  cthoj-redis     Redis 7.2.4，BullMQ 队列

judge role
  judge0-server  Judge0 1.13.1 API
  judge0-worker  单并发隔离执行 Worker
  judge0-db      Judge0 专用 PostgreSQL
  judge0-redis   Judge0 专用临时队列
```

所有宿主机端口默认绑定 `127.0.0.1`。Judge0 默认关闭编译器参数、命令行参数、回调、附加文件和用户代码网络访问，并使用随机认证 Token。

## Windows 本地启动

当前电脑必须先在 BIOS/UEFI 中打开 Intel VT-x，然后以管理员 PowerShell 执行：

```powershell
.\scripts\bootstrap-windows.ps1 -InstallDockerDesktop
Restart-Computer
```

默认使用 WSL 2 后端时可省略 `-EnableHyperVForJudge0`；该参数只在需要额外创建 Hyper-V 虚拟机时使用。

重启后打开 Docker Desktop，等待 Linux Engine 就绪：

```powershell
.\scripts\infra-up.ps1 -Role all
.\scripts\judge0-smoke.ps1
npm run judge:configure-local
npm run dev
```

`judge:configure-local` 会生成或更新根目录 `.env`，从 `infra/.env.infrastructure` 安全读取认证信息并把本地 API 切换到 Judge0。该命令不会打印密钥，`.env` 也不会进入 Git 或迁移包。

官方 Judge0 `v1.13.1` 镜像中的 isolate 1.8.1 只支持 cgroup v1，现代 Docker Desktop 上会以 `/box/main.cpp` 不存在失败。本项目通过 `infra/judge0-cgroupv2/` 自动构建兼容镜像：保留 Judge0 1.13.1 的语言工具链，将 isolate 固定到 2.6，并应用 Judge0 上游 PR #599 的 cgroup v2 适配。不得用 Mock 结果替代 `judge0-smoke.ps1` 的真实编译执行结果。

首次启动需要从 Docker Hub 拉取 `judge0/judge0:1.13.1`，并从 GitHub 获取固定提交的 isolate 源码。后续构建会使用 Docker 缓存。独立判题服务器需要 x86_64 Linux、cgroup v2、Docker Engine/Compose v2，以及至少 2 核 4GB；2GB 仅适合低并发验证。原生 Linux 不要求宿主机暴露 `vmx/svm`；安装脚本检查的是 cgroup v2。

Windows 可将 Docker Desktop 程序、WSL 数据和交换文件迁移到非系统盘，例如：

```text
Program: <data-drive>:\Docker
WSL data: <data-drive>:\DockerData
WSL swap: <data-drive>:\DockerData\wsl-swap.vhdx
Optional Hyper-V data: <data-drive>:\DockerHyperVData
```

可分别启动：

```powershell
.\scripts\infra-up.ps1 -Role main
.\scripts\infra-up.ps1 -Role judge
```

生成的密码保存在 `infra/.env.infrastructure`，Judge0 运行配置位于 `infra/runtime/judge0.conf`。两者均不会进入 Git 或迁移源码包。

## 连接信息

CTHOJ API 后续迁移 PostgreSQL/Redis 时使用：

```env
DATABASE_URL=postgresql://cthoj:<generated-password>@127.0.0.1:5432/cthoj
REDIS_URL=redis://:<generated-password>@127.0.0.1:6379
JUDGE_PROVIDER=judge0
JUDGE0_BASE_URL=http://127.0.0.1:2358
JUDGE0_AUTH_HEADER=X-Auth-Token
JUDGE0_AUTH_TOKEN=<generated-token>
```

## 备份与迁移

```powershell
.\scripts\infra-backup.ps1
.\scripts\export-server-bundle.ps1
```

迁移包生成到 `artifacts/`，不包含密码、运行数据和本地日志。数据库备份生成到 `backups/`，应作为敏感文件单独加密传输。

使用 SSH 密钥一键部署主服务器角色：

```powershell
.\scripts\deploy-infra.ps1 -HostAddress <main-server-ip> -Role main -KeyPath <ssh-key-path>
```

部署独立判题服务器，只允许 CTHOJ 主服务器访问：

```powershell
.\scripts\deploy-infra.ps1 -HostAddress <judge-server-ip> -Role judge -AllowedIp <main-server-ip> -KeyPath <ssh-key-path>
```

服务器安装脚本要求 x86_64 Ubuntu/Linux 已安装 Docker Engine 与 Compose v2，并能访问 Docker Hub、Debian Archive 和 GitHub 以完成首次构建。部署完成后，还必须在云安全组中把 Judge0 `2358` 端口限制为仅允许 CTHOJ 主服务器 IP。

## 恢复

只在核对目标后执行：

```powershell
.\scripts\infra-restore.ps1 -BackupDirectory .\backups\<timestamp> -ConfirmDataReplacement
```

Redis 队列不是业务事实来源，迁移时默认不恢复队列，防止重复执行旧任务。
