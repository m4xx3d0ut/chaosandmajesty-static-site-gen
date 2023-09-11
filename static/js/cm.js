var opacity = 0;
var intervalID = 0;
var out = 0;
var hello = [
	['GREETINGS PROFESSOR FALKEN.', 'tOut0'],
	['HOW ARE YOU FEELING TODAY?', 'tOut1'],
	['SHALL WE PLAY A GAME?', 'tOut2']
]
var eol = 'sOut';
var eolChar = '.';
var elementId = 0;
var i = 0;
var tSpeed = 100;

window.onload = main;
          
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

function blink(element) {
	var speed = 1000;
	var eId = document.getElementById(element);
	eId.innerHTML += eolChar;
	setInterval(function (eId) {
		eId.style.visibility = (eId.style.visibility == 'hidden' ? '' : 'hidden');
	}, speed, eId);
}

function terminal(msgOut) {
	var msg = msgOut[elementId][0];
	var eId = msgOut[elementId][1];
	var msgLen = msg.length;
	if (i < msg.length) {
		document.getElementById(eId).innerHTML += msg.charAt(i);
		i++;
	} else {
		i = 0;
		elementId++;
	}
	if (elementId < hello.length) {
		setTimeout(terminal, tSpeed, msgOut, elementId);	
	}
	if (elementId === hello.length) {
		blink(eol);
	}
}

function main() {
	fadeBounce();
	terminal(hello);		
}
