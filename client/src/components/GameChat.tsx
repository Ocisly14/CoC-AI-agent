/**
 * GameChat Component - Main game interaction interface
 * 
 * Handles sending messages to the game and displaying conversation history.
 */

import { useState, useEffect, useRef } from 'react';
import { useTurnPolling } from '../hooks/useTurnPolling';

interface Message {
  role: 'character' | 'keeper';
  content: string;
  timestamp: string;
  turnNumber: number;
}

interface GameChatProps {
  sessionId: string;
  apiBaseUrl?: string;
  characterName?: string;
  moduleIntroduction?: { introduction: string; characterGuidance: string } | null;
  initialMessages?: Message[];
}

export function GameChat({ sessionId, apiBaseUrl = 'http://localhost:3000/api', characterName = 'Investigator', moduleIntroduction, initialMessages }: GameChatProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages || []);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { turn, isPolling, error, startPolling } = useTurnPolling(apiBaseUrl);

  // Load conversation history on mount or when sessionId changes
  useEffect(() => {
    // If initialMessages are provided, use them; otherwise load from API
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages);
    } else if (sessionId) {
      loadConversationHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Update messages when initialMessages prop changes (e.g., when loading checkpoint)
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages);
    } else if (!initialMessages && sessionId) {
      // If initialMessages is cleared, reload from API
      loadConversationHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update messages when turn completes
  useEffect(() => {
    if (turn && turn.status === 'completed' && turn.keeperNarrative) {
      // Add both character input and keeper response
      setMessages(prev => [
        ...prev,
        {
          role: 'character',
          content: turn.characterInput,
          timestamp: turn.startedAt,
          turnNumber: turn.turnNumber,
        },
        {
          role: 'keeper',
          content: turn.keeperNarrative,
          timestamp: turn.completedAt || turn.startedAt,
          turnNumber: turn.turnNumber,
        }
      ]);
      setIsSending(false);
    }
  }, [turn]);

  const loadConversationHistory = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/conversation`);
      const data = await response.json();

      if (data.success && data.conversation) {
        setMessages(data.conversation);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load conversation history:', err);
      setMessages([]);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isSending) return;

    const messageText = inputValue.trim();
    setInputValue('');
    setIsSending(true);

    try {
      // Send message and create turn
      const response = await fetch(`${apiBaseUrl}/turns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageText,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to send message');
      }

      // Start polling for turn completion
      startPolling(data.turnId);

    } catch (err) {
      console.error('Failed to send message:', err);
      setIsSending(false);
      alert('Failed to send message: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSaveCheckpoint = async () => {
    if (isSaving) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch(`${apiBaseUrl}/checkpoints/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to save checkpoint');
      }

      setSaveMessage(`✓ ${data.message}: ${data.checkpointName}`);
      
      // Clear message after 3 seconds
      setTimeout(() => {
        setSaveMessage(null);
      }, 3000);
    } catch (err) {
      console.error('Failed to save checkpoint:', err);
      setSaveMessage('存档失败: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="game-chat-container">
      {/* Session Info Bar */}
      <div className="session-info-bar">
        <div className="session-metadata">
          <span className="session-label">Session ID:</span>
          <span className="session-value">{sessionId}</span>
        </div>
        <div className="character-info">
          <span className="character-label">Playing as:</span>
          <span className="character-value">{characterName}</span>
        </div>
        <div className="save-checkpoint-section">
          <button
            className="save-checkpoint-btn"
            onClick={handleSaveCheckpoint}
            disabled={isSaving}
            title="保存当前游戏进度"
          >
            {isSaving ? '💾 保存中...' : '💾 存档'}
          </button>
          {saveMessage && (
            <span className="save-message" style={{ 
              marginLeft: '10px', 
              fontSize: '0.85rem',
              color: saveMessage.startsWith('✓') ? '#155724' : '#721c24'
            }}>
              {saveMessage}
            </span>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="messages-scroll-area">
        {messages.length === 0 && (
          <div className="empty-chat-prompt">
            <p>🎲 Welcome to Call of Cthulhu!</p>
            <p>Describe your investigator's actions to begin the adventure...</p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div key={index} className={`chat-message ${msg.role}`}>
            <div className="message-meta">
              <span className="sender-name">
                {msg.role === 'character' ? `📝 ${characterName}` : '🎭 Keeper'}
              </span>
              <span className="message-timestamp">
                {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </span>
            </div>
            <div className="message-text">{msg.content}</div>
          </div>
        ))}

        {(isSending || isPolling) && (
          <div className="chat-message keeper loading">
            <div className="message-meta">
              <span className="sender-name">🎭 Keeper</span>
            </div>
            <div className="message-text">
              <span className="typing-indicator">
                <span>•</span><span>•</span><span>•</span>
              </span>
              {isPolling ? ' The Keeper contemplates...' : ' Processing your action...'}
            </div>
          </div>
        )}

        {error && (
          <div className="error-message">
            <strong>⚠️ Error:</strong> {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="chat-input-area">
        <textarea
          className="action-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="I examine the ancient tome on the desk..."
          disabled={isSending || isPolling}
          rows={3}
        />
        <button
          className="submit-action-btn"
          onClick={handleSendMessage}
          disabled={!inputValue.trim() || isSending || isPolling}
        >
          {isSending || isPolling ? '⏳ Processing...' : '🎲 Declare Action'}
        </button>
      </div>
    </div>
  );
}


