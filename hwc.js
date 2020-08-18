var audioRunning = false;
var playState = false;
var sendMessage;
async function runAudio() {
	if(!audioRunning) {
		audioRunning = true;
		const audioContext = new AudioContext();
		await audioContext.resume();
		let blob;
		let workletSource = "("+workletFunction+")();".replace('"use strict";', '');
		try {
			blob = new Blob([workletSource], {type: 'application/javascript'});
		} catch (e) { // Backwards-compatibility
			window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder;
			blob = new BlobBuilder();
			blob.append(response);
			blob = blob.getBlob();
		}
		await audioContext.audioWorklet.addModule(URL.createObjectURL(blob));
		const chipNode = new AudioWorkletNode(audioContext, 'chip_worklet');
		chipNode.connect(audioContext.destination);
		chipNode.port.onmessage = (event) => {
			let action = event.data.action;
			let payload = event.data.payload;
			receivedMessage(action, payload);
		};
		sendMessage = (action, payload, transfer=[]) => chipNode.port.postMessage({action:action, payload:payload}, transfer);
		sendMessage("setSpeedMod", 3); // 48kHz
		sendMessage("setBitMod", true); // 16bit
		sendMessage("load", musicData);
	}
}

var lights = [0, 0];
var speakerMovement = 0;
function receivedMessage(action, payload) {
	if(action == "lights") {
		if(payload&1) lights[0] = 1;
		if(payload&2) lights[1] = 1;
	} else if(action == "speaker") {
		if(speakerMovement < payload) speakerMovement = (payload > 1) ? 1 : payload;
	} else if(action == "saveRecording") {
		makeWav(payload.buffer, payload.length, payload.rate); 
	}
}
function makeWav(buffer, length, rate) {
	console.log("Writing wav file...");
	let headerLength = 44;
	let wav = new Uint8Array( 44 + length );
	let view = new DataView( wav.buffer );
	view.setUint32( 0, 1380533830, false ); // RIFF identifier 'RIFF'
	view.setUint32( 4, 36 + length, true ); // file length minus RIFF identifier length and file description length
	view.setUint32( 8, 1463899717, false ); // RIFF type 'WAVE'
	view.setUint32( 12, 1718449184, false ); // format chunk identifier 'fmt '
	view.setUint32( 16, 16, true ); // format chunk length
	view.setUint16( 20, 1, true ); // sample format (raw)
	view.setUint16( 22, 1, true ); // channel count
	view.setUint32( 24, rate, true ); // sample rate
	view.setUint32( 28, rate * 2 * 1, true ); // byte rate (sample rate * block align)
	view.setUint16( 32, 2 * 1, true ); // block align (channel count * bytes per sample)
	view.setUint16( 34, 16, true ); // bits per sample
	view.setUint32( 36, 1684108385, false); // data chunk identifier 'data'
	view.setUint32( 40, length, true ); // data chunk length
	wav.set( new Uint8Array(buffer, 0, length), headerLength );
	var blob = new Blob([wav.buffer], {type:"audio/wav"});
	var blobUrl = URL.createObjectURL(blob);
	var link = document.createElement("a");
	link.href = blobUrl;
	link.download = "recording.wav";
	link.click();
}
var svgDoc;
var animating = false;
function loadSvg(id) {
	svgDoc = document.getElementById(id).getSVGDocument();
	for(e of svgDoc.getElementsByTagName("tspan")) {
		e.style.webkitTouchCallout = "none";
		e.style.webkitUserSelect = "none";
		e.style.userSelect = "none";
	}
	svgDoc.getElementById("battery").onclick = async function() {
		if(animating) return;
		if(!playState) {
			await runAudio();
			animating = true;
			svgDoc.getElementById("battery_animate_in").beginElement();
			setTimeout(()=>{sendMessage("play");animating=false;}, 100);
		} else {
			animating = true;
			svgDoc.getElementById("battery_animate_out").beginElement();
			setTimeout(()=>{animating=false;}, 100);
			sendMessage("stop");
		}
		playState = !playState;
	};
	displayLights(0);
	document.getElementById(id).style.visibility = "visible";
}
var tl = 0;
var skipFrame = false;
function displayLights(t) {
	let baseGray = 0x33;
	let grayRemap = (255 - baseGray) / 255;
	if(!skipFrame) { // Every other frame is enough
		let td = (t - tl) / 1000;
		tl = t;
		let l0 = lights[0] * 255;
		let l1 = lights[1] * 255;
		let l0s = l0*1.5;
		let l1s = l1*1.5;
		if(l0s > 255) l0s = 255;
		if(l1s > 255) l1s = 255;
		l0 = (l0 * grayRemap) + baseGray;
		l1 = (l1 * grayRemap) + baseGray;
		l0s = (l0s * grayRemap) + baseGray;
		l1s = (l1s * grayRemap) + baseGray;
		svgDoc.getElementById("led1").style.fill = `rgb(${l0}, ${l0s}, ${l0s})`;
		svgDoc.getElementById("led2").style.fill = `rgb(${l1}, ${l1s}, ${l1s})`;
		svgDoc.getElementById("led1_glow").style.opacity = lights[0];
		svgDoc.getElementById("led2_glow").style.opacity = lights[1];
		// hacky speaker animation
		let speakerScale = playState ? (speakerMovement * 0.14 + 0.96) : 1;
		let speakerBBox = svgDoc.getElementById("speaker_cone").getBBox();
		let speakerOrigin = [speakerBBox.x + speakerBBox.width/2, speakerBBox.y + speakerBBox.height/2];
		let transformStr = `translate(${speakerOrigin[0]} ${speakerOrigin[1]}) scale(${speakerScale}) translate(${-speakerOrigin[0]} ${-speakerOrigin[1]})`;
		//console.log(transformStr);
		svgDoc.getElementById("speaker_cone").setAttribute("transform", transformStr);
		if(lights[0] > 0) lights[0] -= td * 8;
		if(lights[1] > 0) lights[1] -= td * 8;
		if(speakerMovement > 0) speakerMovement -= td * 100;
		if(lights[0] < 0) lights[0] = 0;
		if(lights[1] < 0) lights[1] = 0;
		if(speakerMovement < 0) speakerMovement = 0;
	}
	skipFrame = !skipFrame;
	requestAnimationFrame(displayLights);
}

function setChannelSolo(ch=-1) {
	for(let i = 0; i < 4; i++) sendMessage("setChannelMuted", {channel:i, muted:(i!=ch)});
}

