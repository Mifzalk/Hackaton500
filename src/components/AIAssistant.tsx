import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Leaf, Info, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';

const SYSTEM_INSTRUCTION = `You are a specialized Farming AI Assistant. 
Your primary goal is to help users with agricultural questions, crop management, soil health, pest control, weather impacts on farming, and sustainable farming practices.

STRICT RULES:
1. ONLY answer questions related to farming, agriculture, gardening, livestock, and related technical topics.
2. If a user asks about any other topic (politics, entertainment, sports, general coding, etc.), politely decline and remind them that you are a farming specialist.
3. Provide practical, actionable advice.
4. If you are unsure about a specific local condition, advise the user to consult with local agricultural experts or their nearest Krishi Bhavan.
5. Keep your tone helpful, professional, and encouraging.`;

interface Message {
  role: 'user' | 'model';
  text: string;
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: "Hello! I'm your Farming AI Assistant. How can I help you with your crops or farm management today?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: messages.concat({ role: 'user', text: userMessage }).map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        })),
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.7,
        },
      });

      const aiText = response.text || "I'm sorry, I couldn't generate a response.";
      setMessages(prev => [...prev, { role: 'model', text: aiText }]);
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error. Please try again later." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] bg-slate-50 rounded-3xl overflow-hidden border-2 border-slate-200 shadow-inner">
      {/* Header */}
      <div className="bg-white p-4 border-b border-slate-200 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 shadow-inner">
            <Bot size={24} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Farming AI Assistant</h3>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Online & Ready</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
          <Leaf size={12} className="text-emerald-500" />
          AGRICULTURE ONLY
        </div>
      </div>

      {/* Chat Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar"
      >
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-3 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${
                  msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white text-emerald-600 border border-slate-100'
                }`}>
                  {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className={`p-4 rounded-2xl shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-white text-slate-700 rounded-tl-none border border-slate-100'
                }`}>
                  <div className="prose prose-sm prose-slate max-w-none">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="flex gap-3 items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
              <Loader2 className="animate-spin text-emerald-600" size={16} />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Assistant is thinking...</p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-200">
        <form onSubmit={handleSend} className="relative flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about crops, soil, pests..."
            className="flex-1 clay-inner px-6 py-4 rounded-2xl outline-none font-medium text-slate-700 placeholder:text-slate-400"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={`p-4 rounded-2xl shadow-lg transition-all ${
              isLoading || !input.trim() 
                ? 'bg-slate-100 text-slate-300' 
                : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 active:scale-95'
            }`}
          >
            <Send size={20} />
          </button>
        </form>
        <p className="text-[9px] text-center text-slate-400 mt-3 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
          <AlertCircle size={10} />
          AI can make mistakes. Verify important info with local experts.
        </p>
      </div>
    </div>
  );
}
