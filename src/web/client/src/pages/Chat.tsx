import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { chat, ChatConversation, ChatMessage } from '../api';

interface MessageWithMeta extends ChatMessage {
  model?: string;
  tokens?: number;
  costCents?: number;
}

export default function Chat() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageWithMeta[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const loadConversations = async () => {
    try {
      setLoadingConversations(true);
      const convos = await chat.conversations();
      setConversations(convos);
      if (convos.length > 0 && !activeId) {
        selectConversation(convos[0].id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingConversations(false);
    }
  };

  const selectConversation = async (id: string) => {
    setActiveId(id);
    setMessages([]);
    setError('');
    try {
      const msgs = await chat.messages(id);
      setMessages(msgs);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleNewConversation = async () => {
    try {
      setError('');
      const convo = await chat.createConversation();
      setConversations(prev => [convo, ...prev]);
      setActiveId(convo.id);
      setMessages([]);
      textareaRef.current?.focus();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    try {
      await chat.deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;

    // Auto-create conversation if none is active
    let conversationId = activeId;
    if (!conversationId) {
      try {
        const convo = await chat.createConversation();
        setConversations(prev => [convo, ...prev]);
        setActiveId(convo.id);
        conversationId = convo.id;
      } catch (err: any) {
        setError(err.message);
        return;
      }
    }

    const userMessage: MessageWithMeta = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSending(true);
    setError('');

    try {
      const result = await chat.sendMessage(conversationId, userMessage.content);
      const assistantMessage: MessageWithMeta = {
        id: `resp-${Date.now()}`,
        role: 'assistant',
        content: result.response,
        createdAt: new Date().toISOString(),
        model: result.usage.model,
        tokens: result.usage.tokensIn + result.usage.tokensOut,
        costCents: result.usage.costCents,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatMessageTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatModel = (model: string) => {
    if (model.includes('haiku')) return 'Haiku';
    if (model.includes('sonnet')) return 'Sonnet';
    if (model.includes('opus')) return 'Opus';
    return model;
  };

  return (
    <div className="flex -m-8" style={{ height: 'calc(100vh)' }}>
      {/* Conversation sidebar */}
      <div className="w-72 border-r border-gray-200 flex flex-col bg-gray-50">
        <div className="p-3 border-b border-gray-200">
          <button
            onClick={handleNewConversation}
            className="w-full px-3 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 transition-colors"
          >
            + New Conversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConversations ? (
            <div className="p-4 text-sm text-gray-400">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-sm text-gray-400">No conversations yet</div>
          ) : (
            conversations.map(convo => (
              <div
                key={convo.id}
                onClick={() => selectConversation(convo.id)}
                className={`group px-3 py-2.5 cursor-pointer border-b border-gray-100 flex items-center justify-between transition-colors ${
                  activeId === convo.id
                    ? 'bg-white border-l-2 border-l-hive-500'
                    : 'hover:bg-gray-100'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {convo.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatTime(convo.updatedAt)}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDeleteConversation(convo.id, e)}
                  className="opacity-0 group-hover:opacity-100 ml-2 text-gray-400 hover:text-red-500 transition-all text-xs"
                  title="Delete conversation"
                >
                  x
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6">
          {!activeId && !sending ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <p className="text-lg mb-2">Start a conversation</p>
                <p className="text-sm">Click "New Conversation" or just type a message below.</p>
              </div>
            </div>
          ) : messages.length === 0 && !sending ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <p className="text-sm">Send a message to start chatting.</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map(msg => (
                <div key={msg.id}>
                  <div
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                        msg.role === 'user'
                          ? 'bg-hive-500 text-white'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                  <div
                    className={`flex mt-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <span className="text-xs text-gray-400">
                      {formatMessageTime(msg.createdAt)}
                      {msg.model && (
                        <span className="ml-2">
                          {formatModel(msg.model)} &middot; {msg.tokens?.toLocaleString()} tokens
                          {msg.costCents !== undefined && (
                            <span> &middot; ${(msg.costCents / 100).toFixed(4)}</span>
                          )}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-500 rounded-2xl px-4 py-2.5">
                    <p className="text-sm">
                      <span className="inline-flex items-center gap-1">
                        Thinking
                        <span className="animate-pulse">...</span>
                      </span>
                    </p>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Error bar */}
        {error && (
          <div className="px-6 py-2 bg-red-50 text-red-600 text-sm border-t border-red-100">
            {error}
            <button
              onClick={() => setError('')}
              className="ml-2 text-red-400 hover:text-red-600"
            >
              dismiss
            </button>
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-gray-200 p-4">
          <div className="max-w-3xl mx-auto flex gap-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
              disabled={sending}
              rows={1}
              className="flex-1 resize-none border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-hive-400 focus:border-transparent disabled:opacity-50 disabled:bg-gray-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="px-5 py-2.5 bg-hive-500 text-white rounded-xl text-sm font-medium hover:bg-hive-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
