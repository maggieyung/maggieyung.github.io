(() => {
  let mouseX = 0;
  let mouseY = 0;
  let currentX = 0;
  let currentY = 0;

  // mouse position
  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = (e.clientY / window.innerHeight) * 2 - 1;
  });

  // smooth easing function
  function lerp(start, end, factor) {
    return start + (end - start) * factor;
  }

  // animation loop
  function animate() {
    currentX = lerp(currentX, mouseX, 0.5);
    currentY = lerp(currentY, mouseY, 0.5);

    const parallaxElements = document.querySelectorAll('[data-parallax]');
    
    parallaxElements.forEach(el => {
      const speed = parseFloat(el.getAttribute('data-parallax')) || 20;
      
      // stars layer
      if (el.id === 'stars-layer') {
        const rotateY = currentX * (speed / 3);  
        const rotateX = -currentY * (speed / 3); 
        el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      }
      // house layer (foreground)
      else if (el.id === 'house-layer') {
        const translateX = currentX * speed * 2;
        const translateY = currentY * speed * 2;
        el.style.transform = `translate(calc(-50% + ${translateX}px), ${translateY}px)`;
      }
      // other
      else {
        const rotateY = currentX * speed;  
        const rotateX = -currentY * speed; 
        el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      }
    });

    requestAnimationFrame(animate);
  }

  animate();
})();
