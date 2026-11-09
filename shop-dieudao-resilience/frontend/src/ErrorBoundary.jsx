import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  handleReset = () => {
    this.setState({ error: null });
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.error) {
      return (
        <div className="unprotected-danger-banner" role="alert" style={{ marginTop: 12 }}>
          <AlertTriangle size={20} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong>Không hiển thị được phần này do lỗi dữ liệu tạm thời</strong>
            <p style={{ margin: '4px 0 10px' }}>
              {this.state.error?.message || 'Đã có sự cố khi hiển thị giao diện.'}
            </p>
            <button
              type="button"
              className="reset"
              onClick={this.handleReset}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RotateCcw size={14} /> Thử khôi phục lại
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

