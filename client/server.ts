import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import express from "express";
import { CoCDatabase, seedDatabase } from "../src/coc_multiagents_system/agents/memory/database/index.js";
import { NPCLoader } from "../src/coc_multiagents_system/agents/character/npcloader/index.js";
import { ModuleLoader } from "../src/coc_multiagents_system/agents/memory/moduleloader/index.js";
import { ScenarioLoader } from "../src/coc_multiagents_system/agents/memory/scenarioloader/index.js";
import { RAGEngine } from "../src/rag/engine.js";
import { buildGraph, type GraphState } from "../src/graph.js";
import { initialGameState, type GameState } from "../src/state.js";
import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { TurnManager } from "../src/coc_multiagents_system/agents/memory/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy-loaded components (initialized only when needed)
let db: CoCDatabase | null = null;
let graph: any = null;
let ragEngine: any = null;
let turnManager: TurnManager | null = null;

// **PERSISTENT GAME STATE** - will be initialized when user starts the game
let persistentGameState: GameState | null = null;

console.log("✅ Frontend server ready (nothing initialized yet)");

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

      // Load scenarios
      if (scenarioDirs.length > 0) {
        console.log(`\n📋 [1/3] 加载场景数据...`);
        for (const scenarioDirName of scenarioDirs) {
          const scenariosDir = path.join(modPath, scenarioDirName);
          console.log(`   → 从文件夹加载场景: ${scenarioDirName}`);
          try {
            await scenarioLoader.loadScenariosFromJSONDirectory(scenariosDir);
          } catch (error) {
            console.error(`   ✗ 加载场景失败 ${scenarioDirName}:`, error);
          }
        }
      } else {
        console.log(`\n📋 [1/3] 未找到场景文件夹（包含"scenario"的文件夹）`);
      }

      // Load NPCs
      if (npcDirs.length > 0) {
        console.log(`\n👥 [2/3] 加载NPC数据...`);
        for (const npcDirName of npcDirs) {
          const npcsDir = path.join(modPath, npcDirName);
          console.log(`   → 从文件夹加载NPC: ${npcDirName}`);
          try {
            await npcLoader.loadNPCsFromJSONDirectory(npcsDir);
          } catch (error) {
            console.error(`   ✗ 加载NPC失败 ${npcDirName}:`, error);
          }
        }
      } else {
        console.log(`\n👥 [2/3] 未找到NPC文件夹（包含"npc"的文件夹）`);
      }

      // Load modules/background
      if (backgroundDirs.length > 0) {
        console.log(`\n📚 [3/3] 加载模块数据...`);
        for (const backgroundDirName of backgroundDirs) {
          const moduleDir = path.join(modPath, backgroundDirName);
          console.log(`   → 从文件夹加载模块: ${backgroundDirName}`);
          try {
            const jsonFiles = fs.readdirSync(moduleDir).filter(f => f.toLowerCase().endsWith('.json'));
            if (jsonFiles.length > 0) {
              await moduleLoader.loadModulesFromJSONDirectory(moduleDir);
            } else {
              await moduleLoader.loadModulesFromDirectory(moduleDir);
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
    if (!graph || !ragEngine) {
      console.log(`[${new Date().toISOString()}] Initializing multi-agent system...`);

      // Initialize RAG engine
      const knowledgeDir = path.join(process.cwd(), "data", "knowledge");
      if (!fs.existsSync(knowledgeDir)) {
        fs.mkdirSync(knowledgeDir, { recursive: true });
      }
      ragEngine = new RAGEngine(db, knowledgeDir);
      await ragEngine.ingestFromDirectory();

      // Build the multi-agent graph
      graph = buildGraph(db, scenarioLoader, ragEngine);
      
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
      let gameState: GameState = {
        ...JSON.parse(JSON.stringify(initialGameState)),
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
      if (modules.length > 0) {
        const module = modules[0]; // Use the first/latest module
        console.log(`   → 使用模组: ${module.title}`);
        
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
            gameState.currentScenario = initialScenarioProfile.snapshot;
            console.log(`   ✓ 已匹配并注入初始场景到游戏状态: ${initialScenarioProfile.name}`);
            console.log(`     - 场景ID: ${initialScenarioProfile.snapshot.id}`);
            console.log(`     - 位置: ${initialScenarioProfile.snapshot.location || "未指定"}`);
            console.log(`     - 描述: ${initialScenarioProfile.snapshot.description ? initialScenarioProfile.snapshot.description.substring(0, 100) + "..." : "无"}`);
            console.log(`     - 角色数: ${initialScenarioProfile.snapshot.characters?.length || 0}`);
            console.log(`     - 线索数: ${initialScenarioProfile.snapshot.clues?.length || 0}`);
            console.log(`     - 出口数: ${initialScenarioProfile.snapshot.exits?.length || 0}`);
            console.log(`     - 事件数: ${initialScenarioProfile.snapshot.events?.length || 0}`);
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

      res.json({
        success: true,
        message: `游戏已开始！欢迎，${character.name}！`,
        sessionId: persistentGameState.sessionId,
        characterId: character.character_id,
        characterName: character.name,
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
      let gameState: GameState = JSON.parse(JSON.stringify(initialGameState));
      console.log(`   ✓ 基础状态已创建`);
      console.log(`   - 角色: ${gameState.playerCharacter.name}`);
      console.log(`   - 阶段: ${gameState.phase}`);
      console.log(`   - 游戏时间: 第${gameState.gameDay}天 ${gameState.timeOfDay}`);

      // Load module data and set keeper guidance and initial scenario
      console.log(`\n📚 [2/3] 加载模组配置到游戏状态...`);
      const modules = moduleLoader.getAllModules();
      if (modules.length > 0) {
        const module = modules[0]; // Use the first/latest module
        console.log(`   → 使用模组: ${module.title}`);
        
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
            gameState.currentScenario = initialScenarioProfile.snapshot;
            console.log(`   ✓ 已匹配并注入初始场景到游戏状态: ${initialScenarioProfile.name}`);
            console.log(`     - 场景ID: ${initialScenarioProfile.snapshot.id}`);
            console.log(`     - 位置: ${initialScenarioProfile.snapshot.location || "未指定"}`);
            console.log(`     - 描述: ${initialScenarioProfile.snapshot.description ? initialScenarioProfile.snapshot.description.substring(0, 100) + "..." : "无"}`);
            console.log(`     - 角色数: ${initialScenarioProfile.snapshot.characters?.length || 0}`);
            console.log(`     - 线索数: ${initialScenarioProfile.snapshot.clues?.length || 0}`);
            console.log(`     - 出口数: ${initialScenarioProfile.snapshot.exits?.length || 0}`);
            console.log(`     - 事件数: ${initialScenarioProfile.snapshot.events?.length || 0}`);
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

      res.json({
        success: true,
        message: "游戏已开始！使用默认角色。",
        sessionId: persistentGameState.sessionId,
        characterId: persistentGameState.playerCharacter.id,
        characterName: persistentGameState.playerCharacter.name,
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
    if (!persistentGameState || !turnManager || !graph) {
      return res.status(400).json({ 
        error: "Game not started. Please start the game first by calling /api/game/start" 
      });
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
app.get("/api/turns/:turnId", (req, res) => {
  try {
    if (!turnManager) {
      return res.status(400).json({ error: "Game not initialized" });
    }

    const { turnId } = req.params;
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
