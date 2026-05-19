import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, borderRadius, fontSize } from '../utils/theme';

const EMOJIS = ['❤️', '👍', '😂', '😮', '😢'];

const ChatScreen = ({ route, navigation }) => {
  const { conversationId } = route.params;
  const { getConversation, addMessage, addReaction, loadConversation } = useChat();
  const { currentUser, mockUsers } = useAuth();

  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(true);
  const flatListRef = useRef(null);

  const conversation = getConversation(conversationId);

  const participantMap = useMemo(() => {
    if (!conversation?.participants) {
      return new Map();
    }

    return new Map(
      conversation.participants.map((participant) => [
        participant.id || participant._id || participant,
        participant,
      ])
    );
  }, [conversation]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setIsLoadingConversation(true);
      const result = await loadConversation(conversationId);
      if (!isMounted) return;

      setIsLoadingConversation(false);

      if (result.success) {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }, 50);
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [conversationId, loadConversation]);

  useEffect(() => {
    if (!conversation) {
      return;
    }

    const title = getConversationName();
    navigation.setOptions({ title });
  }, [conversation, navigation, participantMap]);

  const getConversationName = () => {
    if (!conversation) return 'Chat';

    if (conversation.type === 'group') {
      return conversation.name || 'Group Chat';
    }

    const otherParticipant = conversation.participants.find(
      (participant) => (participant.id || participant._id || participant) !== currentUser.id
    );

    if (otherParticipant && typeof otherParticipant === 'object') {
      return otherParticipant.fullName || otherParticipant.username || 'Chat';
    }

    const otherUserId = otherParticipant?.id || otherParticipant?._id || otherParticipant;
    const otherUser = mockUsers.find((u) => u.id === otherUserId) || participantMap.get(otherUserId);

    return otherUser?.fullName || otherUser?.username || 'Chat';
  };

  const getUserName = (userId) => {
    if (userId === currentUser.id) return 'You';

    const user = mockUsers.find((candidate) => candidate.id === userId) || participantMap.get(userId);
    return user?.fullName || user?.username || 'Unknown';
  };

  const handleSend = async () => {
    if (!message.trim()) return;

    const result = await addMessage(conversationId, message.trim(), replyTo?.id || null);

    if (result.success) {
      setMessage('');
      setReplyTo(null);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  };

  const handleLongPress = (msg) => {
    setSelectedMessage(msg);
    setShowActionSheet(true);
  };

  const handleReply = () => {
    setReplyTo(selectedMessage);
    setShowActionSheet(false);
  };

  const handleReact = () => {
    setShowActionSheet(false);
    setShowEmojiPicker(true);
  };

  const handleEmojiSelect = async (emoji) => {
    await addReaction(conversationId, selectedMessage.id, emoji);
    setShowEmojiPicker(false);
    setSelectedMessage(null);
  };

  const getRepliedMessage = (replyToId) => {
    return conversation.messages.find((m) => m.id === replyToId);
  };

  const renderMessage = ({ item }) => {
    const isMe = item.senderId === currentUser.id;
    const repliedMsg = item.replyToId ? getRepliedMessage(item.replyToId) : null;
    const reactions = Object.entries(item.reactions || {});

    return (
      <TouchableOpacity
        style={[styles.messageContainer, isMe && styles.myMessageContainer]}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.7}
      >
        {conversation.type === 'group' && !isMe && (
          <Text style={styles.senderName}>{getUserName(item.senderId)}</Text>
        )}

        {repliedMsg && (
          <View style={styles.replyPreview}>
            <View style={styles.replyLine} />
            <View style={styles.replyContent}>
              <Text style={styles.replyName}>{getUserName(repliedMsg.senderId)}</Text>
              <Text style={styles.replyText} numberOfLines={1}>
                {repliedMsg.text}
              </Text>
            </View>
          </View>
        )}

        <View style={[styles.messageBubble, isMe && styles.myMessageBubble]}>
          <Text style={[styles.messageText, isMe && styles.myMessageText]}>
            {item.text}
          </Text>
        </View>

        {reactions.length > 0 && (
          <View style={[styles.reactionsContainer, isMe && styles.myReactionsContainer]}>
            {reactions.map(([userId, emoji]) => (
              <View key={userId} style={styles.reactionBubble}>
                <Text style={styles.reactionEmoji}>{emoji}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={[styles.messageTime, isMe && styles.myMessageTime]}>
          {new Date(item.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </TouchableOpacity>
    );
  };

  if (isLoadingConversation && !conversation) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading conversation...</Text>
      </View>
    );
  }

  if (!conversation) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Conversation not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={conversation.messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No messages yet</Text>
            <Text style={styles.emptyStateText}>Send the first message to start the chat.</Text>
          </View>
        }
      />

      {replyTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyBarContent}>
            <Ionicons name="return-down-forward" size={16} color={colors.text} />
            <View style={styles.replyBarText}>
              <Text style={styles.replyBarName}>Replying to {getUserName(replyTo.senderId)}</Text>
              <Text style={styles.replyBarMessage} numberOfLines={1}>
                {replyTo.text}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor={colors.darkGray}
          value={message}
          onChangeText={setMessage}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
          <Ionicons name="send" size={24} color={colors.white} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={showActionSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActionSheet(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowActionSheet(false)}
        >
          <View style={styles.actionSheet}>
            <TouchableOpacity style={styles.actionItem} onPress={handleReply}>
              <Ionicons name="return-down-forward" size={24} color={colors.text} />
              <Text style={styles.actionText}>Reply</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={handleReact}>
              <Ionicons name="happy" size={24} color={colors.text} />
              <Text style={styles.actionText}>React</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.cancelAction]}
              onPress={() => setShowActionSheet(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showEmojiPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEmojiPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowEmojiPicker(false)}
        >
          <View style={styles.emojiPicker}>
            <Text style={styles.emojiPickerTitle}>React with</Text>
            <View style={styles.emojiList}>
              {EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.emojiButton}
                  onPress={() => handleEmojiSelect(emoji)}
                >
                  <Text style={styles.emoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingText: {
    flex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
    color: colors.darkGray,
    fontSize: fontSize.md,
  },
  emptyState: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyStateText: {
    fontSize: fontSize.sm,
    color: colors.darkGray,
    textAlign: 'center',
  },
  messagesList: {
    padding: spacing.md,
    flexGrow: 1,
  },
  messageContainer: {
    marginBottom: spacing.md,
    alignItems: 'flex-start',
  },
  myMessageContainer: {
    alignItems: 'flex-end',
  },
  senderName: {
    fontSize: fontSize.xs,
    color: colors.darkGray,
    marginBottom: spacing.xs,
    marginLeft: spacing.sm,
  },
  replyPreview: {
    flexDirection: 'row',
    backgroundColor: colors.lightGray,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    maxWidth: '80%',
  },
  replyLine: {
    width: 3,
    backgroundColor: colors.primary,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  replyContent: {
    flex: 1,
  },
  replyName: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    color: colors.primary,
  },
  replyText: {
    fontSize: fontSize.xs,
    color: colors.darkGray,
    marginTop: 2,
  },
  messageBubble: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    maxWidth: '80%',
  },
  myMessageBubble: {
    backgroundColor: colors.primary,
  },
  messageText: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  myMessageText: {
    color: colors.white,
  },
  reactionsContainer: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  myReactionsContainer: {
    justifyContent: 'flex-end',
  },
  reactionBubble: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: spacing.xs,
  },
  reactionEmoji: {
    fontSize: 16,
  },
  messageTime: {
    fontSize: fontSize.xs,
    color: colors.darkGray,
    marginTop: spacing.xs,
  },
  myMessageTime: {
    textAlign: 'right',
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.lightGray,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray,
  },
  replyBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyBarText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  replyBarName: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    color: colors.text,
  },
  replyBarMessage: {
    fontSize: fontSize.xs,
    color: colors.darkGray,
    marginTop: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray,
  },
  input: {
    flex: 1,
    backgroundColor: colors.lightGray,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: colors.primary,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.md,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  actionText: {
    fontSize: fontSize.md,
    color: colors.text,
    marginLeft: spacing.md,
    fontWeight: '600',
  },
  cancelAction: {
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  cancelText: {
    fontSize: fontSize.md,
    color: colors.error,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  emojiPicker: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  emojiPickerTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  emojiList: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  emojiButton: {
    padding: spacing.md,
  },
  emoji: {
    fontSize: 40,
  },
});

export default ChatScreen;
