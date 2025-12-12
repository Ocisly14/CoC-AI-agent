import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import express from "express";
import { MemoryAgent } from "../src/coc_multiagents_system/agents/memory/memoryAgent.js";
import {
  CoCDatabase,
  seedDatabase,
} from "../src/coc_multiagents_system/agents/memory/database/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new CoCDatabase();

// Seed database with initial data (skills, weapons, rules, etc.)
seedDatabase(db);

const memoryAgent = new MemoryAgent(db);

// Create a default session
const SESSION_ID = "chat-session-" + new Date().toISOString().split("T")[0];
memoryAgent.createSession(SESSION_ID, "Web chat session");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// API endpoint to save user message
app.post("/api/message", (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    // Save message to memory using MemoryAgent
    const eventId = memoryAgent.logEvent({
      eventType: "dialogue",
      sessionId: SESSION_ID,
      timestamp: new Date(),
      details: {
        type: "user_message",
        content: message,
      },
      tags: ["user", "chat"],
    });

    res.json({
      success: true,
      eventId,
      timestamp: new Date().toISOString(),
      message: "Message saved to memory",
    });
  } catch (error) {
    console.error("Error saving message:", error);
    res.status(500).json({ error: "Failed to save message" });
  }
});

// API endpoint to get message history
app.get("/api/messages", (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit as string) || 50;

    const events = memoryAgent.queryHistory({
      sessionId: SESSION_ID,
      eventType: "dialogue",
      limit,
    });

    res.json({
      success: true,
      messages: events.map((event) => ({
        id: event.id,
        content: event.details.content,
        timestamp: event.timestamp,
        type: event.details.type,
      })),
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Session ID: ${SESSION_ID}`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down gracefully...");
  db.close();
  process.exit(0);
});
