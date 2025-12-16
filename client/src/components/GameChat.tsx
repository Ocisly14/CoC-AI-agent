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
    <div className="game-chat">
      <div className="chat-header">
        <h2>Game Chat</h2>
        <span className="session-info">Session: {sessionId}</span>
      </div>

      <div className="messages-container">
        {messages.map((msg, index) => (
          <div key={index} className={`message message-${msg.role}`}>
            <div className="message-header">
              <span className="message-sender">
                {msg.role === 'character' ? characterName : 'Keeper'}
              </span>
              <span className="message-time">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}

        {(isSending || isPolling) && (
          <div className="message message-keeper message-loading">
            <div className="message-header">
              <span className="message-sender">Keeper</span>
            </div>
            <div className="message-content">
              <div className="loading-indicator">
                <span>.</span><span>.</span><span>.</span>
              </div>
              {isPolling ? 'Thinking...' : 'Processing...'}
            </div>
          </div>
        )}

        {error && (
          <div className="message message-error">
            <div className="message-content">Error: {error}</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <textarea
          className="chat-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Describe your action..."
          disabled={isSending || isPolling}
          rows={3}
        />
        <button
          className="send-button"
          onClick={handleSendMessage}
          disabled={!inputValue.trim() || isSending || isPolling}
        >
          {isSending || isPolling ? 'Processing...' : 'Send'}
        </button>
      </div>

      <style>{`
        .game-chat {
          display: flex;
          flex-direction: column;
          height: 100%;
          max-width: 800px;
          margin: 0 auto;
        }

        .chat-header {
          padding: 1rem;
          background: #2c3e50;
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .session-info {
          font-size: 0.8rem;
          opacity: 0.7;
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
          background: #ecf0f1;
        }

        .message {
          margin-bottom: 1rem;
          padding: 0.75rem;
          border-radius: 8px;
          animation: fadeIn 0.3s ease-in;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .message-character {
          background: #3498db;
          color: white;
          margin-left: auto;
          max-width: 70%;
        }

        .message-keeper {
          background: white;
          border: 1px solid #bdc3c7;
          max-width: 80%;
        }

        .message-loading {
          opacity: 0.7;
        }

        .message-error {
          background: #e74c3c;
          color: white;
        }

        .message-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.5rem;
          font-size: 0.85rem;
        }

        .message-sender {
          font-weight: bold;
        }

        .message-time {
          opacity: 0.7;
        }

        .message-content {
          line-height: 1.5;
          white-space: pre-wrap;
        }

        .loading-indicator {
          display: inline-block;
        }

        .loading-indicator span {
          animation: blink 1.4s infinite;
        }

        .loading-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .loading-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes blink {
          0%, 20% { opacity: 0.2; }
          50% { opacity: 1; }
          100% { opacity: 0.2; }
        }

        .chat-input-container {
          padding: 1rem;
          background: white;
          border-top: 1px solid #bdc3c7;
          display: flex;
          gap: 0.5rem;
        }

        .chat-input {
          flex: 1;
          padding: 0.75rem;
          border: 1px solid #bdc3c7;
          border-radius: 4px;
          font-family: inherit;
          font-size: 1rem;
          resize: none;
        }

        .chat-input:focus {
          outline: none;
          border-color: #3498db;
        }

        .chat-input:disabled {
          background: #ecf0f1;
          cursor: not-allowed;
        }

        .send-button {
          padding: 0.75rem 1.5rem;
          background: #3498db;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
          transition: background 0.2s;
        }

        .send-button:hover:not(:disabled) {
          background: #2980b9;
        }

        .send-button:disabled {
          background: #95a5a6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}


