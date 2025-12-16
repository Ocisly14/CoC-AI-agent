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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy-loaded components (initialized only when needed)
let db: CoCDatabase | null = null;
let graph: any = null;
let ragEngine: any = null;

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

// API endpoint to start/initialize the game
app.post("/api/game/start", async (req, res) => {
  try {
    const { characterId } = req.body;

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

    // Lazy-load multi-agent system components (only when game starts)
    if (!graph || !ragEngine) {
      // Initialize NPC directory
      const npcDir = path.join(process.cwd(), "data", "npcs");
      if (!fs.existsSync(npcDir)) {
        fs.mkdirSync(npcDir, { recursive: true });
      }

      // Load NPCs from documents
      const npcLoader = new NPCLoader(db);
      await npcLoader.loadNPCsFromDirectory(npcDir);

      // Initialize module background directory
      const moduleDir = path.join(process.cwd(), "data", "background");
      if (!fs.existsSync(moduleDir)) {
        fs.mkdirSync(moduleDir, { recursive: true });
      }

      // Load module briefings from documents
      const moduleLoader = new ModuleLoader(db);
      await moduleLoader.loadModulesFromDirectory(moduleDir);

      // Initialize scenario directory
      const scenarioDir = path.join(process.cwd(), "data", "scenarios");
      if (!fs.existsSync(scenarioDir)) {
        fs.mkdirSync(scenarioDir, { recursive: true });
      }

      // Load scenarios from documents
      const scenarioLoader = new ScenarioLoader(db);
      await scenarioLoader.loadScenariosFromDirectory(scenarioDir);

      // Initialize RAG knowledge directory
      const knowledgeDir = path.join(process.cwd(), "data", "knowledge");
      if (!fs.existsSync(knowledgeDir)) {
        fs.mkdirSync(knowledgeDir, { recursive: true });
      }
      ragEngine = new RAGEngine(db, knowledgeDir);
      await ragEngine.ingestFromDirectory();

      // Build the multi-agent graph
      graph = buildGraph(db, ragEngine);

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
      const parsedAttributes = JSON.parse(character.attributes);
      const parsedStatus = JSON.parse(character.status);
      const parsedSkills = JSON.parse(character.skills);
      const parsedInventory = JSON.parse(character.inventory);

      persistentGameState = {
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

      console.log(`[${new Date().toISOString()}] Game started with character: ${character.name} (${characterId})`);
      
      if (!persistentGameState) {
        throw new Error("Failed to initialize game state");
      }

      res.json({
        success: true,
        message: `游戏已开始！欢迎，${character.name}！`,
        gameState: {
          phase: persistentGameState.phase,
          playerCharacter: persistentGameState.playerCharacter,
          timeOfDay: persistentGameState.timeOfDay,
          tension: persistentGameState.tension,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      // Start with default character
      persistentGameState = JSON.parse(JSON.stringify(initialGameState));
      
      console.log(`[${new Date().toISOString()}] Game started with default character`);
      
      if (!persistentGameState) {
        throw new Error("Failed to initialize game state");
      }

      res.json({
        success: true,
        message: "游戏已开始！使用默认角色。",
        gameState: {
          phase: persistentGameState.phase,
          playerCharacter: persistentGameState.playerCharacter,
          timeOfDay: persistentGameState.timeOfDay,
          tension: persistentGameState.tension,
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
    const result = (await graph.invoke({
      messages: initialMessages,
      gameState: persistentGameState,
    })) as unknown as GraphState;

    // Update the persistent state with the result
    persistentGameState = result.gameState as GameState;

    // Extract the keeper's response (last AI message)
    const agentMessages = (result.messages as BaseMessage[]).filter(
      (msg: any) => msg._getType && msg._getType() === "ai"
    );
    const lastResponse = agentMessages.length > 0 
      ? agentMessages[agentMessages.length - 1].content 
      : "No response generated.";

    console.log(`[${new Date().toISOString()}] Keeper response generated`);

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
