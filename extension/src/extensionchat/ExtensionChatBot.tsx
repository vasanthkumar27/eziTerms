// ExtensionChatBot.tsx - Fusion theme
import API_ENDPOINTS from '../masterconstans/MasterConstants';
import { getAccessToken, getRefreshToken, setTokens } from '../utils/tokenStore';
import { fusion } from '../theme/fusionTheme';
import React, { useEffect, useRef, useState } from 'react';

type Message = {
  sender: 'user' | 'bot';
  text: string;
};

type ExtensionChatBotProps = {
  termsText: string | null;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
};

const ExtensionChatBot: React.FC<ExtensionChatBotProps> = ({ termsText, messages, setMessages }) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const suggestions = [
    'Summarize key risks',
    'What are hidden charges?',
    'Any termination issues?',
  ];

  const sendMessage = async () => {
    if (!input.trim()) return;
    if (!termsText) return;

    const userMessage: Message = { sender: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setLoading(true);

    try {
      let accessToken = await getAccessToken();
      const refreshToken = await getRefreshToken();

      let resp = await fetch(API_ENDPOINTS.AWS_BASE_API_URL + API_ENDPOINTS.CHATBOT_TEXT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ message: currentInput, terms_text: termsText }),
      });

      if (resp.status === 401 && refreshToken) {
        const refreshResp = await fetch(API_ENDPOINTS.AWS_BASE_API_URL + API_ENDPOINTS.REFRESH_TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: refreshToken }),
        });

        if (refreshResp.ok) {
          const refreshData = await refreshResp.json();
          await setTokens(refreshData.access, refreshToken);
          accessToken = refreshData.access;

          resp = await fetch(API_ENDPOINTS.AWS_BASE_API_URL + API_ENDPOINTS.CHATBOT_TEXT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ message: currentInput, terms_text: termsText }),
          });
        }
      }

      if (!resp.ok) {
        throw new Error('Failed to get response from bot.');
      }

      const data = await resp.json();

      let botMessage =
        data?.reply?.response ||
        data?.reply ||
        data?.response ||
        '';
      if (typeof botMessage !== 'string') {
        botMessage = JSON.stringify(botMessage);
      }

      // Remove surrounding quotes if present
      if (botMessage.startsWith('"') && botMessage.endsWith('"')) {
        botMessage = botMessage.slice(1, -1);
      }

      setMessages(prev => [...prev, { sender: 'bot', text: botMessage || 'Sorry, I could not find an answer in this scan.' }]);
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { sender: 'bot', text: 'Sorry, I am unable to answer that right now.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div style={chatWrapper}>
      <div style={chatHeader}>
        <div>
          <p style={chatHeaderTitle}>Ask Anee</p>
          <p style={chatHeaderSub}>Explain this document in plain language.</p>
        </div>
      </div>
      {messages.length === 0 && (
        <div style={suggestionRow}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              data-eziterms-btn="secondary"
              style={suggestionChip}
              onClick={() => setInput(s)}
              disabled={loading || !termsText}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div style={chatMessages}>
        {messages.map((msg, index) => (
          <div
            key={index}
            style={msg.sender === 'user' ? userMessageStyle : botMessageStyle}
          >
            {msg.text}
          </div>
        ))}
        {loading && (
          <div style={loadingMessageStyle}>
            <div style={typingIndicatorDot}></div>
            <div style={typingIndicatorDot}></div>
            <div style={typingIndicatorDot}></div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div style={chatInputArea}>
        <input
          placeholder="Ask something about the terms..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          style={chatInput}
          disabled={loading || !termsText}
          aria-label="Message Anee"
        />
        <button
          type="button"
          data-eziterms-btn="primary"
          onClick={sendMessage}
          disabled={loading || !input.trim() || !termsText}
          style={sendButton}
          aria-label="Send"
        >
          {loading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default ExtensionChatBot;

const chatWrapper: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  fontFamily: fusion.font,
  padding: 10,
  boxSizing: 'border-box',
  border: `1px solid ${fusion.border}`,
  borderRadius: fusion.radius,
  backgroundColor: fusion.glassBg,
};

const chatHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
  paddingBottom: 8,
  borderBottom: `1px solid ${fusion.border}`,
};

const chatHeaderTitle: React.CSSProperties = {
  margin: 0,
  fontSize: fusion.fontSizeBase,
  fontWeight: fusion.fontWeightSemibold,
  color: fusion.text,
};

const chatHeaderSub: React.CSSProperties = {
  margin: 0,
  marginTop: 2,
  fontSize: fusion.fontSizeXs,
  color: fusion.textMuted,
};

const suggestionRow: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
  marginBottom: 10,
};

const suggestionChip: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 999,
  border: `1px solid ${fusion.border}`,
  background: fusion.bgInput,
  color: fusion.textMuted,
  fontSize: fusion.fontSizeXs,
  cursor: 'pointer',
};

const chatMessages: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '0 4px',
  marginBottom: 8,
};

const messageBase: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 12,
  maxWidth: '90%',
  fontSize: fusion.fontSizeSm,
  lineHeight: fusion.lineHeightNormal,
};

const userMessageStyle: React.CSSProperties = {
  ...messageBase,
  alignSelf: 'flex-end',
  background: 'rgba(255, 255, 255, 0.06)',
  color: fusion.text,
  borderBottomRightRadius: 4,
  border: `1px solid ${fusion.border}`,
};

const botMessageStyle: React.CSSProperties = {
  ...messageBase,
  alignSelf: 'flex-start',
  backgroundColor: fusion.bgInput,
  color: fusion.text,
  borderBottomLeftRadius: 4,
  border: `1px solid ${fusion.border}`,
};

const chatInputArea: React.CSSProperties = {
  display: 'flex',
  paddingTop: 8,
  gap: 6,
  borderTop: `1px solid ${fusion.border}`,
};

const chatInput: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '9px 11px',
  border: `1px solid ${fusion.border}`,
  borderRadius: 12,
  fontSize: fusion.fontSizeSm,
  outline: 'none',
  backgroundColor: fusion.bgInput,
  color: fusion.text,
  transition: fusion.transition,
};

const sendButton: React.CSSProperties = {
  padding: '8px 12px',
  border: 'none',
  borderRadius: 12,
  background: '#fff',
  color: '#000',
  cursor: 'pointer',
  fontSize: fusion.fontSizeSm,
  fontWeight: fusion.fontWeightSemibold,
  boxShadow: 'none',
  transition: fusion.transition,
  flexShrink: 0,
  minWidth: 62,
};

const loadingMessageStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '8px 12px',
  backgroundColor: fusion.bgInput,
  borderRadius: 14,
  borderBottomLeftRadius: 4,
  maxWidth: '90%',
  display: 'flex',
  gap: 4,
  alignItems: 'center',
};

const typingIndicatorDot: React.CSSProperties = {
  width: 8,
  height: 8,
  backgroundColor: fusion.textMuted,
  borderRadius: '50%',
  animation: 'typing-dot-bounce 1.4s infinite ease-in-out both',
};
