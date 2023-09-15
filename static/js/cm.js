var opacity = 0;
var intervalID = 0;
var out = 0;
var hello = [
	'GREETINGS PROFESSOR FALKEN.',
	'HOW ARE YOU FEELING TODAY?',
	'SHALL WE PLAY A GAME?',
	'S2VybmVsIFBhbmljIQo=',
	'.',
	'..',
	'...',
	'All your internet are belong to us!',
	'Who are you looking for?'
]
var allowIn = true;
var elementId = 0;
var i = 0;
var tSpeed = 100;

window.onload = (event) => {
    main();
	const termIn = document.getElementById("uIn");
	termIn.addEventListener("keyup", function(e) {
	    if (e.which === 13 && allowIn) {
	    	var cli = e.target.value;
        	terminal([cli]);
        	e.target.value = "";
    	}
	});
}
          
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

function termFunc(input) {
    console.log(input);
}

function terminal(msgOut) {
	var msg = msgOut[elementId];
	if (msg === undefined) {
		return;
	}
	allowIn = false;
	var msgLen = msg.length;
	const term = document.getElementById("tOut");
	if (i < msg.length) {
		term.value += msg.charAt(i);
		i++;
	} else {
		i = 0;
		elementId++;
		term.value += '\n$ '
	}
	if (elementId < msgOut.length) {
		setTimeout(terminal, tSpeed, msgOut, elementId);	
	}
	if (elementId === msgOut.length) {
		elementId = 0;
		allowIn = true;
	}
}

function main() {
	fadeBounce();
	terminal(hello);		
}
