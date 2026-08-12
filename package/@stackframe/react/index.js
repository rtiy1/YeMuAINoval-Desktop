// Local stub for @stackframe/react (YeMu desktop: local auto-login, Stack
// Auth is never exercised). Exists only to satisfy the Eigent-derived UI.
import React from 'react';

function passthrough(props) {
  return props.children || null;
}

function useStackApp() {
  return null;
}

function useUser() {
  return null;
}

class StackClientApp {
  constructor() {
    // no-op: projectId/publishableClientKey/tokenStore are unused locally
  }
  signIn() {
    return Promise.reject(new Error('Stack Auth is not available in YeMu desktop'));
  }
  signUp() {
    return Promise.reject(new Error('Stack Auth is not available in YeMu desktop'));
  }
  getSession() {
    return null;
  }
  updateUser() {
    return Promise.resolve(null);
  }
}

const StackProvider = passthrough;
const StackTheme = passthrough;
const useSignIn = () => ({ signIn: () => Promise.reject(new Error('unavailable')) });
const useSignUp = () => ({ signUp: () => Promise.reject(new Error('unavailable')) });
const useUpdateUser = () => ({ update: () => Promise.resolve(null) });

export {
  StackProvider,
  StackTheme,
  useStackApp,
  useUser,
  useSignIn,
  useSignUp,
  useUpdateUser,
  StackClientApp,
};
