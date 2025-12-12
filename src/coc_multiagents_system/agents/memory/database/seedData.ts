/**
 * Seed data for CoC database
 * Loads default rules, skills, weapons, and sanity triggers
 */

import { RuleCategory } from "../models/gameTypes.js";
import type { CoCDatabase } from "./schema.js";

export function seedDatabase(db: CoCDatabase): void {
  const database = db.getDatabase();

  // Check if already seeded
  const count = database
    .prepare("SELECT COUNT(*) as count FROM skills")
    .get() as { count: number };
  if (count.count > 0) {
    console.log("Database already seeded, skipping...");
    return;
  }

  console.log("Seeding database with CoC 7e rules...");

  db.transaction(() => {
    seedSkills(database);
    seedRules(database);
    seedWeapons(database);
    seedSanityTriggers(database);
  });

  console.log("Database seeding complete!");
}

function seedSkills(db: any): void {
  const insertSkill = db.prepare(`
        INSERT INTO skills (name, base_value, description, category, uncommon, examples)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

  const skills = [
    // Investigation Skills
    [
      "Spot Hidden",
      25,
      "Finding hidden objects, spotting clues, noticing concealed things",
      "investigation",
      0,
      null,
    ],
    [
      "Listen",
      20,
      "Hearing sounds, eavesdropping, detecting noises",
      "investigation",
      0,
      null,
    ],
    [
      "Library Use",
      20,
      "Research in libraries, archives, databases",
      "investigation",
      0,
      null,
    ],
    ["Track", 10, "Following tracks and trails", "investigation", 0, null],

    // Social Skills
    [
      "Charm",
      15,
      "Being likeable, making friends, seduction",
      "social",
      0,
      null,
    ],
    [
      "Fast Talk",
      5,
      "Quick deception, misdirection, verbal tricks",
      "social",
      0,
      null,
    ],
    [
      "Intimidate",
      15,
      "Frightening or coercing others through threats",
      "social",
      0,
      null,
    ],
    [
      "Persuade",
      10,
      "Convincing others through logical argument",
      "social",
      0,
      null,
    ],
    [
      "Psychology",
      10,
      "Understanding human behavior, detecting lies, treating mental illness",
      "social",
      0,
      null,
    ],
    [
      "Psychoanalysis",
      1,
      "Professional treatment of mental disorders",
      "social",
      1,
      null,
    ],

    // Knowledge Skills
    [
      "Accounting",
      5,
      "Understanding financial records, detecting embezzlement",
      "knowledge",
      0,
      null,
    ],
    [
      "Anthropology",
      1,
      "Knowledge of human cultures and societies",
      "knowledge",
      0,
      null,
    ],
    [
      "Appraise",
      5,
      "Estimating value of objects and antiques",
      "knowledge",
      0,
      null,
    ],
    [
      "Archaeology",
      1,
      "Knowledge of ancient cultures and artifacts",
      "knowledge",
      0,
      null,
    ],
    [
      "History",
      5,
      "Knowledge of historical events and periods",
      "knowledge",
      0,
      null,
    ],
    [
      "Law",
      5,
      "Knowledge of legal systems and procedures",
      "knowledge",
      0,
      null,
    ],
    [
      "Medicine",
      1,
      "Professional medical knowledge and practice",
      "knowledge",
      1,
      null,
    ],
    [
      "Natural World",
      10,
      "Knowledge of flora, fauna, and natural phenomena",
      "knowledge",
      0,
      null,
    ],
    [
      "Occult",
      5,
      "Knowledge of supernatural beliefs, magic, and folklore",
      "knowledge",
      0,
      null,
    ],
    [
      "Science (Biology)",
      1,
      "Scientific knowledge of biology",
      "knowledge",
      1,
      null,
    ],
    [
      "Science (Chemistry)",
      1,
      "Scientific knowledge of chemistry",
      "knowledge",
      1,
      null,
    ],
    [
      "Science (Physics)",
      1,
      "Scientific knowledge of physics",
      "knowledge",
      1,
      null,
    ],

    // Physical Skills
    ["Climb", 20, "Scaling walls, climbing obstacles", "physical", 0, null],
    ["Jump", 20, "Leaping over gaps and obstacles", "physical", 0, null],
    ["Ride", 5, "Riding horses and similar animals", "physical", 0, null],
    [
      "Stealth",
      20,
      "Moving silently, hiding, avoiding detection",
      "physical",
      0,
      null,
    ],
    ["Swim", 20, "Swimming and water activities", "physical", 0, null],
    ["Throw", 20, "Throwing objects accurately", "physical", 0, null],

    // Technical Skills
    ["Art/Craft (Photography)", 5, "Photography skill", "knowledge", 0, null],
    [
      "Disguise",
      5,
      "Changing appearance to avoid recognition",
      "physical",
      0,
      null,
    ],
    ["Drive Auto", 20, "Driving automobiles", "physical", 0, null],
    [
      "Electrical Repair",
      10,
      "Repairing electrical devices",
      "knowledge",
      0,
      null,
    ],
    ["First Aid", 30, "Emergency medical treatment", "knowledge", 0, null],
    [
      "Locksmith",
      1,
      "Picking locks and understanding security",
      "physical",
      1,
      null,
    ],
    [
      "Mechanical Repair",
      10,
      "Repairing mechanical devices",
      "knowledge",
      0,
      null,
    ],
    ["Navigate", 10, "Finding direction, using maps", "knowledge", 0, null],
    [
      "Operate Heavy Machinery",
      1,
      "Operating cranes, bulldozers, etc.",
      "physical",
      1,
      null,
    ],
    [
      "Sleight of Hand",
      10,
      "Pickpocketing, palming objects, stage magic",
      "physical",
      0,
      null,
    ],

    // Combat Skills
    [
      "Dodge",
      0,
      "Avoiding attacks and danger (calculated as DEX/2)",
      "combat",
      0,
      null,
    ],
    [
      "Fighting (Brawl)",
      25,
      "Hand-to-hand combat, punching, kicking",
      "combat",
      0,
      null,
    ],
    [
      "Firearms (Handgun)",
      20,
      "Using pistols and revolvers",
      "combat",
      0,
      null,
    ],
    [
      "Firearms (Rifle/Shotgun)",
      25,
      "Using rifles and shotguns",
      "combat",
      0,
      null,
    ],
    [
      "Firearms (Submachine Gun)",
      15,
      "Using submachine guns",
      "combat",
      0,
      null,
    ],

    // Special Skills
    ["Credit Rating", 0, "Wealth and social standing", "social", 0, null],
    [
      "Cthulhu Mythos",
      0,
      "Knowledge of the Mythos (reduces max Sanity)",
      "knowledge",
      1,
      null,
    ],
  ];

  skills.forEach((skill) => insertSkill.run(...skill));
}

function seedRules(db: any): void {
  const insertRule = db.prepare(`
        INSERT INTO rules (id, category, title, description, mechanics, examples, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

  const rules = [
    // Combat Rules
    [
      "combat_001",
      RuleCategory.COMBAT,
      "Combat Overview",
      "Combat in Call of Cthulhu is dangerous and often deadly. Investigators are not combat-focused heroes.",
      "Combat rounds are approximately 12 seconds. Actions are resolved in order of DEX, highest first.",
      JSON.stringify([
        "A single gunshot can incapacitate or kill",
        "Fleeing is often the wisest choice",
      ]),
      JSON.stringify(["combat", "basic"]),
    ],

    [
      "combat_002",
      RuleCategory.COMBAT,
      "Fighting Maneuvers",
      "Each combat round, characters can perform one fighting maneuver.",
      "Options include: Attack, Dodge, Fight Back, or other actions. Once Dodge is used, all further dodges are at Hard difficulty.",
      null,
      JSON.stringify(["combat", "maneuvers"]),
    ],

    [
      "combat_003",
      RuleCategory.COMBAT,
      "Attack Roll",
      "To attack, roll d100 against the appropriate combat skill.",
      "Success means the attack hits. Damage is then rolled. Critical success (01-05) deals maximum damage. Fumble (96-100) may cause weapon malfunction or other mishaps.",
      null,
      JSON.stringify(["combat", "attack"]),
    ],

    [
      "combat_004",
      RuleCategory.COMBAT,
      "Dodge",
      "Defenders may attempt to dodge incoming attacks.",
      "If dodge succeeds, compare success levels. Equal or better success level negates the attack entirely. Lesser success halves damage (round down).",
      null,
      JSON.stringify(["combat", "defense", "dodge"]),
    ],

    [
      "combat_005",
      RuleCategory.COMBAT,
      "Fighting Back",
      "Instead of dodging, a defender can fight back with their own attack.",
      "Both attacker and defender roll. Whoever gets the better success level deals damage. Equal success means both hit.",
      null,
      JSON.stringify(["combat", "defense", "fighting back"]),
    ],

    [
      "combat_006",
      RuleCategory.COMBAT,
      "Bonus Damage",
      "Characters with high STR and SIZ deal bonus damage in melee.",
      "STR+SIZ: 65-84 = +1d4, 85-124 = +1d6, 125-164 = +2d6, 165+ = +3d6, etc. Bonus damage only applies to melee attacks.",
      null,
      JSON.stringify(["combat", "damage", "bonus"]),
    ],

    [
      "combat_007",
      RuleCategory.COMBAT,
      "Hit Points",
      "Hit Points represent physical health and ability to withstand injury.",
      "Starting HP = (CON + SIZ) / 10 (rounded down). When HP reaches 0, character falls unconscious. At -2 or less, character begins dying.",
      null,
      JSON.stringify(["combat", "health", "hit points"]),
    ],

    [
      "combat_008",
      RuleCategory.COMBAT,
      "Major Wound",
      "Taking damage equal to half max HP in one blow causes a Major Wound.",
      "Character falls prone and must make CON check or fall unconscious. They are unable to fight effectively until healed.",
      null,
      JSON.stringify(["combat", "injury", "major wound"]),
    ],

    [
      "combat_009",
      RuleCategory.COMBAT,
      "Dying",
      "Characters at 0 HP or below are dying.",
      "Each round, make a CON check. Success stabilizes. Failure means losing 1 HP. At HP equal to negative max HP, character dies.",
      null,
      JSON.stringify(["combat", "death", "dying"]),
    ],

    // Sanity Rules
    [
      "sanity_001",
      RuleCategory.SANITY,
      "Sanity Points",
      "Sanity represents mental stability and grip on reality.",
      "Starting Sanity = POW. Maximum Sanity = 99 minus Cthulhu Mythos skill. As Mythos knowledge increases, maximum sanity decreases.",
      null,
      JSON.stringify(["sanity", "basic"]),
    ],

    [
      "sanity_002",
      RuleCategory.SANITY,
      "Sanity Loss",
      "Witnessing horrific or unnatural events causes Sanity loss.",
      "Format: success/failure (e.g., 0/1d3). Roll d100 against current Sanity. On success, lose lesser amount. On failure, lose greater amount.",
      null,
      JSON.stringify(["sanity", "loss"]),
    ],

    [
      "sanity_003",
      RuleCategory.SANITY,
      "Temporary Insanity",
      "Losing 5 or more Sanity points from one source triggers temporary insanity.",
      "Character becomes incapacitated or acts irrationally. Duration: 1d10+4 rounds for brief episodes, or hours for longer bouts. Roll on Temporary Insanity table.",
      JSON.stringify([
        "Fainting",
        "Fleeing in panic",
        "Physical hysteria",
        "Psychosomatic symptoms",
      ]),
      JSON.stringify(["sanity", "temporary insanity"]),
    ],

    [
      "sanity_004",
      RuleCategory.SANITY,
      "Indefinite Insanity",
      "When Sanity reaches 0, character suffers indefinite insanity.",
      "Character develops a permanent mental disorder requiring psychiatric treatment. They cannot continue adventuring until partially recovered.",
      null,
      JSON.stringify(["sanity", "indefinite insanity"]),
    ],

    [
      "sanity_005",
      RuleCategory.SANITY,
      "Going Permanently Insane",
      "Losing 20% or more of current Sanity in one hour can cause permanent insanity.",
      "Character is permanently removed from play, becoming an NPC. This is the final fate of investigators who delve too deep.",
      null,
      JSON.stringify(["sanity", "permanent insanity"]),
    ],

    [
      "sanity_006",
      RuleCategory.SANITY,
      "Phobias and Manias",
      "Indefinite insanity results in phobias (irrational fears) or manias (compulsions).",
      "Examples: Agoraphobia, Hemophobia, Kleptomania. When triggered, must make Sanity check or be unable to act effectively.",
      null,
      JSON.stringify(["sanity", "phobia", "mania"]),
    ],

    // General Rules
    [
      "general_001",
      RuleCategory.GENERAL,
      "Success Levels",
      "Skill checks have different levels of success.",
      "Critical (01-05), Extreme (1/5 skill), Hard (1/2 skill), Regular (skill value), Failure, Fumble (96-00)",
      null,
      JSON.stringify(["basic", "skill check"]),
    ],

    [
      "general_002",
      RuleCategory.GENERAL,
      "Opposed Rolls",
      "When two characters compete, use opposed rolls.",
      "Both roll their skills. Higher success level wins. If tied on success level, higher roll wins.",
      null,
      JSON.stringify(["basic", "opposed"]),
    ],

    [
      "general_003",
      RuleCategory.GENERAL,
      "Pushing Rolls",
      "After failing a roll, you may push it for a second attempt.",
      "Describe a desperate action. If you fail again, consequences are worse. Cannot push combat or damage rolls.",
      null,
      JSON.stringify(["advanced", "push", "skill check"]),
    ],

    [
      "general_004",
      RuleCategory.GENERAL,
      "Bonus and Penalty Dice",
      "Circumstances can add bonus or penalty dice.",
      "Roll extra d10s with your percentile roll. Bonus: use lowest tens die. Penalty: use highest tens die.",
      null,
      JSON.stringify(["advanced", "dice", "bonus", "penalty"]),
    ],

    [
      "general_005",
      RuleCategory.GENERAL,
      "Luck",
      "Luck can be spent to change outcomes.",
      "Spend Luck points to reduce damage taken, improve rolls, or avoid bad outcomes. Once spent, Luck doesn't recover until scenario end.",
      null,
      JSON.stringify(["advanced", "luck"]),
    ],

    [
      "char_001",
      RuleCategory.CHARACTER,
      "Characteristics",
      "Seven primary characteristics define a character.",
      "STR, CON, SIZ, DEX, APP, INT, POW, EDU. Roll 3d6 for most, 2d6+6 for INT and EDU.",
      null,
      JSON.stringify(["character creation", "characteristics"]),
    ],

    [
      "char_002",
      RuleCategory.CHARACTER,
      "Derived Attributes",
      "Several attributes are calculated from characteristics.",
      "Hit Points = (CON+SIZ)/10. Magic Points = POW/5. Sanity = POW. Luck = 3d6×5. Move Rate based on DEX, STR, SIZ.",
      null,
      JSON.stringify(["character creation", "attributes"]),
    ],
  ];

  rules.forEach((rule) => insertRule.run(...rule));
}

function seedWeapons(db: any): void {
  const insertWeapon = db.prepare(`
        INSERT INTO weapons (name, skill, damage, range, attacks_per_round, ammo, malfunction, era)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

  const weapons = [
    // Melee weapons
    ["Unarmed", "Fighting (Brawl)", "1d3", "touch", 1, null, null, null],
    ["Knife", "Fighting (Brawl)", "1d4", "touch", 1, null, null, null],
    ["Sword", "Fighting (Brawl)", "1d8", "touch", 1, null, null, null],
    ["Baseball Bat", "Fighting (Brawl)", "1d8", "touch", 1, null, null, null],
    ["Axe", "Fighting (Brawl)", "1d8+2", "touch", 1, null, null, null],

    // Handguns
    [".32 Revolver", "Firearms (Handgun)", "1d8", "10 yards", 3, 6, 100, null],
    [".38 Revolver", "Firearms (Handgun)", "1d10", "15 yards", 3, 6, 100, null],
    [
      ".45 Revolver",
      "Firearms (Handgun)",
      "1d10+2",
      "15 yards",
      2,
      6,
      100,
      null,
    ],
    [
      ".45 Automatic",
      "Firearms (Handgun)",
      "1d10+2",
      "15 yards",
      3,
      7,
      100,
      null,
    ],
    [
      "9mm Automatic",
      "Firearms (Handgun)",
      "1d10",
      "15 yards",
      3,
      15,
      97,
      null,
    ],

    // Rifles & Shotguns
    [
      ".22 Rifle",
      "Firearms (Rifle/Shotgun)",
      "1d6",
      "30 yards",
      1,
      6,
      99,
      null,
    ],
    [
      ".30-06 Rifle",
      "Firearms (Rifle/Shotgun)",
      "2d6+4",
      "110 yards",
      1,
      5,
      100,
      null,
    ],
    [
      "Shotgun 12-gauge",
      "Firearms (Rifle/Shotgun)",
      "4d6/2d6/1d6",
      "10/20/50 yards",
      1,
      2,
      100,
      null,
    ],
    [
      "Shotgun 20-gauge",
      "Firearms (Rifle/Shotgun)",
      "2d6/1d6/1d3",
      "10/20/50 yards",
      1,
      2,
      100,
      null,
    ],

    // Submachine guns
    [
      "Thompson SMG",
      "Firearms (Submachine Gun)",
      "1d10+2",
      "20 yards",
      3,
      20,
      96,
      null,
    ],

    // Other
    ["Dynamite Stick", "Throw", "4d10", "10 yards", 1, null, null, null],
    [
      "Molotov Cocktail",
      "Throw",
      "2d6 (burn)",
      "10 yards",
      1,
      null,
      null,
      null,
    ],
  ];

  weapons.forEach((weapon) => insertWeapon.run(...weapon));
}

function seedSanityTriggers(db: any): void {
  const insertTrigger = db.prepare(`
        INSERT INTO sanity_triggers (trigger, sanity_loss, description)
        VALUES (?, ?, ?)
    `);

  const triggers = [
    // Common horrors
    ["Seeing a dead body", "0/1d3", null],
    ["Seeing a particularly gruesome death", "1/1d6", null],
    ["Seeing a loved one die", "1d4/1d6+2", null],
    ["Witnessing a violent death", "0/1d4", null],
    ["Seeing a mutilated corpse", "0/1d6", null],
    ["Committing murder", "1d4/1d6", null],

    // Unnatural entities
    ["Seeing a minor Mythos creature (Ghoul)", "0/1d6", null],
    ["Seeing a major Mythos creature (Shoggoth)", "1d6/1d20", null],
    ["Seeing a Great Old One (Cthulhu)", "1d10/1d100", null],
    ["Seeing Nyarlathotep", "1d10/1d100", null],
    ["Seeing Yog-Sothoth", "1d10/1d100", null],

    // Mythos magic and artifacts
    ["Witnessing Mythos magic", "0/1d6", null],
    ["Casting Mythos spell (first time)", "1d6", null],
    ["Reading Necronomicon (full)", "1d6/2d6", null],
    ["Reading De Vermis Mysteriis", "1d3/1d6", null],

    // Disturbing situations
    ["Seeing a ghoul feast", "1/1d6", null],
    ["Being buried alive", "1d6/1d10", null],
    ["Experiencing possession", "1d4/1d10", null],
    ["Torture", "1d6/2d6", null],
    ["Experiencing body horror transformation", "1d6/2d10", null],

    // Minor disturbances
    ["Startling surprise", "0/1", null],
    ["Creepy atmosphere", "0/1d3", null],
    ["Strange noises in the dark", "0/1d3", null],
  ];

  triggers.forEach((trigger) => insertTrigger.run(...trigger));
}
