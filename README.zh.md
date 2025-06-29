[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md)

# Fantia 下载器说明

[Fantia](https://fantia.jp) 是一个创作者分享付费内容的平台（如图片和视频）。  
本下载器可帮助你从指定的 Post ID 开始，自动下载该 Post 中的全部媒体资源，并根据设定自动前进或后退跳转至其他 Post。

> ⚠️ 本项目设计用于 GUI 图形界面模式（需浏览器登录），依赖 Puppeteer 模拟用户行为。**不支持纯 API 接口方式运行**。

# 环境要求

- 安装 [Node.js](https://nodejs.org) 环境
- 安装 [Yarn](https://classic.yarnpkg.com/en/docs/install/) 包管理器（也可以用 `npm` 替代）

# 使用方法

1. 将 `.env.example` 复制为 `.env`，并填写必要配置项。
2. 运行 `yarn install`（或 `npm install`）安装依赖。
3. 运行 `node index_CN.js` 启动程序。
4. 程序将提示你输入起始的 Post ID，输入后将自动开始下载。

你可以在 URL 中找到 Post ID：  
例如：`https://fantia.jp/posts/123456` → ID = `123456`

程序自动在下载每篇 post 后进行短暂停顿，避免访问频率过高被限制。

# 环境变量说明

## DOWNLOAD_PATH

设置资源保存位置，支持相对路径和绝对路径。  

## SESSION_ID

使用 Puppeteer 登录时不需要配置此项。

## BLOCK_KEYWORDS

不下载 Post 标题中包含 `${BLOCK_KEYWORDS}` 里出现词语的 Post
示例：  
`BLOCK_KEYWORDS=test,draft,noaudio`

## BLOCK_FILENAME_KEYWORDS

跳过文件名中包含关键词的资源文件（如视频或图片）。  
多个关键词用英文逗号分隔。  

## DIRECTION

指定下载顺序：

- `forward` – 下载完成后跳转下一篇（较新）
- `backward` – 下载完成后跳转上一篇（较旧）
- `once` – 仅下载当前指定 Post，完成后退出

## USE_IDM

是否使用 IDM（Internet Download Manager）下载器。  
设置为 `true` 将调用 IDM 执行下载。  

## IDM_PATH

IDM 的完整路径（指向 `IDMan.exe`）。  

# 脚本功能

- 自动跳转 Post（支持 forward/backward/once）
  - `forward`：往同作者【最近】发布帖子的时间下载
  - `backward`：往同作者【最早】发布帖子的时间下载
  - `once`：就下载这个帖子的文件
- 下载进度条及文件大小显示
- 保存每个 Post 的 `post.json` 元数据
- 已存在文件将自动跳过
- 支持基于标题和文件名的关键词过滤
- 支持使用 Puppeteer 打开浏览器登录并保存登录状态
- 下载完成后根据方向继续跳转

# Windows 文件命名非法字符处理

以下字符在 Windows 文件名中不允许，程序会自动将其替换为 `+`：

`/`, `\`, `?`, `%`, `*`, `:`, `|`, `"`, `<`, `>`

# 开源许可

MIT License