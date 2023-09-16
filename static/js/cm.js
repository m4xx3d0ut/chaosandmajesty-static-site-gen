var opacity = 0;
var intervalID = 0;
var out = 0;
var hello = [
    'GREETINGS PROFESSOR FALKEN.',
    'HOW ARE YOU FEELING TODAY?',
    'SHALL WE PLAY A GAME?',
    'S2VybmVsIFBhbmljIQo=',
    'Payload_Execute......',
    'Reverse_Shell_Starting...',
    'ALL YOUR BASE ARE BELONG TO US!',
    'Awaiting command...'
]
var opts = ['paul', 'm4xx3d0ut', 'renee', 'matica']
var prof = [
    [
        'Seaching... Profile found!',
        '---',
        'Name: Paul Kolesa',
        'Handle: m4xx3d0ut',
        'Email: ',
        'mailto:hakr@theinfinitereality.com',
        'hakr@theinfinitereality.com',
        'LinkedIn: ',
        'https://www.linkedin.com/in/paul-k-a3a18196/',
        'The Architect',
        'About: Paul (m4xx3d0ut) is iR\'s Swiss Army Knife! Currently serving as Sr. Information Security Officer and InfoSec team lead, he is also the architect of the video infrastructure for their immersive experiences. A Pythonista at heart, he is capable of working across a number of languages and frameworks.',
        '---',
        'End of transmission...'
    ],
    [
        'Seaching... Profile found!',
        '---',
        'Name: Renee Kresho-Kolesa',
        'Handle: matica8',
        'LinkedIn: ',
        'https://www.linkedin.com/in/rene%C3%A9-k-025083bb/',
        'Producer/Audio Engineer/ICC',
        'About: Renee rules.',
        '---',
        'End of transmission...'
    ]
]
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
                terminal(prof[0]);
            } else if (opt == opts[2] || opt == opts[3]) {
                terminal(prof[1]);
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
    var term = document.getElementById("tOut");
    var follow = followTerm(term);
    if (i < msg.length) {
        term.innerHTML += msg.charAt(i);
        i++;
    } else {
        i = 0;
        if (msg === 'Email: ' || msg === 'LinkedIn: ') {
            var a = document.createElement('a');
            var link = document.createTextNode(msgOut[elementId+2])
            a.appendChild(link);
            a.title = msgOut[elementId+2];
            a.href = msgOut[elementId+1];
            a.target = '_blank';
            term.append(a);
            elementId += 2;
        }
        elementId++;
        term.innerHTML += '<br>$ '
    }
    if (follow) {
        scrollTerm(term);
    }
    if (elementId < msgOut.length) {
        setTimeout(terminal, tSpeed, msgOut, elementId);    
    }
    if (elementId === msgOut.length) {
        elementId = 0;
        allowIn = true;
    }
}

function followTerm(el) {
  if (el.scrollTop >= (el.scrollHeight - el.offsetHeight)) {
      return true;
  }
  return false;
}

function scrollTerm(el) {
  el.scrollTop = el.scrollHeight;
}

function main() {
    fadeBounce();
    terminal(hello);
}
