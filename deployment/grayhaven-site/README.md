# Grayhaven 远程静态站点

访问地址：[Grayhaven · 灰港镇](https://grayhaven-coastal-sandbox.ocisly14.chatgpt.site)。2026-09-06 已发布版本 6：多尺度水体起伏、独立浪组、分段破浪与爬滩回退；保留单座出海栈桥、海滩细节、原始主视角、环山沙湾及光照效果。

此目录保存 Grayhaven 独立站点的托管配置。访问权限为站点所有者本人，远程设备需要登录同一账号。后续更新复用 `.openai/hosting.json` 中的站点，不重新创建。

## 更新准备

在应用仓库根目录运行：

```sh
node scripts/export-grayhaven-site.mjs /private/tmp/grayhaven-coastal-site
pnpm --dir client exec vite build /private/tmp/grayhaven-coastal-site --config /private/tmp/grayhaven-coastal-site/vite.config.mjs
```

导出器只复制 Grayhaven 的界面、三维地图、户外模组数据和绘画素材，生成一个独立的 React / Vite 入口。站点根路径直接显示沙盘，也兼容原有 `/sandbox/grayhaven` 路径。无需后端或环境变量。

临时目录是独立的站点源码仓库，不提交父项目的其他改动。按 Sites hosting 技能将构建所对应的源码推送至现有站点，使用打包助手打包 `dist`，保存新版本并私有发布。临时目录如已清理，可重新导出并向同一站点申请新的源码写入凭据。凭据不保存在文件中。

导出器在本机通过忽略的 `node_modules` 符号链接复用应用依赖，所以使用上面的客户端 Vite 命令构建。托管源码可独立安装依赖后运行 `npm run build`。
