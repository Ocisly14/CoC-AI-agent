/**
 * Memory Agent helpers
 * This module owns state-side helpers for memory workflows.
 */
import {
  GameStateManager,
  type GameState,
  type ActionType,
  type ActionAnalysis,
} from "../../../state.js";
import { actionRules } from "../../rules/index.js";
import type { RAGEngine } from "../../../rag/engine.js";
import type { CoCDatabase } from "./database/index.js";
import type { ScenarioSnapshot } from "../models/scenarioTypes.js";

/**
 * Inject action-type-specific rules into temporary rules so downstream agents can apply them.
 */
export const injectActionTypeRules = (
  gameState: GameState,
  actionType?: ActionType
): GameState => {
  if (!actionType) return gameState;

  const ruleText = actionRules[actionType];
  if (!ruleText) return gameState;

  const manager = new GameStateManager(gameState);
  manager.addTemporaryRules({
    rules: [
      {
        title: `${actionType} rules`,
        description: ruleText,
      },
    ],
    count: 1,
  });

  return manager.getGameState() as GameState;
};

/**
 * Fetch top-N RAG slices based on the current action analysis and scenario context.
 */
export const fetchRagSlicesForAction = async (
  ragEngine: RAGEngine | undefined,
  actionAnalysis: ActionAnalysis | null,
  gameState: GameState,
  limit = 3
): Promise<string[]> => {
  if (!ragEngine || !actionAnalysis) return [];

  const queryParts = [
    actionAnalysis.character,
    actionAnalysis.actionType,
    actionAnalysis.action,
    actionAnalysis.target.intent,
    actionAnalysis.target.name ?? undefined,
  ].filter(Boolean);
  const query = queryParts.join(" ");

  const context = gameState.currentScenario
    ? `${gameState.currentScenario.name} ${gameState.currentScenario.location} ${gameState.currentScenario.description ?? ""}`
    : undefined;

  try {
    const hits = await ragEngine.search(query, context, limit);
    return hits.map(
      (hit) => `(${hit.source} #${hit.chunkIndex ?? 0}) ${hit.text.slice(0, 320)}`
    );
  } catch (error) {
    console.warn("Memory agent RAG search failed:", error);
    return [];
  }
};

/**
 * Enrich game state with action-type rules and RAG results for the memory workflow.
 */
export const enrichMemoryContext = async (
  gameState: GameState,
  actionAnalysis: ActionAnalysis | null,
  ragEngine?: RAGEngine
): Promise<GameState> => {
  // First inject the action-type rules
  const withRules = injectActionTypeRules(gameState, actionAnalysis?.actionType);

  // Then fetch RAG slices and write into temporaryInfo.ragResults
  const ragResults = await fetchRagSlicesForAction(
    ragEngine,
    actionAnalysis,
    withRules
  );

  return {
    ...withRules,
    temporaryInfo: {
      ...withRules.temporaryInfo,
      ragResults,
    },
  };
};

/**
 * Create a checkpoint: Save current scenario state to database when scenario switches.
 * This includes: scenario snapshot, all NPCs, player character, and permanent changes.
 * 
 * New: Also saves a unified checkpoint to game_checkpoints table for easy save/load.
 */
