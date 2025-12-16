/**
 * Seed data for CoC database
 * Loads default rules, skills, weapons, and sanity triggers
 */

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
    // Interpersonal & Social Skills
    ["Charm", 15, "Being likeable, making friends, seduction", "social", 0, null],
    ["Fast Talk", 5, "Quick deception, misdirection, verbal tricks", "social", 0, null],
    ["Intimidate", 15, "Frightening or coercing others through threats", "social", 0, null],
    ["Persuade", 10, "Convincing others through logical argument", "social", 0, null],
    ["Psychology", 10, "Understanding human behavior, detecting lies, treating mental illness", "social", 0, null],

    // Knowledge & Academic Skills
    ["Accounting", 5, "Understanding financial records, detecting embezzlement", "knowledge", 0, null],
    ["Anthropology", 1, "Knowledge of human cultures and societies", "knowledge", 0, null],
    ["Archaeology", 1, "Knowledge of ancient cultures and artifacts", "knowledge", 0, null],
    ["Art and Craft", 5, "Artistic and craft skills", "knowledge", 0, null],
    ["History", 5, "Knowledge of historical events and periods", "knowledge", 0, null],
    ["Law", 5, "Knowledge of legal systems and procedures", "knowledge", 0, null],
    ["Library Use", 20, "Research in libraries, archives, databases", "knowledge", 0, null],
    ["Occult", 5, "Knowledge of supernatural beliefs, magic, and folklore", "knowledge", 0, null],
    ["Science (Biology)", 1, "Scientific knowledge of biology", "knowledge", 1, null],
    ["Science (Chemistry)", 1, "Scientific knowledge of chemistry", "knowledge", 1, null],
    ["Science (Physics)", 1, "Scientific knowledge of physics", "knowledge", 1, null],
    ["Appraise", 5, "Estimating value of objects and antiques", "knowledge", 0, null],

    // Perception & Investigation Skills
    ["Listen", 20, "Hearing sounds, eavesdropping, detecting noises", "investigation", 0, null],
    ["Spot Hidden", 25, "Finding hidden objects, spotting clues, noticing concealed things", "investigation", 0, null],
    ["Track", 10, "Following tracks and trails", "investigation", 0, null],

    // Physical & Movement Skills
    ["Climb", 20, "Scaling walls, climbing obstacles", "physical", 0, null],
    ["Dodge", 0, "Avoiding attacks and danger (calculated as DEX/2)", "physical", 0, null],
    ["Jump", 20, "Leaping over gaps and obstacles", "physical", 0, null],
    ["Swim", 20, "Swimming and water activities", "physical", 0, null],
    ["Throw", 20, "Throwing objects accurately", "physical", 0, null],
    ["Ride", 5, "Riding horses and similar animals", "physical", 0, null],

    // Stealth & Deception Skills
    ["Disguise", 5, "Changing appearance to avoid recognition", "stealth", 0, null],
    ["Sleight of Hand", 10, "Pickpocketing, palming objects, stage magic", "stealth", 0, null],
    ["Stealth", 20, "Moving silently, hiding, avoiding detection", "stealth", 0, null],

    // Mechanical & Technical Skills
    ["Electrical Repair", 10, "Repairing electrical devices", "technical", 0, null],
    ["Mechanical Repair", 10, "Repairing mechanical devices", "technical", 0, null],
    ["Operate Heavy Machinery", 1, "Operating cranes, bulldozers, etc.", "technical", 1, null],
    ["Pilot (Aircraft)", 1, "Piloting airplanes", "technical", 1, null],
    ["Pilot (Boat)", 1, "Piloting boats and ships", "technical", 1, null],
    ["Drive Auto", 20, "Driving automobiles", "technical", 0, null],
    ["Navigate", 10, "Finding direction, using maps", "technical", 0, null],

    // Medical & Survival Skills
    ["First Aid", 30, "Emergency medical treatment", "medical", 0, null],
    ["Medicine", 1, "Professional medical knowledge and practice", "medical", 1, null],
    ["Natural World", 10, "Knowledge of flora, fauna, and natural phenomena", "medical", 0, null],
    ["Survival (Arctic)", 10, "Surviving in arctic environments", "medical", 0, null],
    ["Survival (Desert)", 10, "Surviving in desert environments", "medical", 0, null],
    ["Survival (Forest)", 10, "Surviving in forest environments", "medical", 0, null],
    ["Psychoanalysis", 1, "Professional treatment of mental disorders", "medical", 1, null],

    // Combat Skills - Fighting
    ["Fighting (Brawl)", 25, "Hand-to-hand combat, punching, kicking", "combat", 0, null],
    ["Fighting (Sword)", 20, "Combat with swords", "combat", 0, null],
    ["Fighting (Axe)", 15, "Combat with axes", "combat", 0, null],
    ["Fighting (Whip)", 5, "Combat with whips", "combat", 0, null],

    // Combat Skills - Firearms
    ["Firearms (Handgun)", 20, "Using pistols and revolvers", "combat", 0, null],
    ["Firearms (Rifle/Shotgun)", 25, "Using rifles and shotguns", "combat", 0, null],
    ["Firearms (Submachine Gun)", 15, "Using submachine guns", "combat", 0, null],
    ["Firearms (Bow)", 15, "Using bows and crossbows", "combat", 0, null],

    // Criminal & Subterfuge Skills
    ["Locksmith", 1, "Picking locks and understanding security", "criminal", 1, null],
    ["Criminology", 1, "Understanding criminal behavior and investigation", "criminal", 1, null],
    ["Forgery", 1, "Creating fake documents and signatures", "criminal", 1, null],

    // Communication & Language Skills
    ["Language (Own)", 0, "Native language (EDU×5)", "language", 0, null],
    ["Language (Other)", 1, "Foreign language", "language", 0, null],

    // Financial & Status Skill
    ["Credit Rating", 0, "Wealth and social standing", "status", 0, null],

    // Cthulhu Mythos
    ["Cthulhu Mythos", 0, "Knowledge of the Mythos (reduces max Sanity)", "mythos", 1, null],
  ];

  skills.forEach((skill) => insertSkill.run(...skill));
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
