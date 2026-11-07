import { createRoot } from 'react-dom/client';
import { strings } from '../lib/strings';
import { App } from './App';
import './styles.css';
import './fonts.css';

document.title = strings.app;
createRoot(document.getElementById('root')!).render(<App />);
