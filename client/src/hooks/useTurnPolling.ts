/**
 * Custom hook for polling turn status
 * 
 * This hook handles polling the server for turn completion and manages the polling state.
 */

import { useState, useEffect, useRef } from 'react';

export interface TurnStatus {
  turnId: string;
  turnNumber: number;
  characterInput: string;
  keeperNarrative: string | null;
  status: 'processing' | 'completed' | 'error';
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  sceneId: string | null;
  sceneName: string | null;
  location: string | null;
}

export interface UseTurnPollingResult {
  turn: TurnStatus | null;
  isPolling: boolean;
  error: string | null;
  startPolling: (turnId: string) => void;
  stopPolling: () => void;
}

export function useTurnPolling(
  apiBaseUrl: string = 'http://localhost:3000/api',
  pollInterval: number = 1000  // Poll every 1 second
): UseTurnPollingResult {
  const [turn, setTurn] = useState<TurnStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentTurnIdRef = useRef<string | null>(null);

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
    currentTurnIdRef.current = null;
  };

  const pollTurnStatus = async (turnId: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/turns/${turnId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch turn status');
      }

      setTurn(data.turn);

      // Stop polling if turn is completed or error
      if (data.turn.status === 'completed' || data.turn.status === 'error') {
        stopPolling();
        
        if (data.turn.status === 'error') {
          setError(data.turn.errorMessage || 'Turn processing failed');
        }
      }
    } catch (err) {
      console.error('Error polling turn:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      stopPolling();
    }
  };

  const startPolling = (turnId: string) => {
    // Clear any existing polling
    stopPolling();
    setError(null);
    setTurn(null);
    
    currentTurnIdRef.current = turnId;
    setIsPolling(true);

    // Initial poll
    pollTurnStatus(turnId);

    // Set up interval for continuous polling
    intervalRef.current = setInterval(() => {
      if (currentTurnIdRef.current) {
        pollTurnStatus(currentTurnIdRef.current);
      }
    }, pollInterval);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  return {
    turn,
    isPolling,
    error,
    startPolling,
    stopPolling,
  };
}


