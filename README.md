# GalaxyLoom

GalaxyLoom 是一个面向短剧生产流程的一体化 AI 创作应用。当前项目已经不是早期的演示仓库形态，而是一套可以直接运行和打包的桌面应用与本地服务：

- 桌面端基于 `Electron`
- 后端服务基于 `Express + TypeScript`
- 前端界面基于 `Vue 3 + Element Plus`
- 本地数据存储基于 `SQLite`

它把“项目管理 -> 故事创作 -> 大纲 -> 剧本 -> 资产 -> 分镜 -> 视频”串成了一条完整流程，适合做 AI 短剧、小说改编、剧情可视化和视频预生产。

## 当前版本定位

这个仓库现在包含的是完整应用本体，而不是只做某一个阶段的工具：

- 内置项目管理、登录、设置页和 6 个创作阶段页面
- 内置后端 API、数据库初始化、上传目录和静态资源服务
- 内置桌面端主进程和打包配置
- 内置新的前端源码目录 `web-src/`
- 内置已编译前端资源目录 `scripts/web/`

也就是说，这个仓库本身已经可以独立开发、构建、打包和部署。

## 主要能力

### 1. 项目管理

- 创建、编辑、删除项目
- 为项目设置题材类型、画风和视频比例
- 按 6 个阶段跟踪当前制作进度

### 2. Stage 1: 故事灵感 / 小说内容

- 管理小说或故事原始内容
- 支持 AI 生成小说内容
- 支持围绕小说进行对话式创作

### 3. Stage 2: 剧集大纲

- 生成剧集大纲
- 对大纲继续聊天式调整
- 保存历史记录、分集内容和故事线

### 4. Stage 3: 剧本生成

- 根据大纲生成剧本
- 支持流式生成
- 支持继续聊天式改稿

### 5. Stage 4: 项目资产

- 抽取和管理角色、场景、道具等资产
- 生成资产提示词
- 生成资产图片并保存
- 获取资产上下文，供后续分镜和视频阶段使用

### 6. Stage 5: 分镜制作

- 根据剧本或资产生成分镜
- 自动规划镜头
- 新增镜头、补镜头
- 上传参考图、查看参考图
- 重绘分镜图、删除分镜图、移除资产参考图
- 生成视频提示词

### 7. Stage 6: 视频合成

- 配置视频生成方案
- 生成视频提示词
- 调用视频模型生成视频
- 查看视频结果
- 合并多个视频片段

### 8. 模型配置与连通性测试

设置页支持直接配置并测试：

- 语言模型
- 图像模型
- 视频模型

当前代码中已经适配或预留了这些供应商类型：

- 语言模型：`OpenAI 兼容接口`、`Anthropic`
- 图像模型：`SiliconFlow`、`OpenAI / DALL-E`、`Stability AI`
- 视频模型：`Volcengine`、`RunningHub`、`Other`

## 技术栈

- `Electron 40`
- `Express 5`
- `TypeScript 5`
- `Vue 3`
- `Element Plus`
- `Knex`
- `better-sqlite3`
- `esbuild`
- `AI SDK / LangChain / Aigne`
- `ffmpeg / ffprobe`

## 运行方式

项目支持两种主要运行方式：

### 1. 作为本地 API 服务运行

适合开发后端接口，或者把它当成独立服务启动。

```bash
yarn install
yarn dev
```

默认监听：

```text
http://localhost:60000
```

### 2. 作为桌面应用运行

适合本地完整体验当前应用形态。

```bash
yarn install
yarn dev:win
```

这会启动：

- Electron 主进程
- 内嵌 Express 服务
- 本地前端界面

## 构建与打包

### 构建后端和 Electron 主进程

```bash
yarn build
```

构建产物：

- `build/app.js`
- `build/main.js`

### 打包桌面应用

```bash
yarn dist:win
```

也可以按平台分别执行：

```bash
yarn dist:mac
yarn dist:linux
```

