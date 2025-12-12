# Call of Cthulhu Multi-Agent System - Building Instructions

## System Overview

A multi-agent system for running Call of Cthulhu tabletop RPG sessions, consisting of five specialized agents coordinated by an orchestrator.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR AGENT                       │
│  (Coordinates all agents, manages game flow, routes requests)│
└───────┬─────────────────────────────────────────────────────┘
        │
        ├──────────┬──────────┬──────────┬──────────┐
        │          │          │          │          │
        ▼          ▼          ▼          ▼          ▼
   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
   │ RULE   │ │CHARACTER│ │ KEEPER │ │ MEMORY │ │        │
   │ AGENT  │ │ AGENT  │ │ AGENT  │ │  /LOG  │ │ PLAYER │
   │        │ │        │ │        │ │ AGENT  │ │ AGENTS │
   └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
```

## Agent Specifications

### 1. Orchestrator Agent

**Role:** Central coordinator and router for all game activities

**Responsibilities:**
- Receives player input and determines which agent(s) should handle it
- Manages turn order and game state transitions
- Coordinates multi-agent responses (e.g., Keeper narration + Rule checks)
- Resolves conflicts between agents
- Maintains game session continuity
- Handles meta-commands (save, load, pause, resume)

**Core Functions:**
```
- route_request(input, context) -> agent_name
- coordinate_response(agents[]) -> unified_response
- manage_game_state(action) -> state
- handle_meta_command(command) -> result
```

**Implementation Requirements:**
- Decision tree or LLM-based routing logic
- State machine for game phases (investigation, combat, social, rest)
- Priority queue for handling simultaneous events
- Session persistence layer

---

### 2. Rule Agent

**Role:** Rule arbitration and mechanics resolution

**Responsibilities:**
- Interprets and applies Call of Cthulhu rules (7th edition recommended)
- Performs dice rolls and calculates results
- Manages skill checks, combat resolution, sanity checks
- Tracks character stats, skills, and conditions
- Enforces game balance and rule consistency
- Provides rule clarifications when needed

**Core Functions:**
```
- skill_check(skill_name, difficulty, modifiers) -> result
- combat_resolution(attacker, defender, action) -> outcome
- sanity_check(trigger, intensity) -> sanity_loss
- calculate_damage(weapon, success_level) -> damage
- apply_status_effect(character, effect) -> updated_character
- lookup_rule(query) -> rule_explanation
```

**Knowledge Base:**
- Complete CoC 7th edition rulebook
- Common house rules
- Quick reference tables (skills, weapons, spells, creatures)
- Dice probability calculations

**Implementation Requirements:**
- Rules database (JSON/SQL)
- Dice rolling system with configurable randomness
- Combat tracker with initiative management
- Condition/status effect system

---

### 3. Character Agent

**Role:** Player character management and representation

**Responsibilities:**
- Maintains detailed character sheets for all investigators
- Tracks inventory, equipment, and resources
- Manages character progression (experience, skill improvements)
- Handles character backgrounds and motivations
- Assists players with character decisions
- Enforces character limitations and capabilities

**Core Functions:**
```
- create_character(template, customizations) -> character
- update_stats(character_id, stat_changes) -> updated_character
- check_inventory(character_id, item) -> has_item
- add_experience(character_id, amount) -> new_total
- apply_injury(character_id, injury) -> updated_health
- get_character_knowledge(character_id, topic) -> knowledge_level
- suggest_action(character_id, situation) -> suggestions[]
```

**Data Management:**
- Character sheet templates
- Skill progression tracking
- Equipment database
- Character relationship graphs
- Background story storage

**Implementation Requirements:**
- Character database (one per investigator)
- Version control for character changes
- Backup/snapshot system for character states
- Character validation against rules

---

### 4. Keeper Agent

**Role:** Narrative director and world master

**Responsibilities:**
- Creates and narrates atmospheric descriptions
- Portrays NPCs with distinct personalities and voices
- Designs and runs investigation scenarios
- Manages clues, secrets, and revelations
- Controls monsters and antagonists
- Builds tension and pacing
- Improvises in response to player choices

**Core Functions:**
```
- narrate_scene(location, context, mood) -> description
- portray_npc(npc_id, dialogue, emotion) -> response
- reveal_clue(clue_id, discovery_method) -> clue_description
- escalate_tension(current_level) -> horror_event
- generate_mystery(theme, difficulty) -> scenario
- improvise_response(player_action, context) -> outcome
```

**Creative Resources:**
- Scene templates (locations, atmospheres, encounters)
- NPC personality matrices
- Clue delivery mechanisms
- Horror escalation patterns
- Mythos creature behavior profiles
- Random encounter tables

**Implementation Requirements:**
- Natural language generation for descriptions
- Emotional tone control
- NPC dialogue system with personality traits
- Pacing algorithm (tension curve management)
- Scenario builder with branching paths

---

### 5. Memory/Log Agent

**Role:** Session historian and context manager

**Responsibilities:**
- Records all game events chronologically
- Maintains searchable game history
- Tracks discovered clues and information
- Manages NPC relationships and faction standings
- Provides context for decision-making
- Generates session summaries
- Handles long-term campaign continuity

**Core Functions:**
```
- log_event(event_type, details, timestamp) -> log_id
- query_history(query, filters) -> relevant_events[]
- get_session_summary(session_id) -> summary
- track_relationship(character_id, npc_id, change) -> new_status
- record_discovery(clue_id, discoverer, method) -> logged_clue
- get_campaign_timeline() -> timeline
- search_logs(keyword) -> matching_entries[]
```

**Data Structure:**
```json
{
  "session_id": "string",
  "timestamp": "ISO8601",
  "event_type": "narration|action|roll|combat|dialogue|discovery",
  "participants": ["character_ids"],
  "content": "event details",
  "game_state_snapshot": {},
  "tags": ["keywords"],
  "importance": 1-10
}
```

**Implementation Requirements:**
- Time-series database or structured logging system
- Full-text search capability
- Automatic summarization (LLM-based)
- Relationship graph database
- Export functionality (PDF, HTML, JSON)

---

## System Integration Flow

### Example: Player Declares Action

```
1. PLAYER: "I want to examine the ancient tome on the desk"

