import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { apiRequest, API_BASE_URL } from '../utils/api';

const ChatContext = createContext();

const SOCKET_URL = API_BASE_URL.replace(/\/api$/, '');

const normalizeParticipant = (user) => {
  if (typeof user === 'string') {
    return {
      id: user,
      fullName: '',
      username: '',
      profilePhoto: '',
    };
  }

  return {
    id: user._id || user.id,
    fullName: user.fullName || '',
    username: user.username || '',
    profilePhoto: user.profilePhoto || '',
  };
};

const normalizeReactions = (reactions) => {
  if (Array.isArray(reactions)) {
    return reactions.reduce((acc, reaction) => {
      const userId = reaction?.userId?._id || reaction?.userId?.id || reaction?.userId;
      if (userId) {
        acc[userId] = reaction.emoji;
      }
      return acc;
    }, {});
  }

  if (reactions && typeof reactions === 'object') {
    return { ...reactions };
  }

  return {};
};

const normalizeMessage = (message) => ({
  id: message._id || message.id,
  conversationId: message.chatId || message.conversationId,
  senderId: message.senderId?._id || message.senderId?.id || message.senderId,
  text: message.content || message.text || '',
  messageType: message.messageType || message.type || 'text',
  imageUrl: message.imageUrl || '',
  createdAt: message.createdAt ? new Date(message.createdAt).getTime() : Date.now(),
  replyToId: message.replyTo?._id || message.replyTo || null,
  reactions: normalizeReactions(message.reactions),
});

const normalizeConversation = (chat) => ({
  id: chat.chatId || chat.id || chat._id,
  chatId: chat.chatId || chat.id || chat._id,
  type: chat.isGroup ? 'group' : 'private',
  name: chat.isGroup ? chat.groupName || 'Group Chat' : '',
  participants: Array.isArray(chat.participants)
    ? chat.participants.map(normalizeParticipant)
    : [],
  lastMessage: chat.lastMessage || '',
  updatedAt: chat.lastMessageTime
    ? new Date(chat.lastMessageTime).getTime()
    : chat.createdAt
      ? new Date(chat.createdAt).getTime()
      : Date.now(),
  messages: [],
});

