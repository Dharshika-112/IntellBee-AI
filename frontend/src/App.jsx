// frontend/src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar.jsx';
import { speak, stopSpeaking, ready as speechReady, pickVoice } from './utils/speech.js';

function App() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatId, setChatId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceGender, setVoiceGender] = useState('female');
  const [language, setLanguage] = useState('en-US');
  const [isTyping, setIsTyping] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');

  const listRef = useRef(null);

  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const isAuthed = !!token;

  useEffect(() => { speechReady(); }, []);

  const fetchMe = async () => {
    if (!isAuthed) return;
    const res = await fetch('/api/user/me', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data && data.name) setName(data.name);
    if (data && data.username) setUsername(data.username);
    if (data && data.prefs) {
      if (data.prefs.lang) setLanguage(data.prefs.lang);
      if (data.prefs.voiceGender) setVoiceGender(data.prefs.voiceGender);
    }
  };

  const savePrefs = async (prefs) => {
    if (!isAuthed) return;
    await fetch('/api/user/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(prefs) });
  };

  const scrollToBottom = () => { requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }); };

  const loadHistory = () => {
    if (!isAuthed) return;
    fetch('/api/history', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        const convos = data.conversations || [];
        setConversations(convos);
        if (convos.length > 0) {
          const latest = convos[0];
          setMessages(latest.messages || []);
          setChatId(latest.id);
          scrollToBottom();
        } else {
          setMessages([]);
          setChatId(null);
        }
      })
      .catch(err => console.error('Failed to load history:', err));
  };

  useEffect(() => { loadHistory(); fetchMe(); /* eslint-disable-next-line */ }, [isAuthed]);

  const authSubmit = async () => {
    const path = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
    const payload = authMode === 'signup' ? { name, username, email, password } : { email, password };
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      setToken(data.token);
      if (data.name) setName(data.name);
      if (data.username) setUsername(data.username);
      if (data.prefs) {
        if (data.prefs.lang) setLanguage(data.prefs.lang);
        if (data.prefs.voiceGender) setVoiceGender(data.prefs.voiceGender);
      }
      setEmail(''); setPassword(''); setAuthMode('login'); loadHistory();
    } else if (data.error) { alert(data.error); }
  };

  const logout = () => { localStorage.removeItem('token'); setToken(''); setConversations([]); setMessages([]); setChatId(null); setName(''); setUsername(''); };

  const resolveVoiceName = () => pickVoice({ lang: language, gender: voiceGender });

  const sendMessage = async () => {
    if (!message.trim() || !isAuthed) return;
    const userMsg = { role: 'user', content: message };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);
    const outgoing = message;
    setMessage('');
    scrollToBottom();

    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ message: outgoing, chat_id: chatId, lang: language }) });
      const data = await res.json();
      setIsTyping(false);
      if (data.conversations && data.conversations.length > 0) {
        setConversations(data.conversations);
        const latest = data.conversations[0];
        setMessages(latest.messages || []);
        setChatId(latest.id);
        scrollToBottom();
        const lastMsg = (latest.messages || []).slice().reverse().find(m => m.role === 'model');
        if (voiceEnabled && lastMsg && lastMsg.content) speak(lastMsg.content, { lang: language, voiceName: resolveVoiceName() });
      } else if (data.response) {
        const aiMsg = { role: 'model', content: data.response };
        setMessages(prev => [...prev, aiMsg]);
        scrollToBottom();
        if (voiceEnabled) speak(data.response, { lang: language, voiceName: resolveVoiceName() });
      } else if (data.error) { alert(data.error); }
    } catch (err) {
      setIsTyping(false);
      setMessages(prev => [...prev, { role: 'model', content: '❌ Failed to connect to AI.' }]);
      scrollToBottom();
    }
  };

  const handleSelectChat = (id) => { const selected = conversations.find(c => c.id === id); if (selected) { setChatId(selected.id); setMessages(selected.messages || []); scrollToBottom(); } };
  const handleNewChat = () => { setChatId(null); setMessages([]); };
  const toggleVoice = () => { setVoiceEnabled(v => { const next = !v; if (!next) stopSpeaking(); return next; }); };

  const onLangChange = async (val) => { setLanguage(val); await savePrefs({ lang: val }); };
  const onGenderChange = async (val) => { setVoiceGender(val); await savePrefs({ voiceGender: val }); };

  if (!isAuthed) {
    return (
      <div className="frame">
        <div className="frame-border"></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div className="card" style={{ width: 460, padding: 28, position: 'relative' }}>
            <div className="header-brand" style={{ justifyContent: 'center', marginBottom: 10 }}>
              <h2 style={{ margin: 0, color: 'var(--color-primary)' }}>INTELLBEE</h2>
              <span role="img" aria-label="bee">🐝</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {authMode === 'signup' && <input className="input" type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />}
              {authMode === 'signup' && <input className="input" type="text" placeholder="Username (short)" value={username} onChange={(e) => setUsername(e.target.value)} />}
              <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button onClick={authSubmit} style={{ background: 'var(--color-primary)', color: 'white' }}>{authMode === 'signup' ? 'Create account' : 'Log in'}</button>
              <button onClick={() => setAuthMode(authMode === 'signup' ? 'login' : 'signup')}>
                {authMode === 'signup' ? 'Have an account? Log in' : 'Need an account? Sign up'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="frame" style={{ position: 'relative' }}>
      <div className="frame-border"></div>
      {username && (
        <div className="card" style={{ position: 'absolute', top: -10, right: 30, padding: '6px 12px', borderRadius: 12 }}>
          <span role="img" aria-label="sparkles">✨</span> Hi {username}
        </div>
      )}
      <div style={{ display: 'flex', height: '100%', gap: 12 }}>
        <Sidebar conversations={conversations} activeChatId={chatId} onSelectChat={handleSelectChat} onNewChat={handleNewChat} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="header-brand">
              <h1 style={{ margin: 0 }}>INTELLBEE</h1>
              <span role="img" aria-label="bee">🐝</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select className="input" value={language} onChange={(e) => onLangChange(e.target.value)}>
                <option value="en-US">English</option>
                <option value="ta-IN">Tamil</option>
                <option value="hi-IN">Hindi</option>
              </select>
              <select className="input" value={voiceGender} onChange={(e) => onGenderChange(e.target.value)}>
                <option value="female">Female voice</option>
                <option value="male">Male voice</option>
              </select>
              <button onClick={toggleVoice} style={{ background: voiceEnabled ? 'var(--color-primary)' : '#ddd', color: voiceEnabled ? 'white' : '#111827' }}>{voiceEnabled ? 'Voice: On' : 'Voice: Off'}</button>
              <button onClick={logout} style={{ background: '#fde68a' }}>Logout</button>
            </div>
          </div>

          <div ref={listRef} className="card" style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
            {messages.length === 0 && <p style={{ opacity: 0.6 }}>Start a conversation...</p>}
            {messages.map((msg, i) => (
              <div key={i} style={{ maxWidth: 720, padding: 12, marginBottom: 12, alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start' }} className={msg.role === 'user' ? 'bubble-user' : 'bubble-ai'}>
                {msg.role !== 'user' && <span role="img" aria-label="robot">🤖</span>}
                <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br>') }} />
              </div>
            ))}
            {isTyping && (
              <div className="bubble-ai" style={{ maxWidth: 200, padding: 12 }}>
                <span role="img" aria-label="robot">🤖</span>
                <span className="typing-dots">Typing...</span>
              </div>
            )}
          </div>

          <div className="message-box" style={{ display: 'flex', gap: 8, marginTop: 12, padding: 12 }}>
            <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendMessage()} placeholder="Message INTELLBEE..." className="input" style={{ flex: 1 }} />
            <label className="input" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
              📷
              <input id="image-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !isAuthed) return;
                setIsTyping(true);
                const form = new FormData();
                form.append('image', file);
                form.append('message', message);
                form.append('chat_id', chatId || '');
                form.append('lang', language);
                const res = await fetch('/api/chat', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
                const data = await res.json();
                setIsTyping(false);
                if (data.conversations) {
                  setConversations(data.conversations);
                  const latest = data.conversations[0];
                  setMessages(latest.messages || []);
                  setChatId(latest.id);
                  scrollToBottom();
                } else if (data.response) {
                  setMessages(prev => [...prev, { role: 'model', content: data.response }]);
                  scrollToBottom();
                }
                e.target.value = '';
              }} />
            </label>
            <label className="input" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
              🎤
              <input id="audio-input" type="file" accept="audio/*" style={{ display: 'none' }} onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !isAuthed) return;
                setIsTyping(true);
                const form = new FormData();
                form.append('audio', file);
                form.append('message', message);
                form.append('chat_id', chatId || '');
                form.append('lang', language);
                const res = await fetch('/api/chat', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
                const data = await res.json();
                setIsTyping(false);
                if (data.conversations) {
                  setConversations(data.conversations);
                  const latest = data.conversations[0];
                  setMessages(latest.messages || []);
                  setChatId(latest.id);
                  scrollToBottom();
                } else if (data.response) {
                  setMessages(prev => [...prev, { role: 'model', content: data.response }]);
                  scrollToBottom();
                }
                e.target.value = '';
              }} />
            </label>
            <button onClick={sendMessage} style={{ background: 'var(--color-primary)', color: 'white' }}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;