export const createScenarioCheckpoint = async (
  gameState: GameState,
  db: CoCDatabase
): Promise<void> => {
  if (!gameState.currentScenario || !db) return;

  const database = db.getDatabase();
  const currentScenario = gameState.currentScenario;

  db.transaction(() => {
    // UNIFIED CHECKPOINT: Save complete game state to single checkpoint table
    const checkpointId = `checkpoint-${currentScenario.id}-${Date.now()}`;
    const checkpointName = `${currentScenario.name}`;
    const description = `Auto-saved at ${currentScenario.location}`;
    
    db.saveCheckpoint(
      checkpointId,
      gameState.sessionId,
      checkpointName,
      gameState,
      'scene_transition',
      description
    );

    // LEGACY: Still save to normalized tables for backwards compatibility and queries
    // Determine scenarioId - infer from snapshot ID
    let scenarioId = (currentScenario as any).scenarioId;
    if (!scenarioId && currentScenario.id) {
      // Infer scenario ID from snapshot ID (e.g., "scenario-xyz-snapshot" -> "scenario-xyz")
      scenarioId = currentScenario.id.replace(/-snapshot.*$/, '');
    }
    const finalScenarioId = scenarioId || 'unknown';

    // 1. Save/Update permanent changes at scenario level
    if (currentScenario.permanentChanges && currentScenario.permanentChanges.length > 0) {
      // Check if scenario exists in scenarios table
      const existingScenario = database
        .prepare("SELECT scenario_id, permanent_changes FROM scenarios WHERE scenario_id = ?")
        .get(finalScenarioId) as any;

      if (existingScenario) {
        // Merge with existing permanent changes to avoid duplicates
        const existingChanges = existingScenario.permanent_changes 
          ? JSON.parse(existingScenario.permanent_changes) 
          : [];
        const mergedChanges = Array.from(
          new Set([...existingChanges, ...currentScenario.permanentChanges])
        );

        // Update permanent changes in scenarios table
        database
          .prepare("UPDATE scenarios SET permanent_changes = ? WHERE scenario_id = ?")
          .run(JSON.stringify(mergedChanges), finalScenarioId);
      } else {
        // Create minimal scenario record if it doesn't exist
        database
          .prepare(`
            INSERT INTO scenarios (
              scenario_id, name, description, tags, connections, permanent_changes, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            finalScenarioId,
            currentScenario.name,
            currentScenario.description || "",
            JSON.stringify([]),
            JSON.stringify([]),
            JSON.stringify(currentScenario.permanentChanges),
            JSON.stringify({
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              gameSystem: "CoC 7e",
            })
          );
      }
    }

    // 2. Save/Update the scenario snapshot (without permanent_changes - those are at scenario level)
    const snapshotStmt = database.prepare(`
      INSERT OR REPLACE INTO scenario_snapshots (
        snapshot_id, scenario_id, snapshot_name, location, description, events, exits, keeper_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    snapshotStmt.run(
      currentScenario.id,
      finalScenarioId,
      currentScenario.name,
      currentScenario.location,
      currentScenario.description,
      JSON.stringify(currentScenario.events),
      JSON.stringify(currentScenario.exits || []),
      currentScenario.keeperNotes || null
    );

    // 3. Save scenario characters (from snapshot)
    // Delete existing characters for this snapshot first
    database
      .prepare("DELETE FROM scenario_characters WHERE snapshot_id = ?")
      .run(currentScenario.id);

    if (currentScenario.characters.length > 0) {
      const charStmt = database.prepare(`
        INSERT INTO scenario_characters (
          id, snapshot_id, character_name, character_role, character_status,
          character_location, character_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const char of currentScenario.characters) {
        charStmt.run(
          char.id,
          currentScenario.id,
          char.name,
          char.role,
          char.status,
          char.location || null,
          char.notes || null
        );
      }
    }

    // 4. Save scenario clues
    database
      .prepare("DELETE FROM scenario_clues WHERE snapshot_id = ?")
      .run(currentScenario.id);

    if (currentScenario.clues.length > 0) {
      const clueStmt = database.prepare(`
        INSERT INTO scenario_clues (
          clue_id, snapshot_id, clue_text, category, difficulty,
          clue_location, discovery_method, reveals, discovered, discovery_details
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const clue of currentScenario.clues) {
        clueStmt.run(
          clue.id,
          currentScenario.id,
          clue.clueText,
          clue.category,
          clue.difficulty,
          clue.location,
          clue.discoveryMethod || null,
          JSON.stringify(clue.reveals || []),
          clue.discovered ? 1 : 0,
          clue.discoveryDetails ? JSON.stringify(clue.discoveryDetails) : null
        );
      }
    }

    // 5. Save scenario conditions
    database
      .prepare("DELETE FROM scenario_conditions WHERE snapshot_id = ?")
      .run(currentScenario.id);

    if (currentScenario.conditions.length > 0) {
      const condStmt = database.prepare(`
        INSERT INTO scenario_conditions (
          condition_id, snapshot_id, condition_type, description, mechanical_effect
        ) VALUES (?, ?, ?, ?, ?)
      `);

      for (const cond of currentScenario.conditions) {
        const condId = `${currentScenario.id}-cond-${cond.type}-${Date.now()}`;
        condStmt.run(
          condId,
          currentScenario.id,
          cond.type,
          cond.description,
          cond.mechanicalEffect || null
        );
      }
    }

    // 6. Save player character
    const playerStmt = database.prepare(`
      INSERT OR REPLACE INTO characters (
        character_id, name, attributes, status, inventory, skills, notes,
        is_npc, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    playerStmt.run(
      gameState.playerCharacter.id,
      gameState.playerCharacter.name,
      JSON.stringify(gameState.playerCharacter.attributes),
      JSON.stringify(gameState.playerCharacter.status),
      JSON.stringify(gameState.playerCharacter.inventory),
      JSON.stringify(gameState.playerCharacter.skills),
      gameState.playerCharacter.notes || null,
      0 // is_npc = false
    );

    // 7. Save all NPC characters (with full NPCProfile attributes if available)
    if (gameState.npcCharacters.length > 0) {
      const npcStmt = database.prepare(`
        INSERT OR REPLACE INTO characters (
          character_id, name, attributes, status, inventory, skills, notes,
          is_npc, occupation, age, appearance, personality, background, goals, secrets,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      for (const npc of gameState.npcCharacters) {
        // Type assertion to check if NPC has extended NPCProfile properties
        const npcWithExtras = npc as any;
        
        npcStmt.run(
          npc.id,
          npc.name,
          JSON.stringify(npc.attributes),
          JSON.stringify(npc.status),
          JSON.stringify(npc.inventory),
          JSON.stringify(npc.skills),
          npc.notes || null,
          1, // is_npc = true
          npcWithExtras.occupation || null,
          npcWithExtras.age || null,
          npcWithExtras.appearance || null,
          npcWithExtras.personality || null,
          npcWithExtras.background || null,
          npcWithExtras.goals ? JSON.stringify(npcWithExtras.goals) : null,
          npcWithExtras.secrets ? JSON.stringify(npcWithExtras.secrets) : null
        );
        
        // Save NPC clues if available
        if (npcWithExtras.clues && Array.isArray(npcWithExtras.clues)) {
          // Delete existing clues for this NPC
          database.prepare("DELETE FROM npc_clues WHERE npc_id = ?").run(npc.id);
          
          if (npcWithExtras.clues.length > 0) {
            const clueStmt = database.prepare(`
              INSERT INTO npc_clues (
                id, npc_id, clue_text, category, difficulty, revealed, related_to
              ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            for (const clue of npcWithExtras.clues) {
              clueStmt.run(
                clue.id,
                npc.id,
                clue.clueText,
                clue.category || null,
                clue.difficulty || null,
                clue.revealed ? 1 : 0,
                clue.relatedTo ? JSON.stringify(clue.relatedTo) : null
              );
            }
          }
        }
        
        // Save NPC relationships if available
        if (npcWithExtras.relationships && Array.isArray(npcWithExtras.relationships)) {
          // Delete existing relationships for this NPC
          database.prepare("DELETE FROM npc_relationships WHERE source_id = ?").run(npc.id);
          
          if (npcWithExtras.relationships.length > 0) {
            const relStmt = database.prepare(`
              INSERT INTO npc_relationships (
                id, source_id, target_id, target_name, relationship_type,
                attitude, description, history
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            for (const rel of npcWithExtras.relationships) {
              const relId = `${npc.id}-to-${rel.targetId}`;
              relStmt.run(
                relId,
                npc.id,
                rel.targetId,
                rel.targetName,
                rel.relationshipType,
                rel.attitude || 0,
                rel.description || null,
                rel.history || null
              );
            }
          }
        }
      }
    }

    // 8. Save permanent scenario changes as game events (for timeline tracking)
    if (currentScenario.permanentChanges && currentScenario.permanentChanges.length > 0) {
      const eventStmt = database.prepare(`
        INSERT INTO game_events (
          event_type, session_id, timestamp, details, location, tags
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const change of currentScenario.permanentChanges) {
        eventStmt.run(
          "scenario_change",
          gameState.sessionId,
          new Date().toISOString(),
          JSON.stringify({
            snapshotId: currentScenario.id,
            change: change,
          }),
          currentScenario.location,
          JSON.stringify(["permanent_change", "scenario", "checkpoint"])
        );
      }
    }
  });

  console.log(
    `✓ Checkpoint created: ${currentScenario.name} (${currentScenario.id})`
  );
};

/**
 * Update current scenario with automatic checkpoint creation.
 * This should be called instead of directly calling GameStateManager.updateCurrentScenario
 * to ensure the current state is persisted before switching scenarios.
 */
export const updateCurrentScenarioWithCheckpoint = async (
  manager: GameStateManager,
  scenarioData: { snapshot: ScenarioSnapshot; scenarioName: string } | null,
  db: CoCDatabase
): Promise<void> => {
  if (!scenarioData) return;

  const gameStateBefore = manager.getGameState() as GameState;

  // Create checkpoint for the current scenario before switching (if there is one)
  if (gameStateBefore.currentScenario) {
    await createScenarioCheckpoint(gameStateBefore, db);
  }

  // Now update the scenario in memory
  manager.updateCurrentScenario(scenarioData);
  
  // 设置场景转换标志，让 Keeper Agent 知道发生了场景变化
  manager.setTransitionFlag(true);
};

/**
 * Manually save a checkpoint with custom name
 */
export const saveManualCheckpoint = (
  gameState: GameState,
  db: CoCDatabase,
  checkpointName: string,
  description?: string
): string => {
  const checkpointId = `manual-${Date.now()}`;
  
  db.saveCheckpoint(
    checkpointId,
    gameState.sessionId,
    checkpointName,
    gameState,
    'manual',
    description
  );

  console.log(`✓ Manual checkpoint saved: "${checkpointName}" (ID: ${checkpointId})`);
  return checkpointId;
};

/**
 * Load a checkpoint and restore game state
 */
export const loadCheckpoint = (
  checkpointId: string,
  db: CoCDatabase
): GameState | null => {
  const checkpoint = db.loadCheckpoint(checkpointId);
  
  if (!checkpoint) {
    console.error(`Checkpoint not found: ${checkpointId}`);
    return null;
  }

  console.log(`✓ Loaded checkpoint: "${checkpoint.checkpointName}" from ${checkpoint.metadata.createdAt}`);
  return checkpoint.gameState as GameState;
};

/**
 * List all available checkpoints for current session
 */
export const listAvailableCheckpoints = (
  sessionId: string,
  db: CoCDatabase,
  limit = 20
): any[] => {
  return db.listCheckpoints(sessionId, limit);
};