2. ORCHESTRATOR receives input
   - Identifies action type: investigation
   - Routes to relevant agents

3. KEEPER AGENT generates description
   - "The leather-bound volume is covered in strange symbols..."

4. RULE AGENT determines check needed
   - Library Use skill check required
   - Difficulty: Regular

5. CHARACTER AGENT provides character context
   - Character's Library Use: 45%
   - Relevant background: Antiquarian

6. ORCHESTRATOR coordinates roll
   - Roll: 33 (success)

7. KEEPER AGENT reveals information
   - "You recognize the symbols as R'lyehian script..."

8. MEMORY AGENT logs everything
   - Player action, roll result, clue discovery
   - Updates character's known information

9. ORCHESTRATOR presents unified response to player
```

---

## Building Instructions

### Phase 1: Foundation (Weeks 1-2)

**Step 1: Environment Setup**
```bash
# Create project structure
mkdir coc-multi-agent-system
cd coc-multi-agent-system
mkdir -p agents/{orchestrator,rule,character,keeper,memory}
mkdir -p shared/{models,utils,data}
mkdir -p data/{rules,characters,scenarios,logs}
mkdir tests
```

**Step 2: Choose Tech Stack**

**Recommended Stack:**
- **Framework**: ElizaOS (based on your existing setup) or LangGraph
- **LLM**: OpenAI GPT-4, Anthropic Claude, or Google Gemini
- **Database**: PostgreSQL (relational) + Vector DB (RAG)
- **State Management**: Redis or in-memory store
- **API Layer**: FastAPI or Express.js

**Step 3: Define Agent Interfaces**
```python
# shared/models/agent_base.py
class Agent:
    def __init__(self, name, llm, knowledge_base):
        self.name = name
        self.llm = llm
        self.knowledge_base = knowledge_base

    async def process(self, input_data, context):
        """Each agent implements this method"""
        pass

    async def get_prompt(self, input_data, context):
        """Generate agent-specific prompt"""
        pass
