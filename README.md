# CTH-OnlineJudge

CTH-OnlineJudge（CTHOJ）是一个面向算法训练、程序设计竞赛和测试数据工程的在线评测系统。项目包含题库、真实代码评测、比赛、排行榜、评论治理、通知、管理员后台和测试数据实验室，可在 Windows、Linux上开发，并支持部署到 Linux 服务器。实测服务端可部署在最低配置为2核2GB内存的Linux服务器上（低并发）。

## 功能

- 用户注册、登录、退出、头像与个人中心
- 题库、Markdown/LaTeX 题面、样例和隐藏测试点
- C++、Python、Java 等语言的 Judge0 隔离评测
- 精确匹配、忽略空白、浮点误差和 Special Judge
- ACM、OI、IOI 赛制，支持罚时、封榜和滚榜
- 独立比赛排行榜与比赛题目访问控制
- 题目评论、违禁词、账号封禁和管理员权限管理
- 站内通知、审计记录和内容治理
- AI生成测试数据、校验、对拍、反例缩小和完整数据导出
- 可选的 OpenAI-compatible 模型接口，密钥仅由服务端读取

## 技术结构

```text
apps/
  api/                 Node.js HTTP API、认证、评测调度和静态资源服务
  web/                 原生 Web 前端
  worker/              独立任务 Worker 入口
packages/
  database/            Prisma/PostgreSQL 目标模型
  shared/              公共类型
  ui/                   UI 包
infra/                  PostgreSQL、Redis 和 Judge0 Compose 配置
scripts/                初始化、启动、备份、恢复和部署脚本
tests/                  API 回归测试
docs/                   架构、API、安全与基础设施文档
```

当前业务数据层使用 JSON 文件持久化；PostgreSQL/Prisma 与 Redis/BullMQ 的目标模型和基础设施已经提供，但业务读写迁移尚未完成。生产部署时应对数据目录进行定期备份。

## 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本
- 使用真实评测时需要 Docker Engine 与 Docker Compose v2
- Judge0 建议至少 2 核 4GB；2GB 内存只适合单 Worker、低并发测试

## 本地启动

Windows PowerShell：

```powershell
Copy-Item .env.example .env
npm run dev
```

Linux：

```bash
cp .env.example .env
npm run dev
```

打开 <http://localhost:3000>。项目 API 当前只使用 Node.js 标准库，首次开发启动不需要安装第三方运行依赖。

开发环境首次启动会创建演示数据。生产环境必须在 `.env` 中设置强随机 `JWT_SECRET` 和 `CTHOJ_ADMIN_PASSWORD`；不要提交 `.env`、用户数据或测试数据。

## 启用 Judge0

Windows PowerShell：

```powershell
.\scripts\infra-up.ps1 -Role all
.\scripts\judge0-smoke.ps1
npm run judge:configure-local
npm run dev
```

Linux：

```bash
sudo bash scripts/server-install.sh all
bash scripts/infra-up.sh all
```

随后在 `.env` 中配置：

```env
JUDGE_PROVIDER=judge0
JUDGE0_BASE_URL=http://127.0.0.1:2358
JUDGE0_AUTH_HEADER=X-Auth-Token
JUDGE0_AUTH_TOKEN=<infra/.env.infrastructure 中生成的令牌>
```

Judge0 令牌、模型密钥和隐藏测试数据不得传给浏览器，也不得提交到仓库。用户代码和 Special Judge 必须通过 `ExecutionProvider` 送入隔离执行环境，禁止在 API 进程内执行。

## Docker 启动

复制环境配置并至少设置管理员密码和 JWT 密钥：

```bash
cp .env.example .env
docker compose -p cthoj up -d --build
```

根目录 Compose 用于启动 Web/API 和通用依赖。真实 Judge0 使用 `infra/docker-compose.yml`：

```bash
bash scripts/infra-init.sh
bash scripts/infra-up.sh all
```

## Ubuntu 生产部署

以下示例使用 Ubuntu 22.04/24.04、Node.js 20+、Docker Engine、Compose v2 和 Nginx。

### 1. 获取代码

```bash
sudo git clone https://github.com/CTH-Fan-Club/CTHOJ.git /opt/cthoj
cd /opt/cthoj
```

