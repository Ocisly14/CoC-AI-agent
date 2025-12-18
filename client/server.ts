import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID, createHash } from "crypto";
import cors from "cors";
import express from "express";
import { CoCDatabase, seedDatabase } from "../src/coc_multiagents_system/agents/memory/database/index.js";
import { NPCLoader } from "../src/coc_multiagents_system/agents/character/npcloader/index.js";
import { ModuleLoader } from "../src/coc_multiagents_system/agents/memory/moduleloader/index.js";
import { ScenarioLoader } from "../src/coc_multiagents_system/agents/memory/scenarioloader/index.js";
import { createBgeSqliteRagManager, RagManager } from "../src/coc_multiagents_system/agents/memory/RagManager.js";
import { buildGraph, type GraphState } from "../src/graph.js";
import { initialGameState, type GameState } from "../src/state.js";
import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { TurnManager } from "../src/coc_multiagents_system/agents/memory/index.js";
import { saveManualCheckpoint, loadCheckpoint, listAvailableCheckpoints } from "../src/coc_multiagents_system/agents/memory/memoryAgent.js";
import { generateRandomAttributes } from "../src/coc_multiagents_system/agents/character/characterBuilder.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy-loaded components (initialized only when needed)
let db: CoCDatabase | null = null;
let graph: any = null;
let ragManager: RagManager | null = null;
let turnManager: TurnManager | null = null;

// **PERSISTENT GAME STATE** - will be initialized when user starts the game
let persistentGameState: GameState | null = null;

console.log("✅ Frontend server ready (nothing initialized yet)");

/**
 * Get client IP address from request
 */
function getClientIp(req: express.Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = forwarded
    ? (typeof forwarded === "string" ? forwarded.split(",")[0] : forwarded[0])
    : req.socket.remoteAddress || req.ip || "127.0.0.1";
  return ip.trim();
}

/**
 * Generate sessionId based on client IP address
 */
function generateSessionIdFromIp(ip: string): string {
  // Create a hash of the IP address for consistent sessionId per IP
  const hash = createHash("sha256").update(ip).digest("hex").slice(0, 16);
  return `session-ip-${hash}`;
}

/**
 * 标准化名称（用于模糊匹配）
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
    .trim();
}

/**
 * 计算两个字符串的Levenshtein距离（编辑距离）
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/**
 * 判断两个名称是否相似（相似度 >= 80%）
 */
