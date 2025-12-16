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
}

export function GameChat({ sessionId, apiBaseUrl = 'http://localhost:3000/api', characterName = 'Investigator' }: GameChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { turn, isPolling, error, startPolling } = useTurnPolling(apiBaseUrl);

  // Load conversation history on mount
  useEffect(() => {
    loadConversationHistory();
  }, [sessionId]);

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
      }
    } catch (err) {
      console.error('Failed to load conversation history:', err);
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


