import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ConfigError } from './components/ConfigError'
import { configProblem } from './lib/config'
import './index.css'

const problem = configProblem()

createRoot(document.getElementById('root')!).render(
  <StrictMode>{problem ? <ConfigError problem={problem} /> : <App />}</StrictMode>,
)
