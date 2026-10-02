import { useEffect } from 'react';
import appShell from './app-shell.html?raw';
import { initializeApp } from './app-controller';

/** Mounts the existing accessible tabitular interface and connects its audio/editor controller. */
export default function App() {
  useEffect(() => {
    initializeApp();
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: appShell }} />;
}
