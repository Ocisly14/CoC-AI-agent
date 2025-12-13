import "dotenv/config";
import fs from "fs";
import path from "path";
import { AIMessage } from "@langchain/core/messages";
import type { Messages } from "@langchain/core/messages";
import {
  CoCDatabase,
  seedDatabase,
} from "./coc_multiagents_system/agents/memory/database/index.js";
import { NPCLoader } from "./coc_multiagents_system/agents/character/npcloader/index.js";
import { ModuleLoader } from "./coc_multiagents_system/agents/memory/moduleloader/index.js";
import { ScenarioLoader } from "./coc_multiagents_system/agents/memory/scenarioloader/index.js";
import { buildGraph } from "./graph.js";
import { initialGameState } from "./state.js";
import { RAGEngine } from "./rag/engine.js";

// Initialize database
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new CoCDatabase();
seedDatabase(db);

// Initialize NPC directory
const npcDir = path.join(process.cwd(), "data", "npcs");
if (!fs.existsSync(npcDir)) {
  fs.mkdirSync(npcDir, { recursive: true });
  console.log(`Created NPC directory: ${npcDir}`);
  console.log(
    `Place your NPC .docx or .pdf files in this directory to load them automatically.\n`
  );
}

// Load NPCs from documents
const npcLoader = new NPCLoader(db);
await npcLoader.loadNPCsFromDirectory(npcDir);

// Initialize module background directory
const moduleDir = path.join(process.cwd(), "data", "background");
if (!fs.existsSync(moduleDir)) {
  fs.mkdirSync(moduleDir, { recursive: true });
  console.log(`Created module background directory: ${moduleDir}`);
  console.log(
    `Place your module .docx or .pdf files in this directory to load background/outlines automatically.\n`
  );
}

// Load module briefings from documents
const moduleLoader = new ModuleLoader(db);
await moduleLoader.loadModulesFromDirectory(moduleDir);

// Initialize scenario directory
const scenarioDir = path.join(process.cwd(), "data", "scenarios");
if (!fs.existsSync(scenarioDir)) {
  fs.mkdirSync(scenarioDir, { recursive: true });
  console.log(`Created scenario directory: ${scenarioDir}`);
  console.log(
    `Place your scenario .docx or .pdf files in this directory to load them automatically.\n`
  );
}

// Load scenarios from documents
const scenarioLoader = new ScenarioLoader(db);
await scenarioLoader.loadScenariosFromDirectory(scenarioDir);

// Initialize RAG knowledge directory
const knowledgeDir = path.join(process.cwd(), "data", "knowledge");
if (!fs.existsSync(knowledgeDir)) {
  fs.mkdirSync(knowledgeDir, { recursive: true });
  console.log(`Created knowledge directory: ${knowledgeDir}`);
}
const ragEngine = new RAGEngine(db, knowledgeDir);
await ragEngine.ingestFromDirectory();

const parseArgs = (argv: string[]): string => {
  const promptFlagIndex = argv.findIndex((arg) => arg === "--prompt");
  if (promptFlagIndex !== -1 && argv[promptFlagIndex + 1]) {
    return argv[promptFlagIndex + 1];
  }

  const joined = argv.slice(2).join(" ").trim();
  return joined || "I cautiously examine the dusty study for clues.";
};

const printTranscript = (messages: AIMessage[]) => {
  for (const message of messages) {
    const label = message.name ? `[${message.name}]` : "[agent]";
    const content =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content, null, 2);
    console.log(`${label} ${content}\n`);
  }
};

const main = async () => {
  const userPrompt = parseArgs(process.argv);
  const app = buildGraph(db, ragEngine);

  const initialMessages: Messages = [{ type: "human", content: userPrompt }];

  const result = await app.invoke({
    messages: initialMessages,
    agentQueue: [],
    gameState: initialGameState,
  });

  const agentMessages = result.messages.filter(
    (message: any): message is AIMessage => message instanceof AIMessage
  );

  printTranscript(agentMessages);

  // Close database connection
  db.close();
};

main().catch((error) => {
  console.error("Error running graph:", error);
  process.exit(1);
});
