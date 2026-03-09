import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// StrictMode removed — it double-mounts components in dev
// which causes socket listeners to register twice and break
createRoot(document.getElementById('root')).render(
  <App />
)