function isNameSimilar(name1: string, name2: string): boolean {
  const na = normalizeName(name1);
  const nb = normalizeName(name2);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // 如果首词相同，认为相似
  const tokensA = na.split(/\s+/);
  const tokensB = nb.split(/\s+/);
  if (tokensA[0] && tokensA[0] === tokensB[0]) return true;

  // 计算Levenshtein距离并转换为相似度
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return false;
  const similarity = 1 - dist / maxLen;
  return similarity >= 0.8; // 80%相似度阈值
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend build (client/dist) if present
const distDir = path.join(__dirname, "dist");
const staticDir = fs.existsSync(path.join(distDir, "index.html")) ? distDir : __dirname;
app.use(express.static(staticDir));

// SPA fallback
app.get("/", (_req, res) => {
  const indexPath = path.join(staticDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res
      .status(500)
      .send("Frontend not built. Run `pnpm --filter coc-investigator-sheet build` inside client/ to generate dist/.");
  }
});

// API endpoint to get all available occupations
app.get("/api/occupations", (req, res) => {
  try {
    const occupationsFile = path.join(process.cwd(), "src", "coc_multiagents_system", "agents", "character", "Character occupation.json");

    if (!fs.existsSync(occupationsFile)) {
      return res.status(404).json({ error: "Occupations file not found" });
    }

    const occupationsData = JSON.parse(fs.readFileSync(occupationsFile, "utf-8"));

    res.json({
      success: true,
      occupations: occupationsData,
    });
  } catch (error) {
    console.error("Error fetching occupations:", error);
    res.status(500).json({ error: "Failed to fetch occupations: " + (error as Error).message });
  }
});

// API endpoint to get all available mods
app.get("/api/mods", (req, res) => {
  try {
    const modsDir = path.join(process.cwd(), "data", "Mods");
    if (!fs.existsSync(modsDir)) {
      return res.json({ success: true, mods: [] });
    }

    const dirs = fs.readdirSync(modsDir, { withFileTypes: true });
    const mods = dirs
      .filter(dirent => dirent.isDirectory())
      .map(dirent => ({
        name: dirent.name,
        path: path.join(modsDir, dirent.name),
      }));

    res.json({
      success: true,
      mods: mods,
    });
  } catch (error) {
    console.error("Error fetching mods:", error);
    res.status(500).json({ error: "Failed to fetch mods: " + (error as Error).message });
  }
});

// API endpoint to import game data (scenarios, NPCs, and modules)
app.post("/api/game/import-data", async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Starting data import...`);

    // Initialize database if not already initialized
    if (!db) {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      db = new CoCDatabase();
      seedDatabase(db);
      console.log("Database initialized");
    }

    // Helper function to find Cassandra mod directory (handles different quote characters)
    const findCassandraModDir = (): string | null => {
      const modsDir = path.join(process.cwd(), "data", "Mods");
      if (!fs.existsSync(modsDir)) {
        return null;
      }
      const dirs = fs.readdirSync(modsDir);
      const cassandraDir = dirs.find(d => d.includes("Cassandra") && d.includes("Black Carnival"));
      return cassandraDir ? path.join(modsDir, cassandraDir) : null;
    };

    const cassandraModDir = findCassandraModDir();

    // Load scenarios from JSON files
    const scenarioLoader = new ScenarioLoader(db);
    let scenariosLoaded = 0;
    if (cassandraModDir) {
      const cassandraScenariosDir = path.join(cassandraModDir, "Cassandra's_Scenarios");
      if (fs.existsSync(cassandraScenariosDir)) {
        const scenarios = await scenarioLoader.loadScenariosFromJSONDirectory(cassandraScenariosDir);
        scenariosLoaded = scenarios.length;
        console.log(`Loaded ${scenariosLoaded} scenarios`);
      } else {
        console.log("Cassandra's_Scenarios directory not found, skipping scenario import");
      }
    } else {
      console.log("Cassandra mod directory not found, skipping scenario import");
    }

    // Load NPCs from JSON files
    const npcLoader = new NPCLoader(db);
    let npcsLoaded = 0;
    if (cassandraModDir) {
      const cassandraNPCsDir = path.join(cassandraModDir, "Cassandra's_npc");
      if (fs.existsSync(cassandraNPCsDir)) {
        const npcs = await npcLoader.loadNPCsFromJSONDirectory(cassandraNPCsDir);
        npcsLoaded = npcs.length;
        console.log(`Loaded ${npcsLoaded} NPCs`);
      } else {
        console.log("Cassandra's_npc directory not found, skipping NPC import");
      }
    } else {
      console.log("Cassandra mod directory not found, skipping NPC import");
    }

    // Load modules from JSON files (skip document parsing if JSON exists)
    const moduleLoader = new ModuleLoader(db);
    let modulesLoaded = 0;
    if (cassandraModDir) {
      const moduleDir = path.join(cassandraModDir, "background");
      if (fs.existsSync(moduleDir)) {
        // Try JSON first, fallback to document parsing
        const jsonFiles = fs.readdirSync(moduleDir).filter(f => f.toLowerCase().endsWith('.json'));
        if (jsonFiles.length > 0) {
          const modules = await moduleLoader.loadModulesFromJSONDirectory(moduleDir);
          modulesLoaded = modules.length;
          console.log(`Loaded ${modulesLoaded} modules from JSON files`);
        } else {
          const modules = await moduleLoader.loadModulesFromDirectory(moduleDir);
          modulesLoaded = modules.length;
          console.log(`Loaded ${modulesLoaded} modules from documents`);
        }
      } else {
        console.log("Module directory not found, skipping module import");
      }
    } else {
      console.log("Cassandra mod directory not found, skipping module import");
    }

    res.json({
      success: true,
      message: `数据导入完成：${scenariosLoaded} 个场景，${npcsLoaded} 个NPC，${modulesLoaded} 个模块`,
      scenariosLoaded,
      npcsLoaded,
      modulesLoaded,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error importing data:", error);
    res.status(500).json({ error: "Failed to import data: " + (error as Error).message });
  }
});

// Helper function to send SSE progress update (only if SSE is enabled)
function sendProgress(res: express.Response, useSSE: boolean, stage: string, progress: number, message: string) {
  if (useSSE) {
    res.write(`data: ${JSON.stringify({ stage, progress, message })}\n\n`);
  }
}

// API endpoint to load mod data with SSE progress reporting
app.post("/api/mod/load", async (req, res) => {
  // Check if client wants SSE streaming (via Accept header or query param)
  const useSSE = req.headers.accept?.includes('text/event-stream') || req.query.stream === 'true';
  
  if (useSSE) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx
  }

  try {
    const { modName } = req.body;

    if (!modName || typeof modName !== 'string') {
      if (useSSE) {
        sendProgress(res, useSSE, "错误", 0, "modName 参数必需");
        res.end();
      } else {
        return res.status(400).json({ error: "modName is required" });
      }
      return;
    }

    console.log(`[${new Date().toISOString()}] Loading mod data: ${modName}`);

    sendProgress(res, useSSE, "初始化", 5, "正在初始化数据库...");

    // Initialize database if not already initialized
    if (!db) {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      db = new CoCDatabase();
      seedDatabase(db);
      console.log("Database initialized");
    }

    sendProgress(res, useSSE, "初始化", 10, "正在初始化加载器...");

    const scenarioLoader = new ScenarioLoader(db);
    const npcLoader = new NPCLoader(db);
    const moduleLoader = new ModuleLoader(db);

    const modsDir = path.join(process.cwd(), "data", "Mods");
    if (!fs.existsSync(modsDir)) {
      const error = "Mods directory does not exist";
      if (useSSE) {
        sendProgress(res, useSSE, "错误", 0, error);
        res.end();
      } else {
        return res.status(404).json({ error });
      }
      return;
    }

    const dirs = fs.readdirSync(modsDir);
    const modDir = dirs.find(d => d === modName);
    if (!modDir) {
      const error = `Mod "${modName}" not found`;
      if (useSSE) {
        sendProgress(res, useSSE, "错误", 0, error);
        res.end();
      } else {
        return res.status(404).json({ error });
      }
      return;
    }

    const modPath = path.join(modsDir, modDir);

    sendProgress(res, useSSE, "扫描", 15, "正在扫描模组文件夹...");

    // Scan subdirectories and match by name patterns
    const subdirs = fs.readdirSync(modPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    console.log(`📂 扫描模组子文件夹: ${subdirs.join(", ")}`);

      // Find directories by name patterns (case-insensitive)
      const scenarioDirs = subdirs.filter(name => 
        name.toLowerCase().includes("scenario")
      );
      const npcDirs = subdirs.filter(name => 
        name.toLowerCase().includes("npc")
      );
      const backgroundDirs = subdirs.filter(name => 
        name.toLowerCase().includes("background") ||
        name.toLowerCase().includes("module") ||
        name.toLowerCase().includes("briefing")
      );
      const knowledgeDirs = subdirs.filter(name => 
        name.toLowerCase() === "knowledge"
      );

    let scenariosLoaded = 0;
    let npcsLoaded = 0;
    let modulesLoaded = 0;

    const totalSteps = (scenarioDirs.length > 0 ? 1 : 0) + 
                       (npcDirs.length > 0 ? 1 : 0) + 
                       (backgroundDirs.length > 0 ? 1 : 0) + 
                       (knowledgeDirs.length > 0 ? 1 : 0);
    let currentStep = 0;

    // Load scenarios
    if (scenarioDirs.length > 0) {
      currentStep++;
      const stepProgress = 15 + (currentStep / (totalSteps + 1)) * 65;
      sendProgress(res, useSSE, "加载场景", stepProgress, "正在加载场景数据...");
      console.log(`\n📋 [1/${totalSteps}] 加载场景数据...`);
      for (const scenarioDirName of scenarioDirs) {
        const scenariosDir = path.join(modPath, scenarioDirName);
        console.log(`   → 从文件夹加载场景: ${scenarioDirName}`);
        try {
          const scenarios = await scenarioLoader.loadScenariosFromJSONDirectory(scenariosDir, false); // false = don't force reload
          scenariosLoaded += scenarios.length;
          console.log(`   ✓ 已加载 ${scenarios.length} 个场景`);
          sendProgress(res, useSSE, "加载场景", stepProgress, `已加载 ${scenariosLoaded} 个场景`);
        } catch (error) {
          console.error(`   ✗ 加载场景失败 ${scenarioDirName}:`, error);
        }
      }
    } else {
      console.log(`\n📋 [1/${totalSteps}] 未找到场景文件夹（包含"scenario"的文件夹）`);
    }

    // Load NPCs
    if (npcDirs.length > 0) {
      currentStep++;
      const stepProgress = 15 + (currentStep / (totalSteps + 1)) * 65;
      sendProgress(res, useSSE, "加载NPC", stepProgress, "正在加载NPC数据...");
      console.log(`\n👥 [2/${totalSteps}] 加载NPC数据...`);
      for (const npcDirName of npcDirs) {
        const npcsDir = path.join(modPath, npcDirName);
        console.log(`   → 从文件夹加载NPC: ${npcDirName}`);
        try {
          const npcs = await npcLoader.loadNPCsFromJSONDirectory(npcsDir, false); // false = don't force reload
          npcsLoaded += npcs.length;
          console.log(`   ✓ 已加载 ${npcs.length} 个NPC`);
          sendProgress(res, useSSE, "加载NPC", stepProgress, `已加载 ${npcsLoaded} 个NPC`);
        } catch (error) {
          console.error(`   ✗ 加载NPC失败 ${npcDirName}:`, error);
        }
      }
    } else {
      console.log(`\n👥 [2/${totalSteps}] 未找到NPC文件夹（包含"npc"的文件夹）`);
    }

      // Load modules/background
      if (backgroundDirs.length > 0) {
        currentStep++;
        const stepProgress = 15 + (currentStep / (totalSteps + 1)) * 65;
        sendProgress(res, useSSE, "加载模块", stepProgress, "正在加载模块数据...");
        console.log(`\n📚 [3/${totalSteps}] 加载模块数据...`);
        for (const backgroundDirName of backgroundDirs) {
          const moduleDir = path.join(modPath, backgroundDirName);
          console.log(`   → 从文件夹加载模块: ${backgroundDirName}`);
          try {
            const jsonFiles = fs.readdirSync(moduleDir).filter(f => f.toLowerCase().endsWith('.json'));
            let modules: any[] = [];
            if (jsonFiles.length > 0) {
              modules = await moduleLoader.loadModulesFromJSONDirectory(moduleDir, false); // false = don't force reload
            } else {
              modules = await moduleLoader.loadModulesFromDirectory(moduleDir, false); // false = don't force reload
            }
          modulesLoaded += modules.length;
          console.log(`   ✓ 已加载 ${modules.length} 个模块`);
          sendProgress(res, useSSE, "加载模块", stepProgress, `已加载 ${modulesLoaded} 个模块`);
        } catch (error) {
          console.error(`   ✗ 加载模块失败 ${backgroundDirName}:`, error);
        }
      }
    } else {
      console.log(`\n📚 [3/${totalSteps}] 未找到模块文件夹（包含"background"或"module"的文件夹）`);
    }

      // RAG 知识库由 RagManager 构建，不再处理 legacy knowledge 目录

    console.log(`\n${"=".repeat(60)}`);
    console.log(`✅ 模组数据加载完成！`);
    console.log(`   - 场景: ${scenariosLoaded}`);
    console.log(`   - NPC: ${npcsLoaded}`);
    console.log(`   - 模块: ${modulesLoaded}`);
    console.log(`   - RAG知识库: ${knowledgeDirs.length > 0 ? "已处理" : "未找到"}`);
    console.log(`${"=".repeat(60)}\n`);

    const result = {
      success: true,
      message: `模组数据加载完成：${scenariosLoaded} 个场景，${npcsLoaded} 个NPC，${modulesLoaded} 个模块`,
      scenariosLoaded,
      npcsLoaded,
      modulesLoaded,
      timestamp: new Date().toISOString(),
    };

    if (useSSE) {
      sendProgress(res, useSSE, "完成", 100, `已加载 ${scenariosLoaded} 个场景，${npcsLoaded} 个NPC，${modulesLoaded} 个模块`);
      res.write(`data: ${JSON.stringify({ ...result, stage: "完成", progress: 100 })}\n\n`);
      res.end();
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error("Error loading mod data:", error);
    const errorMessage = "Failed to load mod data: " + (error as Error).message;
    if (useSSE) {
      sendProgress(res, useSSE, "错误", 0, errorMessage);
      res.end();
    } else {
      res.status(500).json({ error: errorMessage });
    }
  }
});

// API endpoint to get module introduction (without starting game)
app.get("/api/module/introduction", async (req, res) => {
  try {
    const { modName } = req.query;

    if (!modName || typeof modName !== 'string') {
      return res.status(400).json({ error: "modName is required" });
    }

    console.log(`[${new Date().toISOString()}] Getting module introduction for: ${modName}`);

    // Initialize database if not already initialized
    if (!db) {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      db = new CoCDatabase();
      seedDatabase(db);
      console.log("Database initialized");
    }

    // Load module data
    const moduleLoader = new ModuleLoader(db);

    const modsDir = path.join(process.cwd(), "data", "Mods");
    if (!fs.existsSync(modsDir)) {
      return res.status(404).json({ error: "Mods directory does not exist" });
    }

    const dirs = fs.readdirSync(modsDir);
    const modDir = dirs.find(d => d === modName);
    if (!modDir) {
      return res.status(404).json({ error: `Mod "${modName}" not found` });
    }

    const modPath = path.join(modsDir, modDir);

    // Scan subdirectories and match by name patterns
    const subdirs = fs.readdirSync(modPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    // Find directories by name patterns (case-insensitive)
    const backgroundDirs = subdirs.filter(name => 
      name.toLowerCase().includes("background") ||
      name.toLowerCase().includes("module") ||
      name.toLowerCase().includes("briefing")
    );

    if (backgroundDirs.length > 0) {
      const backgroundPath = path.join(modPath, backgroundDirs[0]);
      console.log(`📚 Loading module from: ${backgroundPath}`);
      await moduleLoader.loadModulesFromDirectory(backgroundPath);
    }

    // Get module and generate introduction
    const modules = moduleLoader.getAllModules();
    if (modules.length === 0) {
      return res.status(404).json({ error: "No module data found" });
    }

    const module = modules[0];
    console.log(`   → 使用模组: ${module.title}`);

    // Get introduction from module (generated automatically during load)
    const moduleIntroduction: { introduction: string; characterGuidance: string } | null = 
      module.introduction && module.characterGuidance
        ? {
            introduction: module.introduction,
            characterGuidance: module.characterGuidance,
          }
        : {
            // Fallback if not generated yet
            introduction: module.storyHook || module.background || `Welcome to ${module.title}.`,
            characterGuidance: module.moduleNotes || "Create an investigator appropriate for this module.",
          };

    res.json({
      success: true,
      moduleIntroduction: moduleIntroduction,
      moduleTitle: module.title,
    });
  } catch (error) {
    console.error("Error getting module introduction:", error);
    res.status(500).json({ error: "Failed to get module introduction: " + (error as Error).message });
  }
});

// API endpoint to start/initialize the game
app.post("/api/game/start", async (req, res) => {
  try {
    const { characterId, modName } = req.body;

    console.log(`[${new Date().toISOString()}] Initializing multi-agent system...`);

    // Initialize database if not already initialized
    if (!db) {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      db = new CoCDatabase();
      seedDatabase(db);
      console.log("Database initialized");
    }

    // Load mod data if modName is provided
    let scenarioLoader: ScenarioLoader;
    let npcLoader: NPCLoader;
    let moduleLoader: ModuleLoader;

    if (modName) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🎮 开始加载模组: ${modName}`);
      console.log(`${"=".repeat(60)}\n`);
      
      scenarioLoader = new ScenarioLoader(db);
      npcLoader = new NPCLoader(db);
      moduleLoader = new ModuleLoader(db);

      const modsDir = path.join(process.cwd(), "data", "Mods");
      if (!fs.existsSync(modsDir)) {
        throw new Error("Mods directory does not exist");
      }

      const dirs = fs.readdirSync(modsDir);
      const modDir = dirs.find(d => d === modName);
      if (!modDir) {
        throw new Error(`Mod "${modName}" not found`);
      }

      const modPath = path.join(modsDir, modDir);

      // Scan subdirectories and match by name patterns
      const subdirs = fs.readdirSync(modPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      console.log(`📂 扫描模组子文件夹: ${subdirs.join(", ")}`);

      // Find directories by name patterns (case-insensitive)
      const scenarioDirs = subdirs.filter(name => 
        name.toLowerCase().includes("scenario")
      );
      const npcDirs = subdirs.filter(name => 
        name.toLowerCase().includes("npc")
      );
      const backgroundDirs = subdirs.filter(name => 
        name.toLowerCase().includes("background") || 
        name.toLowerCase().includes("module")
      );

      // Load scenarios (loader will check for changes and skip if already loaded)
      if (scenarioDirs.length > 0) {
        console.log(`\n📋 [1/3] 检查场景数据...`);
        for (const scenarioDirName of scenarioDirs) {
          const scenariosDir = path.join(modPath, scenarioDirName);
          console.log(`   → 检查场景文件夹: ${scenarioDirName}`);
          try {
            await scenarioLoader.loadScenariosFromJSONDirectory(scenariosDir, false); // false = don't force reload
          } catch (error) {
            console.error(`   ✗ 加载场景失败 ${scenarioDirName}:`, error);
          }
        }
      } else {
        console.log(`\n📋 [1/3] 未找到场景文件夹（包含"scenario"的文件夹）`);
      }

      // Load NPCs (loader will check for changes and skip if already loaded)
      if (npcDirs.length > 0) {
        console.log(`\n👥 [2/3] 检查NPC数据...`);
        for (const npcDirName of npcDirs) {
          const npcsDir = path.join(modPath, npcDirName);
          console.log(`   → 检查NPC文件夹: ${npcDirName}`);
          try {
            await npcLoader.loadNPCsFromJSONDirectory(npcsDir, false); // false = don't force reload
          } catch (error) {
            console.error(`   ✗ 加载NPC失败 ${npcDirName}:`, error);
          }
        }
      } else {
        console.log(`\n👥 [2/3] 未找到NPC文件夹（包含"npc"的文件夹）`);
      }

      // Load modules/background (loader will check for changes and skip if already loaded)
      if (backgroundDirs.length > 0) {
        console.log(`\n📚 [3/3] 检查模块数据...`);
        for (const backgroundDirName of backgroundDirs) {
          const moduleDir = path.join(modPath, backgroundDirName);
          console.log(`   → 检查模块文件夹: ${backgroundDirName}`);
          try {
            const jsonFiles = fs.readdirSync(moduleDir).filter(f => f.toLowerCase().endsWith('.json'));
            if (jsonFiles.length > 0) {
              await moduleLoader.loadModulesFromJSONDirectory(moduleDir, false); // false = don't force reload
            } else {
              await moduleLoader.loadModulesFromDirectory(moduleDir, false); // false = don't force reload
            }
          } catch (error) {
            console.error(`   ✗ 加载模块失败 ${backgroundDirName}:`, error);
          }
        }
      } else {
        console.log(`\n📚 [3/3] 未找到模块文件夹（包含"background"或"module"的文件夹）`);
      }

      console.log(`\n${"=".repeat(60)}`);
      console.log(`✅ 模组数据加载完成！`);
      console.log(`${"=".repeat(60)}\n`);
    } else {
      // Fallback: use existing loaders (for backward compatibility)
      scenarioLoader = new ScenarioLoader(db);
      npcLoader = new NPCLoader(db);
      moduleLoader = new ModuleLoader(db);
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`✅ 游戏数据加载完成！`);
    console.log(`${"=".repeat(60)}\n`);

    // Lazy-load multi-agent system components (only when game starts)
    if (!graph || !ragManager) {
      console.log(`[${new Date().toISOString()}] Initializing multi-agent system...`);

      // Initialize RAG Manager (using base RAG - checkpoint_id IS NULL)
      ragManager = createBgeSqliteRagManager(db);
      
      // Check if base knowledge base is already built (from previous game session)
      const isBaseKbBuilt = RagManager.isBaseKnowledgeBaseBuilt(db);
      
      if (!isBaseKbBuilt) {
        console.log(`[${new Date().toISOString()}] Base RAG knowledge base not found, building from loaded data...`);
        console.log(`[${new Date().toISOString()}] This will be saved as the base knowledge base for future games.`);
        // Build KB from loaded data only if base doesn't exist
        const scenarioProfiles = scenarioLoader.getAllScenarios();
        const npcProfiles = npcLoader.getAllNPCs();
        await ragManager.buildKnowledgeBase(
          {
            scenarios: scenarioProfiles.map((s: any) => s.snapshot),
            npcs: npcProfiles,
            clues: [],
            rules: [],
            playerInventory: initialGameState.playerCharacter.inventory,
            playerId: initialGameState.playerCharacter.id,
            playerName: initialGameState.playerCharacter.name,
          },
          {
            moduleName: "default-module",
            mode: "keeper",
            enableNodeEmbeddings: true,
            enableKnnEdges: true,
          }
        );
        console.log(`[${new Date().toISOString()}] Base RAG knowledge base built successfully (checkpoint_id IS NULL)`);
        console.log(`[${new Date().toISOString()}] Future games will reuse this base knowledge base.`);
      } else {
        console.log(`[${new Date().toISOString()}] Base RAG knowledge base already exists, reusing it (no rebuild needed)`);
      }

      // Build the multi-agent graph
      graph = buildGraph(db, scenarioLoader, ragManager);
      
      // Initialize TurnManager
      turnManager = new TurnManager(db);

      console.log(`[${new Date().toISOString()}] Multi-agent system loaded successfully`);
    }

    // Check if character exists
    if (characterId) {
      const database = db.getDatabase();
      const character = database.prepare(`
        SELECT character_id, name, attributes, status, skills, inventory, notes
        FROM characters
        WHERE character_id = ? AND is_npc = 0
      `).get(characterId) as {
        character_id: string;
        name: string;
        attributes: string;
        status: string;
        skills: string;
        inventory: string;
        notes: string;
      } | undefined;

      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }

      // Parse character data and create game state with this character
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🎲 初始化游戏状态...`);
      console.log(`${"=".repeat(60)}\n`);

      const parsedAttributes = JSON.parse(character.attributes);
      const parsedStatus = JSON.parse(character.status);
      const parsedSkills = JSON.parse(character.skills);
      const parsedInventory = JSON.parse(character.inventory);

      console.log(`📝 [1/3] 创建基础游戏状态...`);
      // Generate sessionId based on client IP
      const clientIp = getClientIp(req);
      const sessionId = generateSessionIdFromIp(clientIp);
      console.log(`   - 客户端 IP: ${clientIp}`);
      console.log(`   - Session ID: ${sessionId}`);
      
      let gameState: GameState = {
        ...JSON.parse(JSON.stringify(initialGameState)),
        sessionId: sessionId,
        playerCharacter: {
          id: character.character_id,
          name: character.name,
          attributes: parsedAttributes,
          status: parsedStatus,
          skills: parsedSkills,
          inventory: parsedInventory,
          notes: character.notes || "",
          actionLog: [],
        },
      };
      console.log(`   ✓ 基础状态已创建`);
      console.log(`   - 角色: ${character.name}`);
      console.log(`   - 阶段: ${gameState.phase}`);
      console.log(`   - 游戏时间: 第${gameState.gameDay}天 ${gameState.timeOfDay}`);

      // Load module data and set keeper guidance and initial scenario
      console.log(`\n📚 [2/3] 加载模组配置到游戏状态...`);
      const modules = moduleLoader.getAllModules();
      let moduleIntroduction: { introduction: string; characterGuidance: string } | null = null;
      
      if (modules.length > 0) {
        const module = modules[0]; // Use the first/latest module
        console.log(`   → 使用模组: ${module.title}`);
        
        // Get introduction from module (generated automatically during load)
        if (module.introduction && module.characterGuidance) {
          moduleIntroduction = {
            introduction: module.introduction,
            characterGuidance: module.characterGuidance,
          };
          console.log(`   ✓ 导入叙事已加载 (介绍: ${moduleIntroduction.introduction.length} 字符, 角色指导: ${moduleIntroduction.characterGuidance.length} 字符)`);
        } else {
          // Fallback if not generated yet
          moduleIntroduction = {
            introduction: module.storyHook || module.background || `Welcome to ${module.title}.`,
            characterGuidance: module.moduleNotes || "Create an investigator appropriate for this module.",
          };
          console.log(`   ⚠️  使用备用导入叙事`);
        }
        
        // Set keeper guidance
        if (module.keeperGuidance) {
          gameState.keeperGuidance = module.keeperGuidance;
          console.log(`   ✓ 已设置守秘人指导 (长度: ${module.keeperGuidance.length} 字符)`);
        } else {
          console.log(`   ⚠️  模组未提供守秘人指导`);
        }

        // Load initial scenario if specified (with fuzzy matching - returns best match only)
        if (module.initialScenario) {
          console.log(`   → 查找初始场景: "${module.initialScenario}" (模糊匹配)`);
          const searchResult = scenarioLoader.searchScenarios({ name: module.initialScenario });
          if (searchResult.scenarios.length > 0) {
            // Use the best matching scenario (only one returned)
            const initialScenarioProfile = searchResult.scenarios[0];
            gameState.currentScenario = {
              ...initialScenarioProfile.snapshot,
              characters: initialScenarioProfile.snapshot.characters || []
            };
            const scenarioLocation = initialScenarioProfile.snapshot.location;
            console.log(`   ✓ 已匹配并注入初始场景到游戏状态: ${initialScenarioProfile.name}`);
            console.log(`     - 场景ID: ${initialScenarioProfile.snapshot.id}`);
            console.log(`     - 位置: ${scenarioLocation || "未指定"}`);
            console.log(`     - 描述: ${initialScenarioProfile.snapshot.description ? initialScenarioProfile.snapshot.description.substring(0, 100) + "..." : "无"}`);
            console.log(`     - 角色数: ${initialScenarioProfile.snapshot.characters?.length || 0}`);
            console.log(`     - 线索数: ${initialScenarioProfile.snapshot.clues?.length || 0}`);
            console.log(`     - 出口数: ${initialScenarioProfile.snapshot.exits?.length || 0}`);
            console.log(`     - 事件数: ${initialScenarioProfile.snapshot.events?.length || 0}`);

            // Set currentLocation for initial scenario NPCs and add them to gameState
            if (module.initialScenarioNPCs && module.initialScenarioNPCs.length > 0 && scenarioLocation) {
              console.log(`   → 设置初始场景NPC位置并注入到游戏状态 (${module.initialScenarioNPCs.length} 个NPC):`);
              const allNPCs = npcLoader.getAllNPCs();
              const database = db.getDatabase();
              let matchedCount = 0;
              const npcsToAdd: any[] = [];
              
              for (const npcName of module.initialScenarioNPCs) {
                // Find matching NPC by name (使用80%相似度的模糊匹配)
                const matchingNpc = allNPCs.find(npc => {
                  return isNameSimilar(npc.name, npcName);
                });

                if (matchingNpc) {
                  const npcProfile = matchingNpc as any; // NPCProfile
                  const oldLocation = npcProfile.currentLocation || null;
                  npcProfile.currentLocation = scenarioLocation;
                  
                  if (oldLocation !== scenarioLocation) {
                    console.log(`     ✓ ${matchingNpc.name}: ${oldLocation || "Unknown"} → ${scenarioLocation}`);
                    matchedCount++;
                    
                    // Update NPC in database
                    const updateStmt = database.prepare(`
                      UPDATE characters 
                      SET current_location = ? 
                      WHERE character_id = ? AND is_npc = 1
                    `);
                    updateStmt.run(scenarioLocation, matchingNpc.id);
                  } else {
                    console.log(`     - ${matchingNpc.name}: 已在 ${scenarioLocation} (无需更新)`);
                    matchedCount++;
                  }
                  
                  // Add NPC to gameState (create a copy to avoid mutating the original)
                  npcsToAdd.push({
                    ...npcProfile,
                    currentLocation: scenarioLocation
                  });
                } else {
                  console.warn(`     ⚠️  NPC "${npcName}" 未找到，跳过位置设置`);
                }
              }
              
              // Add all matched NPCs to gameState
              if (npcsToAdd.length > 0) {
                gameState.npcCharacters = [...(gameState.npcCharacters || []), ...npcsToAdd];
                console.log(`   ✓ 已将 ${npcsToAdd.length} 个NPC注入到游戏状态`);
                
                // Also add NPCs to currentScenario.characters if scenario is set
                if (gameState.currentScenario) {
                  const scenarioCharacters = gameState.currentScenario.characters || [];
                  const updatedCharacters = [...scenarioCharacters];
                  
                  for (const npc of npcsToAdd) {
                    // Check if NPC already exists in scenario characters
                    const existingIndex = updatedCharacters.findIndex(c => 
                      c.id === npc.id || c.name.toLowerCase() === npc.name.toLowerCase()
                    );
                    
                    if (existingIndex >= 0) {
                      // Update existing character
                      updatedCharacters[existingIndex] = {
                        ...updatedCharacters[existingIndex],
                        location: scenarioLocation,
                        status: updatedCharacters[existingIndex].status || 'present'
                      };
                    } else {
                      // Add new character to scenario
                      updatedCharacters.push({
                        id: npc.id,
                        name: npc.name,
                        role: npc.occupation || 'npc',
                        status: 'present',
                        location: scenarioLocation,
                        notes: npc.background ? npc.background.substring(0, 100) : undefined
                      });
                    }
                  }
                  
                  gameState.currentScenario.characters = updatedCharacters;
                  const originalCount = scenarioCharacters.length;
                  const finalCount = updatedCharacters.length;
                  const addedCount = finalCount - originalCount;
                  const updatedCount = npcsToAdd.length - addedCount;
                  if (addedCount > 0) {
                    console.log(`   ✓ 已将 ${addedCount} 个新NPC添加到当前场景的角色列表中`);
                  }
                  if (updatedCount > 0) {
                    console.log(`   ✓ 已更新 ${updatedCount} 个已存在的NPC在场景中的信息`);
                  }
                  if (addedCount === 0 && updatedCount === 0) {
                    console.log(`   ✓ 所有NPC已在场景中`);
                  }
                }
              }
              
              console.log(`   ✓ 已设置 ${matchedCount}/${module.initialScenarioNPCs.length} 个NPC的位置`);
            } else if (module.initialScenarioNPCs && module.initialScenarioNPCs.length > 0) {
              console.warn(`   ⚠️  场景位置未指定，无法设置初始场景NPC位置`);
            }
          } else {
            console.warn(`   ⚠️  初始场景 "${module.initialScenario}" 未找到，将不设置初始场景`);
          }
        } else {
          console.log(`   ⚠️  模组未指定初始场景`);
        }

        // Load initial game time if specified
        if (module.initialGameTime) {
          console.log(`   → 设置初始游戏时间: "${module.initialGameTime}"`);
          // Parse time format: "HH:MM" or "Day X HH:MM"
          const timeMatch = module.initialGameTime.match(/(?:Day\s*(\d+)\s+)?(\d{1,2}):(\d{2})/i);
          if (timeMatch) {
            const day = timeMatch[1] ? parseInt(timeMatch[1], 10) : 1;
            const hours = timeMatch[2];
            const minutes = timeMatch[3];
            gameState.gameDay = day;
            gameState.timeOfDay = `${hours.padStart(2, '0')}:${minutes}`;
            gameState.scenarioTimeState.sceneStartTime = gameState.timeOfDay;
            console.log(`   ✓ 已设置初始游戏时间: 第${day}天 ${gameState.timeOfDay}`);
          } else {
            // Try simple HH:MM format
            const simpleTimeMatch = module.initialGameTime.match(/(\d{1,2}):(\d{2})/);
            if (simpleTimeMatch) {
              const hours = simpleTimeMatch[1];
              const minutes = simpleTimeMatch[2];
              gameState.timeOfDay = `${hours.padStart(2, '0')}:${minutes}`;
              gameState.scenarioTimeState.sceneStartTime = gameState.timeOfDay;
              console.log(`   ✓ 已设置初始游戏时间: ${gameState.timeOfDay}`);
            } else {
              console.warn(`   ⚠️  无法解析初始游戏时间格式: "${module.initialGameTime}"`);
            }
          }
        } else {
          console.log(`   ⚠️  模组未指定初始游戏时间，使用默认时间`);
        }
      } else {
        console.log(`   ⚠️  未找到模组数据，使用默认配置`);
      }

      console.log(`\n💾 [3/3] 保存游戏状态...`);
      persistentGameState = gameState;
      console.log(`   ✓ 游戏状态已保存`);
      console.log(`   - Session ID: ${gameState.sessionId}`);
      console.log(`   - 当前场景: ${gameState.currentScenario ? gameState.currentScenario.name : "无"}`);
      console.log(`   - 游戏时间: 第${gameState.gameDay}天 ${gameState.timeOfDay}`);
      console.log(`   - 守秘人指导: ${gameState.keeperGuidance ? "已设置" : "未设置"}`);
      console.log(`\n${"=".repeat(60)}`);
      console.log(`✅ 游戏状态初始化完成！`);
      console.log(`${"=".repeat(60)}\n`);

      console.log(`[${new Date().toISOString()}] Game started with character: ${character.name} (${characterId})`);
      
      if (!persistentGameState) {
        throw new Error("Failed to initialize game state");
      }

      // Create introduction turn if module introduction is available and turnManager is initialized
      if (moduleIntroduction && turnManager && db) {
        try {
          // Check if introduction turn already exists for this session
          const database = db.getDatabase();
          const existingIntro = database.prepare(`
            SELECT turn_id FROM game_turns 
            WHERE session_id = ? AND turn_number = 0 AND character_input = ''
          `).get(persistentGameState.sessionId);
          
          if (!existingIntro) {
            // Only save introduction, not characterGuidance
            const introContent = moduleIntroduction.introduction;
            
            const introTurnId = `turn-intro-${Date.now()}-${randomUUID().slice(0, 8)}`;
            
            // Create a special turn with turnNumber 0 for introduction
            database.prepare(`
              INSERT INTO game_turns (
                turn_id, session_id, turn_number, character_input, character_id, character_name,
                keeper_narrative, status, started_at, completed_at, created_at
              ) VALUES (?, ?, 0, '', ?, ?, ?, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(
              introTurnId,
              persistentGameState.sessionId,
              character.character_id,
              character.name,
              introContent
            );
            
            console.log(`✓ Introduction turn created: ${introTurnId}`);
          } else {
            console.log(`✓ Introduction turn already exists for this session`);
          }
        } catch (error) {
          console.error("Failed to create introduction turn:", error);
          // Don't fail the game start if introduction turn creation fails
        }
      }

      res.json({
        success: true,
        message: `游戏已开始！欢迎，${character.name}！`,
        sessionId: persistentGameState.sessionId,
        characterId: character.character_id,
        characterName: character.name,
        moduleIntroduction: moduleIntroduction, // Include module introduction for frontend display
        gameState: {
          phase: persistentGameState.phase,
          playerCharacter: persistentGameState.playerCharacter,
          timeOfDay: persistentGameState.timeOfDay,
          tension: persistentGameState.tension,
          currentScenario: persistentGameState.currentScenario,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      // Start with default character
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🎲 初始化游戏状态（使用默认角色）...`);
      console.log(`${"=".repeat(60)}\n`);

      console.log(`📝 [1/3] 创建基础游戏状态...`);
      // Generate sessionId based on client IP
      const clientIp = getClientIp(req);
      const sessionId = generateSessionIdFromIp(clientIp);
      console.log(`   - 客户端 IP: ${clientIp}`);
      console.log(`   - Session ID: ${sessionId}`);
      
      let gameState: GameState = {
        ...JSON.parse(JSON.stringify(initialGameState)),
        sessionId: sessionId,
      };
      console.log(`   ✓ 基础状态已创建`);
      console.log(`   - 角色: ${gameState.playerCharacter.name}`);
      console.log(`   - 阶段: ${gameState.phase}`);
      console.log(`   - 游戏时间: 第${gameState.gameDay}天 ${gameState.timeOfDay}`);

      // Load module data and set keeper guidance and initial scenario
      console.log(`\n📚 [2/3] 加载模组配置到游戏状态...`);
      const modules = moduleLoader.getAllModules();
      let moduleIntroduction: { introduction: string; characterGuidance: string } | null = null;
      
      if (modules.length > 0) {
        const module = modules[0]; // Use the first/latest module
        console.log(`   → 使用模组: ${module.title}`);
        
        // Get introduction from module (generated automatically during load)
        if (module.introduction && module.characterGuidance) {
          moduleIntroduction = {
            introduction: module.introduction,
            characterGuidance: module.characterGuidance,
          };
          console.log(`   ✓ 导入叙事已加载 (介绍: ${moduleIntroduction.introduction.length} 字符, 角色指导: ${moduleIntroduction.characterGuidance.length} 字符)`);
        } else {
          // Fallback if not generated yet
          moduleIntroduction = {
            introduction: module.storyHook || module.background || `Welcome to ${module.title}.`,
            characterGuidance: module.moduleNotes || "Create an investigator appropriate for this module.",
          };
          console.log(`   ⚠️  使用备用导入叙事`);
        }
        
        // Set keeper guidance
        if (module.keeperGuidance) {
          gameState.keeperGuidance = module.keeperGuidance;
          console.log(`   ✓ 已设置守秘人指导 (长度: ${module.keeperGuidance.length} 字符)`);
        } else {
          console.log(`   ⚠️  模组未提供守秘人指导`);
        }

        // Load initial scenario if specified (with fuzzy matching - returns best match only)
        if (module.initialScenario) {
          console.log(`   → 查找初始场景: "${module.initialScenario}" (模糊匹配)`);
          const searchResult = scenarioLoader.searchScenarios({ name: module.initialScenario });
          if (searchResult.scenarios.length > 0) {
            // Use the best matching scenario (only one returned)
            const initialScenarioProfile = searchResult.scenarios[0];
            gameState.currentScenario = {
              ...initialScenarioProfile.snapshot,
              characters: initialScenarioProfile.snapshot.characters || []
            };
            const scenarioLocation = initialScenarioProfile.snapshot.location;
            console.log(`   ✓ 已匹配并注入初始场景到游戏状态: ${initialScenarioProfile.name}`);
            console.log(`     - 场景ID: ${initialScenarioProfile.snapshot.id}`);
            console.log(`     - 位置: ${scenarioLocation || "未指定"}`);
            console.log(`     - 描述: ${initialScenarioProfile.snapshot.description ? initialScenarioProfile.snapshot.description.substring(0, 100) + "..." : "无"}`);
            console.log(`     - 角色数: ${initialScenarioProfile.snapshot.characters?.length || 0}`);
            console.log(`     - 线索数: ${initialScenarioProfile.snapshot.clues?.length || 0}`);
            console.log(`     - 出口数: ${initialScenarioProfile.snapshot.exits?.length || 0}`);
            console.log(`     - 事件数: ${initialScenarioProfile.snapshot.events?.length || 0}`);

            // Set currentLocation for initial scenario NPCs and add them to gameState
            if (module.initialScenarioNPCs && module.initialScenarioNPCs.length > 0 && scenarioLocation) {
              console.log(`   → 设置初始场景NPC位置并注入到游戏状态 (${module.initialScenarioNPCs.length} 个NPC):`);
              const allNPCs = npcLoader.getAllNPCs();
              const database = db.getDatabase();
              let matchedCount = 0;
              const npcsToAdd: any[] = [];
              
              for (const npcName of module.initialScenarioNPCs) {
                // Find matching NPC by name (使用80%相似度的模糊匹配)
                const matchingNpc = allNPCs.find(npc => {
                  return isNameSimilar(npc.name, npcName);
                });

                if (matchingNpc) {
                  const npcProfile = matchingNpc as any; // NPCProfile
                  const oldLocation = npcProfile.currentLocation || null;
                  npcProfile.currentLocation = scenarioLocation;
                  
                  if (oldLocation !== scenarioLocation) {
                    console.log(`     ✓ ${matchingNpc.name}: ${oldLocation || "Unknown"} → ${scenarioLocation}`);
                    matchedCount++;
                    
                    // Update NPC in database
                    const updateStmt = database.prepare(`
                      UPDATE characters 
                      SET current_location = ? 
                      WHERE character_id = ? AND is_npc = 1
                    `);
                    updateStmt.run(scenarioLocation, matchingNpc.id);
                  } else {
                    console.log(`     - ${matchingNpc.name}: 已在 ${scenarioLocation} (无需更新)`);
                    matchedCount++;
                  }
                  
                  // Add NPC to gameState (create a copy to avoid mutating the original)
                  npcsToAdd.push({
                    ...npcProfile,
                    currentLocation: scenarioLocation
                  });
                } else {
                  console.warn(`     ⚠️  NPC "${npcName}" 未找到，跳过位置设置`);
                }
              }
              
              // Add all matched NPCs to gameState
              if (npcsToAdd.length > 0) {
                gameState.npcCharacters = [...(gameState.npcCharacters || []), ...npcsToAdd];
                console.log(`   ✓ 已将 ${npcsToAdd.length} 个NPC注入到游戏状态`);
                
                // Also add NPCs to currentScenario.characters if scenario is set
                if (gameState.currentScenario) {
                  const scenarioCharacters = gameState.currentScenario.characters || [];
                  const updatedCharacters = [...scenarioCharacters];
                  
                  for (const npc of npcsToAdd) {
                    // Check if NPC already exists in scenario characters
                    const existingIndex = updatedCharacters.findIndex(c => 
                      c.id === npc.id || c.name.toLowerCase() === npc.name.toLowerCase()
                    );
                    
                    if (existingIndex >= 0) {
                      // Update existing character
                      updatedCharacters[existingIndex] = {
                        ...updatedCharacters[existingIndex],
                        location: scenarioLocation,
                        status: updatedCharacters[existingIndex].status || 'present'
                      };
                    } else {
                      // Add new character to scenario
                      updatedCharacters.push({
                        id: npc.id,
                        name: npc.name,
                        role: npc.occupation || 'npc',
                        status: 'present',
                        location: scenarioLocation,
                        notes: npc.background ? npc.background.substring(0, 100) : undefined
                      });
                    }
                  }
                  
                  gameState.currentScenario.characters = updatedCharacters;
                  const originalCount = scenarioCharacters.length;
                  const finalCount = updatedCharacters.length;
                  const addedCount = finalCount - originalCount;
                  const updatedCount = npcsToAdd.length - addedCount;
                  if (addedCount > 0) {
                    console.log(`   ✓ 已将 ${addedCount} 个新NPC添加到当前场景的角色列表中`);
                  }
                  if (updatedCount > 0) {
                    console.log(`   ✓ 已更新 ${updatedCount} 个已存在的NPC在场景中的信息`);
                  }
                  if (addedCount === 0 && updatedCount === 0) {
                    console.log(`   ✓ 所有NPC已在场景中`);
                  }
                }
              }
              
              console.log(`   ✓ 已设置 ${matchedCount}/${module.initialScenarioNPCs.length} 个NPC的位置`);
            } else if (module.initialScenarioNPCs && module.initialScenarioNPCs.length > 0) {
              console.warn(`   ⚠️  场景位置未指定，无法设置初始场景NPC位置`);
            }
          } else {
            console.warn(`   ⚠️  初始场景 "${module.initialScenario}" 未找到，将不设置初始场景`);
          }
        } else {
          console.log(`   ⚠️  模组未指定初始场景`);
        }

        // Load initial game time if specified
        if (module.initialGameTime) {
          console.log(`   → 设置初始游戏时间: "${module.initialGameTime}"`);
          // Parse time format: "HH:MM" or "Day X HH:MM"
          const timeMatch = module.initialGameTime.match(/(?:Day\s*(\d+)\s+)?(\d{1,2}):(\d{2})/i);
          if (timeMatch) {
            const day = timeMatch[1] ? parseInt(timeMatch[1], 10) : 1;
            const hours = timeMatch[2];
            const minutes = timeMatch[3];
            gameState.gameDay = day;
            gameState.timeOfDay = `${hours.padStart(2, '0')}:${minutes}`;
            gameState.scenarioTimeState.sceneStartTime = gameState.timeOfDay;
            console.log(`   ✓ 已设置初始游戏时间: 第${day}天 ${gameState.timeOfDay}`);
          } else {
            // Try simple HH:MM format
            const simpleTimeMatch = module.initialGameTime.match(/(\d{1,2}):(\d{2})/);
            if (simpleTimeMatch) {
              const hours = simpleTimeMatch[1];
              const minutes = simpleTimeMatch[2];
              gameState.timeOfDay = `${hours.padStart(2, '0')}:${minutes}`;
              gameState.scenarioTimeState.sceneStartTime = gameState.timeOfDay;
              console.log(`   ✓ 已设置初始游戏时间: ${gameState.timeOfDay}`);
            } else {
              console.warn(`   ⚠️  无法解析初始游戏时间格式: "${module.initialGameTime}"`);
            }
          }
        } else {
          console.log(`   ⚠️  模组未指定初始游戏时间，使用默认时间`);
        }
      } else {
        console.log(`   ⚠️  未找到模组数据，使用默认配置`);
      }

      console.log(`\n💾 [3/3] 保存游戏状态...`);
      persistentGameState = gameState;
      console.log(`   ✓ 游戏状态已保存`);
      console.log(`   - Session ID: ${gameState.sessionId}`);
      console.log(`   - 当前场景: ${gameState.currentScenario ? gameState.currentScenario.name : "无"}`);
      console.log(`   - 游戏时间: 第${gameState.gameDay}天 ${gameState.timeOfDay}`);
      console.log(`   - 守秘人指导: ${gameState.keeperGuidance ? "已设置" : "未设置"}`);
      console.log(`\n${"=".repeat(60)}`);
      console.log(`✅ 游戏状态初始化完成！`);
      console.log(`${"=".repeat(60)}\n`);

      console.log(`[${new Date().toISOString()}] Game started with default character`);
      
      if (!persistentGameState) {
        throw new Error("Failed to initialize game state");
      }

      // Create introduction turn if module introduction is available and turnManager is initialized
      if (moduleIntroduction && turnManager && db) {
        try {
          // Check if introduction turn already exists for this session
          const database = db.getDatabase();
          const existingIntro = database.prepare(`
            SELECT turn_id FROM game_turns 
            WHERE session_id = ? AND turn_number = 0 AND character_input = ''
          `).get(persistentGameState.sessionId);
          
          if (!existingIntro) {
            // Only save introduction, not characterGuidance
            const introContent = moduleIntroduction.introduction;
            
            const introTurnId = `turn-intro-${Date.now()}-${randomUUID().slice(0, 8)}`;
            
            // Create a special turn with turnNumber 0 for introduction
            database.prepare(`
              INSERT INTO game_turns (
                turn_id, session_id, turn_number, character_input, character_id, character_name,
                keeper_narrative, status, started_at, completed_at, created_at
              ) VALUES (?, ?, 0, '', ?, ?, ?, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(
              introTurnId,
              persistentGameState.sessionId,
              persistentGameState.playerCharacter.id,
              persistentGameState.playerCharacter.name,
              introContent
            );
            
            console.log(`✓ Introduction turn created: ${introTurnId}`);
          } else {
            console.log(`✓ Introduction turn already exists for this session`);
          }
        } catch (error) {
          console.error("Failed to create introduction turn:", error);
          // Don't fail the game start if introduction turn creation fails
        }
      }

      res.json({
        success: true,
        message: "游戏已开始！使用默认角色。",
        sessionId: persistentGameState.sessionId,
        characterId: persistentGameState.playerCharacter.id,
        characterName: persistentGameState.playerCharacter.name,
        moduleIntroduction: moduleIntroduction, // Include module introduction for frontend display
        gameState: {
          phase: persistentGameState.phase,
          playerCharacter: persistentGameState.playerCharacter,
          timeOfDay: persistentGameState.timeOfDay,
          tension: persistentGameState.tension,
          currentScenario: persistentGameState.currentScenario,
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error starting game:", error);
    res.status(500).json({ error: "Failed to start game: " + (error as Error).message });
  }
});

// API endpoint to process user query
app.post("/api/message", async (req, res) => {
  try {
    // Check if game is initialized
    if (!persistentGameState) {
      return res.status(400).json({ 
        error: "Game not started. Please start the game first by calling /api/game/start" 
      });
    }

    // Ensure graph is initialized (needed for processing messages)
    if (!graph || !ragManager) {
      // Initialize graph and ragManager if not already initialized
      if (!db) {
        const dataDir = path.join(process.cwd(), "data");
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        db = new CoCDatabase();
        seedDatabase(db);
      }
      
      const scenarioLoader = new ScenarioLoader(db);
      const npcLoader = new NPCLoader(db);
      
      ragManager = createBgeSqliteRagManager(db);
      
      // Check if base knowledge base is already built (reusable for all games)
      const isBaseKbBuilt = RagManager.isBaseKnowledgeBaseBuilt(db);
      
      if (!isBaseKbBuilt) {
        console.log("Base RAG knowledge base not found, building from database...");
        const scenarioProfiles = scenarioLoader.getAllScenarios();
        const npcProfiles = npcLoader.getAllNPCs();
        
        await ragManager.buildKnowledgeBase(
          {
            scenarios: scenarioProfiles.map((s: any) => s.snapshot),
            npcs: npcProfiles,
            clues: [],
            rules: [],
            playerInventory: persistentGameState.playerCharacter?.inventory || [],
            playerId: persistentGameState.playerCharacter?.id || '',
            playerName: persistentGameState.playerCharacter?.name || 'Investigator',
          },
          {
            moduleName: "default-module",
            mode: "keeper",
            enableNodeEmbeddings: true,
            enableKnnEdges: true,
          }
        );
        console.log("Base RAG knowledge base built successfully (will be reused for future games)");
      } else {
        console.log("Base RAG knowledge base already exists, reusing it (no rebuild needed)");
      }

      graph = buildGraph(db, scenarioLoader, ragManager);
      console.log("Graph and RAG Manager initialized for message processing");
    }

    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    console.log(`[${new Date().toISOString()}] User query: ${message}`);

    // Create initial messages for the graph
    const initialMessages = [new HumanMessage(message)];

    // Invoke the graph with persistent state
    console.log("🚀 [API] 开始执行 Graph 流程...");
    const result = (await graph.invoke({
      messages: initialMessages,
      gameState: persistentGameState,
    })) as unknown as GraphState;
    console.log("✅ [API] Graph 流程执行完成");

    // Update the persistent state with the result
    persistentGameState = result.gameState as GameState;
    console.log("💾 [API] 游戏状态已更新");

    // Extract the keeper's response (last AI message)
    const agentMessages = (result.messages as BaseMessage[]).filter(
      (msg: any) => msg._getType && msg._getType() === "ai"
    );
    const lastResponse = agentMessages.length > 0 
      ? agentMessages[agentMessages.length - 1].content 
      : "No response generated.";

    console.log(`📤 [API] Keeper 响应已提取 (${typeof lastResponse === 'string' ? lastResponse.length : 0} 字符)`);
    console.log(`📤 [API] 准备返回响应给客户端`);

    res.json({
      success: true,
      eventId: null,
      timestamp: new Date().toISOString(),
      userMessage: message,
      response: lastResponse,
      gameState: {
        phase: persistentGameState.phase,
        currentScenario: persistentGameState.currentScenario,
        timeOfDay: persistentGameState.timeOfDay,
        tension: persistentGameState.tension,
        playerCharacter: persistentGameState.playerCharacter,
        npcCharacters: persistentGameState.npcCharacters,
      },
    });
  } catch (error) {
    console.error("Error processing message:", error);
    res.status(500).json({ error: "Failed to process message: " + (error as Error).message });
  }
});

// API endpoint to get current game state
app.get("/api/gamestate", (req, res) => {
  try {
    if (!persistentGameState) {
      return res.json({
        success: true,
        gameState: null,
        initialized: false,
        message: "Game not started yet",
      });
    }

    res.json({
      success: true,
      gameState: persistentGameState,
      initialized: true,
    });
  } catch (error) {
    console.error("Error fetching game state:", error);
    res.status(500).json({ error: "Failed to fetch game state" });
  }
});

// API endpoint to reset/stop game
app.post("/api/game/stop", (req, res) => {
  try {
    if (!persistentGameState) {
      return res.json({
        success: true,
        message: "Game was not running",
        timestamp: new Date().toISOString(),
      });
    }

    // Clear the game state
    persistentGameState = null;
    
    console.log(`[${new Date().toISOString()}] Game stopped and state cleared`);
    
    res.json({
      success: true,
      message: "游戏已停止，状态已清空",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error stopping game:", error);
    res.status(500).json({ error: "Failed to stop game" });
  }
});

// API endpoint to generate random attributes according to CoC 7th Edition rules
app.post("/api/character/random-attributes", (req, res) => {
  try {
    const { age } = req.body;

    // Generate random attributes
    const attributes = generateRandomAttributes(age);

    console.log(`[${new Date().toISOString()}] Generated random attributes${age ? ` for age ${age}` : ''}`);

    res.json({
      success: true,
      attributes: attributes,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error generating random attributes:", error);
    res.status(500).json({ error: "Failed to generate random attributes: " + (error as Error).message });
  }
});

// API endpoint to create/save a character
app.post("/api/character", (req, res) => {
  try {
    // Initialize database if not already initialized
    if (!db) {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      db = new CoCDatabase();
      seedDatabase(db);
      console.log("Database initialized for character storage");
    }

    const characterData = req.body;

    if (!characterData || !characterData.identity?.name) {
      return res.status(400).json({ error: "Character name is required" });
    }

    // Generate character ID
    const characterId = `char-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Prepare character data for database
    const dbCharacter = {
      character_id: characterId,
      name: characterData.identity.name,
      attributes: JSON.stringify(characterData.attributes || {}),
      status: JSON.stringify({
        hp: characterData.derived?.HP || 10,
        maxHp: characterData.derived?.HP || 10,
        sanity: characterData.derived?.SAN || 60,
        maxSanity: characterData.attributes?.POW ? characterData.attributes.POW * 5 : 99,
        luck: characterData.derived?.LUCK || characterData.attributes?.LCK || 50,
        mp: characterData.derived?.MP || 10,
        damageBonus: characterData.derived?.DB || "0",
        build: characterData.derived?.BUILD || 0,
        mov: characterData.derived?.MOV || 8,
        conditions: [],
      }),
      inventory: JSON.stringify(
        (characterData.weapons || [])
          .filter((w: any) => w.name)
          .map((w: any) => w.name)
      ),
      skills: JSON.stringify(
        Object.entries(characterData.skills || {}).reduce((acc: any, [name, data]: [string, any]) => {
          acc[name] = data.value || 0;
          return acc;
        }, {})
      ),
      notes: JSON.stringify({
        era: characterData.identity?.era || "",
        gender: characterData.identity?.gender || "",
        residence: characterData.identity?.residence || "",
        birthplace: characterData.identity?.birthplace || "",
        appearance: characterData.notes?.appearance || "",
        ideology: characterData.notes?.ideology || "",
        people: characterData.notes?.people || "",
        gear: characterData.notes?.gear || "",
        backstory: characterData.notes?.backstory || "",
        weapons: characterData.weapons || [],
      }),
      is_npc: 0, // Player character
      occupation: characterData.identity?.occupation || null,
      age: characterData.identity?.age || null,
      appearance: characterData.notes?.appearance || null,
      personality: characterData.notes?.ideology || null,
      background: characterData.notes?.backstory || null,
      goals: null,
      secrets: null,
    };

    // Insert into database
    const database = db.getDatabase();
    const insertStmt = database.prepare(`
      INSERT INTO characters (
        character_id, name, attributes, status, inventory, skills, notes,
        is_npc, occupation, age, appearance, personality, background, goals, secrets
      ) VALUES (
        @character_id, @name, @attributes, @status, @inventory, @skills, @notes,
        @is_npc, @occupation, @age, @appearance, @personality, @background, @goals, @secrets
      )
    `);

    insertStmt.run(dbCharacter);

    console.log(`[${new Date().toISOString()}] Character created: ${characterData.identity.name} (${characterId})`);

    res.json({
      success: true,
      characterId: characterId,
      message: `角色 ${characterData.identity.name} 创建成功！`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error creating character:", error);
    res.status(500).json({ error: "Failed to create character: " + (error as Error).message });
  }
});

// API endpoint to get all characters
app.get("/api/characters", (req, res) => {
  try {
    // Initialize database if not already initialized
    if (!db) {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      db = new CoCDatabase();
      seedDatabase(db);
      console.log("Database initialized for character retrieval");
    }

    const database = db.getDatabase();
    const characters = database.prepare(`
      SELECT character_id, name, occupation, age, is_npc, appearance
      FROM characters
      WHERE is_npc = 0 OR is_npc IS NULL
      ORDER BY updated_at DESC
    `).all();

    res.json({
      success: true,
      characters: characters,
    });
  } catch (error) {
    console.error("Error fetching characters:", error);
    res.status(500).json({ error: "Failed to fetch characters" });
  }
});

// ==================== TURN API ENDPOINTS ====================

// POST /api/turns - Create a new turn and start processing
app.post("/api/turns", async (req, res) => {
  try {
    if (!persistentGameState) {
      return res.status(400).json({ 
        error: "Game not started. Please start the game first by calling /api/game/start" 
      });
    }

    // Initialize TurnManager if not already initialized
    if (!turnManager) {
      if (!db) {
        const dataDir = path.join(process.cwd(), "data");
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        db = new CoCDatabase();
        seedDatabase(db);
      }
      turnManager = new TurnManager(db);
      console.log("TurnManager initialized for turn processing");
    }

    // Initialize graph and ragManager if not already initialized
    if (!graph || !ragManager) {
      if (!db) {
        const dataDir = path.join(process.cwd(), "data");
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        db = new CoCDatabase();
        seedDatabase(db);
      }
      
      const scenarioLoader = new ScenarioLoader(db);
      const npcLoader = new NPCLoader(db);
      
      ragManager = createBgeSqliteRagManager(db);
      
      // Check if base knowledge base is already built (reusable for all games)
      const isBaseKbBuilt = RagManager.isBaseKnowledgeBaseBuilt(db);
      
      if (!isBaseKbBuilt) {
        console.log("Base RAG knowledge base not found, building from database...");
        const scenarioProfiles = scenarioLoader.getAllScenarios();
        const npcProfiles = npcLoader.getAllNPCs();
        
        await ragManager.buildKnowledgeBase(
          {
            scenarios: scenarioProfiles.map((s: any) => s.snapshot),
            npcs: npcProfiles,
            clues: [],
            rules: [],
            playerInventory: persistentGameState.playerCharacter?.inventory || [],
            playerId: persistentGameState.playerCharacter?.id || '',
            playerName: persistentGameState.playerCharacter?.name || 'Investigator',
          },
          {
            moduleName: "default-module",
            mode: "keeper",
            enableNodeEmbeddings: true,
            enableKnnEdges: true,
          }
        );
        console.log("Base RAG knowledge base built successfully (will be reused for future games)");
      } else {
        console.log("Base RAG knowledge base already exists, reusing it (no rebuild needed)");
      }

      graph = buildGraph(db, scenarioLoader, ragManager);
      console.log("Graph and RAG Manager initialized for turn processing");
    }

    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    // Create turn record in database
    const turnId = turnManager.createTurnFromGameState(
      persistentGameState.sessionId,
      message,
      persistentGameState
    );

    console.log(`[${new Date().toISOString()}] Turn created: ${turnId} for message: ${message}`);

    // Start async processing (don't wait for it)
    processGameTurn(turnId, message, persistentGameState)
      .catch((error) => {
        console.error(`Error processing turn ${turnId}:`, error);
        if (turnManager) {
          turnManager.markError(turnId, error);
        }
      });

    // Immediately return the turnId
    res.json({
      success: true,
      turnId: turnId,
      status: 'processing',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error creating turn:", error);
    res.status(500).json({ error: "Failed to create turn: " + (error as Error).message });
  }
});

// GET /api/turns/:turnId - Get turn status and result
// Supports long polling: if ?wait=true, waits until turn is completed
app.get("/api/turns/:turnId", async (req, res) => {
  try {
    if (!turnManager) {
      return res.status(400).json({ error: "Game not initialized" });
    }

    const { turnId } = req.params;
    const waitForCompletion = req.query.wait === 'true';
    const maxWaitTime = 60000; // 60 seconds max wait time
    const checkInterval = 500; // Check every 500ms
    const startTime = Date.now();

    // Long polling: wait until turn is completed
    if (waitForCompletion) {
      while (Date.now() - startTime < maxWaitTime) {
        const turn = turnManager.getTurn(turnId);
        
        if (!turn) {
          return res.status(404).json({ error: "Turn not found" });
        }

        // If turn is completed or error, return immediately
        if (turn.status === 'completed' || turn.status === 'error') {
          console.log(`📖 [API] 获取 Turn ${turnId}: status=${turn.status}, keeperNarrative=${turn.keeperNarrative ? `${turn.keeperNarrative.length} 字符` : 'null'}`);
          
          return res.json({
            success: true,
            turn: {
              turnId: turn.turnId,
              turnNumber: turn.turnNumber,
              characterInput: turn.characterInput,
              keeperNarrative: turn.keeperNarrative,
              status: turn.status,
              errorMessage: turn.errorMessage,
              startedAt: turn.startedAt,
              completedAt: turn.completedAt,
              sceneId: turn.sceneId,
              sceneName: turn.sceneName,
              location: turn.location,
            },
          });
        }

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }

      // Timeout: return current status
      const turn = turnManager.getTurn(turnId);
      if (!turn) {
        return res.status(404).json({ error: "Turn not found" });
      }

      console.log(`📖 [API] 获取 Turn ${turnId}: timeout, status=${turn.status}`);
      return res.json({
        success: true,
        turn: {
          turnId: turn.turnId,
          turnNumber: turn.turnNumber,
          characterInput: turn.characterInput,
          keeperNarrative: turn.keeperNarrative,
          status: turn.status,
          errorMessage: turn.errorMessage,
          startedAt: turn.startedAt,
          completedAt: turn.completedAt,
          sceneId: turn.sceneId,
          sceneName: turn.sceneName,
          location: turn.location,
        },
      });
    }

    // Immediate return (no waiting)
    const turn = turnManager.getTurn(turnId);

    if (!turn) {
      return res.status(404).json({ error: "Turn not found" });
    }

    console.log(`📖 [API] 获取 Turn ${turnId}: status=${turn.status}, keeperNarrative=${turn.keeperNarrative ? `${turn.keeperNarrative.length} 字符` : 'null'}`);

    res.json({
      success: true,
      turn: {
        turnId: turn.turnId,
        turnNumber: turn.turnNumber,
        characterInput: turn.characterInput,
        keeperNarrative: turn.keeperNarrative,
        status: turn.status,
        errorMessage: turn.errorMessage,
        startedAt: turn.startedAt,
        completedAt: turn.completedAt,
        sceneId: turn.sceneId,
        sceneName: turn.sceneName,
        location: turn.location,
      },
    });
  } catch (error) {
    console.error("Error fetching turn:", error);
    res.status(500).json({ error: "Failed to fetch turn" });
  }
});

// GET /api/sessions/:sessionId/conversation - Get conversation history
app.get("/api/sessions/:sessionId/conversation", (req, res) => {
  try {
    if (!turnManager) {
      return res.status(400).json({ error: "Game not initialized" });
    }

    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const conversation = turnManager.getConversation(sessionId, limit);

    res.json({
      success: true,
      conversation: conversation,
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

// GET /api/sessions/:sessionId/turns - Get turn history
app.get("/api/sessions/:sessionId/turns", (req, res) => {
  try {
    if (!turnManager) {
      return res.status(400).json({ error: "Game not initialized" });
    }

    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;

    const turns = turnManager.getHistory(sessionId, limit);

    res.json({
      success: true,
      turns: turns,
    });
  } catch (error) {
    console.error("Error fetching turns:", error);
    res.status(500).json({ error: "Failed to fetch turns" });
  }
});

// Helper function to process a game turn asynchronously
async function processGameTurn(turnId: string, userInput: string, gameState: GameState) {
  try {
    console.log(`[${new Date().toISOString()}] Processing turn ${turnId}...`);

    // Create initial messages for the graph
    const initialMessages = [new HumanMessage(userInput)];

    // Invoke the graph with turnId in state
    const result = (await graph.invoke({
      messages: initialMessages,
      gameState: gameState,
      turnId: turnId,  // Pass turnId to graph
    })) as unknown as GraphState;

    // Update the persistent state
    persistentGameState = result.gameState as GameState;

    console.log(`[${new Date().toISOString()}] Turn ${turnId} completed successfully`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Turn ${turnId} failed:`, error);
    throw error;
  }
}

// API endpoint to get message history (stub for now)
app.get("/api/messages", (req, res) => {
  try {
    res.json({
      success: true,
      messages: [],
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// ==================== CHECKPOINT API ENDPOINTS ====================

// POST /api/checkpoints/save - Save current game state as checkpoint
app.post("/api/checkpoints/save", async (req, res) => {
  try {
    // Initialize database if not already initialized
    if (!db) {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      db = new CoCDatabase();
      seedDatabase(db);
      console.log("Database initialized for checkpoint saving");
    }

    if (!persistentGameState) {
      return res.status(400).json({ 
        error: "Game not started. Please start the game first." 
      });
    }

    const currentScenario = persistentGameState.currentScenario;
    if (!currentScenario) {
      return res.status(400).json({ 
        error: "No current scenario. Cannot save checkpoint." 
      });
    }

    // Generate checkpoint name: scenario name + current date
    const currentDate = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const checkpointName = `${currentScenario.name} - ${currentDate}`;
    const description = `Manual save at ${currentScenario.location}`;

    const checkpointId = saveManualCheckpoint(
      persistentGameState,
      db,
      checkpointName,
      description
    );

    // Save RAG state to checkpoint if RAG Manager is initialized
    if (ragManager) {
      try {
        await ragManager.saveToCheckpoint(checkpointId);
        console.log(`[${new Date().toISOString()}] RAG state saved to checkpoint: ${checkpointId}`);
      } catch (error) {
        console.warn(`[${new Date().toISOString()}] Failed to save RAG state to checkpoint:`, error);
        // Don't fail the checkpoint save if RAG save fails
      }
    }

    console.log(`[${new Date().toISOString()}] Checkpoint saved: ${checkpointName} (${checkpointId})`);

    res.json({
      success: true,
      checkpointId: checkpointId,
      checkpointName: checkpointName,
      message: "存档成功",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error saving checkpoint:", error);
    res.status(500).json({ error: "Failed to save checkpoint: " + (error as Error).message });
  }
});

// GET /api/checkpoints/list - List all available checkpoints
app.get("/api/checkpoints/list", (req, res) => {
  try {
    // Initialize database if not already initialized
    if (!db) {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      db = new CoCDatabase();
      seedDatabase(db);
      console.log("Database initialized for checkpoint listing");
    }

    const sessionId = req.query.sessionId as string;
    const limit = parseInt(req.query.limit as string) || 50;

    let checkpoints: any[] = [];

    if (sessionId && sessionId !== "all") {
      // List checkpoints for specific session
      checkpoints = listAvailableCheckpoints(sessionId, db, limit);
    } else {
      // List all checkpoints from all sessions
      const database = db.getDatabase();
      const stmt = database.prepare(`
        SELECT 
          checkpoint_id, checkpoint_name, checkpoint_type, description,
          game_day, game_time, current_scene_name, current_location,
          player_hp, player_sanity, created_at, session_id
        FROM game_checkpoints 
        ORDER BY created_at DESC
        LIMIT ?
      `);
      checkpoints = stmt.all(limit) as any[];
    }

    // Convert snake_case field names to camelCase for frontend compatibility
    const normalizedCheckpoints = checkpoints.map((cp: any) => ({
      checkpointId: cp.checkpoint_id || cp.checkpointId,
      checkpointName: cp.checkpoint_name || cp.checkpointName,
      checkpointType: cp.checkpoint_type || cp.checkpointType,
      description: cp.description,
      gameDay: cp.game_day || cp.gameDay,
      gameTime: cp.game_time || cp.gameTime,
      currentSceneName: cp.current_scene_name || cp.currentSceneName,
      currentLocation: cp.current_location || cp.currentLocation,
      playerHp: cp.player_hp || cp.playerHp,
      playerSanity: cp.player_sanity || cp.playerSanity,
      createdAt: cp.created_at || cp.createdAt,
      sessionId: cp.session_id || cp.sessionId,
    }));

    res.json({
      success: true,
      checkpoints: normalizedCheckpoints,
    });
  } catch (error) {
    console.error("Error listing checkpoints:", error);
    res.status(500).json({ error: "Failed to list checkpoints: " + (error as Error).message });
  }
});

// POST /api/checkpoints/load - Load a checkpoint and restore game state
app.post("/api/checkpoints/load", async (req, res) => {
  try {
    // Initialize database if not already initialized
    if (!db) {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      db = new CoCDatabase();
      seedDatabase(db);
      console.log("Database initialized for checkpoint loading");
    }

    const { checkpointId } = req.body;
    if (!checkpointId) {
      return res.status(400).json({ error: "checkpointId is required" });
    }

    const gameState = loadCheckpoint(checkpointId, db);
    if (!gameState) {
      return res.status(404).json({ error: "Checkpoint not found" });
    }

    // Restore persistent game state
    persistentGameState = gameState;

    // Initialize TurnManager if not already initialized (needed for fetching conversation history)
    if (!turnManager) {
      turnManager = new TurnManager(db);
      console.log("TurnManager initialized for checkpoint loading");
    }

    // Fetch conversation history for this session
    let conversationHistory: Array<{
      role: 'character' | 'keeper';
      content: string;
      timestamp: string;
      turnNumber: number;
    }> = [];
    
    try {
      conversationHistory = turnManager.getConversation(gameState.sessionId, 50);
      console.log(`[${new Date().toISOString()}] Loaded ${conversationHistory.length} conversation messages from history`);
    } catch (error) {
      console.warn("Failed to load conversation history:", error);
      // Continue without history - not a critical error
    }

    // Initialize graph and ragManager if not already initialized (needed for processing turns)
    if (!graph || !ragManager) {
      console.log(`[${new Date().toISOString()}] Initializing multi-agent system for loaded checkpoint...`);
      
      // Initialize loaders to get existing data from database
      const scenarioLoader = new ScenarioLoader(db);
      const npcLoader = new NPCLoader(db);
      const moduleLoader = new ModuleLoader(db);
      
      // Try to restore RAG from checkpoint first
      try {
        ragManager = await RagManager.restoreFromCheckpoint(db, checkpointId);
        console.log(`[${new Date().toISOString()}] RAG state restored from checkpoint: ${checkpointId}`);
      } catch (error) {
        console.warn(`[${new Date().toISOString()}] Failed to restore RAG from checkpoint, using base RAG:`, error);
        // Fall back to base RAG (checkpoint_id IS NULL)
        ragManager = createBgeSqliteRagManager(db);
        
        // Check if base knowledge base is already built (reusable for all games)
        const isBaseKbBuilt = RagManager.isBaseKnowledgeBaseBuilt(db);
        
        if (!isBaseKbBuilt) {
          console.log(`[${new Date().toISOString()}] Base RAG knowledge base not found, building from database...`);
          // Only build if base knowledge base doesn't exist
          const scenarioProfiles = scenarioLoader.getAllScenarios();
          const npcProfiles = npcLoader.getAllNPCs();
          
          await ragManager.buildKnowledgeBase(
            {
              scenarios: scenarioProfiles.map((s: any) => s.snapshot),
              npcs: npcProfiles,
              clues: [],
              rules: [],
              playerInventory: gameState.playerCharacter?.inventory || [],
              playerId: gameState.playerCharacter?.id || '',
              playerName: gameState.playerCharacter?.name || 'Investigator',
            },
            {
              moduleName: "default-module",
              mode: "keeper",
              enableNodeEmbeddings: true,
              enableKnnEdges: true,
            }
          );
          console.log(`[${new Date().toISOString()}] Base RAG knowledge base built successfully (will be reused for future games)`);
        } else {
          console.log(`[${new Date().toISOString()}] Base RAG knowledge base already exists, reusing it (no rebuild needed)`);
        }
      }

      // Build the multi-agent graph
      graph = buildGraph(db, scenarioLoader, ragManager);
      
      console.log(`[${new Date().toISOString()}] Multi-agent system initialized for checkpoint`);
    }

    // Reinitialize graph and other components with the loaded game state
    // We need to reinitialize the graph with the loaded mod
    if (gameState.currentScenario) {
      // Extract mod name from scenario if available, or use a default
      // The mod should be loaded when the checkpoint was created
      // For now, we'll just restore the state - the graph should work with existing state
      console.log(`[${new Date().toISOString()}] Restoring game state from checkpoint: ${checkpointId}`);
    }

    console.log(`[${new Date().toISOString()}] Checkpoint loaded: ${checkpointId}`);

    res.json({
      success: true,
      sessionId: gameState.sessionId,
      gameState: gameState,
      conversationHistory: conversationHistory,
      message: "存档加载成功",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error loading checkpoint:", error);
    res.status(500).json({ error: "Failed to load checkpoint: " + (error as Error).message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down gracefully...");
  if (db) {
    db.close();
  }
  process.exit(0);
});
