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
    'ALL YOUR BASE ARE BELONG TO US!',
    'Who are you looking for?'
]
var opts = ['paul', 'm4xx3d0ut', 'renee', 'matica']
var allowIn = true;
var elementId = 0;
var i = 0;
var tSpeed = 100;
String.prototype.trim = function() {
  return this.replace(/^\s+|\s+$/g, "");
};

window.onload = (event) => {
    main();
    const termIn = document.getElementById("uIn");
    termIn.addEventListener("keyup", function(e) {
        if (e.which === 13 && allowIn) {
            var cli = e.target.value;
            terminal([cli]);
            checkIn(cli);
            e.target.value = "";
        }
    });
}

function checkIn(cli) {
    var i = cli;
    if(!allowIn) {
         window.setTimeout(checkIn, 100, i);
    } else {
        termFunc(i);
    }
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
    var term = input.toLowerCase();
    var valid = false;
    opts.forEach((opt) => {
        if (term.includes(opt)) {
            valid = true;
            if (opt === opts[0] || opt === opts[1]) {
                terminal(['m4xx3d0ut Profile']);
            } else if (opt == opts[2] || opt == opts[3]) {
                terminal(['matica8 Profile']);
            }
        }
    });
    if (!valid) {
        terminal(['DOES NOT COMPUTE!!!']);
    }
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
