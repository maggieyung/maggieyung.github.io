// reference: https://webglfundamentals.org/webgl/lessons/webgl-qna-create-image-warping-effect-in-webgl.html


var img = new Image();
img.onload = start;
img.src = "img/overlay.png";

function start() {

  var canvas = document.querySelector("#backdrop-canvas");
  var ctx = canvas.getContext("2d");

  function mix(a, b, l) {
    return a + (b - a) * l;
  }
  
  function upDown(v) {
    return Math.sin(v) * 0.5 + 0.5;
  }

  function shape(v, time) {
    
    // two peaks
    if (v < 0.2) {
      var top = v * 25;
      return Math.sin(top * Math.PI) * 80 * Math.sin(time * 0.5);
    }
    
    // rounded
    if (v < 0.4) {
      var headV = (v - 0.2) / 0.2;
      return Math.sin(headV * Math.PI) * 60 * Math.cos(time * 0.7);
    }
    
    // gentle curve
    if (v < 0.8) {
      var middle = (v - 0.4) / 0.4;
      return Math.sin(middle * Math.PI * 0.5) * 100 * Math.sin(time * 0.3);
    }
    
    // tapering wave
    var end = (v - 0.8) / 0.2;
    return Math.sin(end * Math.PI * 3) * 40 * (1 - end) * Math.cos(time * 0.9);
  }
  
  function render(time) {
    time *= 0.001;

    resize(canvas);

    var t1 = time;
    var t2 = time * 0.37;

    // for each line in the canvas
    for (var dstY = 0; dstY < canvas.height; ++dstY) {
      
      // v is value that goes 0 to 1 down the canvas
      var v = dstY / canvas.height;
      
      // compute offset
      var off = shape(v, t1) + shape(v, t2) * 0.3;
      
      // compute what line of the source image we want
      var srcY = dstY * img.height / canvas.height + off;
      
      // clamp srcY to be inside the image
      srcY = Math.max(0, Math.min(img.height - 1, srcY));

      // draw a single line from the src to the canvas
      ctx.drawImage(
        img, 
        0, srcY, img.width, 1, 
        0, dstY, canvas.width, 1);
    }    
    
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  function resize(canvas) {
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    if (width != canvas.width || height != canvas.height) {
      canvas.width = width;
      canvas.height = height;
    }
  }
}
