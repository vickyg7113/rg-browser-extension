import { ChatInterface } from './components/ChatInterface';
import { WingmanProvider } from './hooks/WingmanContext';
import { TalkToFileProvider } from './talk-to-file/TalkToFileContext';

function App() {
  return (
    <WingmanProvider>
      <TalkToFileProvider>
        <ChatInterface />
      </TalkToFileProvider>
    </WingmanProvider>
  );
}

export default App;
