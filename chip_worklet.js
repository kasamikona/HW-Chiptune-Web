// Boilerplate
var startFunction;
var generatorFunction;
var messageProcessorFunction;
var messageSend;
var started = false;
class ChipWorkletProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.port.onmessage = (event) => {
			let action = event.data.action;
			let payload = event.data.payload;
			if(messageProcessorFunction) messageProcessorFunction(action, payload);
		};
		messageSend = (action, payload) => {
			this.port.postMessage({action:action, payload:payload});
		}
	}
	process(inputs, outputs, parameters) {
		if(startFunction && !started) startFunction();
		started = true;
		if(!generatorFunction) return true;
		let channels = outputs[0];
		let channel0 = channels[0];
		let channel1 = null;
		if(channels.length > 1) channel1 = channels[1];
		generatorFunction(channel0, channel1, sampleRate);
		return true;
	}
}
registerProcessor("chip_worklet", ChipWorkletProcessor);

// Synth specific
generatorFunction = function(buffer0, buffer1, rate) {
	if(!!buffer1) for(let i in buffer0) {
		buffer0[i] = resample(rate);
		buffer1[i] = buffer0[i];
	}
	else for(let i in buffer0) buffer0[i] = resample(rate);
};
const callableFunctions = {startplaysong:startplaysong};
messageProcessorFunction = function(action, payload) {
	if(action == "callfunc") {
		let f = payload.f || payload;
		let args = payload.args || [];
		callableFunctions[f](...args);
	} else if(action == "play") {
		forcePop = 0.5;
		startplaysong();
	} else if(action == "stop") {
		forcePop = -0.3;
		silence();
	} else if(action == "load") {
		loadSong(payload);
	} else if(action == "setSpeedMod") {
		if(typeof(payload) == "number")
			setSpeedMod(payload);
	} else if(action == "setBitMod") {
		if(typeof(payload) == "boolean")
			setBitMod(payload);
	}
	else console.log("Audio worklet ignoring message "+action);
};
startFunction = function() {
	//startplaysong();
};

const TRACKLEN = 32;
// From implicit enum
const WF_TRI = 0;
const WF_SAW = 1;
const WF_PUL = 2;
const WF_NOI = 3;
var SPEEDMOD = 1;
var NOISEDIV;
var NATIVE_RATE;
var POPDECAY;
var BITMOD = false;
var OUTSCALE;
var outputSampleTimer = 0;
var lastSample = 0;
var lastLastSample = 0;
var sendSample = 0;
var forcePop = 0;
function setSpeedMod(mult) {
	if(mult < 1) mult = 1;
	SPEEDMOD = mult;
	NOISEDIV = Math.sqrt(1/SPEEDMOD); // best sound
	NATIVE_RATE = 16000*SPEEDMOD;
	POPDECAY = Math.pow(0.998, 1/SPEEDMOD);
}
setSpeedMod(SPEEDMOD);
function setBitMod(use) {
	BITMOD = !!use;
	OUTSCALE = 1 / (BITMOD ? 32768 : 128);
}
setBitMod(BITMOD);
function resample(rate) {
	let sampleDelta = NATIVE_RATE / rate;
	outputSampleTimer += sampleDelta;
	if(outputSampleTimer > 10) outputSampleTimer = 10; // More than enough cap, stop infinite loops
	while(outputSampleTimer >= 1) {
		outputSampleTimer--;
		lastLastSample = lastSample;
		lastSample = interrupthandler() * OUTSCALE;
	}
	// Linear interpolation/antialiasing
	let rv = lastLastSample + (lastSample - lastLastSample) * outputSampleTimer;
	let av = rv < 0 ? -rv : rv;
	if(av > sendSample) sendSample = av;
	rv += forcePop;
	forcePop *= POPDECAY;
	if(rv < -1) rv = -1;
	if(rv > 1) rv = 1;
	return rv * 0.65;
}
var songData = [];
var trackData = [];
var instrData = [];

