// game dialogue box interaction
(() => {
  const box = document.getElementById('dialogue-box');
  if (!box) return;
  box.addEventListener('click', () => box.classList.toggle('hidden'));
})();
