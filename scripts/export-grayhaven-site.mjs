import { cp, mkdir, readFile, writeFile, symlink, lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.resolve(process.argv[2] ?? "/private/tmp/grayhaven-coastal-site");
if (destination === repo || repo.startsWith(destination + path.sep) || destination.startsWith(repo + path.sep)) {
  throw new Error("Export the standalone Site to a separate directory outside the application checkout.");
}
const configPath = path.join(repo, "deployment/grayhaven-site/.openai/hosting.json");
const config = await readFile(configPath, "utf8");
const previous = await readFile(path.join(destination, ".openai/hosting.json"), "utf8").catch(error => {
  if (error.code !== "ENOENT") throw error;
  return null;
});
if (previous && JSON.parse(previous).project_id !== JSON.parse(config).project_id) throw new Error("Destination belongs to another Site.");
await mkdir(path.join(destination, "src/grayhaven/assets"), { recursive: true });
await mkdir(path.join(destination, ".openai"), { recursive: true });
await writeFile(path.join(destination, ".openai/hosting.json"), config);
const source = path.join(repo, "client/src/observer/grayhaven");
for (const filename of ["GrayhavenSandboxPage.tsx", "GrayhavenWorld.ts", "painterlyArt.ts", "architectureMaterials.ts", "forestLayout.ts", "lighting.ts", "daylight.ts", "lightingPatch.ts", "globalIllumination.ts", "softShadows.ts", "proceduralSky.ts", "worldLightAtlas.ts", "waterDynamics.ts", "seaMist.ts", "mainStreet.ts", "buildingInteriors.ts", "buildingScenes.generated.json", "bluebirdShell.ts", "bluebirdInterior.ts", "interiorLighting.ts", "beachScene.ts", "beachScene.generated.json", "layout.ts", "grayhaven.css", "grayhaven.generated.json"]) {
  await cp(path.join(source, filename), path.join(destination, "src/grayhaven", filename));
}
for (const filename of ["main-street-materials-v1.png", "coastal-materials-v1.png", "redwood-tapered-v1.png", "sequoia-giants-v1.png", "README.md"]) {
  await cp(path.join(source, "assets", filename), path.join(destination, "src/grayhaven/assets", filename));
}
await writeFile(path.join(destination, "src/main.tsx"), `import React from "react";
import ReactDOM from "react-dom/client";
import GrayhavenSandboxPage from "./grayhaven/GrayhavenSandboxPage";
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><GrayhavenSandboxPage /></React.StrictMode>);
`);
await writeFile(path.join(destination, "index.html"), `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#b3bdb9"><title>Grayhaven · 灰港镇</title><style>body{margin:0}button,input{font:inherit}</style></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
`);
await writeFile(path.join(destination, "vite.config.mjs"), `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], build: { outDir: "dist" } });
`);
const versions = {};
for (const name of ["react", "react-dom", "three", "vite", "@vitejs/plugin-react"]) {
  versions[name] = JSON.parse(await readFile(path.join(repo, "client/node_modules", name, "package.json"), "utf8")).version;
}
await writeFile(path.join(destination, "package.json"), JSON.stringify({
  name: "grayhaven-coastal-site", private: true, version: "1.0.0", type: "module",
  scripts: { dev: "vite --host", build: "vite build", preview: "vite preview --host" },
  dependencies: Object.fromEntries(["react", "react-dom", "three"].map(name => [name, versions[name]])),
  devDependencies: Object.fromEntries(["vite", "@vitejs/plugin-react"].map(name => [name, versions[name]])),
}, null, 2) + "\n");
await writeFile(path.join(destination, ".gitignore"), "node_modules/\ndist/\n.env*\n");
await writeFile(path.join(destination, "README.md"), "# Grayhaven 静态沙盘\n\n独立导出的户外地图与地点手记。安装依赖后运行 npm run build；Sites 发布 dist 静态目录。无需后端或 API 密钥。素材说明见 src/grayhaven/assets/README.md。\n");
if (!await lstat(path.join(destination, "node_modules")).catch(error => {
  if (error.code !== "ENOENT") throw error;
  return null;
})) await symlink(path.join(repo, "client/node_modules"), path.join(destination, "node_modules"), "dir");
console.log(destination);
