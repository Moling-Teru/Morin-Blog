# Markdown 内嵌网易云音乐

在文章或普通页面的 Markdown 正文中写：

```md
!:[wyy_music_id=536622304]
```

把 `536622304` 换成网易云的歌曲 ID，不需要保留花括号。例如歌曲链接
`https://music.163.com/#/song?id=536622304` 中，ID 就是 `536622304`。
推荐独立成段，并在前后留一个空行。同一页面可以放多个播放器；引用和列表也支持。
行内代码、代码块、HTML 的 `<code>` / `<pre>` 和反斜杠转义中的示例不会被转换。

运行 `npm run build` 后，Node.js 插件通过 Hexo 的 `marked:extensions` 识别这段语法，
生成引用本站 `/music-player/index.html?id=...` 的 iframe，同时将播放器 HTML、CSS、JS
输出到 `public/music-player/`。支持 Hexo `root: /blog/` 这样的子目录部署。
本站通过 Vercel Services 同时部署静态博客和音乐 Node.js 服务。
若只上传 `public/` 到纯静态平台，需要另行部署 API 或改用其他 API 地址。

播放器界面参考 [embedded-netease-music-player](https://github.com/dontpanic92/embedded-netease-music-player)，
重新实现并随本站托管；不会加载 GitHub Pages 或远程脚本。
使用浏览器原生音频控件，支持播放、暂停、拖动进度、音量和循环；不自动播放。
“在网易云打开”在手机端使用 `orpheus://song/歌曲ID` 唤起网易云 App，电脑端保留网易云网页链接。
播放器沿用博客提示卡片的圆角、浅色标题栏和左侧强调线，默认淡蓝紫色。
封面加载后在浏览器中提取主色，统一用于强调线、标题栏和歌词；无封面或封面服务器
不允许跨域取色时保留默认配色，仍可正常显示封面和播放。

## 本站配置与限制

本站使用 [api-enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced) 的
npm 包 `@neteasecloudmusicapienhanced/api`，版本固定为 `4.41.1`，通过本站
`/api/netease/` 获取歌名、封面、歌词和音频 URL。不再调用原播放器作者的 API。

同一仓库通过 npm workspace 管理博客与 `services/netease-api` 的依赖，
同一 Vercel 项目通过 Services 部署两个服务：

- `app`：Hexo 静态博客，包含 `/music-player/` 的 HTML、CSS、JS。
- `music`：Node.js 24 音乐服务。

`vercel.json` 先将 `/api/netease/*` 路由到 `music`，其余请求路由到 `app`。
Services 保留完整请求路径，后端已处理 `/api/netease/` 前缀。
两个服务共享项目和域名，因此浏览器调用 API 无需跨域配置。
音频从网易云返回的 CDN 地址直接播放，不通过博客函数转发。

服务提供以下只读接口：

| 路径 | 参数 | 返回内容 |
| --- | --- | --- |
| `/api/netease/song/detail` | `ids=歌曲ID` | 歌名、歌手、封面 |
| `/api/netease/song/url` | `id=歌曲ID` | 音频 URL、试听信息 |
| `/api/netease/lyric` | `id=歌曲ID` | LRC 歌词 |
| `/api/netease/health` | 无 | `{"ok":true}`，无需请求上游 |

构建只生成静态播放器文件，不调用音乐 API；访客打开播放器时才请求音乐数据。
SDK 按需加载。函数最多运行 30 秒；上游请求超时为 10 秒，总处理期限为 20 秒。
播放器对同域 API 的请求超时为 25 秒，为首次启动留出时间；第三方 API 为 8 秒。
详情、歌词和音频地址分别设置短期 CDN 缓存，错误响应不缓存。
可以替换 API 地址，也可以删除 `netease_music` 配置，仅使用网易云直接外链。

实测示例歌曲 `536622304` 是会员歌曲，api-enhanced SDK 返回约 30 秒试听。
界面会标明试听状态；完整歌曲是否可播放取决于音源权限。

不配置 API 时，通过网易云的 HTTPS 外链
`https://music.163.com/song/media/outer/url?id=歌曲ID.mp3` 加载音频，
显示歌曲 ID，并提供“在网易云打开”的链接。
构建过程不请求网易云，因此离线构建也可完成。

播放器界面完全静态，但音频仍需访问网易云。会员、版权、地区限制或被下架的歌曲
可能无法播放；失败时显示提示和网易云链接。静态站点无法解除这些限制。
直接外链不能提供歌名、封面和歌词。当前验证环境访问直接外链会跳转网易云 404，
不能保证该方式在所有网络或所有歌曲上有效；因此本站启用了上述同项目 API。

## Vercel Hobby 支持

截至 2026-10-11，[Services 官方文档](https://vercel.com/docs/services) 确认所有套餐可用，
目前为 Beta；[Services 计算资源](https://vercel.com/docs/services/pricing) 按 Functions 计量。
[Hobby 套餐](https://vercel.com/docs/plans/hobby) 包含每月 100 万次函数调用、4 CPU 小时、
360 GB 小时内存额度，限个人、非商业用途。
[Hobby 函数限制](https://vercel.com/docs/functions/limitations) 在 Fluid Compute 下为最多
300 秒、2 GB 内存，Node.js 函数未压缩大小上限为 250 MB。

本项目无需升级 Pro，也无需建立第二个 Vercel 项目。免费额度有上限，
音乐 API 与项目其他函数共享套餐额度；音频直接来自音乐 CDN，不占用函数音频转发流量。

## 更换音乐 API

在站点根目录 `_config.yml` 修改：

```yml
netease_music:
  api: /api/netease/
  # 可选，沿用最初播放器参考项目的值；按部署环境调整或删除。
  real_ip: 116.25.146.177
```

也可以填其他 HTTPS 服务地址，例如 `https://your-music-api.example.com/`。
第三方服务需兼容以下接口，并允许本站跨域访问：

- `GET song/detail?ids=...`：`songs[0]`，包含 `name`、`ar`、`al.picUrl`。
- `GET song/url?id=...`：`data[0].url`，可播放的音频地址；配置 `real_ip` 时附带 `realIP` 参数。
- `GET lyric?id=...`：`lrc.lyric`，LRC 格式歌词。

配置后重新构建。访客加载播放器时才查询 API，构建无需联网。
API 地址会出现在网页中，请填写公开的服务地址。HTTPS 站点使用 HTTPS API。
API 异常时仍保留网易云直接外链，可以尝试播放；该外链本身也可能不可用。
缺少歌词或封面不会影响已获取到的音频。
本站 API 与博客一起部署；使用其他 API 时，该服务需要另行部署。
`real_ip` 统一传给详情、音频和歌词请求，用于指定网易云上游请求的客户端 IP，
不是读取访客 IP。
可在 Vercel 环境变量里设置 `NETEASE_REAL_IP`，它优先于请求参数；
设置后可以删除站点配置中的 `real_ip`。

## 本地验证

使用 Node.js 24，在仓库根目录执行：

```sh
npm ci
npm test
npm run build
npm start
```

`npm ci` 自动安装博客和音乐 API workspace 的依赖。
`npm start` 默认启动 `http://localhost:4000/`，Hexo 开发中间件同时提供同域 API。
访问 `http://localhost:4000/api/netease/health` 可以检查 API 是否挂载。
单独调试后端可执行 `npm start --workspace services/netease-api`，默认端口 3001，
可通过 `PORT` 环境变量修改。

部署到现有 Vercel 项目时，保留根目录 `vercel.json`，平台会同时构建两个服务。

测试覆盖 Markdown 渲染、代码与转义保护、子目录部署、多播放器、静态资源生成，
以及 API 路由、参数检查、缓存、超时、播放错误、试听提示和歌词同步。
