# Grayhaven 远程静态站点

访问地址：[Grayhaven · 灰港镇](https://grayhaven-coastal-sandbox.ocisly14.chatgpt.site)。2026-09-06 已发布版本 22：24 小时动态光照时间轴，支持分钟级拖动与播放/暂停（4 分钟一日，默认 15:00）。连续太阳方向、阴影、天空、水面、雾色和室内窗侧光；灯塔、门廊和港灯在暮色中渐亮。直射及阴影按 80 ms、间接光按 500 ms 分频更新，拖动停止后补齐最终状态。源版本 `379a4f36084a9bfbde10c2860dfcef1a3ce5538e`，私有部署成功；独立副本 `/private/tmp/grayhaven-daylight-timeline-site`。64 项自动测试、定向类型检查与独立构建通过；未做浏览器视觉与实际设备性能验收。

### 建筑顶标更新

2026-09-06 已发布版本 21：主街六栋建筑在放大后显示屋顶名称，位置按实际屋顶轮廓投影；蓝鸟室内展开和楼层切换时保留顶标。保留版本 20 的室内与所有户外效果。源版本 `89d09b073fdb635b0de743bfb8208f11048597c4`，私有部署成功；独立副本 `/private/tmp/grayhaven-building-labels-site`。定向类型检查与完整导出构建通过，未做浏览器视觉验收。

### 上一版室内样板

2026-09-06 已发布版本 20：蓝鸟餐馆原地剖视样板，包含一层堂座/后厨与二层住处、40 个原模组物件锚点、按需加载、缩放滞回、房间/楼层导航和返回街景。室内独立填光，物理门窗与楼梯开口参与遮光，室内雾透明度上限 0.1；保留版本 19 海滩及户外效果。源版本 `cbc01410b4752fdcbbb5cdd9357055238773e4ea`，私有部署成功；独立副本位于 `/private/tmp/grayhaven-bluebird-cutaway-site`。59 项自动测试、定向类型检查与完整导出构建通过，原生 GPU 验证室内雾合成，尚未做浏览器视觉或真实设备性能验收。

此目录保存 Grayhaven 独立站点的托管配置。访问权限为站点所有者本人，远程设备需要登录同一账号。后续更新复用 `.openai/hosting.json` 中的站点，不重新创建。

## 更新准备

在应用仓库根目录运行：

```sh
node scripts/export-grayhaven-site.mjs /private/tmp/grayhaven-coastal-site
pnpm --dir client exec vite build /private/tmp/grayhaven-coastal-site --config /private/tmp/grayhaven-coastal-site/vite.config.mjs
```

导出器只复制 Grayhaven 的界面、三维地图、户外与蓝鸟餐馆室内模组数据和绘画素材，生成一个独立的 React / Vite 入口。站点根路径直接显示沙盘，也兼容原有 `/sandbox/grayhaven` 路径。无需后端或环境变量。

临时目录是独立的站点源码仓库，不提交父项目的其他改动。按 Sites hosting 技能将构建所对应的源码推送至现有站点，使用打包助手打包 `dist`，保存新版本并私有发布。临时目录如已清理，可重新导出并向同一站点申请新的源码写入凭据。凭据不保存在文件中。

导出器在本机通过忽略的 `node_modules` 符号链接复用应用依赖，所以使用上面的客户端 Vite 命令构建。托管源码可独立安装依赖后运行 `npm run build`。
