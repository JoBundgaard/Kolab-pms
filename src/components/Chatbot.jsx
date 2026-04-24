import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';

// After deploying the Cloud Function, paste the URL shown in the deploy output here.
// You can also set VITE_CHATBOT_URL in a .env.local file.
const CHATBOT_URL = import.meta.env.VITE_CHATBOT_URL || '';

const COLORS = {
  darkGreen: '#26402E',
  lime: '#E2F05D',
  cream: '#F9F8F2',
};

const WELCOME = "Hi! I'm Kolab Assistant. Ask me anything about rooms, bookings, availability, or housekeeping.";

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([{ text: WELCOME, sender: 'bot' }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isLoading) return;

    if (!CHATBOT_URL) {
      setMessages((prev) => [
        ...prev,
        { text: question, sender: 'user' },
        { text: 'Chatbot URL not configured yet. Set VITE_CHATBOT_URL after deploying the Cloud Function.', sender: 'bot' },
      ]);
      setInput('');
      return;
    }

    const newMessages = [...messages, { text: question, sender: 'user' }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(CHATBOT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          // Send last 6 messages as context (3 turns), excluding the welcome message
          history: messages.filter((m) => m.text !== WELCOME).slice(-6),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Server error');
      }

      setMessages([...newMessages, { text: data.answer, sender: 'bot' }]);
    } catch (err) {
      console.error('Chatbot error:', err);
      setMessages([
        ...newMessages,
        { text: 'Sorry, something went wrong. Please try again.', sender: 'bot' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen ? (
        <div
          className="rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ width: '360px', height: '520px', backgroundColor: COLORS.cream }}
        >
          {/* Header */}
          <div
            className="px-5 py-4 flex justify-between items-center flex-shrink-0"
            style={{ backgroundColor: COLORS.darkGreen }}
          >
            <div>
              <h3 className="font-bold text-white text-base leading-tight">Kolab Assistant</h3>
              <p className="text-white/60 text-xs mt-0.5">Ask about rooms, bookings & housekeeping</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/60 hover:text-white transition-colors p-1"
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="rounded-2xl px-4 py-2.5 text-sm max-w-[85%] whitespace-pre-wrap leading-relaxed"
                  style={
                    msg.sender === 'user'
                      ? { backgroundColor: COLORS.darkGreen, color: COLORS.lime }
                      : { backgroundColor: '#E8E8E0', color: '#1a1a1a' }
                  }
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div
                  className="rounded-2xl px-4 py-2.5 text-sm"
                  style={{ backgroundColor: '#E8E8E0', color: '#666' }}
                >
                  <span className="animate-pulse">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            className="px-4 py-3 border-t flex-shrink-0"
            style={{ backgroundColor: COLORS.cream, borderColor: '#ddd' }}
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question…"
                disabled={isLoading}
                className="flex-1 px-4 py-2 text-sm border rounded-full focus:outline-none focus:ring-2 bg-white disabled:opacity-50"
                style={{ borderColor: '#ccc', '--tw-ring-color': COLORS.darkGreen }}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="p-2.5 rounded-full text-white flex-shrink-0 transition-opacity disabled:opacity-40"
                style={{ backgroundColor: COLORS.darkGreen }}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="p-4 rounded-full text-white shadow-lg hover:opacity-90 transition-opacity"
          style={{ backgroundColor: COLORS.darkGreen }}
          title="Kolab Assistant"
        >
          <MessageSquare size={24} />
        </button>
      )}
    </div>
  );
}
