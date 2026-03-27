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
    iframe.src = config.server + '/?widget=true';
    iframe.style.cssText = 'width:380px;height:520px;border:none;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.12);display:none;';

    iframe.onload = function() {
      iframe.contentWindow.postMessage({ type: 'opendocuments-auth', apiKey: config.apiKey, workspace: config.workspace }, config.server);
    };

    button.onclick = function() {
      iframe.style.display = iframe.style.display === 'none' ? 'block' : 'none';
      button.style.display = iframe.style.display === 'none' ? 'block' : 'none';
    };

    container.appendChild(iframe);
    container.appendChild(button);
    document.body.appendChild(container);
  };
  window.OpenDocuments = OpenDocuments;
})();
`
}
