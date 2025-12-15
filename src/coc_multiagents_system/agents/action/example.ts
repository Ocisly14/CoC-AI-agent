/**
 * Action Agent Templates for Different Action Types
 * Each template can be injected based on the specific action type
 */

export const explorationTemplate = `
EXPLORATION ACTIONS - Discovering clues, understanding environment, gathering information:

TIME CONSUMPTION ANALYSIS:
- "instant": Quick glance at obvious clues, overview of room, checking exposed items, confirming environment
- "short": Quick search of desk/drawers, listening at door, checking locks/windows, rough search of corner
- "scene": Thorough search of house, investigating crime scene, systematic area investigation, reading documents

{
  "type": "result",
  "summary": "Detective Smith carefully searches the library shelves and discovers a hidden compartment containing an ancient tome",
  "timeConsumption": "short",
  "stateUpdate": {
    "playerCharacter": {
      "name": "Detective Smith",
      "status": { "hp": 0 }
    }
  },
  "scenarioUpdate": {
    "description": "The library now shows signs of thorough searching, with books displaced and the hidden compartment revealed",
    "events": ["Hidden compartment discovered behind the bookshelf"],
    "clues": [
      {
        "id": "ancient-tome",
        "discovered": true,
        "discoveredBy": "Detective Smith",
        "discoveredAt": "current time"
      }
    ]
  },
  "log": ["Spot Hidden 45% vs roll 23 = success", "Hidden compartment discovered"]
}`;

export const socialTemplate = `
SOCIAL ACTIONS - Influencing NPCs, gathering intelligence, reaching consensus:

TIME CONSUMPTION ANALYSIS:
- "instant": Nod/brief response, casual question, simple yes/no answer
- "short": Probing questions, interjecting/arguing, observing reactions, simple threats/reassurance
- "scene": Formal conversation/interrogation, multi-round persuasion, building/breaking trust, changing NPC stance

{
  "type": "result",
  "summary": "Detective Smith successfully persuades the librarian to reveal information about the missing books",
  "timeConsumption": "short",
  "stateUpdate": {
    "playerCharacter": {
      "name": "Detective Smith",
      "status": { "hp": 0 }
    },
    "npcCharacters": [
      {
        "id": "librarian-1",
        "name": "Old Librarian",
        "status": { "hp": 0 }
      }
    ]
  },
  "log": ["Persuade 60% vs roll 45 = success", "Librarian becomes helpful"]
}`;

export const stealthTemplate = `
STEALTH ACTIONS - Acting without being detected:

TIME CONSUMPTION ANALYSIS:
- "instant": Hiding in place motionless, pause action to observe
- "short": Short distance stealth, duck behind cover, peek around corner, quick lock picking attempt
- "scene": Infiltrating building, bypassing complete guard system, long surveillance, stealing key items

{
  "type": "result",
  "summary": "Detective Smith silently moves through the shadows but accidentally knocks over a candlestick, alerting the cultist",
  "timeConsumption": "short",
  "stateUpdate": {
    "playerCharacter": {
      "name": "Detective Smith",
      "status": { "hp": 0 }
    }
  },
  "log": ["Stealth 35% vs roll 67 = failure", "Noise alerts enemies"]
}`;

export const combatTemplate = `
COMBAT ACTIONS - Causing damage, subduing or stopping opponents:

TIME CONSUMPTION ANALYSIS:
⚠️ Combat generally does NOT use scene time
- "instant": Say a word, drop items, change stance description (not tactical movement)
- "short": Attack, dodge, reload, get up/help others (= round actions)
- "scene": ❌ Generally not applicable ✔ Post-combat "battlefield cleanup/stabilize situation"

{
  "type": "result",
  "summary": "Detective Smith successfully punches the cultist, dealing significant damage and stunning the opponent",
  "timeConsumption": "short",
  "stateUpdate": {
    "playerCharacter": {
      "name": "Detective Smith",
      "status": { "hp": 0 }
    },
    "npcCharacters": [
      {
        "id": "cultist-1",
        "name": "Hooded Cultist",
        "status": { "hp": -4 }
      }
    ]
  },
  "scenarioUpdate": {
    "description": "The library shows signs of violent struggle, with overturned furniture and blood stains on the floor",
    "events": ["Combat occurred between Detective Smith and the cultist"],
    "conditions": [
      {
        "type": "other",
        "description": "Signs of struggle",
        "mechanicalEffect": "Investigation checks in this area get +10% bonus"
      }
    ]
  },
  "log": ["Fighting (Brawl) 50% vs roll 32 = success", "Damage 1d3+1 = 4", "Cultist HP: -4"]
}`;

