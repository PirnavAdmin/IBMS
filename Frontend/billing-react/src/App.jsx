import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { queryClient } from './queryClient';
import { AppRoutes } from './routes/AppRoutes';
import './styles/App.css';

const theme = createTheme({
  palette: {
    primary: { main: '#5A2508', dark: '#421a05', light: '#D4864F', contrastText: '#ffffff' },
    secondary: { main: '#D4864F', dark: '#8B451F', light: '#F4C18E' },
    background: { default: '#F8F1E7', paper: '#ffffff' },
    text: { primary: '#171717', secondary: '#667085' },
    success: { main: '#16A05D' },
    error: { main: '#FF2D2D' },
    warning: { main: '#F59E0B' },
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
        containedPrimary: { background: '#5A2508' },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': { borderRadius: 10, transition: 'all 0.2s ease', '&:hover fieldset': { borderColor: '#DFA24B' }, '&.Mui-focused fieldset': { borderColor: '#9A4F2F', borderWidth: 2 } },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none', borderColor: '#EADFD2' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { border: '1px solid #EADFD2', borderRadius: 16, boxShadow: '0 7px 22px rgba(90, 37, 8, 0.07)' },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { backgroundColor: '#FFFFFF', borderRadius: 10 },
        notchedOutline: { borderColor: '#EADFD2' },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 16, border: '1px solid #EADFD2' },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { backgroundColor: '#F8F1E7', color: '#5A2508', fontWeight: 700 },
        root: { borderBottomColor: '#EADFD2' },
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
