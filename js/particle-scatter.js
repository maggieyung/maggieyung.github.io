(() => {
  const container = document.getElementById('particle-layer');
  if (!container) return;

  const particleCount = 8; 
  const minSize = 150;
  const maxSize = 350;

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('img');
    particle.src = 'img/particle.png'; 
    particle.className = 'scattered-particle';
    
    // random size
    const size = minSize + Math.random() * (maxSize - minSize);
    particle.style.width = size + 'px';
    
    // random position
    const x = 5 + Math.random() * 90; // viewport width
    const y = 20 + Math.random() * 70; // iewport height
    particle.style.left = x + '%';
    particle.style.top = y + '%';
    
    // parallax speed
    const parallaxSpeed = 8 + Math.random() * 6; // 8-14
    particle.setAttribute('data-parallax', parallaxSpeed.toFixed(1));
    
    container.appendChild(particle);
  }
  
})();
