import React, { useMemo } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider as MuiThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { queryClient } from './queryClient';
import { AppRoutes } from './routes/AppRoutes';
import { ThemeProvider, useThemeMode } from './context/ThemeContext';
import './styles/App.css';

const getAppTheme = (mode = 'light') => {
  const isDark = mode === 'dark';

  return createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: isDark
        ? { main: '#E0935C', dark: '#B56832', light: '#F4C18E', contrastText: '#18120E' }
        : { main: '#5A2508', dark: '#421a05', light: '#D4864F', contrastText: '#ffffff' },
      secondary: isDark
        ? { main: '#D4864F', dark: '#8B451F', light: '#F4C18E' }
        : { main: '#D4864F', dark: '#8B451F', light: '#F4C18E' },
      background: {
        default: isDark ? '#140E0A' : '#F8F1E7',
        paper: isDark ? '#1E1612' : '#ffffff',
      },
      text: {
        primary: isDark ? '#F5ECE3' : '#171717',
        secondary: isDark ? '#AD9C8F' : '#667085',
      },
      success: { main: '#16A05D' },
      error: { main: '#FF2D2D' },
      warning: { main: '#F59E0B' },
      divider: isDark ? '#3A2E26' : '#EADFD2',
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
          root: {
            borderRadius: 10,
            boxShadow: 'none',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            '&:hover': {
              boxShadow: isDark
                ? '0 4px 14px rgba(224, 147, 92, 0.3)'
                : '0 4px 14px rgba(154, 79, 47, 0.35)',
              transform: 'translateY(-1px)',
            },
          },
          containedPrimary: {
            background: isDark ? '#E0935C' : '#5A2508',
            color: isDark ? '#18120E' : '#ffffff',
            '&:hover': {
              background: isDark ? '#F4C18E' : '#421a05',
            },
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 10,
              backgroundColor: isDark ? '#231B16' : '#FFFFFF',
              transition: 'all 0.2s ease',
              '&:hover fieldset': { borderColor: isDark ? '#E0935C' : '#DFA24B' },
              '&.Mui-focused fieldset': {
                borderColor: isDark ? '#F4C18E' : '#9A4F2F',
                borderWidth: 2,
              },
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            borderColor: isDark ? '#3A2E26' : '#EADFD2',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: `1px solid ${isDark ? '#3A2E26' : '#EADFD2'}`,
            borderRadius: 16,
            boxShadow: isDark
              ? '0 7px 22px rgba(0, 0, 0, 0.35)'
              : '0 7px 22px rgba(90, 37, 8, 0.07)',
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? '#231B16' : '#FFFFFF',
            borderRadius: 10,
          },
          notchedOutline: { borderColor: isDark ? '#3A2E26' : '#EADFD2' },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 16,
            border: `1px solid ${isDark ? '#3A2E26' : '#EADFD2'}`,
            backgroundColor: isDark ? '#1E1612' : '#ffffff',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            backgroundColor: isDark ? '#251C17' : '#F8F1E7',
            color: isDark ? '#F4C18E' : '#5A2508',
            fontWeight: 700,
          },
          root: { borderBottomColor: isDark ? '#3A2E26' : '#EADFD2' },
        },
      },
    },
  });
};

const ThemedAppContent = () => {
  const { mode } = useThemeMode();
  const theme = useMemo(() => getAppTheme(mode), [mode]);

  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className="app-container">
          <AppRoutes />
        </div>
      </BrowserRouter>
    </MuiThemeProvider>
  );
};

export const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <ThemedAppContent />
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
