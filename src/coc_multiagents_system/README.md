# Call of Cthulhu Multi-Agent System

A multi-agent system for running Call of Cthulhu tabletop RPG sessions.

## Architecture

```
coc_multiagents_system/
├── agents/                 # Individual agent implementations
│   ├── orchestrator/      # Central coordinator and router
│   ├── rule/             # Rule arbitration and mechanics
│   ├── character/        # Character management
│   ├── keeper/           # Narrative director
│   └── memory/           # Session historian and context
├── shared/               # Shared resources
│   ├── models/          # Type definitions and data models
│   ├── utils/           # Utility functions
│   └── data/            # Shared data structures
├── data/                # Game data
│   ├── rules/          # CoC rules database
│   ├── characters/     # Character sheets
│   ├── scenarios/      # Game scenarios
│   └── logs/           # Game session logs
└── tests/              # Test files
```

## Agent Overview

### 1. Orchestrator Agent
Central coordinator that routes requests and manages game flow.

### 2. Rule Agent
Handles all game mechanics, dice rolls, and rule arbitration.

### 3. Character Agent
Manages player characters, inventory, and progression.

### 4. Keeper Agent
Creates narrative, portrays NPCs, and builds atmosphere.

### 5. Memory Agent
Records game history and provides context.

## Development Status

- [x] Folder structure created
- [ ] Base type definitions
- [ ] Individual agent implementations
- [ ] Integration layer
- [ ] Testing suite
