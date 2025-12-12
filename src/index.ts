import "dotenv/config";
import fs from "fs";
import path from "path";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import {
  CoCDatabase,
  seedDatabase,
} from "./coc_multiagents_system/shared/database/index.js";
import { NPCLoader } from "./coc_multiagents_system/shared/npc/index.js";
import { buildGraph } from "./graph.js";
import { initialGameState } from "./state.js";

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
  const app = buildGraph(db);

  const result = await app.invoke({
    messages: [new HumanMessage(userPrompt)],
    agentQueue: [],
    gameState: initialGameState,
  });

  const agentMessages = result.messages.filter(
    (message): message is AIMessage => message instanceof AIMessage
  );

  printTranscript(agentMessages);

  // Close database connection
  db.close();
};

main().catch((error) => {
  console.error("Error running graph:", error);
  process.exit(1);
});
