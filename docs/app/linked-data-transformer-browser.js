// docs/app/linked-data-transformer-browser.js
import { downloadTextFile } from './shared/format-registry/browser-file-actions.js';

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('File read error'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsText(file);
  });
}

export function downloadContent({ content, filename, mimeType = 'text/plain' }) {
  downloadTextFile(filename, content, { mimeType });
}