```

---

### Phase 2: Individual Agent Development (Weeks 3-6)

**Build Order:**
1. **Memory Agent** (Foundation)
2. **Rule Agent** (Core mechanics)
3. **Character Agent** (Depends on Rule Agent)
4. **Keeper Agent** (Creative layer)
5. **Orchestrator** (Integration layer)

#### Building the Memory Agent

```python
# agents/memory/memory_agent.py

class MemoryAgent(Agent):
    def __init__(self):
        super().__init__("Memory", llm, vector_db)
        self.event_log = []
        self.relationships = {}
        self.clues = {}

    async def log_event(self, event):
        self.event_log.append({
            "timestamp": datetime.now(),
            "type": event.type,
            "content": event.content,
            "participants": event.participants
        })
        # Store in vector DB for semantic search
        await self.vector_db.store(event)

    async def query_history(self, query, limit=10):
        # Semantic search through history
        results = await self.vector_db.similarity_search(query, limit)
        return results

    async def get_context(self, depth="recent"):
        # Returns relevant context for other agents
        if depth == "recent":
            return self.event_log[-10:]
        elif depth == "session":
            return self.get_session_summary()
        elif depth == "campaign":
            return self.get_campaign_summary()
```

**Data Schema:**
```sql
-- PostgreSQL schema for memory storage
CREATE TABLE game_sessions (
    id UUID PRIMARY KEY,
    campaign_id UUID,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    summary TEXT
);

CREATE TABLE events (
    id UUID PRIMARY KEY,
    session_id UUID REFERENCES game_sessions(id),
    timestamp TIMESTAMP,
    event_type VARCHAR(50),
    content JSONB,
    importance INTEGER,
    tags TEXT[]
);

CREATE TABLE clues (
    id UUID PRIMARY KEY,
    session_id UUID,
    description TEXT,
    discovered_by UUID,
    discovered_at TIMESTAMP,
    related_mystery UUID
);
```

---

#### Building the Rule Agent

```python
# agents/rule/rule_agent.py

class RuleAgent(Agent):
    def __init__(self):
        super().__init__("Rule", llm, rules_db)
        self.load_rules()

    def load_rules(self):
        # Load CoC 7e rules
        with open('data/rules/coc7e_rules.json') as f:
            self.rules = json.load(f)

    async def skill_check(self, skill_name, base_value, difficulty, modifiers=0):
        """
        Performs a skill check
        Returns: {success: bool, roll: int, critical: bool, fumble: bool}
        """
        adjusted_value = base_value + modifiers

        # Apply difficulty
        target = adjusted_value
        if difficulty == "hard":
            target = adjusted_value // 2
        elif difficulty == "extreme":
            target = adjusted_value // 5

        roll = random.randint(1, 100)

        # Determine outcome
        success = roll <= target
        critical = roll <= 5
        fumble = roll >= 96

        return {
            "success": success,
            "roll": roll,
            "target": target,
            "critical": critical,
            "fumble": fumble,
            "description": self.format_result(success, critical, fumble)
        }

    async def combat_roll(self, attacker, defender, action_type):
        # Implement combat resolution
        pass

    async def sanity_check(self, character, trigger, intensity):
        # Calculate sanity loss
        pass
```

**Rules Database Structure:**
```json
{
  "skills": {
    "Spot Hidden": {
      "base_value": 25,
      "description": "Finding hidden objects and clues",
      "uncommon": false
    }
  },
  "combat": {
    "melee": {
      "unarmed": {"damage": "1d3", "range": "touch"}
    }
  },
  "sanity": {
    "triggers": {
      "corpse": {"loss": "0/1d3"},
      "elder_god": {"loss": "1d10/1d100"}
    }
  }
}
```

---

#### Building the Character Agent

```python
# agents/character/character_agent.py

