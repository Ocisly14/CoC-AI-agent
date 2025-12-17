/**
 * GameSidebar Component - Character status and clues panel
 *
 * Displays character information and collected clues in separate tabs.
 */

import { useState } from 'react';

interface GameSidebarProps {
  sessionId: string;
  apiBaseUrl?: string;
}

type TabType = 'status' | 'clues';

export function GameSidebar({ sessionId, apiBaseUrl = 'http://localhost:3000/api' }: GameSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('status');

  return (
    <div className="game-sidebar">
      {/* Tab Headers */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === 'status' ? 'active' : ''}`}
          onClick={() => setActiveTab('status')}
        >
          角色状态
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'clues' ? 'active' : ''}`}
          onClick={() => setActiveTab('clues')}
        >
          已获得的线索
        </button>
      </div>

      {/* Tab Content */}
      <div className="sidebar-content">
        {activeTab === 'status' && (
          <div className="tab-panel status-panel">
            <div className="status-section">
              <h3>基本属性</h3>
              <div className="status-grid">
                <div className="status-item">
                  <span className="status-label">HP:</span>
                  <span className="status-value">--/--</span>
                </div>
                <div className="status-item">
                  <span className="status-label">MP:</span>
                  <span className="status-value">--/--</span>
                </div>
                <div className="status-item">
                  <span className="status-label">SAN:</span>
                  <span className="status-value">--/--</span>
                </div>
                <div className="status-item">
                  <span className="status-label">LUCK:</span>
                  <span className="status-value">--</span>
                </div>
              </div>
            </div>

            <div className="status-section">
              <h3>当前状态</h3>
              <div className="status-list">
                <div className="status-item-full">
                  <span className="status-label">位置:</span>
                  <span className="status-value">未知</span>
                </div>
                <div className="status-item-full">
                  <span className="status-label">时间:</span>
                  <span className="status-value">--</span>
                </div>
                <div className="status-item-full">
                  <span className="status-label">天数:</span>
                  <span className="status-value">第 -- 天</span>
                </div>
              </div>
            </div>

            <div className="status-section">
              <h3>状态效果</h3>
              <div className="status-effects">
                <p className="empty-state">暂无状态效果</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'clues' && (
          <div className="tab-panel clues-panel">
            <div className="clues-section">
              <h3>重要线索</h3>
              <div className="clues-list">
                <p className="empty-state">暂无线索</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
