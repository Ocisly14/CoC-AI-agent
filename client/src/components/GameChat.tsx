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
  moduleIntroduction?: { introduction: string; moduleNotes: string } | null;
  initialMessages?: Message[];
  onNarrativeComplete?: () => void;
}

export function GameChat({ sessionId, apiBaseUrl = 'http://localhost:3000/api', characterName = 'Investigator', moduleIntroduction, initialMessages, onNarrativeComplete }: GameChatProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages || []);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const processedTurnIdsRef = useRef<Set<string>>(new Set());
  const { turn, isPolling, error, startPolling } = useTurnPolling(apiBaseUrl);

  // Load conversation history on mount or when sessionId changes
  useEffect(() => {
    // If initialMessages are provided, use them; otherwise load from API
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages);
      // Mark all existing turnNumbers as processed
      const existingTurnNumbers = new Set(initialMessages.map(msg => msg.turnNumber));
      processedTurnIdsRef.current = new Set(Array.from(existingTurnNumbers).map(n => `turn-${n}`));
    } else if (sessionId) {
      loadConversationHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Update messages when initialMessages prop changes (e.g., when loading checkpoint)
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages);
      // Mark all existing turnNumbers as processed
      const existingTurnNumbers = new Set(initialMessages.map(msg => msg.turnNumber));
      processedTurnIdsRef.current = new Set(Array.from(existingTurnNumbers).map(n => `turn-${n}`));
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
    if (turn && turn.status === 'completed') {
      // Check if we've already processed this turn to avoid duplicates
      const turnKey = turn.turnId || `turn-${turn.turnNumber}`;
      if (processedTurnIdsRef.current.has(turnKey)) {
        console.log(`[GameChat] Turn ${turnKey} already processed, skipping...`);
        return;
      }

      // Log turn details for debugging
      console.log(`[GameChat] Processing completed turn:`, {
        turnId: turn.turnId,
        turnNumber: turn.turnNumber,
        hasKeeperNarrative: !!turn.keeperNarrative,
        keeperNarrativeLength: turn.keeperNarrative?.length || 0,
        characterInput: turn.characterInput?.substring(0, 50) + '...',
      });

      // Mark this turn as processed
      processedTurnIdsRef.current.add(turnKey);

      // Add both character input and keeper response
      setMessages(prev => {
        // Double-check to avoid duplicates in case of race conditions
        const existingTurnNumbers = new Set(prev.map(msg => msg.turnNumber));
        if (existingTurnNumbers.has(turn.turnNumber)) {
          console.log(`[GameChat] Turn ${turn.turnNumber} already exists in messages, skipping...`);
          return prev;
        }

        const newMessages: Message[] = [
          {
            role: 'character',
            content: turn.characterInput || '',
            timestamp: turn.startedAt,
            turnNumber: turn.turnNumber,
          }
        ];

        // Only add keeper message if narrative exists
        if (turn.keeperNarrative) {
          newMessages.push({
            role: 'keeper',
            content: turn.keeperNarrative,
            timestamp: turn.completedAt || turn.startedAt,
            turnNumber: turn.turnNumber,
          });
        } else {
          console.warn(`[GameChat] Turn ${turn.turnNumber} completed but keeperNarrative is empty`);
        }

        return [...prev, ...newMessages];
      });
      setIsSending(false);

      // Trigger sidebar refresh when narrative is complete
      if (onNarrativeComplete) {
        onNarrativeComplete();
      }
    } else if (turn && turn.status === 'error') {
      // Handle error case
      console.error(`[GameChat] Turn ${turn.turnId || turn.turnNumber} failed:`, turn.errorMessage);
      setIsSending(false);
    }
  }, [turn, onNarrativeComplete]);

  const loadConversationHistory = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/conversation`);
      const data = await response.json();

      if (data.success && data.conversation) {
        setMessages(data.conversation);
        // Mark all existing turnNumbers as processed
        const existingTurnNumbers = new Set(data.conversation.map((msg: Message) => msg.turnNumber));
        processedTurnIdsRef.current = new Set(Array.from(existingTurnNumbers).map(n => `turn-${n}`));
      } else {
        setMessages([]);
        processedTurnIdsRef.current.clear();
      }
    } catch (err) {
      console.error('Failed to load conversation history:', err);
      setMessages([]);
      processedTurnIdsRef.current.clear();
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
      setSaveMessage('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'));
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
            title="Save current game progress"
          >
            {isSaving ? '💾 Saving...' : '💾 Save'}
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