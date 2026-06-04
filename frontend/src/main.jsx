import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/global.css';
import './styles/logo.css';
import './styles/mobile.css';

/**
 * React + Google Translate hardening. Translate (the Chrome extension AND
 * the in-page widget) walks the DOM and swaps text nodes underneath React.
 * When React later tries to reconcile, the parent it remembers no longer
 * contains the node — `removeChild` / `insertBefore` throw NotFoundError
 * and the whole tree unmounts → user sees a blank dark screen.
 *
 * The fix is the well-known shim from facebook/react#11538: tolerate the
 * mismatch instead of crashing. Cheap, safe, and idempotent — we leave
 * the originals alone otherwise.
 */
if (typeof Node === 'function' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function patchedRemoveChild(child) {
    if (child.parentNode !== this) {
      // Google Translate already detached the node — pretend we removed it.
      return child;
    }
    return originalRemoveChild.apply(this, arguments);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function patchedInsertBefore(newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      // Reference node was moved by a translator — append instead of throw.
      return this.appendChild(newNode);
    }
    return originalInsertBefore.apply(this, arguments);
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
