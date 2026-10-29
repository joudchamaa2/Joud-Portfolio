import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/index.css'

// index.html carries static SEO defaults for crawlers that do not run
// JavaScript. Remove them so the per-page tags rendered by <Seo> are the only
// ones in the document.
document.querySelectorAll('[data-default-seo]').forEach((el) => el.remove())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
