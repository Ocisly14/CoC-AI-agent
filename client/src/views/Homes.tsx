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
          <h1>CoC AI Keeper</h1>
          <p className="lede">
            Manage investigators and let orchestrator, memory, action, and keeper agents run your scenarios.
          </p>
        </div>

        <div className="home-actions">
          <button className="primary" onClick={handleStartGame}>
            🎮 New Game
          </button>
          <button className="secondary" onClick={onContinueGame}>
            📂 Continue Game
          </button>
          <button onClick={onCreate}>
            Create Character
          </button>
        </div>
      </div>
    </div>
  );
};

export default Homes;
