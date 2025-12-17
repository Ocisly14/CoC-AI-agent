import React, { useMemo, useState } from "react";
import Homes from "./views/Homes";
import { GameChat } from "./components/GameChat";
import { CharacterSelector } from "./components/CharacterSelector";
import { ModSelector } from "./components/ModSelector";

type SkillEntry = { name: string; base: string; category: string };
type AppPage = "home" | "sheet" | "game" | "character-select" | "mod-select" | "module-intro";

const SKILLS: SkillEntry[] = [
  // Interpersonal & Social Skills
  { name: "Charm", base: "15%", category: "Social" },
  { name: "Fast Talk", base: "5%", category: "Social" },
  { name: "Intimidate", base: "15%", category: "Social" },
  { name: "Persuade", base: "10%", category: "Social" },
  { name: "Psychology", base: "10%", category: "Social" },

  // Knowledge & Academic Skills
  { name: "Accounting", base: "5%", category: "Knowledge" },
  { name: "Anthropology", base: "1%", category: "Knowledge" },
  { name: "Archaeology", base: "1%", category: "Knowledge" },
  { name: "Art and Craft", base: "5%", category: "Knowledge" },
  { name: "History", base: "5%", category: "Knowledge" },
  { name: "Law", base: "5%", category: "Knowledge" },
  { name: "Library Use", base: "20%", category: "Knowledge" },
  { name: "Occult", base: "5%", category: "Knowledge" },
  { name: "Science (Biology)", base: "1%", category: "Knowledge" },
  { name: "Science (Chemistry)", base: "1%", category: "Knowledge" },
  { name: "Science (Physics)", base: "1%", category: "Knowledge" },

  // Perception & Investigation Skills
  { name: "Listen", base: "20%", category: "Investigation" },
  { name: "Spot Hidden", base: "25%", category: "Investigation" },
  { name: "Track", base: "10%", category: "Investigation" },

  // Physical & Movement Skills
  { name: "Climb", base: "20%", category: "Physical" },
  { name: "Dodge", base: "0%", category: "Physical" },
  { name: "Jump", base: "20%", category: "Physical" },
  { name: "Swim", base: "20%", category: "Physical" },
  { name: "Throw", base: "20%", category: "Physical" },

  // Stealth & Deception Skills
  { name: "Disguise", base: "5%", category: "Stealth" },
  { name: "Sleight of Hand", base: "10%", category: "Stealth" },
  { name: "Stealth", base: "20%", category: "Stealth" },

  // Mechanical & Technical Skills
  { name: "Electrical Repair", base: "10%", category: "Technical" },
  { name: "Mechanical Repair", base: "10%", category: "Technical" },
  { name: "Operate Heavy Machinery", base: "1%", category: "Technical" },
  { name: "Pilot (Aircraft)", base: "1%", category: "Technical" },
  { name: "Pilot (Boat)", base: "1%", category: "Technical" },
  { name: "Drive Auto", base: "20%", category: "Technical" },

  // Medical & Survival Skills
  { name: "First Aid", base: "30%", category: "Medical" },
  { name: "Medicine", base: "1%", category: "Medical" },
  { name: "Natural World", base: "10%", category: "Medical" },
  { name: "Survival (Arctic)", base: "10%", category: "Medical" },
  { name: "Survival (Desert)", base: "10%", category: "Medical" },
  { name: "Survival (Forest)", base: "10%", category: "Medical" },

  // Combat Skills - Fighting
  { name: "Fighting (Brawl)", base: "25%", category: "Combat" },
  { name: "Fighting (Sword)", base: "20%", category: "Combat" },
  { name: "Fighting (Axe)", base: "15%", category: "Combat" },
  { name: "Fighting (Whip)", base: "5%", category: "Combat" },

  // Combat Skills - Firearms
  { name: "Firearms (Handgun)", base: "20%", category: "Combat" },
  { name: "Firearms (Rifle/Shotgun)", base: "25%", category: "Combat" },
  { name: "Firearms (Submachine Gun)", base: "15%", category: "Combat" },
  { name: "Firearms (Bow)", base: "15%", category: "Combat" },

  // Criminal & Subterfuge Skills
  { name: "Locksmith", base: "1%", category: "Criminal" },
  { name: "Criminology", base: "1%", category: "Criminal" },
  { name: "Forgery", base: "1%", category: "Criminal" },

  // Communication & Language Skills
  { name: "Language (Own)", base: "0%", category: "Language" },
  { name: "Language (Other)", base: "1%", category: "Language" },

  // Financial & Status Skill
  { name: "Credit Rating", base: "0%", category: "Status" },

  // Cthulhu Mythos
  { name: "Cthulhu Mythos", base: "0%", category: "Mythos" },

  // Additional Common Skills
  { name: "Appraise", base: "5%", category: "Knowledge" },
  { name: "Navigate", base: "10%", category: "Technical" },
  { name: "Psychoanalysis", base: "1%", category: "Medical" },
  { name: "Ride", base: "5%", category: "Physical" },
];