function loadSong(fileContents) { // Loads from .song file, fileContents is a string with newlines
	silence();
	songData = [];
	trackData = [];
	instrData = [];
	let fileLines = fileContents.toLowerCase().split(/\r?\n/);
	for(let line of fileLines) {
		let elems = line.split(" ");
		if(line.startsWith("songline") && elems.length >= 10) {
			let pos = parseInt(elems[1], 16);
			let ch = [];
			for(let i = 0; i < 4; i++) {
				ch[i] = [parseInt(elems[i+i+2], 16), parseInt(elems[i+i+3], 16)];
			}
			songData[pos] = ch;
		} else if(line.startsWith("trackline") && elems.length >= 7) { // Ignore last 2 numbers, unused second command column
			let num = parseInt(elems[1], 16);
			let pos = parseInt(elems[2], 16);
			let note = parseInt(elems[3], 16);
			let instr = parseInt(elems[4], 16);
			let cmd = [parseInt(elems[5], 16), 0]
			let param = [parseInt(elems[6], 16), 0];
			if(!trackData[num]) trackData[num] = Array(TRACKLEN).fill({note:0, instr:0, cmd:[0, 0], param:[0, 0]});
			trackData[num][pos] = {note:note, instr:instr, cmd:cmd, param:param};
		} else if(line.startsWith("instrumentline") && elems.length >= 5) {
			let num = parseInt(elems[1], 16);
			let pos = parseInt(elems[2], 16);
			let cmd = parseInt(elems[3], 16);
			let param = parseInt(elems[4], 16);
			if(!instrData[num]) instrData[num] = [];
			instrData[num][pos] = [cmd, param];
		}
	}
}

function readsong(pos, ch) { // returns [track, transp]
	if(pos < 0 || pos >= songData.length || ch < 0 || ch > 3) return 0; // failsafe
	return songData[pos][ch];
}
function readtrack(num, pos) { // returns {.note, .instr, .cmd, .param}
	if(num < 0 || num >= trackData.length || pos < 0 || pos >= TRACKLEN) return 0; // failsafe
	return trackData[num][pos] || 0; // undefined to 0
}
function readinstr(num, pos) { // returns [cmd, param]
	if(num < 0 || num >= instrData.length || pos < 0) return [0, 0]; // failsafe
	let inst = instrData[num];
	if(pos >= inst.length) return [0, 0]; // failsafe
	return inst[pos] || [0, 0]; // undefined to [0, 0]
}

// Ported mostly from tracker source, lights added from hardware source

function makeOsc() {
	return {
		freq: 0,
		phase: 0,
		duty: 0,
		volume: 0,
		waveform: 0
	}
}
function makeChannel() {
	return {
		tnum: 0,
		transp: 0,
		tnote: 0,
		lastinstr: 0,
		inum: 0,
		iptr: 0,
		iwait: 0,
		inote: 0,
		bendd: 0,
		bend: 0,
		volumed: 0,
		dutyd: 0,
		vdepth: 0,
		vrate: 0,
		vpos: 0,
		inertia: 0,
		slur: 0
	}
};

var _c = {
	callbackwait: 0,
	trackwait: 0,
	trackpos: 0,
	songpos: 0,
	playsong: 0,
	playtrack: 0,
	osc: [makeOsc(), makeOsc(), makeOsc(), makeOsc()],
	channel: [makeChannel(), makeChannel(), makeChannel(), makeChannel()],
	noiseseed: 1, // Moved from sound routine
	noiseDivideCounter: 0, // For sound mod
	light: [0, 0],
	lightPort: 0
};

