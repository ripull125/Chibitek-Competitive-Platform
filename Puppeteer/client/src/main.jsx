import ReactDOM from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <MantineProvider defaultColorScheme="light">
      <App />
    </MantineProvider>
)
