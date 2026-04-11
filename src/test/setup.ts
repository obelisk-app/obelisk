import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement scrollIntoView.
// Guard for node-env tests (e.g. file upload route) where Element is undefined.
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = () => {};
}
