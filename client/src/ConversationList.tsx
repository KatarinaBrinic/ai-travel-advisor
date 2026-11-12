import { useEffect, useState } from 'react';
import type { ConversationSummary } from '../../shared/types.ts';
import { createConversation, deleteConversation, listConversations } from './api.ts';

interface Props {
  onOpen: (id: string) => void;
  onOpenSettings: () => void;
}

function ConversationList({ onOpen, onOpenSettings }: Props) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    listConversations()
      .then(setConversations)
      .catch((err) => setError(err.message));
  };

  useEffect(refresh, []);

  const handleNew = async () => {
    try {
      const conversation = await createConversation();
      onOpen(conversation.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteConversation(id);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      <h1>AI Advisor Chatbot</h1>
      <button onClick={handleNew}>New conversation</button>{' '}
      <button onClick={onOpenSettings}>Settings</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {conversations.length === 0 && <p>No conversations yet.</p>}
      <ul>
        {conversations.map((c) => (
          <li key={c.id}>
            <button onClick={() => onOpen(c.id)}>{c.title}</button>{' '}
            <button onClick={() => handleDelete(c.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ConversationList;
