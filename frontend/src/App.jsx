import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const BACKEND_URL = 'https://anonymous-chat-production-51a6.up.railway.app';
const socket = io(BACKEND_URL, { autoConnect: true });

export default function App() {
  const [status, setStatus] = useState('idle');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    socket.on('matched', () => {
      setStatus('chatting');
      setMessages([]);
      setErrorMsg('');
    });
    socket.on('waiting', () => {
      setStatus('searching');
    });
    socket.on('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });
    socket.on('partner_disconnected', () => {
      setStatus('ended');
    });
    socket.on('skipped', () => {
      setStatus('idle');
      setMessages([]);
    });
    socket.on('error_msg', (msg) => {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 3000);
    });
    return () => {
      socket.off('matched');
      socket.off('waiting');
      socket.off('receive_message');
      socket.off('partner_disconnected');
      socket.off('skipped');
      socket.off('error_msg');
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFindMatch = () => {
    setStatus('searching');
    setMessages([]);
    socket.emit('find_match');
  };

  const handleSend = () => {
    if (!input.trim()) return;
    socket.emit('send_message', { content: input });
    setInput('');
  };

  const handleSkip = () => {
    socket.emit('skip');
    setStatus('idle');
    setMessages([]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSend();
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>💬 Anonymous Chat</h1>

      <div style={styles.statusBar}>
        {status === 'idle' && <span style={{ color: '#aaa' }}>● Not connected</span>}
        {status === 'searching' && <span style={{ color: '#f0a500' }}>⏳ Searching for a partner...</span>}
        {status === 'chatting' && <span style={{ color: '#4caf50' }}>● Connected to a stranger</span>}
        {status === 'ended' && <span style={{ color: '#f44336' }}>● Partner disconnected</span>}
      </div>

      {(status === 'chatting' || status === 'ended') && (
        <div style={styles.chatBox}>
          {messages.length === 0 && (
            <p style={styles.hint}>Say hello! Your chat is anonymous 👋</p>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                ...styles.message,
                alignSelf: msg.from === 'me' ? 'flex-end' : 'flex-start',
                backgroundColor: msg.from === 'me' ? '#0084ff' : '#3a3a3a',
              }}
            >
              {msg.content}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {errorMsg && <div style={styles.error}>{errorMsg}</div>}

      {status === 'chatting' && (
        <div style={styles.inputRow}>
          <input
            style={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (max 500 chars)"
            maxLength={500}
          />
          <button style={styles.sendBtn} onClick={handleSend}>Send</button>
        </div>
      )}

      <div style={styles.btnRow}>
        {(status === 'idle' || status === 'ended') && (
          <button style={styles.startBtn} onClick={handleFindMatch}>
            {status === 'ended' ? '🔄 Find New Partner' : '🚀 Start Chat'}
          </button>
        )}
        {(status === 'chatting' || status === 'searching') && (
          <button style={styles.skipBtn} onClick={handleSkip}>
            ⏭ Skip / End Chat
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '600px',
    margin: '40px auto',
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
    backgroundColor: '#1a1a1a',
    minHeight: '100vh',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  title: { textAlign: 'center', fontSize: '24px', margin: 0 },
  statusBar: {
    textAlign: 'center',
    fontSize: '14px',
    padding: '8px',
    backgroundColor: '#2a2a2a',
    borderRadius: '8px',
  },
  chatBox: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: '8px',
    padding: '12px',
    minHeight: '350px',
    maxHeight: '400px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  hint: { color: '#666', textAlign: 'center', fontSize: '14px' },
  message: {
    padding: '8px 12px',
    borderRadius: '12px',
    maxWidth: '75%',
    fontSize: '14px',
    wordBreak: 'break-word',
  },
  inputRow: { display: 'flex', gap: '8px' },
  input: {
    flex: 1,
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #444',
    backgroundColor: '#2a2a2a',
    color: '#fff',
    fontSize: '14px',
  },
  sendBtn: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#0084ff',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
  },
  btnRow: { display: 'flex', justifyContent: 'center' },
  startBtn: {
    padding: '12px 32px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#4caf50',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 'bold',
  },
  skipBtn: {
    padding: '12px 32px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#f44336',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '16px',
  },
  error: {
    backgroundColor: '#b71c1c',
    color: '#fff',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '13px',
    textAlign: 'center',
  },
};