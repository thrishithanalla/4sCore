import { Component, ErrorInfo, ReactNode } from 'react';
import { Message } from 'primereact/message';
import { Button } from 'primereact/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-xl mx-auto px-4">
          <div className="flex flex-col items-center justify-center min-h-screen text-center gap-6">
            <i className="pi pi-exclamation-triangle text-red-500" style={{ fontSize: '4rem' }} />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Something Went Wrong
            </h1>
            <Message
              severity="error"
              className="w-full"
              content={
                <p className="text-sm">
                  An unexpected error occurred. Please try refreshing the page or contact support if the
                  problem persists.
                </p>
              }
            />
            {this.state.error && (
              <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                Error: {this.state.error.message}
              </p>
            )}
            <div className="flex gap-4">
              <Button onClick={this.handleReset}>
                Go to Home
              </Button>
              <Button outlined onClick={() => window.location.reload()}>
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
