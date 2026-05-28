import { createContext, useContext, useEffect, useRef, useState } from 'react';

const WSContext = createContext(null);

export function WSProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const wsRef = useRef(null);
  const listeners = useRef(new Set());

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(`ws://localhost:3001`);

      ws.onopen = () => { setConnected(true); wsRef.current = ws; };
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 3000); // reconecta após 3s
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastMessage(data);
          listeners.current.forEach((fn) => fn(data));
        } catch {}
      };
    }

    connect();
    return () => wsRef.current?.close();
  }, []);

  const subscribe = (fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  };

  return (
    <WSContext.Provider value={{ connected, lastMessage, subscribe }}>
      {children}
    </WSContext.Provider>
  );
}

export const useWS = () => useContext(WSContext);
