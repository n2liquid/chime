'use strict';
var tonal = window.tonal = {};
var noteNames = 'cdefgab'.split('');
tonal.noteFromMml = function(mmlNote) {
	var note;
	if(typeof(mmlNote) === 'number') {
		return mmlNote;
	}
	note = noteNames.indexOf(mmlNote.charAt(0)) + 1;
	if(note === 0) {
		return null;
	}
	switch(mmlNote.charAt(1)) {
		case '+':
			note += 0.5;
		case '-':
			note -= 0.5;
	}
	return note;
};
tonal.noteToMml = function(note) {
	var mml;
	if(typeof(note) === 'string') {
		return note;
	}
	mml = noteNames[parseInt(note)];
	if(note % 1 !== 0) {
		mml += '+';
	}
	return mml;
};