class CharacterAgent(Agent):
    def __init__(self):
        super().__init__("Character", llm, character_db)
        self.active_characters = {}

    async def load_character(self, character_id):
        character = await self.db.get_character(character_id)
        self.active_characters[character_id] = character
        return character

    async def update_stat(self, character_id, stat, value):
        char = self.active_characters[character_id]
        char.stats[stat] = value
        await self.db.save_character(char)

    async def get_available_actions(self, character_id, context):
        """
        Returns list of actions character can take based on:
        - Current skills
        - Available equipment
        - Physical/mental state
        - Context
        """
        char = self.active_characters[character_id]
        actions = []

        # Skills-based actions
        for skill, value in char.skills.items():
            if value >= 30:  # Competent threshold
                actions.append(f"Use {skill}")

        # Equipment-based actions
        for item in char.inventory:
            actions.append(f"Use {item}")

        return actions
```

**Character Data Model:**
```python
# shared/models/character.py

@dataclass
class Character:
    id: str
    name: str
    occupation: str
    age: int

    # Characteristics
    STR: int  # Strength
    CON: int  # Constitution
    SIZ: int  # Size
    DEX: int  # Dexterity
    APP: int  # Appearance
    INT: int  # Intelligence
    POW: int  # Power
    EDU: int  # Education

    # Derived attributes
    hp: int
    mp: int  # Magic Points
    sanity: int
    luck: int

    # Skills
    skills: Dict[str, int]

    # Inventory
    inventory: List[str]
    weapons: List[Weapon]

    # Status
    injuries: List[str]
    conditions: List[str]

    # Background
    backstory: str
    connections: List[str]
```

---

#### Building the Keeper Agent

```python
# agents/keeper/keeper_agent.py

class KeeperAgent(Agent):
    def __init__(self):
        super().__init__("Keeper", llm, scenario_db)
        self.current_scene = None
        self.tension_level = 0
        self.npcs = {}

    async def narrate_scene(self, location, context, mood="neutral"):
        """
        Generates atmospheric narration
        """
        prompt = f"""
        As the Keeper of a Call of Cthulhu game, describe the following scene:

        Location: {location}
        Context: {context}
        Mood: {mood}
        Tension Level: {self.tension_level}/10

        Create a vivid, atmospheric description that:
        1. Engages the senses (sight, sound, smell)
        2. Hints at unease without revealing everything
        3. Provides actionable details for investigation
        4. Matches the {mood} tone

        Keep it concise (2-3 paragraphs).
        """

        narration = await self.llm.generate(prompt)
        return narration

    async def portray_npc(self, npc_id, player_input, context):
        """
        Generates NPC dialogue and behavior
        """
        npc = self.npcs[npc_id]

        prompt = f"""
        You are portraying {npc.name}, a {npc.description}.

        Personality: {npc.personality}
        Current emotional state: {npc.emotion}
        Secret knowledge: {npc.secrets}

        The player says: "{player_input}"

        Respond as this NPC would, considering:
        - Their personality and motivations
        - What they know vs. what they're willing to share
        - Their relationship with the investigators

        Response:
        """

        response = await self.llm.generate(prompt)
        return response

    async def generate_clue(self, clue_type, difficulty, context):
        # Dynamically generate investigation clues
        pass

    async def escalate_horror(self):
        # Increase tension through events
        self.tension_level += 1
        return self.get_horror_event(self.tension_level)
```

**NPC Data Model:**
```python
@dataclass
class NPC:
    id: str
    name: str
    description: str
    personality: str  # "nervous", "aggressive", "helpful", etc.
    occupation: str
    secrets: List[str]
    knowledge: Dict[str, str]
    relationship_to_pcs: Dict[str, int]  # character_id -> relationship_score
    current_emotion: str
    location: str
```

---

#### Building the Orchestrator

```python
# agents/orchestrator/orchestrator.py