function workletFunction() {
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
			messageSend = (action, payload, transfer=[]) => {
				this.port.postMessage({action, payload}, transfer);
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
	var recordBuffer = null;
	var recordBufferView = null;
	var doRecordBytes = 0;
	var recordHead = 0;
	var playing = false;
	var stateChanging = false;
	generatorFunction = function(buffer0, buffer1, rate) {
		let s;
		let si;
		for(let i in buffer0) {
			s = resample(rate);
			buffer0[i] = s;
			if(buffer1 != null) buffer1[i] = s;
			if(playing && recordBuffer && recordHead < doRecordBytes) {
				si = s * 32767;
				recordBufferView[recordHead++] = si;
				recordBufferView[recordHead++] = si>>8;
				if(recordHead >= doRecordBytes) {
					messageSend("saveRecording", {buffer:recordBuffer, length:recordHead, rate:sampleRate}, [recordBuffer]);
					recordBuffer = null;
				}
			}
		}
	};
	messageProcessorFunction = function(action, payload) {
		/*if(action == "callfunc") {
			let f = payload.f || payload;
			let args = payload.args || [];
			callableFunctions[f](...args);
		} else*/
		if(action == "play") {
			if(playing || stateChanging) return;
			stateChanging = true;
			if(doRecordBytes) {
				recordBuffer = new ArrayBuffer(doRecordBytes);
				recordBufferView = new Uint8Array(recordBuffer);
				recordHead = 0;
			}
			resetChip();
			forcePop = 0.5;
			startplaysong();
			playing = true;
			stateChanging = false;
		} else if(action == "stop") {
			if(!playing || stateChanging) return;
			stateChanging = true;
			playing = false;
			forcePop = -0.3;
			silence();
			if(doRecordBytes && recordBuffer) { // early finish!
				messageSend("saveRecording", {buffer:recordBuffer, length:recordHead, rate:sampleRate}, [recordBuffer])
				recordBuffer = null;
			}
			stateChanging = false;
		} else if(action == "load") {
			playing = false;
			loadSong(payload);
		} else if(action == "setSpeedMod" && typeof(payload) == "number") {
			setSpeedMod(payload);
		} else if(action == "setBitMod" && typeof(payload) == "boolean") {
			setBitMod(payload);
		} else if(action == "setRecordTime" && typeof(payload) == "number") {
			doRecordBytes = Math.ceil(Math.max(0, payload) * sampleRate) * 2;
		} else if(action == "setChannelMuted" && typeof(payload) == "object") {
			if(typeof(payload.channel) == "number"
			&& payload.channel >= 0 && payload.channel < 4
			&& typeof(payload.muted) == "boolean") {
				channelMutes[payload.channel] = payload.muted;
			}
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
	var channelMutes = [false, false, false, false];
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
	}

	var _c;

	function resetChip() {
		_c = {
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
	}
	resetChip();

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

			if(!channelMutes[i])
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
}

var musicData = `
songline 00 00 00 00 00 81 00 00 00
songline 01 00 00 00 00 80 00 67 00
songline 02 00 00 00 00 82 00 68 00
songline 03 01 00 00 00 00 00 00 00
songline 04 01 00 00 00 00 00 00 00
songline 05 01 00 10 00 03 00 00 00
songline 06 01 00 10 00 00 00 00 00
songline 07 01 00 10 00 00 00 30 00
songline 08 01 00 10 00 00 00 31 00
songline 09 01 00 10 00 00 00 32 00
songline 0a 08 00 10 00 00 00 30 00
songline 0b 01 00 10 00 00 00 30 00
songline 0c 01 00 10 00 00 00 31 00
songline 0d 01 00 10 00 00 00 32 00
songline 0e 01 00 10 00 04 00 30 00
songline 0f 01 00 10 00 20 00 30 00
songline 10 01 00 10 00 21 00 31 00
songline 11 01 00 10 00 22 00 32 00
songline 12 01 00 10 00 23 00 30 00
songline 13 01 00 10 00 24 00 30 00
songline 14 01 00 10 00 25 00 31 00
songline 15 01 00 10 00 28 00 34 00
songline 16 08 00 10 00 23 00 30 00
songline 17 02 00 60 00 40 00 50 00
songline 18 02 00 61 00 41 00 51 00
songline 19 02 00 62 00 42 00 52 00
songline 1a 02 00 63 00 43 00 53 00
songline 1b 02 00 62 ff 44 00 54 00
songline 1c 02 00 64 00 45 00 55 00
songline 1d 02 00 66 00 46 00 56 00
songline 1e 08 00 65 00 03 00 04 00
songline 1f 01 00 10 00 70 00 30 00
songline 20 01 00 10 00 71 00 31 00
songline 21 01 00 10 00 72 00 32 00
songline 22 01 00 10 00 73 00 30 00
songline 23 01 00 10 00 74 00 30 00
songline 24 01 00 10 00 75 00 31 00
songline 25 01 00 10 00 72 00 34 00
songline 26 08 00 10 00 73 00 30 00
songline 27 01 00 70 03 24 03 30 03
songline 28 01 00 71 03 25 03 31 03
songline 29 02 00 72 03 22 03 32 03
songline 2a 01 00 73 03 23 03 30 03
songline 2b 01 00 10 03 26 03 30 03
songline 2c 01 00 10 03 26 03 31 03
songline 2d 02 00 10 03 27 03 32 03
songline 2e 08 00 10 03 27 03 30 03
songline 2f 06 00 91 03 92 03 30 03
songline 30 06 00 91 03 92 03 31 03
songline 31 06 00 91 03 92 03 32 03
songline 32 06 00 91 03 92 03 30 03
songline 33 06 00 91 03 92 03 30 03
songline 34 06 00 91 03 92 03 31 03
songline 35 04 00 67 03 92 03 34 03
songline 36 09 00 68 03 05 00 33 03
trackline 01 00 0d 01 00 00 00 00
trackline 01 06 0d 01 00 00 00 00
trackline 01 08 19 02 00 00 00 00
trackline 01 0a 0d 01 00 00 00 00
trackline 01 0e 0d 01 76 80 00 00
trackline 01 0f 00 00 76 80 00 00
trackline 01 10 0d 01 00 00 00 00
trackline 01 12 0d 01 00 00 00 00
trackline 01 14 0d 01 00 00 00 00
trackline 01 16 19 02 00 00 00 00
trackline 01 1a 0d 01 00 00 00 00
trackline 01 1c 0d 01 00 00 00 00
trackline 01 1f 00 00 76 00 00 00
trackline 02 00 0d 01 00 00 00 00
trackline 02 02 0d 01 00 00 00 00
trackline 02 08 19 02 00 00 00 00
trackline 02 0e 0d 01 00 00 00 00
trackline 02 14 0d 01 00 00 00 00
trackline 02 18 19 02 00 00 00 00
trackline 03 00 00 00 66 ff 00 00
trackline 04 03 00 00 69 00 00 00
trackline 04 04 31 01 00 00 00 00
trackline 04 05 31 01 00 00 00 00
trackline 04 06 31 01 00 00 00 00
trackline 04 07 31 01 00 00 00 00
trackline 04 08 31 01 00 00 00 00
trackline 04 0a 31 01 00 00 00 00
trackline 04 0e 31 01 00 00 00 00
trackline 04 10 2c 01 00 00 00 00
trackline 04 12 2c 01 00 00 00 00
trackline 04 16 2c 01 00 00 00 00
trackline 04 18 25 01 00 00 00 00
trackline 04 1a 25 01 00 00 00 00
trackline 04 1c 20 01 00 00 00 00
trackline 04 1e 20 01 00 00 00 00
trackline 05 00 25 07 00 00 00 00
trackline 06 00 19 02 00 00 00 00
trackline 06 01 00 00 76 50 00 00
trackline 06 02 0d 01 00 00 00 00
trackline 06 03 0d 01 00 00 00 00
trackline 06 04 0d 01 00 00 00 00
trackline 06 06 0d 01 00 00 00 00
trackline 06 08 19 02 00 00 00 00
trackline 06 09 00 00 76 00 00 00
trackline 06 0a 19 02 76 50 00 00
trackline 06 0b 00 00 76 00 00 00
trackline 06 0c 0d 01 00 00 00 00
trackline 06 0e 0d 01 00 00 00 00
trackline 06 10 19 02 00 00 00 00
trackline 06 11 00 00 76 50 00 00
trackline 06 12 0d 01 00 00 00 00
trackline 06 14 0d 01 00 00 00 00
trackline 06 16 0d 01 00 00 00 00
trackline 06 18 19 02 00 00 00 00
trackline 06 19 00 00 76 50 00 00
trackline 06 1a 0d 01 00 00 00 00
trackline 06 1c 0d 01 00 00 00 00
trackline 06 1d 0d 01 00 00 00 00
trackline 06 1e 0d 01 00 00 00 00
trackline 06 1f 0d 01 00 00 00 00
trackline 07 00 0d 01 00 00 00 00
trackline 07 03 00 00 69 00 00 00
trackline 07 04 31 01 00 00 00 00
trackline 07 05 31 01 00 00 00 00
trackline 07 06 31 01 00 00 00 00
trackline 07 07 31 01 00 00 00 00
trackline 07 08 31 01 00 00 00 00
trackline 07 0a 31 01 00 00 00 00
trackline 07 0e 31 01 00 00 00 00
trackline 07 10 2c 01 00 00 00 00
trackline 07 12 2c 01 00 00 00 00
trackline 07 16 2c 01 00 00 00 00
trackline 07 18 25 01 00 00 00 00
trackline 07 1a 25 01 00 00 00 00
trackline 07 1c 20 01 00 00 00 00
trackline 07 1e 20 01 00 00 00 00
trackline 08 00 0d 01 00 00 00 00
trackline 08 06 0d 01 00 00 00 00
trackline 08 08 19 02 00 00 00 00
trackline 08 09 00 00 76 00 00 00
trackline 08 0a 0d 01 00 00 00 00
trackline 08 0e 0d 01 76 80 00 00
trackline 08 0f 0d 01 00 80 00 00
trackline 08 10 19 02 00 00 00 00
trackline 08 11 00 00 76 00 00 00
trackline 08 12 0d 01 00 00 00 00
trackline 08 14 0d 01 00 00 00 00
trackline 08 16 0d 01 00 00 00 00
trackline 08 18 19 02 00 00 00 00
trackline 08 1a 0d 01 00 00 00 00
trackline 08 1c 19 02 00 00 00 00
trackline 08 1d 00 00 76 00 00 00
trackline 08 1e 19 02 00 00 00 00
trackline 08 1f 00 00 76 00 00 00
trackline 09 00 0d 01 00 00 00 00
trackline 10 00 34 04 69 00 00 00
trackline 10 02 25 04 00 00 00 00
trackline 10 04 34 04 00 00 00 00
trackline 10 06 33 04 00 00 00 00
trackline 10 08 25 04 00 00 00 00
trackline 10 0a 31 04 00 00 00 00
trackline 10 0c 36 04 00 00 00 00
trackline 10 0e 33 04 00 00 00 00
trackline 10 10 34 04 00 00 00 00
trackline 10 12 25 04 00 00 00 00
trackline 10 14 34 04 00 00 00 00
trackline 10 16 33 04 00 00 00 00
trackline 10 18 25 04 00 00 00 00
trackline 10 1a 31 04 00 00 00 00
trackline 10 1c 33 04 00 00 00 00
trackline 10 1e 2f 04 00 00 00 00
trackline 20 00 38 03 69 00 00 00
trackline 20 03 00 00 76 c0 00 00
trackline 20 08 31 03 00 00 00 00
trackline 20 0b 00 00 76 c0 00 00
trackline 20 10 38 03 00 00 00 00
trackline 20 11 00 00 76 40 00 00
trackline 20 12 00 00 76 00 00 00
trackline 20 14 38 03 00 00 00 00
trackline 20 15 00 00 76 00 00 00
trackline 20 16 39 03 00 00 00 00
trackline 20 19 00 00 76 00 00 00
trackline 20 1a 36 03 00 00 00 00
trackline 20 1b 00 00 76 00 00 00
trackline 20 1c 3d 03 00 00 00 00
trackline 20 1e 37 03 00 00 00 00
trackline 21 00 38 03 00 00 00 00
trackline 21 03 00 00 76 c0 00 00
trackline 21 08 31 03 00 00 00 00
trackline 21 0b 00 00 76 c0 00 00
trackline 21 10 38 03 00 00 00 00
trackline 21 12 36 03 00 00 00 00
trackline 21 14 34 03 00 00 00 00
trackline 21 15 00 00 76 00 00 00
trackline 21 16 31 03 00 00 00 00
trackline 21 19 00 00 76 00 00 00
trackline 21 1a 34 03 00 00 00 00
trackline 21 1b 00 00 76 00 00 00
trackline 21 1c 38 03 00 00 00 00
trackline 21 1d 39 03 00 00 00 00
trackline 21 1e 3b 03 00 00 00 00
trackline 21 1f 3d 03 00 00 00 00
trackline 22 00 40 03 00 00 00 00
trackline 22 04 40 03 00 00 00 00
trackline 22 06 3d 03 00 00 00 00
trackline 22 0a 39 03 00 00 00 00
trackline 22 0c 42 03 00 00 00 00
trackline 22 0e 40 03 00 00 00 00
trackline 22 10 3f 03 00 00 00 00
trackline 22 12 40 03 00 00 00 00
trackline 22 14 42 03 00 00 00 00
trackline 22 16 3b 03 00 00 00 00
trackline 22 1a 38 03 00 00 00 00
trackline 22 1c 33 03 00 00 00 00
trackline 22 1e 36 03 00 00 00 00
trackline 23 00 40 03 00 00 00 00
trackline 23 02 3f 03 00 00 00 00
trackline 23 04 00 00 76 00 00 00
trackline 23 06 3d 03 00 00 00 00
trackline 23 14 00 00 66 fe 00 00
trackline 24 00 31 03 00 00 00 00
trackline 24 01 00 00 76 00 00 00
trackline 24 02 33 03 00 00 00 00
trackline 24 03 00 00 76 c0 00 00
trackline 24 06 34 03 00 00 00 00
trackline 24 08 00 00 76 00 00 00
trackline 24 0a 31 03 00 00 00 00
trackline 24 0b 00 00 76 c0 00 00
trackline 24 0c 36 03 00 00 00 00
trackline 24 0d 00 00 76 00 00 00
trackline 24 0e 31 03 00 00 00 00
trackline 24 0f 00 00 76 00 00 00
trackline 24 10 38 03 00 00 00 00
trackline 24 11 36 03 00 40 00 00
trackline 24 12 34 03 00 00 00 00
trackline 24 14 38 03 00 00 00 00
trackline 24 15 00 00 76 00 00 00
trackline 24 16 36 03 00 00 00 00
trackline 24 18 34 03 00 00 00 00
trackline 24 19 00 00 76 00 00 00
trackline 24 1a 33 03 00 00 00 00
trackline 24 1b 00 00 76 00 00 00
trackline 24 1c 31 03 00 00 00 00
trackline 25 00 2c 03 00 00 00 00
trackline 25 01 00 00 69 ff 00 00
trackline 25 02 25 03 00 00 00 00
trackline 25 04 31 03 00 00 00 00
trackline 25 06 25 03 00 00 00 00
trackline 25 08 2c 03 00 00 00 00
trackline 25 0a 25 03 00 00 00 00
trackline 25 0c 31 03 00 00 00 00
trackline 25 0d 00 00 69 00 00 00
trackline 25 0e 25 03 00 00 00 00
trackline 25 10 34 03 00 00 00 00
trackline 25 11 33 03 00 00 00 00
trackline 25 12 31 03 00 00 00 00
trackline 25 13 2c 03 00 00 00 00
trackline 25 14 2a 03 00 00 00 00
trackline 25 15 28 03 00 00 00 00
trackline 25 16 25 03 00 00 00 00
trackline 25 17 20 03 00 00 00 00
trackline 25 18 1c 03 00 00 00 00
trackline 25 19 1e 03 00 00 00 00
trackline 25 1a 1f 03 00 00 00 00
trackline 25 1b 20 03 00 00 00 00
trackline 25 1c 25 03 00 00 00 00
trackline 25 1d 2d 03 00 00 00 00
trackline 25 1e 31 03 00 00 00 00
trackline 25 1f 38 03 00 00 00 00
trackline 26 00 25 03 00 00 00 00
trackline 26 01 00 00 69 ff 00 00
trackline 26 02 19 03 00 00 00 00
trackline 26 04 19 03 00 00 00 00
trackline 26 06 28 03 00 00 00 00
trackline 26 08 19 03 00 00 00 00
trackline 26 0a 25 03 00 00 00 00
trackline 26 0c 2c 03 00 00 00 00
trackline 26 0e 23 03 00 00 00 00
trackline 26 10 25 03 00 00 00 00
trackline 26 12 19 03 00 00 00 00
trackline 26 14 19 03 00 00 00 00
trackline 26 16 28 03 00 00 00 00
trackline 26 18 2f 03 00 00 00 00
trackline 26 1a 2c 03 00 00 00 00
trackline 26 1b 00 00 69 00 00 00
trackline 26 1c 25 03 00 00 00 00
trackline 26 1d 27 03 00 00 00 00
trackline 26 1e 28 03 00 00 00 00
trackline 26 1f 2c 03 00 00 00 00
trackline 27 00 2c 03 00 00 00 00
trackline 27 01 00 00 69 ff 00 00
trackline 27 02 31 03 00 00 00 00
trackline 27 04 19 03 00 00 00 00
trackline 27 06 2c 03 00 00 00 00
trackline 27 08 25 03 00 00 00 00
trackline 27 0a 19 03 00 00 00 00
trackline 27 0c 2c 03 00 00 00 00
trackline 27 0d 00 00 76 00 00 00
trackline 27 0e 31 03 69 00 00 00
trackline 27 0f 00 00 76 00 00 00
trackline 27 10 19 03 00 00 00 00
trackline 27 11 00 00 69 ff 00 00
trackline 27 12 2c 03 00 00 00 00
trackline 27 14 25 03 00 00 00 00
trackline 27 16 19 03 00 00 00 00
trackline 27 18 25 03 00 00 00 00
trackline 27 1a 19 03 00 00 00 00
trackline 27 1b 00 00 69 00 00 00
trackline 27 1c 2c 03 00 00 00 00
trackline 27 1d 00 00 76 00 00 00
trackline 27 1e 2f 03 00 00 00 00
trackline 27 1f 00 00 76 00 00 00
trackline 28 00 34 03 00 00 00 00
trackline 28 01 00 00 76 00 00 00
trackline 28 02 36 03 00 00 00 00
trackline 28 06 38 03 00 00 00 00
trackline 28 07 00 00 76 80 00 00
trackline 28 0a 34 03 00 00 00 00
trackline 28 0c 3b 03 00 00 00 00
trackline 28 0d 39 03 00 00 00 00
trackline 28 0e 38 03 00 00 00 00
trackline 28 10 3b 03 00 00 00 00
trackline 28 12 3d 03 00 00 00 00
trackline 28 14 3f 03 00 00 00 00
trackline 28 15 00 00 76 00 00 00
trackline 28 16 42 03 00 00 00 00
trackline 28 1a 38 03 00 00 00 00
trackline 28 1c 33 03 00 00 00 00
trackline 28 1e 36 03 00 00 00 00
trackline 30 00 0d 05 00 00 00 00
trackline 30 02 01 05 00 00 00 00
trackline 30 09 00 00 76 00 00 00
trackline 30 0c 06 05 00 00 00 00
trackline 30 0d 08 05 00 00 00 00
trackline 30 0e 0b 05 00 00 00 00
trackline 30 10 0d 05 00 00 00 00
trackline 30 12 01 05 00 00 00 00
trackline 30 14 01 05 00 00 00 00
trackline 30 19 00 00 76 00 00 00
trackline 31 04 0d 05 00 00 00 00
trackline 31 07 00 00 76 80 00 00
trackline 31 0a 0d 05 00 00 00 00
trackline 31 0c 00 00 76 00 00 00
trackline 31 0e 0d 05 00 00 00 00
trackline 31 10 01 05 00 00 00 00
trackline 32 00 09 05 00 00 00 00
trackline 32 06 15 05 00 00 00 00
trackline 32 08 00 00 76 00 00 00
trackline 32 0a 10 05 00 00 00 00
trackline 32 0c 09 05 00 00 00 00
trackline 32 0e 06 05 00 00 00 00
trackline 32 10 0b 05 00 00 00 00
trackline 32 12 0b 05 00 00 00 00
trackline 32 15 00 00 76 00 00 00
trackline 32 16 08 05 00 00 00 00
trackline 32 17 00 00 76 c0 00 00
trackline 32 1a 03 05 00 00 00 00
trackline 32 1b 00 00 76 c0 00 00
trackline 32 1e 08 05 00 00 00 00
trackline 33 00 01 05 00 00 00 00
trackline 34 00 09 05 00 00 00 00
trackline 34 06 15 05 00 00 00 00
trackline 34 08 00 00 76 00 00 00
trackline 34 0a 10 05 00 00 00 00
trackline 34 0c 09 05 00 00 00 00
trackline 34 0e 06 05 00 00 00 00
trackline 34 10 08 05 00 00 00 00
trackline 34 12 08 05 00 00 00 00
trackline 34 15 00 00 76 00 00 00
trackline 34 16 08 05 00 00 00 00
trackline 34 17 00 00 76 c0 00 00
trackline 34 1a 03 05 00 00 00 00
trackline 34 1b 00 00 76 c0 00 00
trackline 34 1e 08 05 00 00 00 00
trackline 40 00 28 06 00 00 00 00
trackline 40 0c 23 06 00 00 00 00
trackline 40 0e 00 00 76 00 00 00
trackline 40 10 2b 06 00 00 00 00
trackline 40 15 00 00 76 00 00 00
trackline 40 16 2a 06 00 00 00 00
trackline 40 1b 00 00 76 00 00 00
trackline 40 1c 28 06 00 00 00 00
trackline 40 1f 00 00 76 00 00 00
trackline 41 00 27 06 00 34 00 00
trackline 41 05 00 00 76 00 00 00
trackline 41 06 28 06 00 00 00 00
trackline 41 07 00 00 76 00 00 00
trackline 41 08 2a 06 00 00 00 00
trackline 41 12 00 00 66 fd 00 00
trackline 42 00 24 06 00 00 00 00
trackline 42 0c 26 06 00 00 00 00
trackline 42 10 28 06 00 00 00 00
trackline 42 18 24 06 00 00 00 00
trackline 42 1b 00 00 6c f8 00 00
trackline 43 00 23 06 00 00 00 00
trackline 43 08 00 00 66 ff 00 00
trackline 44 00 27 06 00 00 00 00
trackline 44 04 27 06 00 00 00 00
trackline 44 06 28 06 00 00 00 00
trackline 44 0a 28 06 00 00 00 00
trackline 44 0c 2a 06 00 00 00 00
trackline 44 10 00 00 66 f8 00 00
trackline 44 14 2d 06 00 00 00 00
trackline 44 18 2d 06 00 00 00 00
trackline 44 1a 2a 06 00 00 00 00
trackline 44 1b 00 00 76 00 00 00
trackline 44 1c 24 06 00 00 00 00
trackline 44 1d 00 00 76 00 00 00
trackline 44 1e 23 06 00 00 00 00
trackline 44 1f 00 00 76 00 00 00
trackline 45 00 28 06 00 00 00 00
trackline 45 04 00 00 66 fc 00 00
trackline 45 08 2b 06 00 00 00 00
trackline 45 0c 00 00 66 fc 00 00
trackline 45 10 2a 06 00 00 00 00
trackline 45 14 00 00 66 fc 00 00
trackline 45 18 26 06 00 00 00 00
trackline 45 1a 00 00 6c 03 00 00
trackline 46 00 28 06 00 00 00 00
trackline 50 00 04 05 00 00 00 00
trackline 50 04 04 05 00 00 00 00
trackline 50 06 10 05 00 00 00 00
trackline 50 0a 0b 05 00 00 00 00
trackline 50 0c 0e 05 00 00 00 00
trackline 50 0e 0f 05 00 00 00 00
trackline 50 10 04 05 00 00 00 00
trackline 50 14 04 05 00 00 00 00
trackline 50 16 10 05 00 00 00 00
trackline 50 1a 0b 05 00 00 00 00
trackline 50 1c 10 05 00 00 00 00
trackline 50 1d 10 05 00 00 00 00
trackline 50 1e 0b 05 00 00 00 00
trackline 50 1f 04 05 00 00 00 00
trackline 51 00 0b 05 00 00 00 00
trackline 51 04 0b 05 00 00 00 00
trackline 51 06 17 05 00 00 00 00
trackline 51 0a 06 05 00 00 00 00
trackline 51 0c 09 05 00 00 00 00
trackline 51 0e 0a 05 00 00 00 00
trackline 51 10 0b 05 00 00 00 00
trackline 51 14 0d 05 00 00 00 00
trackline 51 18 0e 05 00 00 00 00
trackline 51 1c 0f 05 00 00 00 00
trackline 51 1d 00 00 6c e0 00 00
trackline 52 00 0c 05 00 00 00 00
trackline 52 02 0c 05 00 00 00 00
trackline 52 04 00 00 76 00 00 00
trackline 52 06 07 05 00 00 00 00
trackline 52 08 0a 05 00 00 00 00
trackline 52 0a 0c 05 00 00 00 00
trackline 52 0c 00 00 76 00 00 00
trackline 52 0e 0a 05 00 00 00 00
trackline 52 10 0c 05 00 00 00 00
trackline 52 12 0c 05 00 00 00 00
trackline 52 14 00 00 76 00 00 00
trackline 52 16 07 05 00 00 00 00
trackline 52 18 0f 05 00 00 00 00
trackline 52 1a 0e 05 00 00 00 00
trackline 52 1c 0c 05 00 00 00 00
trackline 52 1e 05 05 00 00 00 00
trackline 53 00 07 05 00 00 00 00
trackline 53 02 07 05 00 00 00 00
trackline 53 06 13 05 00 00 00 00
trackline 53 0a 10 05 00 00 00 00
trackline 53 0c 0e 05 00 00 00 00
trackline 53 0e 0b 05 00 00 00 00
trackline 53 10 09 05 00 00 00 00
trackline 53 11 07 05 00 00 00 00
trackline 53 12 17 05 00 00 00 00
trackline 53 13 15 05 00 00 00 00
trackline 53 14 13 05 00 00 00 00
trackline 53 15 10 05 00 00 00 00
trackline 53 16 0e 05 00 00 00 00
trackline 53 17 09 05 00 00 00 00
trackline 53 18 07 05 00 00 00 00
trackline 53 1c 09 05 00 00 00 00
trackline 54 00 0b 05 00 00 00 00
trackline 55 00 0c 05 00 00 00 00
trackline 55 0c 0c 05 00 00 00 00
trackline 55 10 0e 05 00 00 00 00
trackline 55 1c 0e 05 00 00 00 00
trackline 56 00 10 05 00 00 00 00
trackline 56 06 10 05 00 00 00 00
trackline 56 08 00 00 76 00 00 00
trackline 56 0c 04 05 00 00 00 00
trackline 60 00 25 07 00 00 00 00
trackline 60 0a 28 08 00 00 00 00
trackline 60 0e 28 08 00 00 00 00
trackline 60 0f 00 00 76 00 00 00
trackline 60 10 28 08 00 00 00 00
trackline 60 16 34 08 00 00 00 00
trackline 60 17 00 00 76 80 00 00
trackline 60 1a 34 08 00 00 00 00
trackline 60 1b 00 00 76 00 00 00
trackline 60 1c 28 08 00 00 00 00
trackline 61 00 23 09 00 00 00 00
trackline 61 05 00 00 76 00 00 00
trackline 61 06 2f 09 00 00 00 00
trackline 61 07 00 00 76 80 00 00
trackline 61 0a 23 09 00 00 00 00
trackline 61 0e 23 09 00 00 00 00
trackline 61 0f 00 00 76 00 00 00
trackline 61 10 2f 09 00 00 00 00
trackline 61 14 23 09 00 00 00 00
trackline 61 18 23 09 00 00 00 00
trackline 61 1a 2f 09 00 00 00 00
trackline 61 1c 23 09 00 00 00 00
trackline 62 00 24 09 00 00 00 00
trackline 62 05 00 00 76 00 00 00
trackline 62 06 30 09 00 00 00 00
trackline 62 07 00 00 76 80 00 00
trackline 62 0a 24 09 00 00 00 00
trackline 62 0e 24 09 00 00 00 00
trackline 62 0f 00 00 76 00 00 00
trackline 62 10 24 09 00 00 00 00
trackline 62 16 30 09 00 00 00 00
trackline 62 17 00 00 76 80 00 00
trackline 62 1a 30 09 00 00 00 00
trackline 62 1b 00 00 76 00 00 00
trackline 62 1c 24 09 00 00 00 00
trackline 63 00 2b 09 00 00 00 00
trackline 63 01 00 00 76 00 00 00
trackline 63 02 1f 09 00 00 00 00
trackline 63 05 00 00 76 00 00 00
trackline 63 06 2b 09 00 00 00 00
trackline 63 07 00 00 76 00 00 00
trackline 63 08 2b 09 00 00 00 00
trackline 63 09 00 00 76 00 00 00
trackline 63 0a 1f 09 00 00 00 00
trackline 63 0d 00 00 76 00 00 00
trackline 63 0e 2b 09 00 00 00 00
trackline 63 0f 00 00 76 00 00 00
trackline 63 10 2b 09 00 00 00 00
trackline 63 11 00 00 76 00 00 00
trackline 63 12 1f 09 00 00 00 00
trackline 63 15 00 00 76 00 00 00
trackline 63 16 1f 09 00 00 00 00
trackline 63 1a 2b 09 00 00 00 00
trackline 63 1b 00 00 76 80 00 00
trackline 63 1e 1f 09 00 00 00 00
trackline 63 1f 00 00 76 00 00 00
trackline 64 00 24 09 00 00 00 00
trackline 64 04 24 09 00 00 00 00
trackline 64 05 00 00 76 00 00 00
trackline 64 06 30 09 00 00 00 00
trackline 64 08 00 00 76 00 00 00
trackline 64 0a 30 09 00 00 00 00
trackline 64 0b 00 00 76 00 00 00
trackline 64 0c 24 09 00 00 00 00
trackline 64 10 26 09 00 00 00 00
trackline 64 12 00 00 76 00 00 00
trackline 64 14 26 09 00 00 00 00
trackline 64 15 00 00 76 00 00 00
trackline 64 16 32 09 00 00 00 00
trackline 64 19 00 00 76 00 00 00
trackline 64 1a 32 09 00 00 00 00
trackline 64 1b 00 00 76 00 00 00
trackline 64 1c 26 09 00 00 00 00
trackline 64 1d 00 00 76 00 00 00
trackline 64 1e 32 09 00 00 00 00
trackline 64 1f 00 00 76 00 00 00
trackline 65 00 34 09 00 00 00 00
trackline 65 02 34 09 00 00 00 00
trackline 65 03 34 09 00 00 00 00
trackline 65 04 34 09 00 00 00 00
trackline 65 05 00 00 76 00 00 00
trackline 65 06 28 09 00 00 00 00
trackline 65 08 00 00 76 00 00 00
trackline 65 0a 28 09 00 00 00 00
trackline 65 0b 00 00 76 00 00 00
trackline 65 0c 28 09 00 00 00 00
trackline 65 0e 34 09 00 00 00 00
trackline 65 10 28 09 00 00 00 00
trackline 66 00 34 0a 00 00 00 00
trackline 66 02 34 0a 00 00 00 00
trackline 66 03 28 0a 00 00 00 00
trackline 66 04 34 0a 00 00 00 00
trackline 66 05 00 00 76 00 00 00
trackline 66 06 28 0a 00 00 00 00
trackline 66 08 00 00 76 00 00 00
trackline 66 0a 28 0a 00 00 00 00
trackline 66 0b 00 00 76 00 00 00
trackline 66 0c 28 0a 00 00 00 00
trackline 66 10 34 0a 00 00 00 00
trackline 66 12 34 0a 00 00 00 00
trackline 66 13 34 0a 00 00 00 00
trackline 66 14 34 0a 00 00 00 00
trackline 66 15 00 00 76 00 00 00
trackline 66 16 28 0a 00 00 00 00
trackline 66 18 00 00 76 00 00 00
trackline 66 1a 28 0a 00 00 00 00
trackline 66 1b 00 00 76 00 00 00
trackline 66 1c 28 0a 00 00 00 00
trackline 66 1e 34 0a 00 00 00 00
trackline 67 00 21 09 00 00 00 00
trackline 67 10 23 09 00 00 00 00
trackline 68 00 25 08 00 00 00 00
trackline 70 00 25 07 00 ff 00 00
trackline 70 08 2c 0b 00 00 00 00
trackline 70 0a 25 0b 00 00 00 00
trackline 70 0e 2c 0b 00 00 00 00
trackline 70 10 31 0b 00 00 00 00
trackline 70 12 2c 0b 00 00 00 00
trackline 70 14 25 0b 00 00 00 00
trackline 70 16 34 0b 00 00 00 00
trackline 70 17 00 00 66 00 00 00
trackline 70 18 33 0b 00 00 00 00
trackline 70 1a 2c 0b 00 00 00 00
trackline 70 1c 25 0b 00 00 00 00
trackline 70 1e 36 0b 00 00 00 00
trackline 71 00 38 0b 00 00 00 00
trackline 71 18 31 0b 00 00 00 00
trackline 71 1a 34 0b 00 00 00 00
trackline 71 1b 36 0b 00 00 00 00
trackline 71 1c 37 0b 00 00 00 00
trackline 71 1d 38 0b 00 00 00 00
trackline 71 1e 3b 0b 00 00 00 00
trackline 71 1f 3d 0b 00 00 00 00
trackline 72 00 40 0b 00 00 00 00
trackline 72 08 3d 0b 00 00 00 00
trackline 72 0c 40 0b 00 00 00 00
trackline 72 10 3f 0b 00 00 00 00
trackline 72 11 00 00 76 00 00 00
trackline 72 12 3b 0b 00 00 00 00
trackline 72 14 00 00 76 00 00 00
trackline 72 16 38 0b 00 00 00 00
trackline 72 1a 38 0b 00 00 00 00
trackline 72 1b 00 00 76 00 00 00
trackline 72 1c 3f 0b 00 00 00 00
trackline 72 1e 3b 0b 00 00 00 00
trackline 73 00 40 0b 00 00 00 00
trackline 73 01 3f 0b 00 00 00 00
trackline 73 02 3d 0b 00 00 00 00
trackline 73 03 38 0b 00 00 00 00
trackline 73 04 34 0b 00 00 00 00
trackline 73 05 33 0b 00 00 00 00
trackline 73 06 36 0b 00 00 00 00
trackline 73 07 33 0b 00 00 00 00
trackline 73 08 34 0b 00 00 00 00
trackline 73 09 33 0b 00 00 00 00
trackline 73 0a 31 0b 00 00 00 00
trackline 73 0b 2c 0b 00 00 00 00
trackline 73 0c 2f 0b 00 00 00 00
trackline 73 0d 2a 0b 00 00 00 00
trackline 73 0e 33 0b 00 00 00 00
trackline 73 0f 2f 0b 00 00 00 00
trackline 73 10 31 0b 00 00 00 00
trackline 73 11 00 00 76 00 00 00
trackline 73 12 31 0b 00 00 00 00
trackline 73 13 00 00 76 00 00 00
trackline 73 14 31 0b 00 00 00 00
trackline 73 15 00 00 76 00 00 00
trackline 73 16 31 0b 00 00 00 00
trackline 73 19 00 00 76 00 00 00
trackline 73 1a 31 0b 00 00 00 00
trackline 73 1b 00 00 76 00 00 00
trackline 73 1c 3d 0b 00 00 00 00
trackline 73 1d 00 00 76 00 00 00
trackline 73 1e 31 0b 00 00 00 00
trackline 73 1f 00 00 76 00 00 00
trackline 74 00 40 0b 00 00 00 00
trackline 74 02 31 0b 00 00 00 00
trackline 74 04 31 0b 00 00 00 00
trackline 74 06 3d 0b 00 00 00 00
trackline 74 08 31 0b 00 00 00 00
trackline 74 0a 3d 0b 00 00 00 00
trackline 74 0c 42 0b 00 00 00 00
trackline 74 0d 40 0b 00 00 00 00
trackline 74 0e 3f 0b 00 00 00 00
trackline 74 10 40 0b 00 00 00 00
trackline 74 12 31 0b 00 00 00 00
trackline 74 14 31 0b 00 00 00 00
trackline 74 16 3d 0b 00 00 00 00
trackline 74 18 31 0b 00 00 00 00
trackline 74 1a 3d 0b 00 00 00 00
trackline 74 1c 42 0b 00 00 00 00
trackline 74 1d 40 0b 00 00 00 00
trackline 74 1e 3f 0b 00 00 00 00
trackline 75 00 3f 0b 00 00 00 00
trackline 75 02 40 0b 00 00 00 00
trackline 75 03 00 00 76 00 00 00
trackline 75 04 44 0b 00 00 00 00
trackline 75 05 00 00 76 00 00 00
trackline 75 06 3d 0b 00 00 00 00
trackline 75 07 44 0d 00 10 00 00
trackline 75 08 42 0b 00 00 00 00
trackline 75 09 3d 0d 00 10 00 00
trackline 75 0a 31 0b 00 00 00 00
trackline 75 0b 42 0d 00 00 00 00
trackline 75 0c 40 0b 00 00 00 00
trackline 75 0d 31 0d 00 00 00 00
trackline 75 0e 38 0b 00 00 00 00
trackline 75 0f 40 0d 00 00 00 00
trackline 75 10 3f 0b 00 00 00 00
trackline 75 11 3d 0d 00 00 00 00
trackline 75 12 31 0b 00 00 00 00
trackline 75 13 3f 0d 00 00 00 00
trackline 75 14 3b 0b 00 00 00 00
trackline 75 15 31 0d 00 00 00 00
trackline 75 16 38 0b 00 00 00 00
trackline 75 17 3b 0d 00 00 00 00
trackline 75 18 38 0b 00 00 00 00
trackline 75 19 38 0d 00 00 00 00
trackline 75 1a 31 0b 00 00 00 00
trackline 75 1b 44 0d 00 00 00 00
trackline 75 1c 3b 0b 00 00 00 00
trackline 75 1d 31 0d 00 00 00 00
trackline 75 1e 3d 0b 00 00 00 00
trackline 75 1f 3f 0b 00 00 00 00
trackline 80 00 34 03 00 00 00 00
trackline 80 08 31 03 00 00 00 00
trackline 80 0c 34 03 00 00 00 00
trackline 80 10 33 03 00 00 00 00
trackline 80 18 31 03 00 00 00 00
trackline 80 1c 2f 03 00 00 00 00
trackline 81 1d 2f 03 00 00 00 00
trackline 81 1e 31 03 00 00 00 00
trackline 81 1f 33 03 00 00 00 00
trackline 82 00 2f 03 6c 10 00 00
trackline 82 04 31 03 00 00 00 00
trackline 83 00 01 0b 00 00 00 00
trackline 90 00 21 09 69 00 00 00
trackline 90 04 21 09 00 00 00 00
trackline 90 05 00 00 76 00 00 00
trackline 90 06 2d 09 00 00 00 00
trackline 90 0a 2d 09 00 00 00 00
trackline 90 0b 00 00 76 00 00 00
trackline 90 0c 21 09 00 00 00 00
trackline 90 10 23 09 00 00 00 00
trackline 90 12 00 00 76 80 00 00
trackline 90 14 23 09 00 00 00 00
trackline 90 16 00 00 76 80 00 00
trackline 90 18 20 08 00 00 00 00
trackline 90 1a 00 00 76 80 00 00
trackline 90 1c 20 08 00 00 00 00
trackline 90 1e 00 00 76 80 00 00
trackline 91 00 25 08 00 00 00 00
trackline 91 01 00 00 76 00 00 00
trackline 91 02 25 08 00 00 00 00
trackline 91 05 00 00 76 00 00 00
trackline 91 06 31 08 00 00 00 00
trackline 91 07 31 08 00 00 00 00
trackline 91 08 25 08 00 00 00 00
trackline 91 09 00 00 76 00 00 00
trackline 91 0a 25 08 00 00 00 00
trackline 91 0b 00 00 76 00 00 00
trackline 91 0e 25 08 00 00 00 00
trackline 91 0f 00 00 76 00 00 00
trackline 91 10 25 0a 00 00 00 00
trackline 91 11 00 00 76 00 00 00
trackline 91 14 25 0a 00 00 00 00
trackline 91 15 00 00 76 00 00 00
trackline 91 16 25 08 00 00 00 00
trackline 91 17 00 00 76 00 00 00
trackline 91 1a 25 08 00 00 00 00
trackline 91 1b 00 00 76 00 00 00
trackline 91 1c 25 08 00 00 00 00
trackline 91 1d 00 00 76 00 00 00
trackline 91 1e 25 08 00 00 00 00
trackline 91 1f 00 00 76 00 00 00
trackline 92 00 19 03 69 70 00 00
trackline 92 01 00 00 76 00 00 00
trackline 92 02 25 03 00 00 00 00
trackline 92 03 00 00 76 00 00 00
trackline 92 04 25 03 00 00 00 00
trackline 92 05 00 00 76 00 00 00
trackline 92 06 19 03 00 00 00 00
trackline 92 07 00 00 76 00 00 00
trackline 92 08 25 03 00 00 00 00
trackline 92 09 00 00 76 00 00 00
trackline 92 0a 19 03 00 00 00 00
trackline 92 0b 00 00 76 00 00 00
trackline 92 0c 25 03 00 00 00 00
trackline 92 0d 00 00 76 00 00 00
trackline 92 0e 25 03 00 00 00 00
trackline 92 0f 00 00 76 00 00 00
trackline 92 10 19 03 00 00 00 00
trackline 92 11 00 00 76 00 00 00
trackline 92 12 25 03 00 00 00 00
trackline 92 13 00 00 76 00 00 00
trackline 92 14 25 03 00 00 00 00
trackline 92 15 00 00 76 00 00 00
trackline 92 16 19 03 00 00 00 00
trackline 92 17 00 00 76 00 00 00
trackline 92 18 25 03 00 00 00 00
trackline 92 19 00 00 76 00 00 00
trackline 92 1a 19 03 69 00 00 00
trackline 92 1b 19 03 66 c0 00 00
trackline 92 1c 25 03 00 00 00 00
trackline 92 1d 00 00 76 00 00 00
trackline 92 1e 25 03 00 00 00 00
trackline 92 1f 00 00 76 00 00 00
instrumentline 01 00 77 03
instrumentline 01 01 76 ff
instrumentline 01 02 74 01
instrumentline 01 03 77 02
instrumentline 01 04 64 90
instrumentline 01 05 2b 31
instrumentline 01 06 6c a0
instrumentline 01 07 66 f0
instrumentline 02 00 76 ff
instrumentline 02 01 77 03
instrumentline 02 02 74 02
instrumentline 02 03 77 02
instrumentline 02 04 2b 31
instrumentline 02 05 64 70
instrumentline 02 06 6c d0
instrumentline 02 07 74 02
instrumentline 02 08 66 f8
instrumentline 02 09 6a 01
instrumentline 03 00 77 02
instrumentline 03 01 6d 05
instrumentline 03 02 2b 31
instrumentline 03 03 76 ff
instrumentline 03 04 66 f0
instrumentline 03 05 74 06
instrumentline 03 06 66 00
instrumentline 03 07 74 16
instrumentline 03 08 7e 25
instrumentline 04 00 77 03
instrumentline 04 01 76 ff
instrumentline 04 02 74 01
instrumentline 04 03 77 00
instrumentline 04 04 6d 05
instrumentline 04 05 2b 3d
instrumentline 04 06 66 f0
instrumentline 04 07 74 06
instrumentline 04 08 66 00
instrumentline 04 09 74 20
instrumentline 04 0a 66 f0
instrumentline 05 00 77 03
instrumentline 05 01 76 ff
instrumentline 05 02 74 01
instrumentline 05 03 77 02
instrumentline 05 04 64 50
instrumentline 05 05 6d 01
instrumentline 05 06 2b 31
instrumentline 05 07 74 05
instrumentline 05 08 66 fe
instrumentline 06 00 77 02
instrumentline 06 01 64 80
instrumentline 06 02 2b 3d
instrumentline 06 03 76 c0
instrumentline 06 04 66 08
instrumentline 06 05 74 02
instrumentline 06 06 66 f0
instrumentline 06 07 74 02
instrumentline 06 08 66 00
instrumentline 06 09 74 16
instrumentline 06 0a 7e 34
instrumentline 07 00 77 03
instrumentline 07 01 76 ff
instrumentline 07 02 66 fc
instrumentline 08 00 69 00
instrumentline 08 01 77 03
instrumentline 08 02 76 ff
instrumentline 08 03 74 01
instrumentline 08 04 77 02
instrumentline 08 05 6d 05
instrumentline 08 06 66 ff
instrumentline 08 07 2b 3d
instrumentline 08 08 74 03
instrumentline 08 09 2b 38
instrumentline 08 0a 74 03
instrumentline 08 0b 2b 34
instrumentline 08 0c 74 03
instrumentline 08 0d 2b 31
instrumentline 08 0e 74 03
instrumentline 08 0f 6a 07
instrumentline 09 00 69 00
instrumentline 09 01 77 03
instrumentline 09 02 76 ff
instrumentline 09 03 74 01
instrumentline 09 04 77 02
instrumentline 09 05 6d 05
instrumentline 09 06 66 ff
instrumentline 09 07 2b 3d
instrumentline 09 08 74 03
instrumentline 09 09 2b 38
instrumentline 09 0a 74 03
instrumentline 09 0b 2b 35
instrumentline 09 0c 74 03
instrumentline 09 0d 2b 31
instrumentline 09 0e 74 03
instrumentline 09 0f 6a 07
instrumentline 0a 00 69 00
instrumentline 0a 01 77 03
instrumentline 0a 02 76 ff
instrumentline 0a 03 74 01
instrumentline 0a 04 77 02
instrumentline 0a 05 6d 05
instrumentline 0a 06 66 ff
instrumentline 0a 07 2b 3d
instrumentline 0a 08 74 03
instrumentline 0a 09 2b 38
instrumentline 0a 0a 74 03
instrumentline 0a 0b 2b 36
instrumentline 0a 0c 74 03
instrumentline 0a 0d 2b 31
instrumentline 0a 0e 74 03
instrumentline 0a 0f 6a 07
instrumentline 0b 00 77 03
instrumentline 0b 01 76 ff
instrumentline 0b 02 74 01
instrumentline 0b 03 77 00
instrumentline 0b 04 6d 05
instrumentline 0b 05 2b 3d
instrumentline 0b 06 66 f0
instrumentline 0b 07 74 06
instrumentline 0b 08 66 00
instrumentline 0b 09 74 06
instrumentline 0b 0a 7e 25
instrumentline 0c 00 77 03
instrumentline 0c 01 76 ff
instrumentline 0c 02 66 f0
instrumentline 0d 00 76 c4
instrumentline 0d 01 77 00
instrumentline 0d 02 6d 05
instrumentline 0d 03 2b 3d
instrumentline 0d 04 66 f0
instrumentline 0d 05 74 06
instrumentline 0d 06 66 00
instrumentline 0d 07 74 06
instrumentline 0d 08 7e 25
`
