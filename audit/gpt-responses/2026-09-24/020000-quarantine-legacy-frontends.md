Beijing time: 2026-09-24 02:00 +08:00
Context: Quarantine legacy Gallery frontends after stale-version share landing

Reply body:

已经按“隔离旧网页”处理了，而且不是只改分享链接。

我现在把旧前端入口明确列为 legacy：

- `zhou526316-sys.github.io/organic-synthesis-gallery/`
- `organic-synthesis-gallery-public.pages.dev`

这两个地址一旦加载新的入口页，会立即把用户重定向到唯一正式前端：

`https://api.gczhouwld.com/`

并且会保留原来的 `?doi=...` 和 hash，所以旧链接仍然能把人送到当前 Gallery 对应文献，但不会继续停留在旧 UI。

同时我已经把新的分享/定位链接改成带当前构建版本参数的形式：

`https://api.gczhouwld.com/?doi=...&sharev=<当前构建>`

这样微信 WebView 或浏览器即使缓存过旧页面，也不会再直接复用之前那份 HTML。微信 JS-SDK 分享卡片也已经改成直接指向这个“当前 Gallery 深链”，不再依赖旧分享页再跳一次。

对应改动：
- `75c97d6868b3dfe07deb7ca1f025da6182a08486`：分享链接绑定当前构建，处理旧缓存
- `d80495b23c8c4c4fa7fcc4eea97edc1880716594`：旧 GitHub Pages / Cloudflare Pages 前端强制隔离到正式域名

当前正式 Worker 前端部署正在跑；此前包含版本化深链的 Worker 部署已经成功。GitHub Pages 这条旧链本身近期有独立的媒体构建失败，所以我不会把它再当正式前端依赖；它现在的定位就是“旧入口/静态资源备用”，用户入口统一收敛到 `api.gczhouwld.com`。

以后原则就是：**只有 `api.gczhouwld.com` 是正式网页，其他公开前端地址都不再作为用户可停留的 Gallery。**

Related commits:
- 75c97d6868b3dfe07deb7ca1f025da6182a08486
- d80495b23c8c4c4fa7fcc4eea97edc1880716594
- d80495b23c8c4c4fa7fcc4eea97edc1880716594
