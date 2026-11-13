import React from 'react'
import ReactDOM from 'react-dom/client'
import AccessGate from './features/auth/AccessGate.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AccessGate />
  </React.StrictMode>,
)