export const chaseTemplate = `
CHASE ACTIONS - Extending or closing distance:

TIME CONSUMPTION ANALYSIS:
- "instant": Observe target movement, brief shouting
- "short": Sprint, overcome obstacles, driving sharp turns, dodge attacks (= each chase check)
- "scene": ❌ Not used during chase ✔ Post-chase "escape/hide" phase

{
  "type": "result",
  "summary": "Detective Smith sprints down the alley but stumbles on loose cobblestones, allowing the suspect to gain distance",
  "timeConsumption": "short",
  "stateUpdate": {
    "playerCharacter": {
      "name": "Detective Smith",
      "status": { "hp": -1 }
    }
  },
  "log": ["Athletics 40% vs roll 78 = failure", "Fall damage 1 point", "Target escapes"]
}`;

export const mentalTemplate = `
MENTAL ACTIONS - Withstanding or resisting psychological shock:

TIME CONSUMPTION ANALYSIS:
- "instant": SAN check itself, instant fear reaction
- "short": Temporary madness loss of control, compulsive actions
- "scene": Prolonged madness episode, deep mental shock recovery/breakdown phase

{
  "type": "result",
  "summary": "Detective Smith witnesses the eldritch horror but maintains composure, though the sight leaves lasting psychological scars",
  "timeConsumption": "instant",
  "stateUpdate": {
    "playerCharacter": {
      "name": "Detective Smith",
      "status": { "sanity": -3 }
    }
  },
  "log": ["Sanity 65% vs roll 82 = failure", "Sanity loss 1d4 = 3", "Current sanity: 62"]
}`;

export const environmentalTemplate = `
ENVIRONMENTAL ACTIONS - Confronting environment and physiological limits:

TIME CONSUMPTION ANALYSIS:
- "instant": Feel weather changes, notice physical discomfort
- "short": Overcome obstacles, simple climbing, temporary environmental danger avoidance, emergency minor injury treatment
- "scene": Complete first aid treatment, repair equipment, traverse dangerous terrain, endure harsh environment for extended period

{
  "type": "result",
  "summary": "Detective Smith breaks down the locked door with tremendous force, creating a new passage but alerting everyone nearby",
  "timeConsumption": "short",
  "stateUpdate": {
    "playerCharacter": {
      "name": "Detective Smith",
      "status": { "hp": 0 }
    }
  },
  "scenarioUpdate": {
    "description": "The wooden door lies in splinters, creating an open passage to the next room",
    "events": ["Door forcibly broken down, loud noise echoes through the building"],
    "exits": [
      {
        "direction": "north",
        "destination": "secret-chamber",
        "description": "Through the broken doorway",
        "condition": "open"
      }
    ]
  },
  "log": ["STR check 60% vs roll 45 = success", "Door destroyed with brute force"]
}`;

export const narrativeTemplate = `
NARRATIVE ACTIONS - Key choices without mechanical rolls:

TIME CONSUMPTION ANALYSIS:
- "instant": Brief decision, line of dialogue, gesture
- "short": Short exchange, small reveal, quick character beat
- "scene": Longer conversation or monologue that shifts tone or relationships

{
  "type": "result",
  "summary": "Detective Smith confides in the doctor about last night's horrors, earning a measure of trust and support",
  "timeConsumption": "short",
  "stateUpdate": {
    "playerCharacter": {
      "name": "Detective Smith",
      "status": { "hp": 0 }
    },
    "npcCharacters": [
      {
        "id": "doctor-1",
        "name": "Dr. Rowan",
        "status": { "hp": 0 }
      }
    ]
  },
  "log": ["No dice rolled; narrative choice builds rapport"]
}`;

export const actionTypeTemplates = {
  exploration: explorationTemplate,
  social: socialTemplate,
  stealth: stealthTemplate,
  combat: combatTemplate,
  chase: chaseTemplate,
  mental: mentalTemplate,
  environmental: environmentalTemplate,
  narrative: narrativeTemplate
};
