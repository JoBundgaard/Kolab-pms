import { COLORS } from '../../config/pms.js';
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Uncaught error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: COLORS.cream }}>
          <div className="bg-white border border-red-200 rounded-2xl shadow-lg p-6 max-w-md w-full space-y-3">
            <div className="text-lg font-semibold text-red-700">Could not render the app</div>
            <div className="text-sm text-slate-700">An unexpected error occurred. Please reload. The error has been logged to the console.</div>
            <div className="text-xs text-slate-500 break-words">{String(this.state.error)}</div>
            <div className="pt-2 flex justify-end">
              <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-full bg-red-600 text-white text-sm font-semibold">Reload</button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
