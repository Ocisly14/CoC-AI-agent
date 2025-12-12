# Orchestrator Agent

Central coordinator and router for all game activities.

## Responsibilities

- Receives player input and determines which agent(s) should handle it
- Manages turn order and game state transitions
- Coordinates multi-agent responses (e.g., Keeper narration + Rule checks)
- Resolves conflicts between agents
- Maintains game session continuity
- Handles meta-commands (save, load, pause, resume)

## Core Functions

### `processPlayerInput(input: PlayerInput): Promise<OrchestratorResponse>`
Main entry point for processing player actions.

### `classifyIntent(inputText: string): Promise<PlayerIntent>`
Analyzes player input to determine intent type and required actions.

### `handleInvestigation(intent, playerId, context): Promise<OrchestratorResponse>`
Coordinates investigation actions involving Keeper narration and Rule checks.

### `handleDialogue(intent, playerId, context): Promise<OrchestratorResponse>`
Routes dialogue interactions to the Keeper for NPC responses.

### `handleAction(intent, playerId, context): Promise<OrchestratorResponse>`
Processes general player actions.

### `handleMetaCommand(intent): Promise<OrchestratorResponse>`
Handles game control commands (save, load, quit, etc.).

## Game State Management

The orchestrator maintains the central `GameState` which includes:

- **sceneId**: Current scene identifier
- **phase**: Game phase (intro | investigation | confrontation | downtime)
- **location**: Current location
- **timeOfDay**: Current time
- **pcs**: Player characters
- **npcs**: Non-player characters
- **threats**: Active threats
- **clues**: Discovered and undiscovered clues
- **openThreads**: Ongoing plot threads
- **log**: Complete event history

## Usage Example

```typescript
import { OrchestratorAgent } from './orchestrator';

// Initialize orchestrator
const orchestrator = new OrchestratorAgent('session_001');

// Set up other agents
orchestrator.setAgents({
    memory: memoryAgent,
    rule: ruleAgent,
    character: characterAgent,
    keeper: keeperAgent
});

// Process player input
const response = await orchestrator.processPlayerInput({
    playerId: 'player_001',
    text: 'I examine the ancient tome on the desk',
    timestamp: new Date()
});

console.log(response.narration);
console.log(response.rollResult);
console.log(response.revelation);
```

## State Transitions

The orchestrator manages transitions between game phases:

- **intro**: Introduction and setup
- **investigation**: Clue gathering and exploration
- **confrontation**: Combat or climactic encounters
- **downtime**: Rest and recovery between scenes

## Integration

The orchestrator coordinates with:

1. **Memory Agent**: Context retrieval and event logging
2. **Rule Agent**: Skill checks and combat resolution
3. **Character Agent**: Character state management
4. **Keeper Agent**: Narrative generation and NPC portrayal