桌面打包配置位于：

- `electron-builder.yml`

## 首次启动

数据库会在首次运行时自动初始化。

默认账号：

- 用户名：`admin`
- 密码：`admin123`

默认端口：

- `60000`

## 数据与文件位置

### 服务模式

如果直接运行 `yarn dev` 或 `node build/app.js`：

- 数据库文件：项目根目录下的 `db.sqlite`
- 上传目录：项目根目录下的 `uploads/`

### Electron 桌面模式

如果通过 Electron 启动：

- 上传目录会放到 Electron 用户数据目录下的 `uploads/`
- 这样做是为了避免桌面安装版把用户文件写回程序目录

## 模型配置说明

应用启动后，先进入“设置”页完成模型配置。

至少需要配置：

- 语言模型：用于小说、大纲、剧本、提示词等文本生成
- 图像模型：用于资产图和分镜图生成
- 视频模型：用于视频阶段的提示词落地和视频生成

当前设置页支持：

- 直接填写 `API Key`
- 直接填写 `Base URL`
- 直接填写模型名
- 在界面里做连通性测试

## 开发说明

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `yarn dev` | 启动本地 API 开发服务 |
| `yarn dev:win` | 启动 Electron 开发模式 |
| `yarn lint` | TypeScript 类型检查 |
| `yarn build` | 构建后端和 Electron 主进程 |
| `yarn dist` | 构建并打包桌面应用 |
| `yarn dist:win` | 打包 Windows 安装包 |
| `yarn dist:mac` | 打包 macOS 安装包 |
| `yarn dist:linux` | 打包 Linux 安装包 |
| `yarn test` | 运行构建后的服务入口 |
| `yarn license` | 重新生成依赖许可证信息 |

### 前端与静态资源关系

当前仓库里同时存在两套前端相关目录：

- `web-src/`：新的前端源码
- `scripts/web/`：程序实际加载的已编译静态资源

开发前端时，一般应修改 `web-src/`；应用运行时实际读取的是 `scripts/web/index.html` 和其资源文件。

### 路由结构

后端已经内置较完整的业务路由，主要包括：

- `project/*`
- `novel/*`
- `outline/*`
- `script/*`
- `assets/*`
- `storyboard/*`
- `video/*`
- `setting/*`
- `other/*`

并兼容两种访问方式：

- `/xxx`
- `/api/xxx`

## 目录结构

```text
GalaxyLoom-app/
├─ docs/                 文档和图片资源
├─ scripts/              构建脚本、Electron 入口、内置前端静态资源
├─ scripts/web/          程序当前实际加载的前端文件
├─ src/                  后端源码
├─ src/routes/           业务 API 路由
├─ src/agents/           AI Agent 相关能力
├─ src/lib/              数据库初始化、响应格式等公共模块
├─ web-src/              新版前端源码
├─ uploads/              服务模式下的上传目录
├─ db.sqlite             SQLite 数据库
├─ electron-builder.yml  桌面打包配置
├─ package.json          项目脚本与依赖
└─ README.md
```

## 部署

如果你要把它部署成服务端进程，可以这样做：

```bash
yarn install
yarn build
node build/app.js
```

或者使用 PM2：

```bash
pm2 start build/app.js --name galaxyloom
```

如需修改端口，可通过环境变量指定：

```bash
PORT=60001 node build/app.js
```

## 当前项目状态说明

这个仓库是基于早期项目持续演化出来的，但从当前代码结构看，已经和最初版本有明显差异：

- 产品流程已经改成 6 阶段创作流水线
- 前端已经内嵌到当前仓库，不再只是外部依赖关系
- 新增了大量与资产、分镜、视频、聊天式改稿相关的接口
- 文档现在以当前仓库实际代码为准，而不是历史宣传内容为准

## License

本项目采用 `AGPL-3.0` 协议，详见 [LICENSE](./LICENSE)。
