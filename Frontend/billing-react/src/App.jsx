import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { queryClient } from './queryClient';
import { AppRoutes } from './routes/AppRoutes';
import './styles/App.css';

const theme = createTheme({
  palette: {
    primary: { main: '#9A4F2F', dark: '#74371F', light: '#DFA24B', contrastText: '#ffffff' },
    secondary: { main: '#DFA24B', dark: '#9A4F2F', light: '#F5ECE3' },
    background: { default: '#FDFAF6', paper: '#ffffff' },
    text: { primary: '#2D211C', secondary: '#7D6E66' },
  },
  typography: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h1: { fontWeight: 800, letterSpacing: '-0.03em' },
    h2: { fontWeight: 700, letterSpacing: '-0.025em' },
    h3: { fontWeight: 700, letterSpacing: '-0.02em' },
    h4: { fontWeight: 700, letterSpacing: '-0.015em' },
    h5: { fontWeight: 600, letterSpacing: '-0.01em' },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 10, boxShadow: 'none', transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)', '&:hover': { boxShadow: '0 4px 14px rgba(154, 79, 47, 0.35)', transform: 'translateY(-1px)' } },
        containedPrimary: { background: 'linear-gradient(135deg, #9A4F2F 0%, #74371F 100%)' },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': { borderRadius: 10, transition: 'all 0.2s ease', '&:hover fieldset': { borderColor: '#DFA24B' }, '&.Mui-focused fieldset': { borderColor: '#9A4F2F', borderWidth: 2 } },
        },
      },
    },
  },
});

export const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <div className="app-container"><AppRoutes /></div>
      </BrowserRouter>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
