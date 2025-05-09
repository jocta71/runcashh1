import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Send, X, RotateCcw, MessageSquare, Sparkles } from 'lucide-react';
import { RouletteRepository } from '../services/data/rouletteRepository';

interface AIMessage {
  id: number;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

// Componente de carregamento com leap-frog estilizado
const LoadingIndicator = () => {
  return (
    <div className="flex justify-start">
      <div className="leap-frog">
        <div className="leap-frog__dot"></div>
        <div className="leap-frog__dot"></div>
        <div className="leap-frog__dot"></div>
      </div>
    </div>
  );
};

const AIFloatingBar: React.FC = () => {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (messagesEndRef.current && expanded) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, expanded]);

  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  const sendMessageToGemini = async (query: string) => {
    try {
      // Buscar dados da roleta
      const roletaData = await fetchRouletteData();
      
      // Usar o endpoint do backend para evitar problemas de CORS
      const apiUrl = '/api/ai/query';
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, roletaData }),
      });
      
      const data = await response.json();
      return data.response;
    } catch (error) {
      console.error('Erro ao consultar API de IA:', error);
      return 'Erro ao processar consulta. Tente novamente.';
    }
  };
  
  // Função para buscar dados da roleta
  const fetchRouletteData = async () => {
    try {
      // Buscar dados reais do repositório
      const roulettesWithNumbers = await RouletteRepository.fetchAllRoulettesWithNumbers();
      
      if (!roulettesWithNumbers || !Array.isArray(roulettesWithNumbers) || roulettesWithNumbers.length === 0) {
        throw new Error('Não foi possível obter dados das roletas');
      }
      
      // Extrair números recentes
      const allNumbers = [];
      const numerosPorRoleta = {};
      
      // Organizar dados por roleta
      for (const roleta of roulettesWithNumbers) {
        if (roleta.numbers && Array.isArray(roleta.numbers)) {
          // Adicionar todos os números à lista geral
          allNumbers.push(...roleta.numbers.map(n => n.number));
          
          // Organizar números por roleta
          numerosPorRoleta[roleta.name] = roleta.numbers.map(n => n.number);
        }
      }
      
      // Limitar a 50 números mais recentes
      const recentNumbers = allNumbers.slice(0, 50);
      
      // Classificar números por cor
      const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
      const blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
      
      let redCount = 0;
      let blackCount = 0;
      let greenCount = 0;
      let evenCount = 0;
      let oddCount = 0;
      const dozenCounts = [0, 0, 0];
      
      recentNumbers.forEach(num => {
        if (num === 0) {
          greenCount++;
          return;
        }
        
        if (redNumbers.includes(num)) redCount++;
        if (blackNumbers.includes(num)) blackCount++;
        
        if (num % 2 === 0) evenCount++;
        else oddCount++;
        
        if (num >= 1 && num <= 12) dozenCounts[0]++;
        else if (num >= 13 && num <= 24) dozenCounts[1]++;
        else if (num >= 25 && num <= 36) dozenCounts[2]++;
      });
      
      // Calcular frequências para números quentes/frios
      const numFrequency = {};
      recentNumbers.forEach(num => {
        numFrequency[num] = (numFrequency[num] || 0) + 1;
      });
      
      // Ordenar por frequência
      const sortedNumbers = Object.entries(numFrequency)
        .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
        .map(entry => parseInt(entry[0]));
      
      const hotNumbers = sortedNumbers.slice(0, 4);
      const coldNumbers = sortedNumbers.slice(-4).reverse();
      
      // Identificar tendências
      const trends = [];
      const colorStreak = { color: null, count: 0 };
      const parityStreak = { parity: null, count: 0 };
      const dozenStreak = { dozen: null, count: 0 };
      
      // Tendências de cor
      for (let i = 0; i < Math.min(10, recentNumbers.length); i++) {
        const num = recentNumbers[i];
        let color = 'green';
        if (redNumbers.includes(num)) color = 'red';
        else if (blackNumbers.includes(num)) color = 'black';
        
        if (i === 0) {
          colorStreak.color = color;
          colorStreak.count = 1;
        } else if (color === colorStreak.color) {
          colorStreak.count++;
        } else {
          break;
        }
      }
      
      if (colorStreak.count >= 3) {
        trends.push({ type: 'color', value: colorStreak.color, count: colorStreak.count });
      }
      
      // Organizar dados formatados para a IA
      return {
        numbers: {
          recent: recentNumbers,
          raw: recentNumbers,
          redCount,
          blackCount,
          greenCount,
          redPercentage: Number(((redCount / (Number(recentNumbers.length) || 1)) * 100).toFixed(2)),
          blackPercentage: Number(((blackCount / (Number(recentNumbers.length) || 1)) * 100).toFixed(2)),
          greenPercentage: Number(((greenCount / (Number(recentNumbers.length) || 1)) * 100).toFixed(2)),
          evenCount,
          oddCount,
          evenPercentage: Number(((evenCount / (Number(recentNumbers.length) || 1)) * 100).toFixed(2)),
          oddPercentage: Number(((oddCount / (Number(recentNumbers.length) || 1)) * 100).toFixed(2)),
          dozenCounts,
          dozenPercentages: dozenCounts.map(count => 
            Number(((count / (Number(recentNumbers.length) || 1)) * 100).toFixed(2))
          ),
          hotNumbers,
          coldNumbers
        },
        trends,
        roletas: roulettesWithNumbers.map(r => ({
          id: r.id,
          name: r.name,
          online: true // Substitui status
        })),
        numerosPorRoleta
      };
    } catch (error) {
      console.error('Erro ao buscar dados da roleta:', error);
      
      // Em caso de erro, retornar dados simulados como fallback
      return {
        numbers: {
          recent: [12, 35, 0, 26, 3, 15, 4, 0, 32, 15],
          redCount: 45,
          blackCount: 42,
          evenCount: 38,
          oddCount: 49,
          hotNumbers: [32, 15, 0, 26],
          coldNumbers: [6, 13, 33, 1]
        },
        trends: [
          { type: 'color', value: 'red', count: 3 },
          { type: 'parity', value: 'odd', count: 5 },
          { type: 'dozen', value: '2nd', count: 4 }
        ]
      };
    }
  };

  // Função para processar o conteúdo da mensagem, garantindo alinhamento à esquerda
  const processMessageContent = (content: string) => {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-green-300">$1</strong>')
      .replace(/\n/g, '<br>')
      .replace(/<div/g, '<div style="text-align: left;"')
      .replace(/<p/g, '<p style="text-align: left;"')
      .replace(/•\s(.*?)(?=\n|$)/g, '<div style="display: flex; align-items: start; text-align: left;"><span style="margin-right: 0.5rem;" class="text-green-400">•</span><span>$1</span></div>');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const userMessage: AIMessage = {
      id: Date.now(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    
    try {
      const aiResponse = await sendMessageToGemini(input);
      
      const aiMessage: AIMessage = {
        id: Math.floor(Math.random() * 1000000),
        role: 'ai',
        content: aiResponse,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Erro ao processar mensagem:', error);
      
      const errorMessage: AIMessage = {
        id: Math.floor(Math.random() * 1000000),
        role: 'ai',
        content: 'Desculpe, ocorreu um erro ao processar sua consulta. Por favor, tente novamente mais tarde.',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = () => {
    setExpanded(!expanded);
  };

  const clearChat = () => {
    setMessages([]);
  };

  // A interface recolhida mostra apenas a barra de entrada
  if (!expanded) {
    return (
      <div className="fixed bottom-4 left-0 right-0 flex justify-center z-50">
        <div className="w-[95%] max-w-xl bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl shadow-lg overflow-hidden p-3">
          <div className="mb-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shadow-inner">
                <img src="/assets/icon-rabbit.svg" alt="RunCash" className="w-4 h-4" />
              </div>
              <h3 className="text-white font-medium text-sm">Descubra tendências & padrões lucrativos</h3>
            </div>
            <p className="text-green-300/80 text-xs px-1">Pergunte ao RunCash IA sobre estratégias, números quentes e padrões de roleta</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); toggleExpand(); }} className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="O que você quer saber sobre as roletas?"
              className="w-full bg-white/5 border border-white/10 focus:border-green-500/50 rounded-full px-5 py-2.5 text-white text-sm focus:outline-none focus:ring-0 shadow-inner"
              onFocus={toggleExpand}
            />
            <button
              type="button"
              onClick={toggleExpand}
              className="absolute right-2 p-1.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg hover:shadow-green-500/20 transition-all"
            >
              <Sparkles size={16} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // A interface expandida mostra o histórico de mensagens e a entrada
  return (
    <div className="fixed bottom-4 left-0 right-0 flex justify-center z-50">
      <div className="w-[95%] max-w-3xl bg-black/10 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-green-500/20 flex flex-col overflow-hidden animate-slideUp transition-all">
        {/* Cabeçalho com efeito glass */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-green-600/20 to-emerald-500/20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shadow-inner">
              <img src="/assets/icon-rabbit.svg" alt="RunCash" className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-white font-semibold">RunCash Assistente</h2>
              <div className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-green-400 mr-2 animate-pulse"></span>
                <p className="text-green-300/80 text-xs">IA Avançada</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={clearChat}
              className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-green-300 hover:text-white transition-all"
              title="Limpar conversa"
            >
              <RotateCcw size={16} />
            </button>
            <button 
              onClick={toggleExpand}
              className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-green-300 hover:text-white transition-all"
              title="Fechar"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        
        {/* Área de mensagens */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 max-h-[60vh] bg-gradient-to-b from-black/20 to-black/30 backdrop-blur-md">
          {messages.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400/10 to-emerald-600/10 flex items-center justify-center mb-4">
                <MessageSquare size={24} className="text-green-400" />
              </div>
              <h3 className="text-white font-medium text-lg mb-2">Como posso ajudar?</h3>
              <p className="text-gray-300/70 text-center text-sm max-w-md mb-4">
                Pergunte sobre análises de roletas, tendências ou estratégias.
              </p>
              <div className="grid grid-cols-2 gap-2 w-full max-w-md">
                <button 
                  onClick={() => setInput("Todas roletas disponíveis")}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-green-300 hover:text-white text-left text-xs transition-all border border-white/5"
                >
                  Todas roletas disponíveis?
                </button>
                <button 
                  onClick={() => setInput("Detectou algum padrão de cor nas últimas jogadas?")}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-green-300 hover:text-white text-left text-xs transition-all border border-white/5"
                >
                  Há padrões de cor recentes?
                </button>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fadeIn`}
              >
                {msg.role === 'user' ? (
                  <div className="max-w-[85%] rounded-2xl p-3 shadow-md bg-gradient-to-r from-green-600 to-emerald-500 text-white">
                    <div 
                      className="prose prose-invert max-w-none text-sm whitespace-pre-wrap" 
                      dangerouslySetInnerHTML={{ 
                        __html: msg.content
                          .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
                          .replace(/\n/g, '<br>')
                      }} 
                    />
                  </div>
                ) : (
                  <div className="max-w-[85%] text-white">
                    <div 
                      className="text-sm whitespace-pre-wrap text-left px-4 py-3 bg-black/30 rounded-2xl" 
                      style={{ textAlign: 'left' }}
                      dangerouslySetInnerHTML={{ 
                        __html: processMessageContent(msg.content)
                      }} 
                    />
                  </div>
                )}
              </div>
            ))
          )}
          {loading && (
            <LoadingIndicator />
          )}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Barra de entrada com efeito glass */}
        <form onSubmit={handleSubmit} className="p-3 border-t border-white/10 backdrop-blur-md bg-black/20">
          <div className="relative flex items-center">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte algo sobre as roletas..."
              className="w-full bg-white/5 border border-white/10 focus:border-green-500/50 rounded-full px-5 py-2 text-white text-sm focus:outline-none shadow-inner backdrop-blur-md"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className={`absolute right-1 p-2 rounded-full ${
                loading || !input.trim() 
                  ? 'bg-gray-600/30 text-gray-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg hover:shadow-green-500/20'
              } transition-all duration-200`}
            >
              <Send size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AIFloatingBar; 