const freqtable = [
	0x0085, 0x008d, 0x0096, 0x009f, 0x00a8, 0x00b2, 0x00bd, 0x00c8, 0x00d4,
	0x00e1, 0x00ee, 0x00fc, 0x010b, 0x011b, 0x012c, 0x013e, 0x0151, 0x0165,
	0x017a, 0x0191, 0x01a9, 0x01c2, 0x01dd, 0x01f9, 0x0217, 0x0237, 0x0259,
	0x027d, 0x02a3, 0x02cb, 0x02f5, 0x0322, 0x0352, 0x0385, 0x03ba, 0x03f3,
	0x042f, 0x046f, 0x04b2, 0x04fa, 0x0546, 0x0596, 0x05eb, 0x0645, 0x06a5,
	0x070a, 0x0775, 0x07e6, 0x085f, 0x08de, 0x0965, 0x09f4, 0x0a8c, 0x0b2c,
	0x0bd6, 0x0c8b, 0x0d4a, 0x0e14, 0x0eea, 0x0fcd, 0x10be, 0x11bd, 0x12cb,
	0x13e9, 0x1518, 0x1659, 0x17ad, 0x1916, 0x1a94, 0x1c28, 0x1dd5, 0x1f9b,
	0x217c, 0x237a, 0x2596, 0x27d3, 0x2a31, 0x2cb3, 0x2f5b, 0x322c, 0x3528,
	0x3851, 0x3bab, 0x3f37
];

const sinetable = [
	0, 12, 25, 37, 49, 60, 71, 81, 90, 98, 106, 112, 117, 122, 125, 126,
	127, 126, 125, 122, 117, 112, 106, 98, 90, 81, 71, 60, 49, 37, 25, 12,
	0, -12, -25, -37, -49, -60, -71, -81, -90, -98, -106, -112, -117, -122,
	-125, -126, -127, -126, -125, -122, -117, -112, -106, -98, -90, -81,
	-71, -60, -49, -37, -25, -12
];

var songlen = 0;

// Tracker only
function silence() {
	let i;
	for(i = 0; i < 4; i++) {
		_c.osc[i].volume = 0;
	}
	_c.playsong = 0;
	_c.playtrack = 0;
}

function runcmd(ch, cmd, param) {
	let paramSigned = (param > 128) ? param-256 : param; // s8 targets
	switch(cmd) {
		case 0:
			_c.channel[ch].inum = 0;
			break;
		case 100: // 'd'
			_c.osc[ch].duty = param << 8;
			break;
		case 102: // 'f'
			_c.channel[ch].volumed = paramSigned;
			break;
		case 105: // 'i'
			_c.channel[ch].inertia = param << 1;
			break;
		case 106: // 'j'
			_c.channel[ch].iptr = param;
			break;
		case 108: // 'l'
			_c.channel[ch].bendd = paramSigned;
			break;
		case 109: // 'm'
			_c.channel[ch].dutyd = param << 6;
			break;
		case 116: // 't'
			_c.channel[ch].iwait = param;
			break;
		case 118: // 'v'
			_c.osc[ch].volume = param;
			break;
		case 119: // 'w'
			_c.osc[ch].waveform = param;
			break;
		case 43: // '+'
			_c.channel[ch].inote = param + _c.channel[ch].tnote - 12 * 4;
			break;
		case 61: // '='
			_c.channel[ch].inote = param;
			break;
		case 126: // '~'
			if(_c.channel[ch].vdepth != (param >> 4)) {
				_c.channel[ch].vpos = 0;
			}
			_c.channel[ch].vdepth = param >> 4;
			_c.channel[ch].vrate = param & 15;
			break;
	}
}

// Tracker only
function iedplonk(note, instr) {
	_c.channel[0].tnote = note;
	_c.channel[0].inum = instr;
	_c.channel[0].iptr = 0;
	_c.channel[0].iwait = 0;
	_c.channel[0].bend = 0;
	_c.channel[0].bendd = 0;
	_c.channel[0].volumed = 0;
	_c.channel[0].dutyd = 0;
	_c.channel[0].vdepth = 0;
}

