import React from 'react';

function Sidebar({ conversations = [], activeChatId, onSelectChat, onNewChat }) {
  return (
    <aside className="sidebar-frame">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>History</h2>
        <button onClick={onNewChat}>New</button>
      </div>
      <div>
        {conversations.length === 0 && (
          <div style={{ color: '#555', fontSize: 14 }}>No conversations yet</div>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            onClick={() => onSelectChat && onSelectChat(c.id)}
            className="card"
            style={{
              padding: '8px 10px',
              borderRadius: 12,
              marginBottom: 10,
              cursor: 'pointer',
              background: c.id === activeChatId ? 'var(--color-primary)' : 'var(--color-card)',
              color: c.id === activeChatId ? 'white' : 'inherit'
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 14 }}>{c.title || c.id}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{new Date(c.created || Date.now()).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default Sidebar; 