const sortConversations = (conversations) =>
  [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

const sortMessages = (messages) =>
  [...messages].sort((a, b) => a.createdAt - b.createdAt);

const upsertConversation = (conversations, conversation) => {
  const exists = conversations.some((candidate) => candidate.id === conversation.id);

  if (exists) {
    return sortConversations(
      conversations.map((candidate) =>
        candidate.id === conversation.id
          ? {
              ...candidate,
              ...conversation,
              messages: conversation.messages.length ? conversation.messages : candidate.messages,
            }
          : candidate
      )
    );
  }

  return sortConversations([conversation, ...conversations]);
};

const upsertMessageInConversation = (conversation, incomingMessage) => {
  const messages = [...conversation.messages];
  const existingIndex = messages.findIndex((message) => message.id === incomingMessage.id);

  if (existingIndex >= 0) {
    messages[existingIndex] = incomingMessage;
  } else {
    messages.push(incomingMessage);
  }

  return {
    ...conversation,
    messages: sortMessages(messages),
    lastMessage: incomingMessage.text,
    updatedAt: incomingMessage.createdAt,
  };
};

export const ChatProvider = ({ children }) => {
  const { currentUser, token } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);

  const loadChats = useCallback(async () => {
    try {
      const chats = await apiRequest('/messages/chats/all', { method: 'GET' }, token);
      const normalizedChats = Array.isArray(chats) ? chats.map(normalizeConversation) : [];
      setConversations(sortConversations(normalizedChats));

      const socket = socketRef.current;
      if (socket) {
        normalizedChats.forEach((conversation) => {
          socket.emit('join_chat', conversation.id);
        });
      }
    } catch (error) {
      console.error('Error loading chats:', error);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const refreshChats = useCallback(async () => {
    await loadChats();
  }, [loadChats]);

  const getConversation = useCallback(
    (conversationId) =>
      conversations.find((conversation) => conversation.id === conversationId) || null,
    [conversations]
  );

  const getSortedConversations = useCallback(() => sortConversations(conversations), [conversations]);

  const loadConversation = useCallback(
    async (conversationId) => {
      try {
        if (!token) {
          return { success: false, message: 'No authentication token available' };
        }

        const messages = await apiRequest(`/messages/${conversationId}`, { method: 'GET' }, token);
        const normalizedMessages = Array.isArray(messages) ? messages.map(normalizeMessage) : [];

        setConversations((prev) =>
          sortConversations(
            prev.map((conversation) =>
              conversation.id === conversationId
                ? {
                    ...conversation,
                    messages: sortMessages(normalizedMessages),
                    updatedAt:
                      normalizedMessages[normalizedMessages.length - 1]?.createdAt ||
                      conversation.updatedAt,
                    lastMessage:
                      normalizedMessages[normalizedMessages.length - 1]?.text ||
                      conversation.lastMessage,
                  }
                : conversation
            )
          )
        );

        return { success: true };
      } catch (error) {
        return { success: false, message: error.message };
      }
    },
    [token]
  );

  const joinChatRoom = useCallback((conversationId) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('join_chat', conversationId);
  }, []);

  const startPrivateChat = useCallback(
    async (userId) => {
      try {
        if (!currentUser?.id || !token) {
          return { success: false, message: 'No user is logged in' };
        }

        const payload = await apiRequest(
          '/messages/chat',
          {
            method: 'POST',
            body: JSON.stringify({
              participantIds: [userId],
              isGroup: false,
            }),
          },
          token
        );

        const conversation = normalizeConversation(payload);

        setConversations((prev) => upsertConversation(prev, conversation));
        joinChatRoom(conversation.id);

        return { success: true, conversationId: conversation.id };
      } catch (error) {
        return { success: false, message: error.message };
      }
    },
    [currentUser?.id, token, joinChatRoom]
  );

  const createGroup = useCallback(
    async (groupName, selectedUserIds) => {
      try {
        if (!currentUser?.id || !token) {
          return { success: false, message: 'No user is logged in' };
        }

        const payload = await apiRequest(
          '/messages/chat',
          {
            method: 'POST',
            body: JSON.stringify({
              participantIds: selectedUserIds,
              isGroup: true,
              groupName,
            }),
          },
          token
        );

        const conversation = normalizeConversation(payload);

        setConversations((prev) => upsertConversation(prev, conversation));
        joinChatRoom(conversation.id);

        return { success: true, conversationId: conversation.id };
      } catch (error) {
        return { success: false, message: error.message };
      }
    },
    [currentUser?.id, token, joinChatRoom]
  );

  const addMessage = useCallback(
    async (conversationId, text, replyToId = null) => {
      try {
        if (!currentUser?.id) {
          return { success: false, message: 'No user is logged in' };
        }

        const socket = socketRef.current;
        if (!socket?.connected) {
          return { success: false, message: 'Message service is connecting. Please try again.' };
        }

        socket.emit('send_message', {
          chatId: conversationId,
          senderId: currentUser.id,
          content: text,
          messageType: 'text',
          replyTo: replyToId || null,
        });

        return { success: true };
      } catch (error) {
        return { success: false, message: error.message };
      }
    },
    [currentUser?.id]
  );

  const addReaction = useCallback(
    async (conversationId, messageId, emoji) => {
      try {
        if (!currentUser?.id) {
          return { success: false, message: 'No user is logged in' };
        }

        const socket = socketRef.current;
        if (!socket?.connected) {
          return { success: false, message: 'Message service is connecting. Please try again.' };
        }

        socket.emit('add_reaction', {
          messageId,
          userId: currentUser.id,
          emoji,
        });

        return { success: true };
      } catch (error) {
        return { success: false, message: error.message };
      }
    },
    [currentUser?.id]
  );

  useEffect(() => {
    if (!currentUser?.id || !token) {
      setConversations([]);
      setLoading(false);
      return undefined;
    }

    void loadChats();
    return undefined;
  }, [currentUser?.id, token, loadChats]);

  useEffect(() => {
    if (!currentUser?.id || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return undefined;
    }

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });

    socketRef.current = socket;

    const handleReceiveMessage = (payload) => {
      const incomingMessage = normalizeMessage(payload);
      if (!incomingMessage.conversationId) return;

      setConversations((prev) => {
        const next = prev.some((conversation) => conversation.id === incomingMessage.conversationId)
          ? prev.map((conversation) =>
              conversation.id === incomingMessage.conversationId
                ? upsertMessageInConversation(conversation, incomingMessage)
                : conversation
            )
          : prev;

        return sortConversations(next);
      });
    };

    const handleReactionUpdated = (payload) => {
      const incomingMessage = normalizeMessage(payload);
      if (!incomingMessage.conversationId) return;

      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== incomingMessage.conversationId) {
            return conversation;
          }

          return upsertMessageInConversation(conversation, incomingMessage);
        })
      );
    };

    socket.on('connect', () => {
      conversations.forEach((conversation) => {
        socket.emit('join_chat', conversation.id);
      });
    });

    socket.on('receive_message', handleReceiveMessage);
    socket.on('reaction_updated', handleReactionUpdated);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('reaction_updated', handleReactionUpdated);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [currentUser?.id, token, conversations]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !currentUser?.id) return;

    conversations.forEach((conversation) => {
      socket.emit('join_chat', conversation.id);
    });
  }, [conversations, currentUser?.id]);

  const value = useMemo(
    () => ({
      conversations,
      loading,
      getConversation,
      getSortedConversations,
      loadConversation,
      refreshChats,
      startPrivateChat,
      createGroup,
      addMessage,
      addReaction,
    }),
    [
      conversations,
      loading,
      getConversation,
      getSortedConversations,
      loadConversation,
      refreshChats,
      startPrivateChat,
      createGroup,
      addMessage,
      addReaction,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within ChatProvider');
  }
  return context;
};
