import { useState } from 'react';
import ChatView from './ChatView.tsx';
import ConversationList from './ConversationList.tsx';
import SystemPromptPage from './SystemPromptPage.tsx';
import TripPlanPanel from './TripPlanPanel.tsx';

type View = { name: 'list' } | { name: 'chat'; conversationId: string } | { name: 'settings' };

function App() {
  const [view, setView] = useState<View>({ name: 'list' });
  const [tripPlanRefreshKey, setTripPlanRefreshKey] = useState(0);

  if (view.name === 'chat') {
    return (
      <main style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <ChatView
            conversationId={view.conversationId}
            onBack={() => setView({ name: 'list' })}
            onDeleted={() => setView({ name: 'list' })}
            onMessageSent={() => setTripPlanRefreshKey((k) => k + 1)}
          />
        </div>
        <TripPlanPanel refreshKey={tripPlanRefreshKey} />
      </main>
    );
  }

  if (view.name === 'settings') {
    return (
      <main>
        <SystemPromptPage onBack={() => setView({ name: 'list' })} />
      </main>
    );
  }

  return (
    <main>
      <ConversationList
        onOpen={(conversationId) => setView({ name: 'chat', conversationId })}
        onOpenSettings={() => setView({ name: 'settings' })}
      />
    </main>
  );
}

export default App;
