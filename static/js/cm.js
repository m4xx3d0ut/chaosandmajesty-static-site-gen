var opacity = 0;
var intervalID = 0;
var out = 0;
window.onload = fadeBounce;
          
function fadeBounce() {
  setInterval(show, 200);
}
          
function show() {
  var body = document.getElementById("tagline");
  opacity = Number(window.getComputedStyle(body).getPropertyValue("opacity"));
  if (opacity < 1 && out === 0) {
    opacity += 0.1;
  } else if (opacity > 0) {
    out = 1;
    opacity -= 0.1;
  } else {
    out = 0;
    opacity += 0.1;
  }
  body.style.opacity = opacity;
}
