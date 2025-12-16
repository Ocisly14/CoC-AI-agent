import React, { useState, useEffect } from "react";

interface HomeProps {
  onCreate: () => void;
  onStartGame: (characterId?: string) => void;
}

const Homes: React.FC<HomeProps> = ({ onCreate, onStartGame }) => {
  const [characters, setCharacters] = useState<any[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<string>("");
  const [gameStarted, setGameStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Check if game is already started
  useEffect(() => {
    fetch("http://localhost:3000/api/gamestate")
      .then((res) => res.json())
      .then((data) => {
        setGameStarted(data.initialized || false);
      })
      .catch((err) => console.error("Failed to check game state:", err));
  }, []);

  // Load characters
  useEffect(() => {
    fetch("http://localhost:3000/api/characters")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setCharacters(data.characters || []);
        }
      })
      .catch((err) => console.error("Failed to load characters:", err));
  }, []);

  const handleStartGame = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("http://localhost:3000/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: selectedCharacter || null }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: "success", text: data.message });
        setGameStarted(true);
        onStartGame(selectedCharacter);
      } else {
        setMessage({ type: "error", text: data.error || "启动游戏失败" });
      }
    } catch (error) {
      console.error("Error starting game:", error);
      setMessage({ type: "error", text: "网络错误，无法连接到服务器" });
    } finally {
      setLoading(false);
    }
  };

  const handleStopGame = async () => {
    if (!confirm("确定要停止当前游戏吗？游戏进度将会丢失！")) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("http://localhost:3000/api/game/stop", {
        method: "POST",
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: "success", text: data.message });
        setGameStarted(false);
        setSelectedCharacter("");
      } else {
        setMessage({ type: "error", text: data.error || "停止游戏失败" });
      }
    } catch (error) {
      console.error("Error stopping game:", error);
      setMessage({ type: "error", text: "网络错误" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home">
      <div className="hero">
        <div>
          <p className="eyebrow">Call of Cthulhu · Multi-Agent</p>
          <h1>CoC AI Agent</h1>
          <p className="lede">
            Manage investigators and let orchestrator, memory, action, and keeper agents run your scenarios.
          </p>
        </div>

        {message && (
          <div
            style={{
              marginTop: "12px",
              padding: "12px",
              borderRadius: "4px",
              backgroundColor: message.type === "success" ? "#d4edda" : "#f8d7da",
              color: message.type === "success" ? "#155724" : "#721c24",
              border: `1px solid ${message.type === "success" ? "#c3e6cb" : "#f5c6cb"}`,
            }}
          >
            {message.text}
          </div>
        )}

        {!gameStarted ? (
          <>
            <div style={{ marginTop: "20px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>
                选择角色（可选）:
              </label>
              <select
                value={selectedCharacter}
                onChange={(e) => setSelectedCharacter(e.target.value)}
                style={{
                  width: "100%",
                  maxWidth: "400px",
                  padding: "8px",
                  fontSize: "1rem",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                }}
              >
                <option value="">使用默认角色</option>
                {characters.map((char) => (
                  <option key={char.character_id} value={char.character_id}>
                    {char.name} {char.occupation ? `(${char.occupation})` : ""}
                  </option>
                ))}
              </select>
              {characters.length === 0 && (
                <p style={{ marginTop: "8px", color: "#666", fontSize: "0.9rem" }}>
                  还没有创建角色。点击"创建角色"按钮创建你的第一个调查员！
                </p>
              )}
            </div>

            <div className="home-actions">
              <button className="primary" onClick={handleStartGame} disabled={loading}>
                {loading ? "启动中..." : "🎮 开始游戏"}
              </button>
              <button onClick={onCreate} disabled={loading}>
                创建角色
              </button>
            </div>
          </>
        ) : (
          <div className="home-actions">
            <div
              style={{
                padding: "12px",
                backgroundColor: "#d1ecf1",
                color: "#0c5460",
                borderRadius: "4px",
                marginBottom: "12px",
              }}
            >
              ✅ 游戏进行中
            </div>
            <button onClick={handleStopGame} disabled={loading} style={{ background: "#dc3545" }}>
              {loading ? "停止中..." : "⏹ 停止游戏"}
            </button>
            <button onClick={onCreate} disabled={loading}>
              创建角色
            </button>
          </div>
        )}
      </div>

      <div className="home-panels">
        <div className="home-card">
          <h3>流程</h3>
          <p>Orchestrator → Memory → Action → Keeper，线性执行。</p>
        </div>
        <div className="home-card">
          <h3>角色卡</h3>
          <p>使用表格化的调查员卡，生成 JSON 以供后端保存。</p>
        </div>
        <div className="home-card">
          <h3>数据</h3>
          <p>后端使用 SQLite，前端可按需对接 API（未连接）。</p>
        </div>
      </div>
    </div>
  );
};

export default Homes;