// Tracker only
function startplaytrack(t) {
	_c.channel[0].tnum = t;
	_c.channel[1].tnum = 0;
	_c.channel[2].tnum = 0;
	_c.channel[3].tnum = 0;
	_c.trackpos = 0;
	_c.trackwait = 0;
	_c.playtrack = 1;
	_c.playsong = 0;
}

function startplaysong(p=0) {
	_c.songpos = p;
	_c.trackpos = 0;
	_c.trackwait = 0;
	_c.playtrack = 0;
	_c.playsong = 1;
}

function playroutine() {
	messageSend("lights", _c.lightPort);
	messageSend("speaker", sendSample);
	sendSample = 0;
	let ch;
	clearLights();
	if(_c.playtrack || _c.playsong) {
		if(_c.trackwait) {
			_c.trackwait--;
		} else {
			_c.trackwait = 4;
			if(!_c.trackpos) {
				if(_c.playsong) {
					if(_c.songpos >= songData.length) {
						_c.playsong = 0;
					} else {
						for(ch = 0; ch < 4; ch++) {
							let tmp = readsong(_c.songpos, ch);
							_c.channel[ch].tnum = tmp[0];
							_c.channel[ch].transp = tmp[1];
						}
						_c.songpos++; _c.songpos &= 255; // u8
					}
				}
			}
			if(_c.playtrack || _c.playsong) {
				for(ch = 0; ch < 4; ch++) {
					if(_c.channel[ch].tnum) {
						let instr = 0;
						let tl = readtrack(_c.channel[ch].tnum, _c.trackpos);
						if(tl.note) {
							_c.channel[ch].tnote = (tl.note + _c.channel[ch].transp) & 255; // u8
							instr = _c.channel[ch].lastinstr;
						}
						if(tl.instr) {
							instr = tl.instr;
						}
						if(instr) {
							addLights(instr, ch);
							_c.channel[ch].lastinstr = instr;
							_c.channel[ch].inum = instr;
							_c.channel[ch].iptr = 0;
							_c.channel[ch].iwait = 0;
							_c.channel[ch].bend = 0;
							_c.channel[ch].bendd = 0;
							_c.channel[ch].volumed = 0;
							_c.channel[ch].dutyd = 0;
							_c.channel[ch].vdepth = 0;
						}
						if(tl.cmd[0])
							runcmd(ch, tl.cmd[0], tl.param[0]);
					}
				}
				_c.trackpos++;
				_c.trackpos &= 31;
			}
		}
	}
	for(ch = 0; ch < 4; ch++) {
		let vol;
		let duty;
		let slur;
		let stuckCounter = 256;
		while(_c.channel[ch].inum && !_c.channel[ch].iwait) {
			stuckCounter--;
			if(stuckCounter < 0) {
				console.log("Got stuck on channel "+ch+" instrument commands!", _c);
				break;
			}
			let il = readinstr(_c.channel[ch].inum, _c.channel[ch].iptr);
			_c.channel[ch].iptr++; _c.channel[ch].iptr &= 255; // u8
			runcmd(ch, il[0], il[1]);
		}
		if(_c.channel[ch].iwait) { _c.channel[ch].iwait--; _c.channel[ch].iwait &= 255; } // u8
		if(_c.channel[ch].inertia) {
			slur = _c.channel[ch].slur;
			let diff = freqtable[_c.channel[ch].inote] - slur;
			if(diff > 0) {
				if(diff > _c.channel[ch].inertia) diff = _c.channel[ch].inertia;
			} else if(diff < 0) {
				if(diff < -_c.channel[ch].inertia) diff = -_c.channel[ch].inertia;
			}
			slur += diff; slur &= 65535; // u16
			_c.channel[ch].slur = slur;
		} else {
			slur = freqtable[_c.channel[ch].inote];
		}
		_c.osc[ch].freq = (
			slur +
			_c.channel[ch].bend +
			((_c.channel[ch].vdepth * sinetable[_c.channel[ch].vpos & 63]) >> 2) ) & 65535; // u16
		_c.channel[ch].bend += _c.channel[ch].bendd;
		vol = _c.osc[ch].volume + _c.channel[ch].volumed;
		if(vol < 0) vol = 0;
		if(vol > 255) vol = 255;
		_c.osc[ch].volume = vol;
		duty = (_c.osc[ch].duty + _c.channel[ch].dutyd) & 65535; // u16
		if(duty > 0xe000) duty = 0x2000;
		if(duty < 0x2000) duty = 0xe000;
		_c.osc[ch].duty = duty;
		_c.channel[ch].vpos += _c.channel[ch].vrate; _c.channel[ch].vpos &= 255; // u8
	}
	updateLights();
}

