export function alertMessage(text) {
  alert(text);
}

export function showOverlay(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.add('visible');
}

export function hideOverlay(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.remove('visible');
}

export function busyButton(button, text) {
  const originalText = button.textContent;
  button.textContent = text;
  button.disabled = true;
  return () => {
    button.textContent = originalText;
    button.disabled = false;
  };
}
