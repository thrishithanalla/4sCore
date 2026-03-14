import React from 'react';

// FeedbackHoverProvider is a passthrough wrapper when running standalone
export const FeedbackHoverProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

export default FeedbackHoverProvider;