function initchip() {
	_c.trackwait = 0;
	_c.trackpos = 0;
	_c.playsong = 0;
	_c.playtrack = 0;
	_c.osc[0].volume = 0;
	_c.channel[0].inum = 0;
	_c.osc[1].volume = 0;
	_c.channel[1].inum = 0;
	_c.osc[2].volume = 0;
	_c.channel[2].inum = 0;
	_c.osc[3].volume = 0;
	_c.channel[3].inum = 0;
}

function interrupthandler() { // sound routine
	let i; // u8
	let acc; // s16
	_c.noiseDivideCounter += NOISEDIV;
	if(_c.noiseDivideCounter >= 1) {
		let newbit = 0;
		if(_c.noiseseed & 0x80000000) newbit ^= 1;
		if(_c.noiseseed & 0x01000000) newbit ^= 1;
		if(_c.noiseseed & 0x00000040) newbit ^= 1;
		if(_c.noiseseed & 0x00000200) newbit ^= 1;
		_c.noiseseed = (_c.noiseseed << 1) | newbit;
		_c.noiseDivideCounter--;
	}
	if(_c.callbackwait) {
		_c.callbackwait--; // u8
	} else {
		playroutine();
		_c.callbackwait = (180*SPEEDMOD) - 1;
	}
	acc = 0;
	for(i = 0; i < 4; i++) {
		//if(i != 2) continue;
		let value; // [-32,31]
		switch(_c.osc[i].waveform) {
			case WF_TRI:
				if(_c.osc[i].phase < 0x8000) {
					value = -32 + (_c.osc[i].phase >> 9);
				} else {
					value = 31 - ((_c.osc[i].phase - 0x8000) >> 9);
				}
				break;
			case WF_SAW:
				value = -32 + (_c.osc[i].phase >> 10);
				break;
			case WF_PUL:
				value = (_c.osc[i].phase > _c.osc[i].duty)? -32 : 31;
				break;
			case WF_NOI:
				value = (_c.noiseseed & 63) - 32;
				break;
			default:
				value = 0;
				break;
		}
		_c.osc[i].phase += (_c.osc[i].freq / SPEEDMOD); _c.osc[i].phase %= 65536; // u16

		acc += value * _c.osc[i].volume; // rhs = [-8160,7905]
	}
	// acc [-32640,31620]
	return BITMOD ? acc : (acc >> 8);
}

function clearLights() {
	_c.light[0] = _c.light[1] = 0;
}
function updateLights() {
	let old = _c.lightPort;
	_c.lightPort = 0;
	if(_c.light[0]) {
		_c.light[0]--;
		_c.lightPort |= 1;
	}
	if(_c.light[1]) {
		_c.light[1]--;
		_c.lightPort |= 2;
	}
}
// This is with the song data because it's sort of specific to the song
function addLights(instr, ch) {
	if(instr == 2) _c.light[1] = 5;
	if(instr == 1) {
		_c.light[0] = 5;
		if(_c.channel[ch].tnum == 4) {
			_c.light[0] = _c.light[1] = 3;
		}
	}
	if(instr == 7) {
		_c.light[0] = _c.light[1] = 30;
	}
}
