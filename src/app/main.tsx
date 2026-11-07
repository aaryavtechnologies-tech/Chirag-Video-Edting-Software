import { createRoot } from 'react-dom/client';
import { strings } from '../lib/strings';
import { App } from './App';
import { Gallery } from '../animation/Gallery';
import './styles.css';
import '../design-system/tokens.css';
import './editorChrome.css';
import '../layouts/layouts.css';
import './fonts.css';

document.title = strings.app;
createRoot(document.getElementById('root')!).render(location.pathname === '/dev/gallery' ? <Gallery /> : <App />);