class Orchestrator:
    def __init__(self):
        self.memory_agent = MemoryAgent()
        self.rule_agent = RuleAgent()
        self.character_agent = CharacterAgent()
        self.keeper_agent = KeeperAgent()

        self.game_state = GameState()
        self.current_phase = "investigation"  # investigation, combat, social, rest

    async def process_player_input(self, player_id, input_text):
        """
        Main entry point for player actions
        """
        # 1. Parse intent
        intent = await self.classify_intent(input_text)

        # 2. Get relevant context
        context = await self.memory_agent.get_context("recent")
        character = await self.character_agent.load_character(player_id)

        # 3. Route to appropriate agents
        if intent.type == "action":
            response = await self.handle_action(intent, character, context)
        elif intent.type == "dialogue":
            response = await self.handle_dialogue(intent, character, context)
        elif intent.type == "investigation":
            response = await self.handle_investigation(intent, character, context)
        elif intent.type == "meta":
            response = await self.handle_meta_command(intent)

        # 4. Log everything
        await self.memory_agent.log_event({
            "type": intent.type,
            "player": player_id,
            "input": input_text,
            "response": response
        })

        return response

    async def handle_investigation(self, intent, character, context):
        """
        Coordinate investigation actions
        """
        # 1. Keeper narrates what the character can attempt
        scene_description = await self.keeper_agent.narrate_scene(
            location=self.game_state.current_location,
            context=context,
            mood="mysterious"
        )

        # 2. Determine if skill check is needed
        skill_check_needed = intent.requires_skill_check

        if skill_check_needed:
            # 3. Rule agent performs check
            result = await self.rule_agent.skill_check(
                skill_name=intent.skill,
                base_value=character.skills[intent.skill],
                difficulty=intent.difficulty
            )

            # 4. Keeper reveals results based on success
            if result["success"]:
                revelation = await self.keeper_agent.reveal_clue(
                    clue_id=intent.target_clue,
                    discovery_method=intent.skill
                )
            else:
                revelation = "You don't find anything significant."

            return {
                "narration": scene_description,
                "roll_result": result,
                "revelation": revelation
            }
        else:
            return {"narration": scene_description}

    async def classify_intent(self, input_text):
        """
        Uses LLM to understand player intent
        """
        prompt = f"""
        Classify the following player input into an intent structure:

        Input: "{input_text}"

        Return JSON with:
        {{
            "type": "action|dialogue|investigation|meta",
            "skill": "relevant skill name or null",
            "target": "target of action",
            "difficulty": "regular|hard|extreme",
            "requires_skill_check": boolean
        }}
        """

        intent = await self.llm.generate_structured(prompt)
        return intent
```

---

### Phase 3: Integration & Testing (Weeks 7-8)

#### Integration Steps

1. **Create Communication Protocol**
```python
# shared/utils/message_bus.py

class MessageBus:
    def __init__(self):
        self.subscribers = {}

    def subscribe(self, event_type, handler):
        if event_type not in self.subscribers:
            self.subscribers[event_type] = []
        self.subscribers[event_type].append(handler)

    async def publish(self, event_type, data):
        if event_type in self.subscribers:
            for handler in self.subscribers[event_type]:
                await handler(data)
```

2. **Create Game Loop**
```python
# main.py

async def game_loop():
    orchestrator = Orchestrator()

    while orchestrator.game_state.active:
        # Get player input
        player_input = await get_player_input()

        # Process through orchestrator
        response = await orchestrator.process_player_input(
            player_id=player_input.player_id,
            input_text=player_input.text
        )

        # Display response
        await display_response(response)

        # Check for game state changes
        if orchestrator.check_scenario_complete():
            await orchestrator.end_session()
```

3. **Testing Strategy**

**Unit Tests:**
```python
# tests/test_rule_agent.py

def test_skill_check_success():
    rule_agent = RuleAgent()
    result = rule_agent.skill_check("Spot Hidden", 50, "regular")
    assert "success" in result
    assert result["roll"] <= 100

def test_combat_resolution():
    # Test combat mechanics
    pass
```

**Integration Tests:**
```python
# tests/test_orchestrator.py

