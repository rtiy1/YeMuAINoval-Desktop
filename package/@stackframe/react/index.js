// Local stub for @stackframe/react (YeMu desktop: local auto-login, Stack
// Auth is never exercised). Exists only to satisfy the Eigent-derived UI.
'use strict';

const React = require('react');

function passthrough(props) {
  return props.children || null;
}

function useStackApp() {
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

module.exports = {
  StackProvider: passthrough,
  StackTheme: passthrough,
  useStackApp,
  StackClientApp,
  useUser: () => null,
  useSignIn: () => ({ signIn: () => Promise.reject(new Error('unavailable')) }),
  useSignUp: () => ({ signUp: () => Promise.reject(new Error('unavailable')) }),
  useUpdateUser: () => ({ update: () => Promise.resolve(null) }),
};
