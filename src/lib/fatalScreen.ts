// Last-resort error screen for failures that escape React entirely: module-eval
// errors and uncaught async rejections, which leave the page blank otherwise.
//
// SECURITY: this renders text the app does not control. A rejected Drive call
// carries Google's raw response body in `err.message`, and a restored backup
// file can put arbitrary strings into an error too. Every dynamic value is
// therefore set with textContent — never build this panel from an HTML string
// and never assign it through innerHTML.

const BOX_STYLE =
  'padding:24px;font-family:monospace;color:#b91c1c;background:#fef2f2;' +
  'min-height:100dvh;white-space:pre-wrap;word-break:break-word';

export function renderFatalScreen(root: HTMLElement, label: string, detail: unknown): void {
  const err = detail instanceof Error ? detail : new Error(String(detail));

  const box = document.createElement('div');
  box.setAttribute('style', BOX_STYLE);

  const heading = document.createElement('h2');
  heading.setAttribute('style', 'font-size:16px;margin:0 0 8px');
  heading.textContent = label;

  const message = document.createElement('div');
  message.setAttribute('style', 'font-weight:700;margin-bottom:8px');
  message.textContent = err.message;

  const stack = document.createElement('pre');
  stack.setAttribute('style', 'font-size:11px;line-height:1.4');
  stack.textContent = err.stack ?? '';

  box.append(heading, message, stack);
  root.replaceChildren(box);
}
