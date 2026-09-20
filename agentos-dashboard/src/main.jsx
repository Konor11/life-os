import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

console.log('Life OS: main.jsx executing...')

const rootEl = document.getElementById('root')
if (!rootEl) {
  console.error('Life OS: #root element NOT FOUND!')
  document.body.innerHTML = '<div style="padding:20px;color:red;font-family:monospace">ERROR: #root element not found</div>'
} else {
  console.log('Life OS: #root found, creating root...')
  try {
    const root = ReactDOM.createRoot(rootEl)
    console.log('Life OS: createRoot done, rendering App...')
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
    console.log('Life OS: render called successfully')
  } catch (e) {
    console.error('Life OS: Render error:', e)
    rootEl.innerHTML = `<div style="padding:20px;color:red;font-family:monospace;background:#1a1a2e;padding:20px;border-radius:8px">
      <h3>React Render Error</h3>
      <pre>${e.message}</pre>
      <pre>${e.stack}</pre>
    </div>`
  }
}