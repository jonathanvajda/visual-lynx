// docs/app/linked-data-transformer-browser.js
import {
  downloadTextFile,
  readFileAsText as readBrowserFileAsText
} from './shared/browser-file-io/index.js';

export function readFileAsText(file) {
  return readBrowserFileAsText(file);
}

export function downloadContent({ content, filename, mimeType = 'text/plain' }) {
  downloadTextFile(filename, content, { mimeType });
}
