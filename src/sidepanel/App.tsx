import { ChatInterface } from './components/ChatInterface';
import { WingmanProvider } from './hooks/WingmanContext';

function App() {
  return (
    <WingmanProvider>
      <ChatInterface />
    </WingmanProvider>
  );
}

export default App;
