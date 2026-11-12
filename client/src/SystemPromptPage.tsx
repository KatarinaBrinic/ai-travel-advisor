import { useEffect, useState } from 'react';
import { getSystemPrompt, updateSystemPrompt } from './api.ts';

interface Props {
  onBack: () => void;
}

function SystemPromptPage({ onBack }: Props) {
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSystemPrompt()
      .then((prompt) => setContent(prompt.content))
      .catch((err) => setError(err.message));
  }, []);

  const handleSave = async () => {
    setError(null);
    setSaved(false);
    try {
      const updated = await updateSystemPrompt(content);
      setContent(updated.content);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      <button onClick={onBack}>&larr; Back</button>
      <h2>Advisor instructions</h2>
      <p>This is the system prompt that shapes how the advisor behaves. Changes apply to the next message sent.</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {saved && <p style={{ color: 'green' }}>Saved.</p>}
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setSaved(false);
        }}
        rows={12}
        style={{ width: '100%' }}
      />
      <button onClick={handleSave}>Save</button>
    </div>
  );
}

export default SystemPromptPage;
