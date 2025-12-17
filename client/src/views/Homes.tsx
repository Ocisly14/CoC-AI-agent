import React, { useState } from "react";

interface HomeProps {
  onCreate: () => void;
  onStartGame: () => void;
  onContinueGame: () => void;
}

const Homes: React.FC<HomeProps> = ({ onCreate, onStartGame, onContinueGame }) => {
  const handleStartGame = () => {
    // Just trigger the character selector
    onStartGame();
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

        <div className="home-actions">
          <button className="primary" onClick={handleStartGame}>
            🎮 新游戏
          </button>
          <button className="secondary" onClick={onContinueGame}>
            📂 继续游戏
          </button>
          <button onClick={onCreate}>
            创建角色
          </button>
        </div>
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
