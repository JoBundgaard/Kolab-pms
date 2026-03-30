import React, { useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';

const COLORS = {
  darkGreen: '#26402E',
  lime: '#E2F05D',
  cream: '#F9F8F2',
};

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (input.trim() === '') return;

    const newMessages = [...messages, { text: input, sender: 'user' }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      // TODO: Replace with the actual URL of your deployed chatbot function
      const response = await fetch('YOUR_CHATBOT_FUNCTION_URL', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: input }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.text();
      setMessages([...newMessages, { text: data, sender: 'bot' }]);
    } catch (error) {
      console.error('Error fetching chatbot response:', error);
      setMessages([
        ...newMessages,
        { text: 'Sorry, I am having trouble connecting.', sender: 'bot' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen ? (
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col"
          style={{ height: '500px' }}
        >
          <div
            className="px-6 py-4 border-b flex justify-between items-center"
            style={{
              backgroundColor: COLORS.darkGreen,
              borderColor: COLORS.darkGreen,
            }}
          >
            <h3 className="font-serif font-bold text-xl text-white">
              Kolab Chatbot
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/70 hover:text-white transition-colors"
            >
              <MessageSquare size={24} />
            </button>
          </div>
          <div
            className="flex-1 p-6 overflow-y-auto"
            style={{ backgroundColor: COLORS.cream }}
          >
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.sender === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`rounded-2xl px-4 py-2 ${
                      message.sender === 'user' ?
                        'bg-lime-200 text-gray-800' :
                        'bg-gray-200 text-gray-800'
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-4 py-2 bg-gray-200 text-gray-800">
                    ...
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="p-4 border-t" style={{ backgroundColor: COLORS.cream }}>
            <div className="flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask a question..."
                className="flex-1 px-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-lime-500"
              />
              <button
                onClick={handleSend}
                className="ml-2 px-4 py-2 rounded-full text-white"
                style={{ backgroundColor: COLORS.darkGreen }}
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="p-4 rounded-full text-white shadow-lg"
          style={{ backgroundColor: COLORS.darkGreen }}
        >
          <MessageSquare size={24} />
        </button>
      )}
    </div>
  );
};

export default Chatbot;
