import { createRoot } from 'react-dom/client';
import { App } from './App';
import './tokens.css';
import './base.css';
import './layout.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(<App />);
