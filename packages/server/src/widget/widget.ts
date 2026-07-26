/**
 * Generate the embeddable widget JavaScript.
 * This is served as a static JS file at /widget.js
 */
export function generateWidgetScript(): string {
  return `
(function() {
  var OpenDocuments = window.OpenDocuments || {};
  OpenDocuments.widget = function(config) {
    var container = document.createElement('div');
    container.id = 'opendocuments-widget';
    container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;';

    var button = document.createElement('button');
    button.textContent = '?';
    button.style.cssText = 'width:56px;height:56px;border-radius:50%;background:#2563eb;color:white;border:none;font-size:24px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.15);';

    var iframe = document.createElement('iframe');
    var serverUrl = new URL(config.server, window.location.href);
    serverUrl.pathname = '/';
    serverUrl.search = '?widget=true&parentOrigin=' + encodeURIComponent(window.location.origin);
    iframe.src = serverUrl.toString();
    iframe.style.cssText = 'width:380px;height:520px;border:none;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.12);display:none;';

    var close = document.createElement('button');
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close OpenDocuments');
    close.style.cssText = 'position:absolute;top:8px;right:8px;width:32px;height:32px;border-radius:50%;background:#0f172a;color:white;border:none;font-size:20px;cursor:pointer;display:none;z-index:2;';

    iframe.onload = function() {
      var targetOrigin = serverUrl.origin;
      iframe.contentWindow.postMessage({ type: 'opendocuments-auth', apiKey: config.apiKey || '', workspace: config.workspace }, targetOrigin);
    };

    button.onclick = function() {
      iframe.style.display = 'block';
      close.style.display = 'block';
      button.style.display = 'none';
    };

    close.onclick = function() {
      iframe.style.display = 'none';
      close.style.display = 'none';
      button.style.display = 'block';
    };

    container.appendChild(iframe);
    container.appendChild(close);
    container.appendChild(button);
    document.body.appendChild(container);
  };
  window.OpenDocuments = OpenDocuments;
})();
`
}