async def test_investigation_flow():
    orchestrator = Orchestrator()

    # Simulate player investigating
    response = await orchestrator.process_player_input(
        player_id="test_player",
        input_text="I examine the bookshelf carefully"
    )

    assert "narration" in response
    assert "roll_result" in response
```

**Scenario Tests:**
Run complete mini-scenarios to test agent coordination

---

### Phase 4: Enhancement & Deployment (Weeks 9-10)

#### Add Advanced Features

1. **Voice Integration** (Optional)
   - Text-to-speech for Keeper narration
   - Speech-to-text for player input

2. **Image Generation** (Optional)
   - Generate scene illustrations
   - Create NPC portraits

3. **Dice Rolling Interface**
   - Visual dice rolling
   - Roll history

4. **Character Sheet UI**
   - Interactive character sheets
   - Inventory management

#### Deployment Options

**Option 1: Local Deployment**
```bash
# Docker Compose setup
docker-compose up -d
```

**Option 2: Web Service**
- Deploy on AWS/GCP/Azure
- WebSocket for real-time gameplay
- Web UI for players

**Option 3: Discord Bot**
- Integrate with Discord API
- Each agent as a bot command
- Persistent campaigns per server

---

## Configuration Files

### orchestrator_config.json
```json
{
  "agents": {
    "memory": {
      "enabled": true,
      "log_level": "detailed",
      "retention_days": 365
    },
    "rule": {
      "enabled": true,
      "edition": "7e",
      "house_rules": true,
      "auto_roll": false
    },
    "character": {
      "enabled": true,
      "auto_save": true,
      "backup_frequency": "per_session"
    },
    "keeper": {
      "enabled": true,
      "narrative_style": "atmospheric",
      "horror_intensity": "moderate"
    }
  },
  "game_settings": {
    "dice_visibility": "all",
    "turn_based": false,
    "auto_advance": true
  }
}
```

---

## Performance Considerations

1. **LLM Call Optimization**
   - Batch non-urgent requests
   - Cache common responses
   - Use smaller models for simple tasks (e.g., intent classification)

2. **Database Optimization**
   - Index frequently queried fields
   - Implement caching layer (Redis)
   - Archive old sessions

3. **Concurrent Processing**
   - Use async/await throughout
   - Parallel agent queries when possible
   - Queue system for long-running operations

---

## Future Enhancements

1. **AI Dungeon Master Toolkit**
   - Procedural scenario generation
   - Dynamic NPC creation
   - Adaptive difficulty

2. **Multi-Campaign Support**
   - Campaign templates
   - Shared universe features
   - Cross-campaign references

3. **Player Analytics**
   - Play style analysis
   - Personalized recommendations
   - Achievement system

4. **Collaborative Storytelling**
   - Player contribution to lore
   - Community scenarios
   - Shared NPC pools

---

## Troubleshooting Guide

### Common Issues

**Issue: Agents providing conflicting information**
- Solution: Implement conflict resolution in orchestrator
- Add agent priority system

**Issue: Slow response times**
- Solution: Implement response time budgets
- Use streaming responses
- Parallelize independent operations

**Issue: Loss of context in long sessions**
- Solution: Implement hierarchical summarization
- Use sliding window context
- Periodic context refresh

---

## Resources

### Call of Cthulhu References
- Official 7th Edition Rulebook
- Keeper's Guide
- Investigator Handbook
- Scenario packs

### Technical Resources
- LangChain documentation
- ElizaOS documentation
- Vector database guides (Pinecone, Weaviate)
- Discord Bot API

### Community
- CoC Discord servers
- Reddit r/callofcthulhu
- RPG AI development forums

---

## License & Credits

This system design is released under MIT License.

Credits:
- Call of Cthulhu © Chaosium Inc.
- System design by [Your Name]
- Built with ElizaOS framework

---

**Next Steps:**
1. Review this document thoroughly
2. Set up development environment
3. Begin with Memory Agent implementation
4. Test each agent independently before integration
5. Run test scenarios
6. Deploy and iterate based on actual gameplay

Good luck, Keeper! May your investigators survive their encounters with the unknown... or at least die memorably.