### 2. 启动 PostgreSQL、Redis 与 Judge0

```bash
sudo bash scripts/server-install.sh all
```

该命令会生成 `infra/.env.infrastructure`，并将 PostgreSQL、Redis 和 Judge0 绑定到本机地址。Judge0 默认使用单 Worker、关闭用户代码网络访问并启用令牌认证。

### 3. 创建生产配置

```bash
sudo useradd --system --home /var/lib/cthoj --shell /usr/sbin/nologin cthoj
sudo install -d -m 750 -o root -g cthoj /etc/cthoj
sudo install -d -m 750 -o cthoj -g cthoj /var/lib/cthoj
sudo cp .env.example /etc/cthoj/cthoj.env
sudo chown root:cthoj /etc/cthoj/cthoj.env
sudo chmod 640 /etc/cthoj/cthoj.env
sudoedit /etc/cthoj/cthoj.env
```

至少修改以下配置：

```env
NODE_ENV=production
PORT=3000
DATA_FILE=/var/lib/cthoj/cthoj.json
TEST_DATA_DIR=/var/lib/cthoj/test-data
DATA_LAB_DATA_DIR=/var/lib/cthoj/data-lab
AVATAR_DIR=/var/lib/cthoj/avatars
JWT_SECRET=<强随机字符串>
CTHOJ_ADMIN_PASSWORD=<首次初始化管理员密码>
CTHOJ_DEMO_PASSWORD=
JUDGE_PROVIDER=judge0
JUDGE0_BASE_URL=http://127.0.0.1:2358
JUDGE0_AUTH_HEADER=X-Auth-Token
JUDGE0_AUTH_TOKEN=<基础设施配置中生成的令牌>
AI_ENABLED=false
```

可以使用 `openssl rand -hex 32` 生成随机值。配置文件只允许 `root` 和服务用户读取。

### 4. 配置 systemd

创建 `/etc/systemd/system/cthoj.service`：

```ini
[Unit]
Description=CTH-OnlineJudge
After=network-online.target docker.service
Requires=docker.service

[Service]
Type=simple
User=cthoj
Group=cthoj
WorkingDirectory=/opt/cthoj
EnvironmentFile=/etc/cthoj/cthoj.env
ExecStart=/usr/bin/node /opt/cthoj/apps/api/src/server.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cthoj
curl http://127.0.0.1:3000/api/v1/health
```

### 5. 配置 Nginx

创建 `/etc/nginx/sites-available/cthoj`：

```nginx
server {
    listen 80;
    server_name _;
    client_max_body_size 2g;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 1800s;
        proxy_send_timeout 1800s;
    }
}
```

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/cthoj /etc/nginx/sites-enabled/cthoj
sudo nginx -t
sudo systemctl reload nginx
```

公网只需开放 `80/443`；`2358`、`3000`、`5432` 和 `6379` 应限制为本机或可信内网。正式使用建议配置域名和 HTTPS。

## 更新

```bash
cd /opt/cthoj
sudo git pull --ff-only
sudo systemctl restart cthoj
```

如果基础设施配置发生变化，再执行：

```bash
sudo bash scripts/server-install.sh all
```

## 备份与迁移

Windows PowerShell：

```powershell
.\scripts\infra-backup.ps1
.\scripts\export-server-bundle.ps1
```

备份和迁移包包含敏感业务数据时，应加密保存并通过受控通道传输。恢复方法见 [基础设施文档](docs/INFRASTRUCTURE.md)。

## 检查

```bash
npm run typecheck
npm run lint
npm test
```

## 部分运行实例
##### 增加题目功能：
<img width="1893" height="1028" alt="QQ_1786895620112" src="https://github.com/user-attachments/assets/75b968ec-e989-4a55-93c1-bb9b7da3fbe8" />

##### 数据生成：
<img width="1494" height="776" alt="QQ_1786895817830" src="https://github.com/user-attachments/assets/5c5ce323-1095-4995-a497-3f30b0ac39d6" />

<img width="1126" height="699" alt="QQ_1786895890024" src="https://github.com/user-attachments/assets/a1e5d6e6-8119-4e46-9621-2c973f52438d" />



## License

[MIT](LICENSE)