const App: React.FC = () => {
  const [page, setPage] = useState<AppPage>("home");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [characterName, setCharacterName] = useState<string>("Investigator");
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>("");
  const [selectedModName, setSelectedModName] = useState<string>("");
  const [showCheckpointSelector, setShowCheckpointSelector] = useState(false);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);
  const [moduleIntroduction, setModuleIntroduction] = useState<{ introduction: string; characterGuidance: string } | null>(null);
  const [showModuleIntro, setShowModuleIntro] = useState(false);
  const [loadingModData, setLoadingModData] = useState(false);
  const [modLoadProgress, setModLoadProgress] = useState<{ stage: string; progress: number; message: string } | null>(null);

  const [form, setForm] = React.useState<Record<string, string>>({});

  // Show mod selector first, then character selector
  const handleShowCharacterSelector = () => {
    setPage("mod-select");
  };

  // Handle mod selection - load mod data, then fetch and show module introduction
  const handleSelectMod = async (modName: string) => {
    setSelectedModName(modName);
    setLoadingModData(true);
    setModLoadProgress({ stage: "初始化", progress: 0, message: "正在初始化..." });
    
    try {
      // Step 1: Load mod data (scenarios, NPCs, modules)
      setModLoadProgress({ stage: "加载场景", progress: 20, message: "正在加载场景数据..." });
      const loadResponse = await fetch("http://localhost:3000/api/mod/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modName }),
      });

      const loadData = await loadResponse.json();

      if (!loadResponse.ok) {
        throw new Error(loadData.error || "加载模组数据失败");
      }

      setModLoadProgress({ stage: "加载完成", progress: 80, message: `已加载 ${loadData.scenariosLoaded || 0} 个场景，${loadData.npcsLoaded || 0} 个NPC，${loadData.modulesLoaded || 0} 个模块` });

      // Step 2: Fetch module introduction
      setModLoadProgress({ stage: "生成导入叙事", progress: 90, message: "正在生成模块导入叙事..." });
      const introResponse = await fetch(`http://localhost:3000/api/module/introduction?modName=${encodeURIComponent(modName)}`);
      const introData = await introResponse.json();

      if (introResponse.ok && introData.success) {
        setModuleIntroduction(introData.moduleIntroduction);
        setModLoadProgress({ stage: "完成", progress: 100, message: "准备就绪" });
        setTimeout(() => {
          setLoadingModData(false);
          setModLoadProgress(null);
          setPage("module-intro"); // Show module introduction page
        }, 500);
      } else {
        // If failed to get introduction, go directly to character select
        console.error("Failed to get module introduction:", introData.error);
        setLoadingModData(false);
        setModLoadProgress(null);
        setPage("character-select");
      }
    } catch (error) {
      console.error("Error loading mod:", error);
      setLoadingModData(false);
      setModLoadProgress(null);
      alert("加载模组失败: " + (error as Error).message);
      setPage("mod-select");
    }
  };

  // Handle character selection and start game
  // Note: Data import is now handled in CharacterSelector component
  const handleSelectCharacter = async (characterId: string, charName: string) => {
    console.log("Selected character:", characterId, charName);
    setSelectedCharacterId(characterId);
    setCharacterName(charName);
    
    try {
      // Start game with selected character and mod
      const response = await fetch("http://localhost:3000/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, modName: selectedModName }),
      });

      const data = await response.json();

      if (response.ok) {
        setSessionId(data.sessionId || `session-${Date.now()}`);
        // Don't show module introduction again (already shown before character selection)
        setShowModuleIntro(false);
        setPage("game");
      } else {
        alert("启动游戏失败: " + (data.error || "Unknown error"));
        setPage("character-select");
      }
    } catch (error) {
      console.error("Error starting game:", error);
      alert("网络错误，无法连接到服务器");
      setPage("character-select");
    }
  };

  const handleBackToHome = () => {
    setPage("home");
  };

  // Handle continue game - show checkpoint selector
  const handleContinueGame = async () => {
    setShowCheckpointSelector(true);
    setLoadingCheckpoints(true);

    try {
      // Get all checkpoints (we'll filter by session later if needed)
      // For now, we'll get checkpoints from a default session or all sessions
      const response = await fetch(`http://localhost:3000/api/checkpoints/list?sessionId=all&limit=50`);
      const data = await response.json();

      if (data.success) {
        setCheckpoints(data.checkpoints || []);
      } else {
        alert("加载存档列表失败: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error loading checkpoints:", error);
      alert("网络错误，无法加载存档列表");
    } finally {
      setLoadingCheckpoints(false);
    }
  };

  // Handle checkpoint selection and load
  const handleLoadCheckpoint = async (checkpointId: string) => {
    try {
      const response = await fetch("http://localhost:3000/api/checkpoints/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpointId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Restore game state
        setSessionId(data.sessionId || `session-${Date.now()}`);
        
        // Extract character name from game state if available
        if (data.gameState?.playerCharacter?.name) {
          setCharacterName(data.gameState.playerCharacter.name);
        }

        // Don't show module introduction when loading checkpoint (only for new games)
        setShowModuleIntro(false);
        setModuleIntroduction(null);

        // Close checkpoint selector and go to game
        setShowCheckpointSelector(false);
        setPage("game");
      } else {
        alert("加载存档失败: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error loading checkpoint:", error);
      alert("网络错误，无法加载存档");
    }
  };

  const onChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const skillsState = useMemo(() => {
    return SKILLS.map((skill) => ({
      name: skill.name,
      base: skill.base,
      category: skill.category,
      value: form[`skill_${skill.name}`] || "",
      checked: form[`skillcheck_${skill.name}`] === "on",
    }));
  }, [form]);

  const weapons = [0, 1, 2].map((i) => ({
    name: form[`weapon_${i}_name`] || "",
    skill: form[`weapon_${i}_skill`] || "",
    damage: form[`weapon_${i}_damage`] || "",
    range: form[`weapon_${i}_range`] || "",
    attacks: form[`weapon_${i}_attacks`] || "",
    ammo: form[`weapon_${i}_ammo`] || "",
  }));

  const characterData = useMemo(
    () => ({
      identity: {
        era: form.era,
        name: form.name,
        occupation: form.occupation,
        age: Number(form.age) || null,
        gender: form.gender,
        residence: form.residence,
        birthplace: form.birthplace,
      },
      attributes: ["STR", "CON", "DEX", "APP", "POW", "SIZ", "INT", "EDU", "LCK"].reduce(
        (acc, key) => ({ ...acc, [key]: Number(form[key]) || 0 }),
        {}
      ),
      derived: {
        HP: Number(form.HP) || 0,
        SAN: Number(form.SAN) || 0,
        MP: Number(form.MP) || 0,
        LUCK: Number(form.LUCK) || 0,
        MOV: Number(form.MOV) || 0,
        BUILD: form.BUILD,
        DB: form.DB,
        ARMOR: form.ARMOR,
      },
      skills: skillsState.reduce(
        (acc, s) => ({ ...acc, [s.name]: { value: Number(s.value) || 0, checked: s.checked } }),
        {}
      ),
      weapons: weapons.filter((w) => w.name || w.skill || w.damage),
      notes: {
        appearance: form.appearance,
        ideology: form.ideology,
        people: form.people,
        gear: form.gear,
        backstory: form.backstory,
      },
    }),
    [form, skillsState, weapons]
  );

  const handleCreateCharacter = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!characterData.identity.name) {
      setSaveMessage({ type: "error", text: "请填写角色姓名！" });
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch("http://localhost:3000/api/character", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(characterData),
      });

      const data = await response.json();

      if (response.ok) {
        setSaveMessage({ type: "success", text: data.message });
        // Navigate back to character selection after successful creation
        setTimeout(() => {
          setPage("character-select");
        }, 1000); // Wait 1 second to show success message
      } else {
        setSaveMessage({ type: "error", text: data.error || "创建角色失败" });
      }
    } catch (error) {
      console.error("Error creating character:", error);
      setSaveMessage({ type: "error", text: "网络错误，无法连接到服务器" });
    } finally {
      setSaving(false);
    }
  };

  const sheet = (
    <div className="sheet">
      <h1>Call of Cthulhu Investigator Sheet</h1>
      <form onSubmit={handleCreateCharacter}>
        <div style={{ textAlign: "right", marginBottom: "6px" }}>
          <button
            type="button"
            className="pill-btn"
            onClick={() => setPage("home")}
            style={{ background: "#eee" }}
          >
            返回首页
          </button>
        </div>
        <div className="section-title">Identity</div>
        <table>
          <tbody>
            <tr>
              <th>Era</th>
              <td>
                <input name="era" placeholder="1920s 调查员" value={form.era || ""} onChange={(e) => onChange("era", e.target.value)} />
              </td>
              <th>Name</th>
              <td>
                <input name="name" placeholder="尼伦顿" value={form.name || ""} onChange={(e) => onChange("name", e.target.value)} />
              </td>
              <th>Occupation</th>
              <td>
                <input name="occupation" placeholder="调查员" value={form.occupation || ""} onChange={(e) => onChange("occupation", e.target.value)} />
              </td>
            </tr>
            <tr>
              <th>Age</th>
              <td>
                <input name="age" type="number" min="1" placeholder="32" value={form.age || ""} onChange={(e) => onChange("age", e.target.value)} />
              </td>
              <th>Gender</th>
              <td>
                <input name="gender" placeholder="男 / 女" value={form.gender || ""} onChange={(e) => onChange("gender", e.target.value)} />
              </td>
              <th>Residence</th>
              <td>
                <input name="residence" placeholder="纽约" value={form.residence || ""} onChange={(e) => onChange("residence", e.target.value)} />
              </td>
            </tr>
            <tr>
              <th>Birthplace</th>
              <td colSpan={5}>
                <input name="birthplace" placeholder="波士顿" value={form.birthplace || ""} onChange={(e) => onChange("birthplace", e.target.value)} />
              </td>
            </tr>
          </tbody>
        </table>

        <div className="two-col">
          <div>
            <div className="section-title">Attributes</div>
            <table>
              <tbody>
                <tr>
                  {["STR", "CON", "DEX", "APP", "POW", "SIZ", "INT", "EDU", "LCK"].map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
                <tr>
                  {["STR", "CON", "DEX", "APP", "POW", "SIZ", "INT", "EDU", "LCK"].map((k) => (
                    <td key={k}>
                      <input
                        name={k}
                        type="number"
                        min="1"
                        max="99"
                        placeholder="50"
                        value={form[k] || ""}
                        onChange={(e) => onChange(k, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>

            <table>
              <tbody>
                <tr>
                  <th>HP</th>
                  <td>
                    <input name="HP" type="number" min="1" placeholder="10" value={form.HP || ""} onChange={(e) => onChange("HP", e.target.value)} />
                  </td>
                  <th>Sanity</th>
                  <td>
                    <input name="SAN" type="number" min="0" placeholder="60" value={form.SAN || ""} onChange={(e) => onChange("SAN", e.target.value)} />
                  </td>
                  <th>MP</th>
                  <td>
                    <input name="MP" type="number" min="0" placeholder="10" value={form.MP || ""} onChange={(e) => onChange("MP", e.target.value)} />
                  </td>
                  <th>Luck</th>
                  <td>
                    <input name="LUCK" type="number" min="0" placeholder="50" value={form.LUCK || ""} onChange={(e) => onChange("LUCK", e.target.value)} />
                  </td>
                </tr>
                <tr>
                  <th>Move</th>
                  <td>
                    <input name="MOV" type="number" min="1" placeholder="8" value={form.MOV || ""} onChange={(e) => onChange("MOV", e.target.value)} />
                  </td>
                  <th>Build</th>
                  <td>
                    <input name="BUILD" placeholder="0" value={form.BUILD || ""} onChange={(e) => onChange("BUILD", e.target.value)} />
                  </td>
                  <th>DB</th>
                  <td>
                    <input name="DB" placeholder="+0" value={form.DB || ""} onChange={(e) => onChange("DB", e.target.value)} />
                  </td>
                  <th>Armor</th>
                  <td colSpan={3}>
                    <input name="ARMOR" placeholder="-" value={form.ARMOR || ""} onChange={(e) => onChange("ARMOR", e.target.value)} />
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="section-title">Skills</div>
            <div style={{ maxHeight: "600px", overflowY: "auto", border: "1px solid #ddd", padding: "8px", borderRadius: "4px" }}>
              {["Social", "Knowledge", "Investigation", "Physical", "Stealth", "Technical", "Medical", "Combat", "Criminal", "Language", "Status", "Mythos"].map((category) => {
                const categorySkills = skillsState.filter((s) => s.category === category);
                if (categorySkills.length === 0) return null;
                
                const categoryNames: Record<string, string> = {
                  Social: "Interpersonal & Social",
                  Knowledge: "Knowledge & Academic",
                  Investigation: "Perception & Investigation",
                  Physical: "Physical & Movement",
                  Stealth: "Stealth & Deception",
                  Technical: "Mechanical & Technical",
                  Medical: "Medical & Survival",
                  Combat: "Combat",
                  Criminal: "Criminal & Subterfuge",
                  Language: "Communication & Language",
                  Status: "Financial & Status",
                  Mythos: "Cthulhu Mythos"
                };

                return (
                  <div key={category} style={{ marginBottom: "16px" }}>
                    <h4 style={{ margin: "8px 0", color: "#555", fontSize: "0.9rem", borderBottom: "1px solid #ccc", paddingBottom: "4px" }}>
                      {categoryNames[category]}
                    </h4>
                    <table className="skills-table" style={{ width: "100%", marginBottom: "0" }}>
                      <tbody>
                        {categorySkills.map((skill) => (
                          <tr key={skill.name}>
                            <td style={{ width: "70%" }}>
                              <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <input
                                  type="checkbox"
                                  checked={skill.checked}
                                  onChange={(e) => onChange(`skillcheck_${skill.name}`, e.target.checked ? "on" : "")}
                                />
                                <span>{skill.name}</span>
                                <span style={{ color: "#888", fontSize: "0.85rem" }}>({skill.base})</span>
                              </label>
                            </td>
                            <td style={{ width: "30%" }}>
                              <input
                                type="number"
                                min="0"
                                max="99"
                                placeholder={skill.base.replace("%", "")}
                                value={skill.value}
                                onChange={(e) => onChange(`skill_${skill.name}`, e.target.value)}
                                style={{ width: "100%" }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="section-title">Portrait & Notes</div>
            <table>
              <tbody>
                <tr>
                  <th>Appearance</th>
                </tr>
                <tr>
                  <td>
                    <textarea
                      name="appearance"
                      placeholder="描绘形象、装束、伤疤、举止..."
                      value={form.appearance || ""}
                      onChange={(e) => onChange("appearance", e.target.value)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <table>
              <tbody>
                <tr>
                  <th>Traits / Ideology</th>
                </tr>
                <tr>
                  <td>
                    <textarea
                      name="ideology"
                      placeholder="信念、政治、宗教、性格癖好..."
                      value={form.ideology || ""}
                      onChange={(e) => onChange("ideology", e.target.value)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <table>
              <tbody>
                <tr>
                  <th>Significant People</th>
                </tr>
                <tr>
                  <td>
                    <textarea
                      name="people"
                      placeholder="重要之人、导师、家族、联系人..."
                      value={form.people || ""}
                      onChange={(e) => onChange("people", e.target.value)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <table>
              <tbody>
                <tr>
                  <th>Gear & Assets</th>
                </tr>
                <tr>
                  <td>
                    <textarea
                      name="gear"
                      placeholder="装备、物品、资产、资金..."
                      value={form.gear || ""}
                      onChange={(e) => onChange("gear", e.target.value)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="section-title">Weapons</div>
        <table>
          <tbody>
            <tr>
              <th>Weapon</th>
              <th>Skill</th>
              <th>Damage</th>
              <th>Range</th>
              <th>Attk/Rd</th>
              <th>Ammo</th>
            </tr>
            {weapons.map((w, i) => (
              <tr className="weapon-row" key={i}>
                <td>
                  <input
                    name={`weapon_${i}_name`}
                    placeholder={i === 0 ? ".38 口径左轮手枪" : "武器"}
                    value={w.name}
                    onChange={(e) => onChange(`weapon_${i}_name`, e.target.value)}
                  />
                </td>
                <td>
                  <input
                    name={`weapon_${i}_skill`}
                    placeholder={i === 0 ? "手枪" : "技能"}
                    value={w.skill}
                    onChange={(e) => onChange(`weapon_${i}_skill`, e.target.value)}
                  />
                </td>
                <td>
                  <input
                    name={`weapon_${i}_damage`}
                    placeholder={i === 0 ? "1d10" : "-"}
                    value={w.damage}
                    onChange={(e) => onChange(`weapon_${i}_damage`, e.target.value)}
                  />
                </td>
                <td>
                  <input
                    name={`weapon_${i}_range`}
                    placeholder={i === 0 ? "15" : "-"}
                    value={w.range}
                    onChange={(e) => onChange(`weapon_${i}_range`, e.target.value)}
                  />
                </td>
                <td>
                  <input
                    name={`weapon_${i}_attacks`}
                    placeholder={i === 0 ? "1" : "-"}
                    value={w.attacks}
                    onChange={(e) => onChange(`weapon_${i}_attacks`, e.target.value)}
                  />
                </td>
                <td>
                  <input
                    name={`weapon_${i}_ammo`}
                    placeholder={i === 0 ? "6" : "-"}
                    value={w.ammo}
                    onChange={(e) => onChange(`weapon_${i}_ammo`, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="section-title">Background Story</div>
        <table>
          <tbody>
            <tr>
              <td>
                <textarea
                  name="backstory"
                  placeholder="背景故事、案件、动机、恐惧、秘密..."
                  value={form.backstory || ""}
                  onChange={(e) => onChange("backstory", e.target.value)}
                />
              </td>
            </tr>
          </tbody>
        </table>

        {saveMessage && (
          <div
            style={{
              marginTop: "12px",
              padding: "12px",
              borderRadius: "4px",
              backgroundColor: saveMessage.type === "success" ? "#d4edda" : "#f8d7da",
              color: saveMessage.type === "success" ? "#155724" : "#721c24",
              border: `1px solid ${saveMessage.type === "success" ? "#c3e6cb" : "#f5c6cb"}`,
            }}
          >
            {saveMessage.text}
          </div>
        )}
        <div style={{ marginTop: "20px", textAlign: "center", display: "flex", gap: "12px", justifyContent: "center" }}>
          {saveMessage && (
            <button
              className="pill-btn"
              type="button"
              onClick={() => setSaveMessage(null)}
              style={{ background: "#8b7355", borderColor: "#8b7355", color: "#f5f1e8" }}
            >
              清空消息
            </button>
          )}
          <button className="pill-btn" type="submit" disabled={saving}>
            {saving ? "创建中..." : "🎲 创建角色"}
          </button>
        </div>
      </form>
    </div>
  );

  if (page === "home") {
    return (
      <>
        <Homes 
          onCreate={() => setPage("sheet")} 
          onStartGame={handleShowCharacterSelector}
          onContinueGame={handleContinueGame}
        />
        {showCheckpointSelector && (
          <div className="checkpoint-selector-overlay" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}>
            <div className="checkpoint-selector" style={{
              backgroundColor: '#f5f1e8',
              padding: '30px',
              borderRadius: '8px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              border: '3px solid #8b7355',
              boxShadow: '0 8px 20px rgba(0, 0, 0, 0.3)',
            }}>
              <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#3d2817' }}>📂 选择存档</h2>
              
              {loadingCheckpoints ? (
                <p>加载存档列表中...</p>
              ) : checkpoints.length === 0 ? (
                <p style={{ color: '#666' }}>暂无存档</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {checkpoints.map((checkpoint: any) => (
                    <div
                      key={checkpoint.checkpointId}
                      onClick={() => handleLoadCheckpoint(checkpoint.checkpointId)}
                      style={{
                        padding: '15px',
                        border: '2px solid #8b7355',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        backgroundColor: '#fff',
                        transition: 'background-color 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f0ebe0';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#fff';
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '5px', color: '#3d2817' }}>
                        {checkpoint.checkpointName || '未命名存档'}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>
                        {checkpoint.currentSceneName && `场景: ${checkpoint.currentSceneName}`}
                        {checkpoint.currentLocation && ` | 位置: ${checkpoint.currentLocation}`}
                        {checkpoint.gameDay && ` | 第 ${checkpoint.gameDay} 天`}
                        {checkpoint.gameTime && ` | ${checkpoint.gameTime}`}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '5px' }}>
                        {checkpoint.createdAt && new Date(checkpoint.createdAt).toLocaleString('zh-CN')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <button
                onClick={() => setShowCheckpointSelector(false)}
                style={{
                  marginTop: '20px',
                  padding: '10px 20px',
                  backgroundColor: '#8b7355',
                  color: '#f5f1e8',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                }}
              >
                取消
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (page === "mod-select") {
    return (
      <>
        <ModSelector
          onSelectMod={handleSelectMod}
          onCancel={handleBackToHome}
        />
        
        {/* Loading Progress Modal */}
        {loadingModData && (
          <div className="mod-loading-overlay" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
            padding: '20px',
          }}>
            <div className="mod-loading-modal" style={{
              backgroundColor: '#f5f1e8',
              padding: '40px',
              borderRadius: '8px',
              maxWidth: '500px',
              width: '90%',
              border: '3px solid #8b7355',
              boxShadow: '0 8px 20px rgba(0, 0, 0, 0.5)',
              fontFamily: 'serif',
            }}>
              <h2 style={{ 
                marginTop: 0, 
                marginBottom: '30px', 
                color: '#3d2817',
                fontSize: '1.8rem',
                textAlign: 'center',
              }}>
                📦 正在加载模组数据
              </h2>
              
              {modLoadProgress && (
                <>
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                      fontSize: '0.9rem',
                      color: '#5a4a3a',
                    }}>
                      <span>{modLoadProgress.stage}</span>
                      <span>{modLoadProgress.progress}%</span>
                    </div>
                    <div style={{
                      width: '100%',
                      height: '24px',
                      backgroundColor: '#ddd',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: '2px solid #8b7355',
                    }}>
                      <div style={{
                        width: `${modLoadProgress.progress}%`,
                        height: '100%',
                        backgroundColor: '#8b7355',
                        transition: 'width 0.3s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#f5f1e8',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                      }}>
                        {modLoadProgress.progress >= 10 && `${modLoadProgress.progress}%`}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{
                    textAlign: 'center',
                    color: '#5a4a3a',
                    fontSize: '1rem',
                    minHeight: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {modLoadProgress.message}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  if (page === "module-intro") {
    return (
      <>
        <div className="module-intro-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px',
        }}>
          <div className="module-intro-modal" style={{
            backgroundColor: '#f5f1e8',
            padding: '40px',
            borderRadius: '8px',
            maxWidth: '800px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
            border: '3px solid #8b7355',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.5)',
            fontFamily: 'serif',
          }}>
            <h2 style={{ 
              marginTop: 0, 
              marginBottom: '20px', 
              color: '#3d2817',
              fontSize: '1.8rem',
              borderBottom: '2px solid #8b7355',
              paddingBottom: '10px'
            }}>
              📖 模块导入
            </h2>
            
            {moduleIntroduction && (
              <>
                <div style={{ marginBottom: '30px' }}>
                  <h3 style={{ color: '#5a4a3a', marginBottom: '10px', fontSize: '1.2rem' }}>
                    故事介绍
                  </h3>
                  <div style={{
                    backgroundColor: '#fff',
                    padding: '20px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    lineHeight: '1.8',
                    color: '#2c2c2c',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {moduleIntroduction.introduction}
                  </div>
                </div>

                <div style={{ marginBottom: '30px' }}>
                  <h3 style={{ color: '#5a4a3a', marginBottom: '10px', fontSize: '1.2rem' }}>
                    📝 角色创建指导
                  </h3>
                  <div style={{
                    backgroundColor: '#fff',
                    padding: '20px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    lineHeight: '1.8',
                    color: '#2c2c2c',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {moduleIntroduction.characterGuidance}
                  </div>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setPage("mod-select")}
                style={{
                  flex: 1,
                  padding: '15px 20px',
                  backgroundColor: '#6b5a45',
                  color: '#f5f1e8',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#5a4a3a';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#6b5a45';
                }}
              >
                返回选择模组
              </button>
              <button
                onClick={() => setPage("character-select")}
                style={{
                  flex: 2,
                  padding: '15px 20px',
                  backgroundColor: '#8b7355',
                  color: '#f5f1e8',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#6b5a45';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#8b7355';
                }}
              >
                下一步：选择角色
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (page === "character-select") {
    return (
      <CharacterSelector
        onSelectCharacter={handleSelectCharacter}
        onCancel={() => setPage("module-intro")}
        onCreateNew={() => setPage("sheet")}
      />
    );
  }
  
  if (page === "game") {
    return (
      <div className="game-container">
        <div className="game-header">
          <h1>Call of Cthulhu - Game Session</h1>
          <button className="back-button" onClick={handleBackToHome}>
            ← 返回首页
          </button>
        </div>
          <GameChat 
            sessionId={sessionId} 
            apiBaseUrl="http://localhost:3000/api"
            characterName={characterName}
            moduleIntroduction={moduleIntroduction}
          />
      </div>
    );
  }
  
  return sheet;
};

export default App;
