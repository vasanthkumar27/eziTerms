import React from 'react'
import ReactDOM from 'react-dom/client'
import ExtensionPopup from './extensionmaster/ExtensionPopup'
import './extension.css'

document.body.style.background = '#000'
document.body.style.color = '#ededed'
document.body.style.margin = '0'
document.body.style.padding = '0'
document.body.style.width = '100%'
document.body.style.height = '100%'
document.body.style.minHeight = '0'
document.body.style.overflow = 'hidden'
document.body.style.fontFamily = 'Inter, "Segoe UI", sans-serif'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ExtensionPopup />
  </React.StrictMode>
)
