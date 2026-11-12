import { useEffect, useState } from 'react';
import type { ConversationDetail } from '../../shared/types.ts';
import { deleteConversation, getConversation, sendMessage } from './api.ts';

interface Props {
  conversationId: string;
  onBack: () => void;
  onDeleted: () => void;
  onMessageSent?: () => void;
}

function ChatView({ conversationId, onBack, onDeleted, onMessageSent }: Props) {
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    getConversation(conversationId)
      .then(setConversation)
      .catch((err) => setError(err.message));
  };

  useEffect(refresh, [conversationId]);

  const handleSend = async () => {
    if (!draft.trim()) return;
    const toSend = draft;
    setDraft('');
    setError(null);
    try {
      await sendMessage(conversationId, toSend);
      onMessageSent?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      refresh();
    }
  };

  const handleDelete = async () => {
    try {
      await deleteConversation(conversationId);
      onDeleted();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      <button onClick={onBack}>&larr; Back</button>
      <button onClick={handleDelete}>Delete conversation</button>
      <h2>{conversation?.title ?? 'Loading…'}</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <ul>
        {conversation?.messages.map((m) => (
          <li key={m.id}>
            <strong>{m.role}:</strong> {m.content}
          </li>
        ))}
      </ul>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        placeholder="Type a message"
      />
      <button onClick={handleSend}>Send</button>
    </div>
  );
}

export default ChatView;
