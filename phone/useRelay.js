// One WebSocket to the relay: receives the roster and the watched person's alert level.
import { useCallback, useEffect, useRef, useState } from 'react';

const CLEAR = { level: 'clear', reason: null };

export function useRelay(url) {
  const socketRef = useRef(null);
  const watchedRef = useRef(null);
  const [status, setStatus] = useState('connecting');
  const [roster, setRoster] = useState([]);
  const [dashboardOnline, setDashboardOnline] = useState(false);
  const [signal, setSignal] = useState(CLEAR);

  useEffect(() => {
    if (!url) return undefined;
    let retry = null;
    let closed = false;
    const connect = () => {
      setStatus('connecting');
      const socket = new WebSocket(url);
      socketRef.current = socket;
      socket.onopen = () => {
        setStatus('open');
        socket.send(JSON.stringify({ type: 'hello', role: 'phone' }));
        if (watchedRef.current) socket.send(JSON.stringify({ type: 'watch', assetId: watchedRef.current }));
      };
      socket.onmessage = (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'roster') setRoster(message.assets || []);
        else if (message.type === 'dashboard') setDashboardOnline(Boolean(message.online));
        else if (message.type === 'level' && message.assetId === watchedRef.current) setSignal({ level: message.level, reason: message.reason });
      };
      socket.onclose = () => {
        setStatus('closed');
        setSignal(CLEAR);
        if (!closed) retry = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      socketRef.current?.close();
    };
  }, [url]);

  const watch = useCallback((assetId) => {
    watchedRef.current = assetId;
    setSignal(CLEAR);
    const socket = socketRef.current;
    if (assetId && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'watch', assetId }));
  }, []);

  return { status, roster, dashboardOnline, signal, watch };
}
