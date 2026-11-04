import React from 'react';

class HousekeepingErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[Housekeeping] render error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm">
          <div className="font-semibold">Housekeeping panel failed to load.</div>
          <div className="text-xs text-red-700 break-words">{String(this.state.error)}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default HousekeepingErrorBoundary;
