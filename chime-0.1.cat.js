exports = {};
Log = {
  enabled: false,
  log: [ ],
  on: function() { Log.enabled = true; },
  off: function() { Log.enabled = false; },
  flush: function() { var d = Log.log.join('\n'); Log.log = []; return d; },
  getLog: function() { return Log; },
  /*
  info: function(m) { console.info(m); if (Log.enabled) Log.log.push(m); },
  warn: function(m) { console.warn(m); if (Log.enabled) Log.log.push(m); },
  error: function(m) { console.error(m); if (Log.enabled) Log.log.push(m); },
  fatal: function(m) { console.fatal(m); if (Log.enabled) Log.log.push(m); }
   */
  info: function(m) {},
  warn: function(m) {},
  error: function(m) { if (Log.enabled) Log.log.push(m); },
  fatal: function(m) { if (Log.enabled) Log.log.push(m); }
};
/**
 * T'SoundSystem for JavaScript (Web Audio API)
 */

/**
 * AudioPlayback prototype
 *
 * This prototype provides an audio output stream for real time sound
 * rendering.
 * @author Takashi Toyoshima <toyoshim@gmail.com>
 *
 * @constructor
 */
function AudioLooper (bufferSize) {
    this.bufferSize = 4096;  // 92msec
    if (bufferSize !== undefined)
        this.bufferSize = bufferSize;
    // Initialize variables.
    this.channel = null;
    this.initialized = true;
    this.firstAudioEvent = null;

    // Web Audio API on Chrome and Safari.
    if (!window.AudioContext && window['webkitAudioContext']) {
		window.AudioContext = window.webkitAudioContext;
	}
	if (window.AudioContext) {
        Log.getLog().info("use Web Audio API");
        this.audioContext = new AudioContext();
        if (this.audioContext == null) {
            Log.getLog().fatal("could not use AudioContext");
            this.initialized = false;
            return;
        }

        // Allocate JavaScript synthesis node.
        this.bufferSource = this.audioContext['createBufferSource']();
        this.jsNode = this.audioContext['createScriptProcessor'](
                this.bufferSize, 2, 2);

        // Register callback
        this.jsNode.owner = this;
        this.jsNode['onaudioprocess'] = function (event) {
            this.owner.onAudioProcess(event);
        };

        // Connect to output audio device.
        this.bufferSource['start'](0);
        this.bufferSource['connect'](this.jsNode);
        this.jsNode['connect'](this.audioContext['destination']);

        return;
    }

    // Audio Data API on Firefox.
    if (window['Audio']) {
        Log.getLog().info("use Audio Data API");
        this.audio = new Audio();
        if ((this.audio == null) || (this.audio['mozSetup'] == undefined)) {
            Log.getLog().fatal("could not use Audio Data API");
            this.initialized = false;
            return;
        }

        // Set up playback configuration.
        this.audioChannel = 2;
        this.audioFrequency = 44100;
        this.audio['mozSetup'](this.audioChannel, this.audioFrequency);

        // Set up output buffer.
        this.bufferId = 0;
        this.bufferPage = 4;
        this.bufferWritten = 0;
        this.buffer = new Array(this.bufferPage);
        var arraySize = this.bufferSize * this.audioChannel;
        for (var i = 0; i < this.bufferPage; i++) {
            this.buffer[i] = new Float32Array(arraySize);
            this.bufferWritten += this.audio['mozWriteAudio'](this.buffer[i]);
        }

        // Register callback with 50msec interval.
        this.audio.owner = this;

        // Set half time of buffer playback time.
        var interval = this.bufferSize * 1000 / 44100 / 2;
        setInterval(function (object) { object.onAudioInterval() }, interval,
            this);

        return;
    }
    Log.getLog().error("Audio API unavailable");
    this.initialized = false;
}

/**
 * Register sound generator.
 * @param newChannel sound generator
 */
AudioLooper.prototype.setChannel = function (newChannel) {
    if (null != newChannel)
        newChannel.setBufferLength(this.bufferSize * 2);
    this.channel = newChannel;
};

/**
 * Audio processing event handler for Web Audio API.
 * @param event AudioProcessingEvent
 */
AudioLooper.prototype.onAudioProcess = function (event) {
    // Logged event contents at the first event.
    if (null == this.firstAudioEvent) {
        this.firstAudioEvent = true;
        Log.getLog().info(event);
    }

    // Get Float32Array output buffer.
    var lOut = event['outputBuffer']['getChannelData'](0);
    var rOut = event['outputBuffer']['getChannelData'](1);

    // Process no input channel.
    var i;
    if (null == this.channel) {
        for (i = 0; i < this.bufferSize; i++) {
            lOut[i] = 0.0;
            rOut[i] = 0.0;
        }
        return;
    }

    // Get Int32Array input buffer.
    this.channel.generate(this.bufferSize * 2);
    var lrIn = this.channel.getBuffer();

    // Process buffer conversion.
    for (i = 0; i < this.bufferSize; i++) {
        lOut[i] = lrIn[i * 2 + 0] / 32768.0;
        rOut[i] = lrIn[i * 2 + 1] / 32768.0;
    }
};

/**
 * Audio interval callback handler for Audio Data API.
 */
AudioLooper.prototype.onAudioInterval = function () {
    // Logged event contents at the first event.
    if (null == this.firstAudioEvent) {
        this.firstAudioEvent = true;
        Log.getLog().info("onAudioInterval");
        Log.getLog().info(this);
    }

    // Check buffer status.
    var audioRead = this.audio['mozCurrentSampleOffset']();
    var pageSize = this.bufferSize * this.audioChannel;
    var pageOffset = audioRead % (pageSize * this.bufferPage);
    var playingPage = ~~(pageOffset / pageSize);
    if (this.bufferId == playingPage &&
            this.bufferWritten != audioRead) {
        // Buffers are busy.
        return;
    }

    // Update buffer tracking variables.
    var lrOut = this.buffer[this.bufferId];
    this.bufferId = (this.bufferId + 1) % this.bufferPage;

    // Process next buffer.
    var i;
    if (null == this.channel) {
        // Process no input channel.
        for (i = 0; i < this.bufferSize; i++) {
            lrOut[i * 2 + 0] = 0.0;
            lrOut[i * 2 + 1] = 0.0;
        }
    } else {
        // Process buffer conversion.
        this.channel.generate(this.bufferSize * this.audioChannel);
        var lrIn = this.channel.getBuffer();
        for (i = 0; i < this.bufferSize; i++) {
            lrOut[i * 2 + 0] = lrIn[i * 2 + 0] / 32768.0;
            lrOut[i * 2 + 1] = lrIn[i * 2 + 1] / 32768.0;
        }
    }

    // Play next buffer.
    this.bufferWritten += this.audio['mozWriteAudio'](lrOut);
};

/**
 * Check if this audio playback loop runs actively.
 * @return true if this audio playback loop runs actively
 */
AudioLooper.prototype.isActive = function () {
    // iOS requires to kick noteOn(0) from a UI action handler.
    if (this.audioContext && this.audioContext['currentTime'] == 0)
        return false;
    return true;
};

/**
 * Activate audio playback loop.
 */
AudioLooper.prototype.activate = function () {
    if (this.isActive())
        return;
    this.bufferSource['noteOn'](0);
};

/**
 * T'SoundSystem for JavaScript
 */

/**
 * MasterChannel prototype
 *
 * This prototype provide main audio generation loop.
 * @author Takashi Toyoshima <toyoshim@gmail.com>
 *
 * @constructor
 */
function MasterChannel () {
    this.channels = new Array();
    this.buffers = null;
    this.buffer = null;
    this.bufferLength = 0;
    this.player = null;
    this.intervalLength = 0;
    this.intervalRestLength = 0;
    this.volume = MasterChannel.DEFAULT_VOLUME;
}

MasterChannel.SAMPLE_FREQUENCY = 44100;
MasterChannel.MAX_WAVE_VALUE = 32767;
MasterChannel.MIN_WAVE_VALUE = -32767;
MasterChannel.MSEC_PER_SEC = 1000;
MasterChannel.DEFAULT_VOLUME = 8;

/**
 * Reconstruct slave buffer references.
 */
MasterChannel.prototype.reconstructBuffers = function () {
    var newBuffers = new Array(this.channels.length);
    for (var i = 0; i < this.channels.length; i++)
        newBuffers[i] = this.channels[i].getBuffer();
    this.buffers = newBuffers;
};

/**
 * Set mixing volume.
 * Every device sets maximum volume of each sound channel
 * as one sixteenth to avoid sound saturation.
 * If you want to maximize sounds set sixteen as volume.
 * It is the default value.
 * @param newVolume volume
 */
MasterChannel.prototype.setVolume = function (newVolume) {
    this.volume = newVolume;
};

/**
 * Add channel to audio play back loop.
 * @param channel channel to add
 * @return result
 */
MasterChannel.prototype.addChannel = function (channel) {
    var result = this.channels.push(channel);
    if (0 != this.bufferLength) {
        channel.setBufferLength(this.bufferLength);
        this.reconstructBuffers();
    }
    return result;
};

/**
 * Remove channel from audio play back loop.
 * @param channel channel to remove
 * @return result
 */
MasterChannel.prototype.removeChannel = function (channel) {
    for (var i = 0; i < this.channels.length; i++)
        if (channel == this.channels[i]) {
            this.buffers = null;
            this.channels.splice(i, 1);
            this.reconstructBuffers();
            return true;
        }
    return false;
};

/**
 * Remove all channels from audio play back loop.
 */
MasterChannel.prototype.clearChannel = function () {
    this.buffers = null;
    this.channels = new Array();
    this.reconstructBuffers();
};

/**
 * Set player object to control devices periodically.
 * @param newPlayer player to call back
 */
MasterChannel.prototype.setPlayer = function (newPlayer) {
    this.player = newPlayer;
};

/**
 * Set time interval to call back player periodically.
 * @param msec time interval
 */
MasterChannel.prototype.setPlayerInterval = function (msec) {
    this.intervalLength = (2 * MasterChannel.SAMPLE_FREQUENCY * msec) /
            MasterChannel.MSEC_PER_SEC;
    this.intervalLength = ~~this.intervalLength;
    this.intervalRestLength = this.intervalLength;
};

/**
 * Do partial slave channel audio mixing.
 * @param base base offset to generate
 * @param length buffer length to generate
 */
MasterChannel.prototype._generate = function (base, length) {
    var channels = this.channels.length;
    var ch;
    for (ch = 0; ch < channels; ch++)
        this.channels[ch].generate(length);
    for (var offset = 0; offset < length; offset++) {
        var value = 0;
        for (ch = 0; ch < channels; ch++)
            value += this.buffers[ch][offset];
        value *= this.volume;
        if (value > MasterChannel.MAX_WAVE_VALUE)
            value = MasterChannel.MAX_WAVE_VALUE;
        else if (value < MasterChannel.MIN_WAVE_VALUE)
            value = MasterChannel.MIN_WAVE_VALUE;
        this.buffer[base + offset] = value;
    }
};

/**
 * Set internal buffer length.
 * @param length buffer length or size in shorts
 */
MasterChannel.prototype.setBufferLength = function (length) {
    this.buffers = null;
    this.buffer = new Int32Array(length);
    this.bufferLength = length;
    for (var i = 0; i < this.channels.length; i++)
        this.channels[i].setBufferLength(length);
    this.reconstructBuffers();
};

/**
 * Get internal buffer.
 * @return audio stream buffer
 */
MasterChannel.prototype.getBuffer = function () {
    return this.buffer;
};

/**
 * Generate audio stream to internal buffer.
 * @param length buffer length or size in shorts to generate audio stream
 */
MasterChannel.prototype.generate = function (length) {
    if (null == this.buffers)
        return;
    if ((null == this.player) || (0 == this.intervalLength)) {
        this._generate(0, length);
    } else {
        var restLength = length;
        var offset = 0;
        while (restLength > this.intervalRestLength) {
            this._generate(offset, this.intervalRestLength);
            restLength -= this.intervalRestLength;
            offset += this.intervalRestLength;
            this.intervalRestLength = this.intervalLength;
            this.player.updateDevice();
        }
        if (0 != restLength) {
            this._generate(offset, restLength);
            this.intervalRestLength -= restLength;
        }
    }
};
/**
 * T'SoundSystem for JavaScript
 */

/**
 * TssChannel prototype
 *
 * This prototype implements virtual sound devices which are used in
 * original T'SS v1 series.
 * @author Takashi Toyoshima <toyoshim@gmail.com>
 *
 * @constructor
 */
function TssChannel () {
    this.buffer = null;
    this.fmBuffer = [ null, null, null, null ];
    this.player = null;
    this.module = [];
    this.timer = [
        { enable: false, timer: 0, count: 0, self: null, callback: null },
        { enable: false, timer: 0, count: 0, self: null, callback: null }
    ];
    this.maxChannel = 0;
    this.wave = [];
}

TssChannel.MODULE_CHANNEL_L = 0;
TssChannel.MODULE_CHANNEL_R = 1;
TssChannel.FM_OUT_MODE_OFF = 0;
TssChannel.FM_OUT_MODE_NEW = 1;
TssChannel.FM_OUT_MODE_ADD = 2;
TssChannel._RND_TABLE = new Int8Array(4096);
TssChannel._SIN_TABLE = new Int8Array(256);

// Calculate tables.
(function () {
    var i;
    for (i = 0; i < 4096; i++) {
        var u8 = ((~~(Math.random() * 0x7fffffff)) >> 8) & 0xff;
        if (u8 >= 0x80)
            u8 = u8 - 0x100;
        TssChannel._RND_TABLE[i] = u8;
    }

    for (i = 0; i < 256; i++)
        TssChannel._SIN_TABLE[i] = ~~(Math.sin(Math.PI * i / 128) * 64 + 0.5);
})();

/**
 * @see MasterChannel
 * @param length buffer length or size in shorts
 */
TssChannel.prototype.setBufferLength = function (length) {
    this.buffer = new Int32Array(length);
    for (var i = 0; i < 4; i++) {
        this.fmBuffer[i] = new Int32Array(length);
    }
};

/**
 * @see MasterChannel
 * @return audio stream buffer
 */
TssChannel.prototype.getBuffer = function () {
    return this.buffer;
};

/**
 * @see MasterChannel
 * @param newPlayer player to call back
 */
TssChannel.prototype.setPlayer = function (newPlayer) {
    this.player = newPlayer;
};

/**
 * @see MasterChannel
 * @param length sound length in short to generate
 */
TssChannel.prototype.generate = function (length) {
    var offset = 0;
    while (offset < length) {
        var timerCount = (length - offset) >> 2;
        var timerId;
        for (timerId = 0; timerId < 2; timerId++) {
            if (this.timer[timerId].enable &&
                    (this.timer[timerId].count < timerCount))
                timerCount = this.timer[timerId].count;
        }
        var generateCount = timerCount << 2;
        this._generateInternal(offset, generateCount);
        offset += generateCount;
        for (timerId = 0; timerId < 2; timerId++) {
            if (!this.timer[timerId].enable)
                continue;
            this.timer[timerId].count -= timerCount;
            if (0 != this.timer[timerId].count)
                continue;
            // Invoke callback.
            this.timer[timerId].count = this.timer[timerId].timer;
            this.timer[timerId].callback.apply(this.timer[timerId].self);
        }
    }
};

/**
 * Check if the module channele id is in range of maxChannel.
 * @param id module channel id
 * @throws RangeError module channel id is out of range of maxChannel
 */
TssChannel.prototype._CheckId = function (id) {
    if ((typeof id == "undefined") || (id > this.maxChannel))
        throw new RangeError("TSC: Invalid module channel: " + id);
};

/**
 * Set max channel number.
 * @param maxChannel max channel number
 */
TssChannel.prototype.setMaxChannel = function (maxChannel) {
    this.maxChannel = maxChannel;
    for (var ch = 0; ch < maxChannel; ch++)
        this.module[ch] = new TssChannel.Module(this, ch);
};

/**
 * Set wave data.
 * @param id table id
 * @param wave wave data of Int8Array
 */
TssChannel.prototype.setWave = function (id, wave) {
    Log.getLog().info("TSC: Set wave table " + id);
    Log.getLog().info(wave);
    this.wave[id] = wave;
};

/**
 * Set timer callback. Timer will be disabled if callback is null.
 * @param id timer id which must be 0 or 1
 * @param count timer count by sampling number
 * @param callback callback function
 */
TssChannel.prototype.setTimerCallback = function (id, count, self, callback) {
    if (id > 2)
        return;
    if ((null != callback) && (count <= 0))
        return;
    this.timer[id] = {
        enable: null != callback,
        timer: count,
        count: count,
        self: self,
        callback: callback
    };
};

/**
 * Set module frequency.
 * @param id module id
 * @param frequency frequency
 * @throws RangeError module channel id is out of range of maxChannel
 */
TssChannel.prototype.setModuleFrequency = function (id, frequency) {
    this._CheckId(id);
    this.module[id].frequency = frequency;
};

/**
 * Set module volume.
 * @param id module id
 * @param ch channel
 * @param volume volume
 * @throws RangeError module channel id is out of range of maxChannel
 */
TssChannel.prototype.setModuleVolume = function (id, ch, volume) {
    this._CheckId(id);
    if (ch == TssChannel.MODULE_CHANNEL_L)
        this.module[id].volume.l = volume;
    else if (ch == TssChannel.MODULE_CHANNEL_R)
        this.module[id].volume.r = volume;
    else
        Log.getLog().error("TSC: Invalid volume channel: " + ch);
};

/**
 * Get module volume.
 * @param id module id
 * @param ch channel
 * @throws RangeError module channel id or channel id is out of range
 */
TssChannel.prototype.getModuleVolume = function (id, ch) {
    this._CheckId(id);
    if (ch == TssChannel.MODULE_CHANNEL_L)
        return this.module[id].volume.l;
    else if (ch == TssChannel.MODULE_CHANNEL_R)
        return this.module[id].volume.r;
    throw new RangeError("TSC: Invalid volume channel:" + id)
};

/**
 * Set module device type
 * @param id module id
 * @param type device type id
 * @throws RangeError module channel id is out of range of maxChannel
 */
TssChannel.prototype.setModuleType = function (id, type) {
    this._CheckId(id);
    this.module[id].setType(type);
    if (TssChannel.Module.TYPE_SCC == type) {
        if (!this.wave[0])
            Log.getLog().warn("TSC: wave table 0 not found");
    }
};

/**
 * Get module device type
 * @param id module id
 * @return device type id
 * @throws RangeError module channel id is out of range of maxChannel
 */
TssChannel.prototype.getModuleType = function (id) {
    this._CheckId(id);
    return this.module[id].type;
};

/**
 * Set module voice.
 * @param id module id
 * @param voice voice id
 * @throws RangeError module channel id is out of range of maxChannel
 */
TssChannel.prototype.setModuleVoice = function (id, voice) {
    this._CheckId(id);
    this.module[id].voice = voice;
    var type = this.getModuleType(id);
    if (TssChannel.Module.TYPE_SCC == type) {
        if (!this.wave[voice])
            Log.getLog().warn("TSC: wave table " + voice + " not found");
    }
};

/**
 * Set module fm input pipe.
 * @see TssChannel.Module.setFmInPipe
 * @param id module id
 * @param rate modulation rate
 * @param pipe pipe id
 * @throws RangeError module channel id is out of range of maxChannel
 */
TssChannel.prototype.setModuleFmInPipe = function (id, rate, pipe) {
    this._CheckId(id);
    this.module[id].setFmInPipe(rate, pipe);
};

/**
 * Set module fm output pipe.
 * @see TssChannel.Module.setFmOutPipe
 * @param id module id
 * @param mode connection mode
 * @param pipe pipe id
 * @throws RangeError module channel id is out of range of maxChannel
 */
TssChannel.prototype.setModuleFmOutPipe = function (id, mode, pipe) {
    this._CheckId(id);
    this.module[id].setFmOutPipe(mode, pipe);
};

/**
 * Set module phase.
 * @param id module id
 * @param phase phase to set
 * @throws RangeError module channel id is out of range of maxChannel
 */
TssChannel.prototype.setModulePhase = function (id, phase) {
    this._CheckId(id);
    this.module[id].phase = phase;
};

/**
 * Generate sounds into a partial buffer.
 * @param offset offset in buffer to start
 * @param count sie to generate
 */
TssChannel.prototype._generateInternal = function (offset, count) {
    var buffer = this.buffer.subarray(offset, offset + count);
    var fmBuffer = [
        this.fmBuffer[0].subarray(offset, offset + count),
        this.fmBuffer[1].subarray(offset, offset + count),
        this.fmBuffer[2].subarray(offset, offset + count),
        this.fmBuffer[3].subarray(offset, offset + count)
    ];
    for (var i = 0; i < count; i++)
        buffer[i] = 0;
    for (var ch = 0; ch < this.maxChannel; ch++)
        this.module[ch].generate(buffer, fmBuffer);
};

/**
 * Module prototype
 *
 * This prototype implements inner class to emulate sound devices.
 * @constructor
 * @param channel parent channel object
 * @param ch module id
 */
TssChannel.Module = function (channel, ch) {
    this.id = ch;
    this.channel = channel;
    this.volume = {
        l: 0,
        r: 0
    };
    this.frequency = 0;
    this.fm = {
        inRate: 0,
        inPipe: 0,
        outMode: 0,
        outPipe: 0
    };
    this.multiple = 1;
    this.setType(TssChannel.Module.TYPE_PSG);
};

TssChannel.Module.TYPE_INVALID = -1;
TssChannel.Module.TYPE_PSG = 0;
TssChannel.Module.TYPE_FC = 1;
TssChannel.Module.TYPE_NOISE = 2;
TssChannel.Module.TYPE_SIN = 3;
TssChannel.Module.TYPE_SCC = 4;
TssChannel.Module.TYPE_OSC = 5;  // TODO
TssChannel.Module.TYPE_GB_SQUARE = 13;  // TODO
TssChannel.Module.TYPE_GB_WAVE = 14;  // TODO

/**
 * Set module device type.
 * @param type device type id
 */
TssChannel.Module.prototype.setType = function (type) {
    this.type = type;
    this.count = 0;
    this.phase = 0;
    this.voice = 0;
    switch (type) {
        case TssChannel.Module.TYPE_PSG:
            this.generate = this.generatePsg;
            break;
        case TssChannel.Module.TYPE_FC:
            this.generate = this.generateFc;
            this.voice = 3;
            break;
        case TssChannel.Module.TYPE_NOISE:
            this.generate = this.generateNoise;
            break;
        case TssChannel.Module.TYPE_SCC:
            this.generate = this.generateScc;
            break;
        case TssChannel.Module.TYPE_SIN:
            this.generate = this.generateSin;
            break;
        default:
            // TODO: Implement other types.
            Log.getLog().warn("TSC: unknown device type " + type);
            this.generate = this.generatePsg;
            break;
    }
};

/**
 * Set frequency modulation input pipe connection. The input pipe affect
 * pow(-2, rate) if rate is not 0. Otherwise, Pipe is not used.
 * @param rate input rate
 * @param pipe pipe id
 */
TssChannel.Module.prototype.setFmInPipe = function (rate, pipe) {
    this.fm.inRate = rate;
    this.fm.inPipe = pipe;
};

/**
 * Set frequency modulation output pipe connection.
 * @param mode connection mode
 *      TssChannel.FM_OUT_MODE_OFF: Don't use frequency modulation
 *      TssChannel.FM_OUT_MODE_ADD: Add output into specified pipe
 *      TssChannel.FM_OUT_MODE_NEW: Write output into specified pipe
 * @param pipe pipe id
 */
TssChannel.Module.prototype.setFmOutPipe = function (mode, pipe) {
    this.fm.outMode = mode;
    this.fm.outPipe = pipe;
};

/**
 * Generate a PSG-like sound.
 * @param buffer Int32Array to which generate sound
 * @param fmBuffer Int32Array to which output fm data, or from which input one
 */
TssChannel.Module.prototype.generatePsg = function (buffer, fmBuffer) {
    var volumeL = this.volume.l << 4;
    var volumeR = this.volume.r << 4;
    var length = buffer.length;
    var plus = this.frequency * 2 * this.multiple;
    var count = this.count;
    var phase = this.phase;
    if (0 == phase) {
        volumeL = -volumeL;
        volumeR = -volumeR;
    }
    for (var i = 0; i < length; i += 2) {
        buffer[i + 0] += volumeL;
        buffer[i + 1] += volumeR;
        count += plus;
        while (count > MasterChannel.SAMPLE_FREQUENCY) {
            volumeL = -volumeL;
            volumeR = -volumeR;
            count -= MasterChannel.SAMPLE_FREQUENCY;
            phase++;
            phase &= 1;
        }
    }
    this.count = count;
    this.phase = phase;
};

/**
 * Generate a NES-like sound.
 * @param buffer Int32Array to which generate sound
 * @param fmBuffer Int32Array to which output fm data, or from which input one
 */
TssChannel.Module.prototype.generateFc = function (buffer, fmBuffer) {
    var volumeL = this.volume.l << 4;
    var volumeR = this.volume.r << 4;
    var length = buffer.length;
    var plus = this.frequency * 8 * this.multiple;
    var count = this.count;
    var phase = this.phase;
    var voice = this.voice;
    if (phase < voice) {
        volumeL = -volumeL;
        volumeR = -volumeR;
    }
    for (var i = 0; i < length; i += 2) {
        buffer[i + 0] += volumeL;
        buffer[i + 1] += volumeR;
        count += plus;
        while (count > MasterChannel.SAMPLE_FREQUENCY) {
            count -= MasterChannel.SAMPLE_FREQUENCY;
            phase++;
            phase &= 7;
            if ((phase == 0) || (phase == voice)) {
                volumeL = -volumeL;
                volumeR = -volumeR;
            }
        }
    }
    this.count = count;
    this.phase = phase;
};

/**
 * Generate a noise sound. The noise is not white noise (maybe brawn?).
 * @param buffer Int32Array to which generate sound
 * @param fmBuffer Int32Array to which output fm data, or from which input one
 */
TssChannel.Module.prototype.generateNoise = function (buffer, fmBuffer) {
    var volumeL = this.volume.l >> 2;
    var volumeR = this.volume.r >> 2;
    var length = buffer.length;
    var plus = this.frequency * this.multiple;
    var count = this.count;
    var phase = this.phase;
    for (var i = 0; i < length; i += 2) {
        var rnd = TssChannel._RND_TABLE[phase];
        buffer[i + 0] += rnd * volumeL;
        buffer[i + 1] += rnd * volumeR;
        count += plus;
        while (count > 0) {
            phase++;
            phase &= 0x0fff;
            count -= 880;
        }
    }
    this.count = count;
    this.phase = phase;
};

TssChannel.Module.prototype.generateScc = function (buffer, fmBuffer) {
    var wave = this.channel.wave[this.voice];
    if (!wave)
        return;
    var out = buffer;
    if (TssChannel.FM_OUT_MODE_OFF != this.fm.outMode)
        out = fmBuffer[this.fm.outPipe];
    var volumeL = this.volume.l >> 2;
    var volumeR = this.volume.r >> 2;
    var length = buffer.length;
    var plus = this.frequency * 32 * this.multiple;
    var count = this.count;
    var phase = this.phase;
    var i;
    if (0 == this.fm.inRate) {
        if (TssChannel.FM_OUT_MODE_NEW == this.fm.outMode) {
            for (i = 0; i < length; i += 2) {
                out[i + 0] = wave[phase] * volumeL;
                out[i + 1] = wave[phase] * volumeR;
                count += plus;
                while (count > MasterChannel.SAMPLE_FREQUENCY) {
                    count -= MasterChannel.SAMPLE_FREQUENCY;
                    phase++;
                    phase &= 31;
                }
            }
        } else {
            for (i = 0; i < length; i += 2) {
                out[i + 0] += wave[phase] * volumeL;
                out[i + 1] += wave[phase] * volumeR;
                count += plus;
                while (count > MasterChannel.SAMPLE_FREQUENCY) {
                    count -= MasterChannel.SAMPLE_FREQUENCY;
                    phase++;
                    phase &= 31;
                }
            }
        }
    } else {
        var fm = fmBuffer[this.fm.inPipe];
        var inRate = this.fm.inRate << 3;
        var fmPhaseL;
        var fmPhaseR;
        if (TssChannel.FM_OUT_MODE_NEW == this.fm.outMode) {
            for (i = 0; i < length; i += 2) {
                fmPhaseL = (phase + (fm[i + 0] >> inRate)) & 31;
                fmPhaseR = (phase + (fm[i + 1] >> inRate)) & 31;
                out[i + 0] = wave[fmPhaseL] * volumeL;
                out[i + 1] = wave[fmPhaseR] * volumeR;
                count += plus;
                while (count > MasterChannel.SAMPLE_FREQUENCY) {
                    count -= MasterChannel.SAMPLE_FREQUENCY;
                    phase++;
                    phase &= 31;
                }
            }
        } else {
            for (i = 0; i < length; i += 2) {
                fmPhaseL = (phase + (fm[i + 0] >> inRate)) & 31;
                fmPhaseR = (phase + (fm[i + 1] >> inRate)) & 31;
                out[i + 0] += wave[fmPhaseL] * volumeL;
                out[i + 1] += wave[fmPhaseR] * volumeR;
                count += plus;
                while (count > MasterChannel.SAMPLE_FREQUENCY) {
                    count -= MasterChannel.SAMPLE_FREQUENCY;
                    phase++;
                    phase &= 31;
                }
            }
        }
    }
    this.count = count;
    this.phase = phase;
};

/**
 * Generate a Sine wave sound.
 * @param buffer Int32Array to which generate sound
 * @param fmBuffer Int32Array to which output fm data, or from which input one
 */
TssChannel.Module.prototype.generateSin = function (buffer, fmBuffer) {
    var out = buffer;
    if (TssChannel.FM_OUT_MODE_OFF != this.fm.outMode)
        out = fmBuffer[this.fm.outPipe];
    var volumeL = this.volume.l >> 1;
    var volumeR = this.volume.r >> 1;
    var length = buffer.length;
    var plus = this.frequency * 256 * this.multiple;
    var count = this.count;
    var phase = this.phase;
    var i;
    if (0 == this.fm.inRate) {
        if (TssChannel.FM_OUT_MODE_NEW == this.fm.outMode) {
            for (i = 0; i < length; i += 2) {
                out[i + 0] = TssChannel._SIN_TABLE[phase] * volumeL;
                out[i + 1] = TssChannel._SIN_TABLE[phase] * volumeR;
                count += plus;
                while (count > MasterChannel.SAMPLE_FREQUENCY) {
                    count -= MasterChannel.SAMPLE_FREQUENCY;
                    phase++;
                    phase &= 0xff;
                }
            }
        } else {
            for (i = 0; i < length; i += 2) {
                out[i + 0] += TssChannel._SIN_TABLE[phase] * volumeL;
                out[i + 1] += TssChannel._SIN_TABLE[phase] * volumeR;
                count += plus;
                while (count > MasterChannel.SAMPLE_FREQUENCY) {
                    count -= MasterChannel.SAMPLE_FREQUENCY;
                    phase++;
                    phase &= 0xff;
                }
            }
        }
    } else {
        var fm = fmBuffer[this.fm.inPipe];
        var inRate = this.fm.inRate;
        var fmPhaseL;
        var fmPhaseR;
        if (TssChannel.FM_OUT_MODE_NEW == this.fm.outMode) {
            for (i = 0; i < length; i += 2) {
                fmPhaseL = (phase + (fm[i + 0] >> inRate)) & 0xff;
                fmPhaseR = (phase + (fm[i + 1] >> inRate)) & 0xff;
                out[i + 0] = TssChannel._SIN_TABLE[fmPhaseL] * volumeL;
                out[i + 1] = TssChannel._SIN_TABLE[fmPhaseR] * volumeR;
                count += plus;
                while (count > MasterChannel.SAMPLE_FREQUENCY) {
                    count -= MasterChannel.SAMPLE_FREQUENCY;
                    phase++;
                    phase &= 0xff;
                }
            }
        } else {
            for (i = 0; i < length; i += 2) {
                fmPhaseL = (phase + (fm[i + 0] >> inRate)) & 0xff;
                fmPhaseR = (phase + (fm[i + 1] >> inRate)) & 0xff;
                out[i + 0] += TssChannel._SIN_TABLE[fmPhaseL] * volumeL;
                out[i + 1] += TssChannel._SIN_TABLE[fmPhaseR] * volumeR;
                count += plus;
                while (count > MasterChannel.SAMPLE_FREQUENCY) {
                    count -= MasterChannel.SAMPLE_FREQUENCY;
                    phase++;
                    phase &= 0xff;
                }
            }
        }
    }
    this.count = count;
    this.phase = phase;
};
/**
 * T'SoundSystem for JavaScript
 */

/**
 * TString prototype
 *
 * Contain string in UTF-8 and performs various functions around string
 * processing.
 * @author Takashi Toyoshima <toyoshim@gmail.com>
 *
 * @constructor
 */
function TString () {
    this.object = null;
}

TString.CODE_NUL = 0x00;
TString.CODE_HT = 0x09;
TString.CODE_LF = 0x0a;
TString.CODE_CR = 0x0d;
TString.CODE_SP = 0x20;
TString.CODE_0 = 0x30;
TString.CODE_9 = 0x39;
TString.CODE_A = 0x41;
TString.CODE_Z = 0x5a;
TString.CODE_a = 0x61;
TString.CODE_z = 0x7a;

/**
 * Check if the specified code is BMP.
 * @param code character code in UTF-16
 * @return return true if the code is BMP
 */
TString._isBMP = function (code) {
    if ((code < 0) || (0x10000 <= code))
        return false;
    if (code < 0xd800)
        return true;
    if (code >= 0xe000)
        return true;
    return false;
};

/**
 * Check if the specified code is the first code of surroage pair.
 * @param code character code in UTF-16
 * @return return true if the code is the first code of surrogate pair
 */
TString._isHighSurrogates = function (code) {
    if ((0xd800 <= code) && (code < 0xdc00))
        return true;
    return false;
};

/**
 * Check if the specified code is the second code of surroage pair.
 * @param code character code in UTF-16
 * @return return true if the code is the second code of surrogate pair
 */
TString._isLowSurrogates = function (code) {
    if ((0xdc00 <= code) && (code < 0xe000))
        return true;
    return false;
};

/**
 * Decode UTF-16 surrogate pair and return UCS-2 code.
 * @param first the first code of a pair
 * @param second the second code of a pair
 * @return UCS-2 code
 * @throws RangeError when the specified code pair is an invalid sarrogate pair
 */
TString._decodeSurrogatePair = function (first, second) {
    if (!TString._isHighSurrogates(first) ||
            !TString._isLowSurrogates(second))
        throw new RangeError("TString: invalid surrogate pair (" + first +
                ", " + second + ")");
    var w = (first >> 6) & 0xf;
    var u = w + 1;
    var x = ((first & 0x3f) << 10) | (second & 0x3ff);
    var i32 = (u << 16) + x;
    if (i32 < 0)
        return 0x100000000 + i32;
    return i32;
};

/**
 * Calculate code size in UTF-8.
 * @param code UCS-2 code
 * @return size in bytes
 */
TString._bytesInUTF8 = function (code) {
    if (code < 0)
        throw new RangeError("TString: invalid UCS-2 code " + code);
    if (code < 0x80)
        return 1;
    if (code < 0x800)
        return 2;
    if (code < 0x10000)
        return 3;
    if (code < 0x200000)
        return 4;
    if (code < 0x4000000)
        return 5;
    if (code < 0x80000000)
        return 6;
    throw new RangeError("TString: invalid UCS-2 code " + code)
};

/**
 * Count UCS-2 string length in UTF-8 bytes.
 * @param string string object to count
 */
TString._countString = function (string) {
    var length = 0;
    for (var i = 0; i < string.length; i++) {
        var code = string.charCodeAt(i);
        if (!TString._isBMP(code)) {
            if (++i >= string.length)
                throw new RangeError("TString: invalid surrogate pair");
            code = TString._decodeSurrogatePair(code, string.charCodeAt(i));
        }
        length += TString._bytesInUTF8(code);
    }
    return length;
};

/**
 * Set UCS2 code to Uint8Array in UTF-8.
 * @param array Uint8Array where store UTF-8 codes
 * @param offset offset in array where store UTF-8 codes
 * @param code code to be stored
 */
TString._setUcs2 = function (array, offset, code) {
    if (code < 0)
        throw new RangeError("TString: invalid UCS-2 code " + code);
    if (code < 0x80) {  // 7bit
        array[offset] = code;  // 7bit
        return 1;
    }
    if (code < 0x800) {  // 11bit
        array[offset + 0] = 0xc0 | (code >> 6);  // 5bit
        array[offset + 1] = 0x80 | (code & 0x3f);  // 6bit
        return 2;
    }
    if (code < 0x10000) {  // 16bit
        array[offset + 0] = 0xe0 | (code >> 12); // 4bit
        array[offset + 1] = 0x80 | ((code >> 6) & 0x3f);  // 6bit
        array[offset + 2] = 0x80 | (code & 0x3f);  // 6bit
        return 3;
    }
    if (code < 0x200000) {  // 21bit
        array[offset + 0] = 0xf0 | (code >> 18); // 3bit
        array[offset + 1] = 0x80 | ((code >> 12) & 0x3f); // 6bit
        array[offset + 2] = 0x80 | ((code >> 6) & 0x3f);  // 6bit
        array[offset + 3] = 0x80 | (code & 0x3f);  // 6bit
        return 4;
    }
    if (code < 0x4000000) {  // 26bit
        array[offset + 0] = 0xf8 | (code >> 24); // 2bit
        array[offset + 1] = 0x80 | ((code >> 18) & 0x3f); // 6bit
        array[offset + 2] = 0x80 | ((code >> 12) & 0x3f); // 6bit
        array[offset + 3] = 0x80 | ((code >> 6) & 0x3f);  // 6bit
        array[offset + 4] = 0x80 | (code & 0x3f);  // 6bit
        return 5;
    }
    if (code < 0x80000000) {  // 31bit
        array[offset + 0] = 0xfc | (code >> 30); // 1bit
        array[offset + 1] = 0x80 | ((code >> 24) & 0x3f); // 6bit
        array[offset + 2] = 0x80 | ((code >> 18) & 0x3f); // 6bit
        array[offset + 3] = 0x80 | ((code >> 12) & 0x3f); // 6bit
        array[offset + 4] = 0x80 | ((code >> 6) & 0x3f);  // 6bit
        array[offset + 5] = 0x80 | (code & 0x3f);  // 6bit
        return 6;
    }
    throw new RangeError("TString: invalid UCS-2 code " + code)
};

/**
 * Build Uint8ArrayString in UTF-8 from string.
 * @param string string object to convert
 */
TString._buildUint8ArrayString = function (string) {
    var size = TString._countString(string);
    var array = new Uint8Array(size);
    var offset = 0;
    for (var i = 0; i < string.length; i++) {
        var code = string.charCodeAt(i);
        if (!TString._isBMP(code)) {
            if (++i >= string.length)
                throw new RangeError("TString: invalid surrogate pair");
            code = TString._decodeSurrogatePair(code, string.charCodeAt(i));
        }
        offset += TString._setUcs2(array, offset, code);
    }
    return array;
};

/**
 * Create TString object from string object.
 * @param string string object
 */
TString.createFromString = function (string) {
    var s = new TString();
    s._fromString(string);
    return s;
};

/**
 * Create TString object from Uint8Array object.
 * This TString object will share the original object.
 * @param array Uint8Array object
 */
TString.createFromUint8Array = function (array) {
    var s = new TString();
    s._fromUint8Array(array);
    return s;
};

/**
 * Contain string object as a internal string. string must be in UTF-16.
 * @param string string object.
 */
TString.prototype._fromString = function (string) {
    this.object = TString._buildUint8ArrayString(string);
};

/**
 * Contain Uint8Array object as a internal string. Uint8Array must be in
 * UTF-8.
 * @param array
 */
TString.prototype._fromUint8Array = function (array) {
    this.object = array;
};

/**
 * Get a byte code from the internal UTF-8 byte array.
 * @param offset offset
 * @return code
 * @throws RangeError when offset is out of range
 */
TString.prototype.at = function (offset) {
    if (offset >= this.object.byteLength)
        throw new RangeError("TString: offset is out of range");
    return this.object[offset];
};

/**
 * Get string from the internal UTF-8 byte array.
 * @param offset offset
 * @return character
 * @throws RangeError when offset is out of range
 */
TString.prototype.charAt = function (offset) {
    return String.fromCharCode(this.at(offset));
};

/**
 * Get lower string from the internal UTF-8 byte array.
 * @param offset offset
 * @return character
 * @throws RangeError when offset is out of range
 */
TString.prototype.lowerCharAt = function (offset) {
    var code = this.at(offset);
    if ((TString.CODE_A <= code) && (code <= TString.CODE_Z))
        code |= 0x20;
    return String.fromCharCode(code);
};

/**
 * Get number from the interrnal UTF-8 byte array.
 * @param offset offset
 * @return the number if the code is number, otherwise -1
 */
TString.prototype.numberAt = function (offset) {
    if (!this.isNumber(offset))
        return -1;
    return this.object[offset] - TString.CODE_0;
};

/**
 * Set a bytes code to the internal UTF-8 byte array.
 * @param offset offset
 * @param code code
 * @throws RangeError when offset is out of range
 */
TString.prototype.setAt = function (offset, code) {
    if (offset >= this.object.byteLength)
        throw new RangeError("TString: offset is out of range");
    this.object[offset] = code;
};

/**
 * Set a character to the internal UTF-8 byte array.
 * @param offset offset
 * @param ch character
 * @throws RangeError when offset is out of range
 */
TString.prototype.setCharAt = function (offset, ch) {
    this.setAt(offset, ch.charCodeAt(0));
};

/**
 * Set a ASCII string to the internal UTF-8 byte array.
 * @param offset offset
 * @param string ASCII string
 * @throws RangeError when offset is out of range
 */
TString.prototype.setASCII = function (offset, string) {
    for (var i = 0; i < string.length; i++)
        this.setAt(offset + i, string.charCodeAt(i));
    this.setAt(offset + string.length, 0);
    return offset + string.length + 1;
};

/**
 * Set a TString to the internal UTF-8 byte array.
 * @param offset offset
 * @param string TString
 * @throws RangeError when offset is out of range
 */
TString.prototype.setTString = function (offset, string) {
    for (var i = 0; i < string.byteLength(); i++)
        this.setAt(offset + i, string.at(i));
    this.setAt(offset + string.byteLength(), 0);
    return offset + string.byteLength() + 1;
};

/**
 * Set a number to the internal UTF-8 byte array as Uint16.
 * @param offset offset
 * @param n Uint16 number
 * @throws RangeError when offset is out of range
 */
TString.prototype.setUint16 = function (offset, n) {
    this.setAt(offset, n >> 8);
    this.setAt(offset + 1, n & 0xff);
    return offset + 2;
};

/**
 * Set a number to the internal UTF-8 byte array as Uint32.
 * @param offset offset
 * @param n Uint32 number
 * @throws RangeError when offset is out of range
 */
TString.prototype.setUint32 = function (offset, n) {
    this.setAt(offset, n >> 24);
    this.setAt(offset + 1, (n >> 16) & 0xff);
    this.setAt(offset + 2, (n >> 8) & 0xff);
    this.setAt(offset + 3, n & 0xff);
    return offset + 4;
};

/**
 * Get the interrnal UTF-8 byte array length.
 * @return length
 */
TString.prototype.byteLength = function () {
    return this.object.length;
};

/**
 * Duplicate a part of this object.
 * @param begin start offset
 * @param end end offset (start + size)
 */
TString.prototype.slice = function (begin, end) {
    return TString.createFromUint8Array(this.object.subarray(begin, end));
};

/**
 * Check if this object contains the specified string from offset.
 * @param offset start offset of the interrnal UTF-8 byte array
 * @param string string to be checked
 * @return true if the internal array contains specified data
 */
TString.prototype.containString = function (offset, string) {
    var t = TString.createFromString(string);
    return this.containUint8Array(offset, t.object);
};

/**
 * Check if this object contains the specified byte sequence from offset.
 * @param offset start offset of the internal UTF-8 byte array
 * @param array Uint8Array object containing byte sequence to be checked
 * @return true if the internal array contains specified data
 */
TString.prototype.containUint8Array = function (offset, array) {
    for (var i = 0; i < array.length; i++)
        if (this.object[offset + i] != array[i])
            return false;
    return true;
};

/**
 * Check if this object contains the specified ASCII string from offset.
 * The string must contain character in the range of 0x00 to 0x7f.
 * @param offset start offset of the internal UTF-8 byte array
 * @param ascii ASCII string to be checked
 * @return true if the internal array contains specified data
 */
TString.prototype.containASCII = function (offset, ascii) {
    for (var i = 0; i < ascii.length; i++)
        if (this.object[offset + i] != ascii.charCodeAt(i))
            return false;
    return true;
};

/**
 * Count line size in bytes except for line delimiter.
 * @param offset start offset
 */
TString.prototype.countLine = function (offset) {
    var count = 0;
    for (var i = offset; i < this.object.length; i++) {
        var c = this.object[i];
        if ((TString.CODE_CR == c)|| (TString.CODE_LF == c))
            break;
        count++;
    }
    return count;
};

/**
 * Count line delimiter size.
 * @param offset start offset
 */
TString.prototype.countLineDelimiter = function (offset) {
    if (offset >= this.object.length)
        return 0;
    var count = 0;
    var c = this.object[offset++];
    if (TString.CODE_CR == c) {
        if (offset == this.object.length)
            return 1;
        count++;
        c = this.object[offset];
    }
    if (TString.CODE_LF == c)
        count++;
    return count;
};

/**
 * Count white saces.
 * @param offset start offset
 * @return number of spaces
 */
TString.prototype.countSpaces = function (offset) {
    var n = 0;
    for (var i = offset; i < this.object.length; i++) {
        var c = this.object[i];
        if ((TString.CODE_NUL != c) && (TString.CODE_HT != c) &&
                (TString.CODE_SP != c))
            break;
        n++;
    }
    return n;
};

/**
 * Return an alphabetical order position from 'a' or 'A' of character in
 * offset if it is alphabet. Otherwise return -1.
 * @param offset offset
 * @return an alphabetical order position from 'a' or 'A', or -1.
 */
TString.prototype.alphabetIndex = function (offset) {
    var c = this.object[offset];
    if ((TString.CODE_A <= c) && (c <= TString.CODE_Z))
        return c - TString.CODE_A;
    else if ((TString.CODE_a <= c) && (c <= TString.CODE_z))
        return c - TString.CODE_a;
    return -1;
};

/**
 * Check if the code in position of offset is a character for a number.
 * @param offset offset
 * @return true if the code is a character for a number.
 */
TString.prototype.isNumber = function (offset) {
    if (offset >= this.object.byteLength)
        return false;
    var c = this.object[offset];
    if ((c < TString.CODE_0) || (TString.CODE_9 < c))
        return false;
    return true;
};

/**
 * Find code from internal UTF-8 array at offset.
 * @param offset start offset
 * @param code code to find
 * @return offset if the code is found, otherwise -1
 */
TString.prototype.find = function (offset, code) {
    for (var i = offset; i < this.object.length; i++)
        if (this.object[i] == code)
            return i;
    return -1;
};

/**
 * Create UTF-16 string object from internal UTF-8 byte array from offset.
 * @param offset start offset (default: 0)
 * @param size size in byte (default: byteLength() - offset)
 * @return UTF-16 string object
 * @throws TypeError when internal UTF-8 byte array contains invalid code
 */
TString.prototype.toString = function (offset, size) {
    if (arguments.length < 1)
        offset = 0;
    if (arguments.length < 2)
        size = this.byteLength() - offset;
    var result = "";
    var first = true;
    var length = 1;
    var value = 0;
    for (var i = 0; (i < size) && (i < this.object.length); i++) {
        var c = this.object[offset + i];
        if (first) {
            if (0 == c)
                break;
            if (c < 0x80) {
                // 1 Byte UTF-8 string
                result += String.fromCharCode(c);
                continue;
            }
            first = false;
            if (c < 0xc2) {
                // Invalid character
                throw new TypeError("TString: invalid UTF-8");
            } else if (c < 0xe0) {
                // 2 Bytes UTF-8 string
                length = 2;
                value = c & 0x1f;
            } else if (c < 0xf0) {
                // 3 Bytes UTF-8 string
                length = 3;
                value = c & 0x0f;
            } else if (c < 0xf8) {
                // 4 Bytes UTF-8 string
                length = 4;
                value = c & 0x07;
            } else if (c < 0xfc) {
                // 5 Bytes UTF-8 string
                length = 5;
                value = c & 0x03;
            } else if (c < 0xfe) {
                // 6 Bytes UTF-8 string
                length = 6;
                value = c & 0x01;
            } else {
                // Invalid character
                throw new TypeError("TString: invalid UTF-8");
            }
            length--;
        } else {
            if ((c < 0x80) || (0xbf < c)) {
                // Invalid character
                throw new TypeError("TString: invalid UTF-8");
            }
            value = (value << 6) | (c & 0x3f);
            length--;
            if (0 == length) {
                first = true;
                if ((value < 0xd800) || (0xe000 <= value)) {
                    result += String.fromCharCode(value);
                } else {
                    var u = (value >> 16) & 0x1f;
                    var w = u - 1;
                    var x = value & 0xffff;
                    result += String.fromCharCode(
                        0xd800 + (w << 6) + (x >> 10));
                    result += String.fromCharCode(0xdc00 + (x & 0x3ff));
                }
            }
        }
    }
    if(!first)
        throw new TypeError("TString: invalid UTF-8");
    return result;
};

exports.TString = TString;
/**
 * T'SoundSystem for JavaScript
 */

/**
 * TsdPlayer prototype
 *
 * Play TSD format files.
 * @author Takashi Toyoshima <toyoshim@gmail.com>
 *
 * @constructor
 */
function TsdPlayer () {
    this.device = null;
    this.input = null;
    this.header = null;
    this.channel = null;
    this.activeChannel = 0;
    this.table = [];
    for (var i = 0; i < 256; i++)
        this.table[i] = new Uint8Array(0);
}

TsdPlayer.VERSION = 0.93;
TsdPlayer.CMD_LAST_NOTE = 0x7f;
TsdPlayer.CMD_NOTE_OFF = 0x80;
TsdPlayer.CMD_VOLUME_MONO = 0x81;
TsdPlayer.CMD_SUSTAIN_MODE = 0x82;
TsdPlayer.CMD_DETUNE = 0x83;
TsdPlayer.CMD_PORTAMENT = 0x84;
TsdPlayer.CMD_VOLUME_LEFT = 0x85;
TsdPlayer.CMD_VOLUME_RIGHT = 0x86;
TsdPlayer.CMD_PANPOT = 0x87;
TsdPlayer.CMD_RELATIVE_VOLUME_UP = 0x88;
TsdPlayer.CMD_RELATIVE_VOLUME_DOWN = 0x89;
TsdPlayer.CMD_TEMPO = 0x90;
TsdPlayer.CMD_FINENESS = 0x91;
TsdPlayer.CMD_KEY_ON_PHASE = 0x92;
TsdPlayer.CMD_MULTIPLE = 0x93;
TsdPlayer.CMD_PITCH_MODULATION_DELAY = 0xa0;
TsdPlayer.CMD_PITCH_MODULATION_DEPTH = 0xa1;
TsdPlayer.CMD_PITCH_MODULATION_WIDTH = 0xa2;
TsdPlayer.CMD_PITCH_MODULATION_HEIGHT = 0xa3;
TsdPlayer.CMD_PITCH_MODULATION_DELTA = 0xa4;
TsdPlayer.CMD_AMP_EMVELOPE = 0xb8;
TsdPlayer.CMD_NOTE_EMVELOPE = 0xc8;
TsdPlayer.CMD_ENDLESS_LOOP_POINT = 0xe0;
TsdPlayer.CMD_LOCAL_LOOP_START = 0xe1;
TsdPlayer.CMD_LOCAL_LOOP_BREAK = 0xe2;
TsdPlayer.CMD_LOCAL_LOOP_END = 0xe3;
TsdPlayer.CMD_FREQUENCY_MODE_CHANGE = 0xf0;
TsdPlayer.CMD_VOLUME_MODE_CHANGE = 0xf1;
TsdPlayer.CMD_FM_IN = 0xf8;
TsdPlayer.CMD_FM_OUT = 0xf9;
TsdPlayer.CMD_VOICE_CHANGE = 0xfd;
TsdPlayer.CMD_MODULE_CHANGE = 0xfe;
TsdPlayer.CMD_END = 0xff;
TsdPlayer._DEFAULT_TIMER_COUNT = 368;
TsdPlayer._TIMER_AUTOMATION = 0;
TsdPlayer._TIMER_SEQUENCER = 1;
TsdPlayer._CH_L = TssChannel.MODULE_CHANNEL_L;
TsdPlayer._CH_R = TssChannel.MODULE_CHANNEL_R;
TsdPlayer._PAN_L = 1;
TsdPlayer._PAN_R = 2;
TsdPlayer._PAN_C = TsdPlayer._PAN_L | TsdPlayer._PAN_R;
TsdPlayer._FREQUENCY_TYPE_NORMAL = 0;
TsdPlayer._FREQUENCY_TYPE_MSX = 1;
TsdPlayer._FREQUENCY_TYPE_FM = 2;
TsdPlayer._FREQUENCY_TYPE_GB_SQUARE = 3;
TsdPlayer._VOLUME_TYPE_NORMAL = 0;
TsdPlayer._VOLUME_TYPE_FM = 1;
TsdPlayer._NOTE_FREQUENCY_TABLE = [ null, null, null, null ];
TsdPlayer._NOTE_PARAMETER_TABLE = [ null, null, null, null ];
TsdPlayer._PARAMETER_FREQUENCY_TABLE = [ null, null,null, null ];
TsdPlayer._FM_VOLUME_TABLE = null;
TsdPlayer._MSX_PARAMETER_TABLE = [
    0x0D5D, 0x0C9C, 0x0BE7, 0x0B3C, 0x0A9B, 0x0A02, 0x0973, 0x08EB,
    0x086B, 0x07F2, 0x0780, 0x0714, 0x06AF, 0x064E, 0x05F4, 0x059E,
    0x054E, 0x0501, 0x04BA, 0x0476, 0x0436, 0x03F9, 0x03C0, 0x038A,
    0x0357, 0x0327, 0x02FA, 0x02CF, 0x02A7, 0x0281, 0x025D, 0x023B,
    0x021B, 0x01FD, 0x01E0, 0x01C5, 0x01AC, 0x0194, 0x017D, 0x0168,
    0x0153, 0x0140, 0x012E, 0x011D, 0x010D, 0x00FE, 0x00F0, 0x00E3,
    0x00D6, 0x00CA, 0x00BE, 0x00B4, 0x00AA, 0x00A0, 0x0097, 0x008F,
    0x0087, 0x007F, 0x0078, 0x0071, 0x006B, 0x0065, 0x005F, 0x005A,
    0x0055, 0x0050, 0x004C, 0x0047, 0x0043, 0x0040, 0x003C, 0x0039,
    0x0035, 0x0032, 0x0030, 0x002D, 0x002A, 0x0028, 0x0026, 0x0024,
    0x0022, 0x0020, 0x001E, 0x001C, 0x001B, 0x0019, 0x0018, 0x0016,
    0x0015, 0x0014, 0x0013, 0x0012, 0x0011, 0x0010, 0x000F, 0x000E
];

// Calculate tables.
(function () {
    var i;

    // from note to frequency table for NORMAL mode
    var table = new Uint16Array(0x80);
    TsdPlayer._NOTE_FREQUENCY_TABLE[TsdPlayer._FREQUENCY_TYPE_NORMAL] = table;
    for (i = 0; i < 0x80; i++)
        table[i] = ~~(440 * Math.pow(2, (i - 69) / 12) + 0.5);

    // from note to frequency table for GB_SQUARE mode
    table = new Uint16Array(0x80);
    TsdPlayer._NOTE_FREQUENCY_TABLE[TsdPlayer._FREQUENCY_TYPE_GB_SQUARE] =
            table;
    for (i = 0; i < 0x80; i++) {
        var frequency = 440 * Math.pow(2, (i - 69) / 12);
        var param = 2048 - 131072 / frequency + 0.5;
        if (param < 0)
            param = 0;
        table[i] = param;
    }

    // from note to parameter table for MSX mode
    table = new Uint16Array(0x80);
    TsdPlayer._NOTE_PARAMETER_TABLE[TsdPlayer._FREQUENCY_TYPE_MSX] = table;
    for (i = 0; i < 12; i++)
        table[i] = 0;
    for (i = 12; i < 108; i++)
        table[i] = TsdPlayer._MSX_PARAMETER_TABLE[i - 12];
    for (i = 108; i < 128; i++)
        table[i] = 0;

    // from parameter to frequency table for MSX mode
    table = new Uint16Array(4096);
    TsdPlayer._PARAMETER_FREQUENCY_TABLE[TsdPlayer._FREQUENCY_TYPE_MSX] =
            table;
    table[0] = 0;
    for (i = 1; i < 4096; i++)
        table[i] = ~~((1.7897725e+6 / 16 / i / 2) + 0.5);

    // from parameter to frequency table for FM mode
    table = new Uint16Array(0x2000);
    TsdPlayer._PARAMETER_FREQUENCY_TABLE[TsdPlayer._FREQUENCY_TYPE_FM] = table;
    for (i = 0; i < 0x2000; i++) {
        var tone = i >> 6;
        var fine = i & 0x3f;
        var power = ((tone - 69) + fine / 64) / 12;
        table[i] = ~~(440 * Math.pow(2, power) + 0.5);
    }

    // volume table for FM mode
    table = new Uint8Array(256);
    TsdPlayer._FM_VOLUME_TABLE = table;
    for (i = 0; i < 256; i++)
        table[i] = ~~(255 * Math.pow(10, -0.75 * (255 - i) / 2 / 20) + 0.5);
})();

/**
 * Set master channel. This function prepares required device channel and
 * connect it player and master channel.
 * @param channel master channel
 */
TsdPlayer.prototype.setMasterChannel = function (channel) {
    this.device = new TssChannel();
    this.device.setPlayer(this);
    channel.clearChannel();
    channel.addChannel(this.device);
};

/**
 * Read signed 8bit data from input buffer.
 * @param offset offset to be read
 * @return read data
 */
TsdPlayer.prototype._readI8 = function (offset) {
    var data = this.input[offset];
    if (data >= 0x80)
        data = data - 0x100;
    return data;
};

/**
 * Read unsigned 16bit data from input buffer.
 * @param offset offset to be read
 * @return read data
 */
TsdPlayer.prototype._readU16 = function (offset) {
    return (this.input[offset] << 8) | this.input[offset + 1];
};

/**
 * Read unsigned 32bit data from input buffer.
 * @param offset offset to be read
 * @return read data
 */
TsdPlayer.prototype._readU32 = function (offset) {
    var i32 = (this.input[offset] << 24) | (this.input[offset + 1] << 16) |
            (this.input[offset + 2] << 8) | this.input[offset + 3];
    if (i32 < 0)
        return 0x100000000 + i32;
    return i32;
};

/**
 * Clamp number value between min and max.
 * @param value original value
 * @param min minimum value
 * @param max maximum value
 * @return clamped value
 */
TsdPlayer.prototype._clamp = function (value, min, max) {
    if (value < min)
        return min;
    if (value > max)
        return max;
    return value;
};

/**
 * Set table data.
 * @param id table id
 * @param table table data of Int8Array
 */
TsdPlayer.prototype._setTable = function (id, table) {
    Log.getLog().info("TSD: Set envelope table " + id);
    Log.getLog().info(table);
    this.table[id] = table;
};

/**
 * Decode and play.
 * @param newInput ArrayBuffer to play
 * @return success or not
 */
TsdPlayer.prototype.play = function (newInput) {
    try {
        this.input = new Uint8Array(newInput);
        var tstring = TString.createFromUint8Array(this.input);
        if (!tstring.containASCII(0, "T'SoundSystem")) {
            Log.getLog().warn("TSD: magic T'SoundSystem not found.");
            return false;
        }
        var header = {};
        // Check version headers.
        header.majorVersion = this.input[14];
        header.minorVersion = this.input[15];
        header.fullVersion = header.majorVersion + header.minorVersion / 100;
        Log.getLog().info("TSD: version = " + header.fullVersion);
        if ((header.fullVersion <= 0.60) ||
                (TsdPlayer.VERSION < header.fullVersion)) {
            Log.getLog().warn("TSD: unsupported format");
            return false;
        }

        // Parse the music title.
        header.titleSize = this._readU16(16);
        header.title = TString.createFromUint8Array(
                this.input.subarray(18, 18 + header.titleSize)).toString();
        Log.getLog().info("TSD: title = " + header.title);

        var offset = 18 + ((header.titleSize + 1) & ~1);
        header.numOfChannel = this._readU16(offset);
        offset += 2;
        Log.getLog().info("TSD: channel = " + header.numOfChannel);
        this.device.setMaxChannel(header.numOfChannel);
        this.header = header;
        this.activeChannel = header.numOfChannel;

        // Parse channel information.
        var channel = [];
        var i;
        for (i = 0; i < header.numOfChannel; i++) {
            channel[i] = {
                id: i,  // module id
                baseOffset: 0,  // offset to sequence data in input buffer
                size: 0,  // sequence data size
                offset: 0,  // current processing offset to sequence data
                loop: {  // loop information
                    offset: 0,  // offset to loop start poit of sequence data
                    count: 0  // current loop count
                },
                localLoop:[],  // inner loop information
                wait: 1,  // wait count to the next processing
                sustain: 0,  // sustain level
                portament: 0,  // portament depth
                detune: 0,  // detune depth
                keyOn: false,  // key on state
                volume: {  // base volume information
                    type: 0,  // volume type
                    l: 0, // left volume
                    r:0  // right volume
                },
                pan: TsdPlayer._PAN_C,  // panpot
                frequency: {  // frequency information
                    type: 0,  // frequency type
                    note: 0,  // original note id
                    param: 0,  // type specific intermediate parameter
                    hz: 0  // frequency to play
                },
                tone: 0,
                phase: 0,  // initial phase at key on
                pitchModulation: {  // pitch modulation information
                    enable: false,  // enable flag
                    base: 0,  // base frequency parameter
                    delayCount: 0,  // delay counter
                    widthCount: 0,  // width counter
                    deltaCount: 0,  // delta counter
                    currentDepth: 0,  // current depth parameter
                    currentHeight: 0,  // current height (+height or -height)
                    currentDiff: 0,  // current offset from base
                    delay: 0,  // delay parameter
                    depth: 0,  // depth parameter
                    width: 0,  // with parameter
                    height: 0,  // height parameter
                    delta: 0  // delta parameter
                },
                ampEnvelope: {  // amplifier envelope information
                    enable: false,  // enable flag
                    id: 0,  // table id
                    wait: 0,  // wait counter
                    state: 0,  // envelope step position
                    count: 0,  // wait count
                    volume: {  // base volume parameter
                        l: 0,  // left volume
                        r: 0  // right volume
                    }
                },
                nt: {
                    enable: false,
                    id: 0,
                    wait: 0,
                    state: 0,
                    count: 0
                }
            };
            for (var n = 0; n < 16; n++) {
                channel[i].localLoop[n] = {
                    offset: 0,  // loop start offset
                    count: 0,  // loop count
                    end: 0  // loop end offset
                };
            }
            channel[i].baseOffset = this._readU32(offset);
            offset += 4;
            channel[i].size = this._readU32(offset);
            offset += 4;
            Log.getLog().info("TSD: ch." + (i + 1) + " offset = " +
                    channel[i].baseOffset + ", size = " + channel[i].size);
        }
        Log.getLog().info(channel);
        this.channel = channel;

        // Parse table information.
        var tableOffset = this._readU32(offset);
        Log.getLog().info("TSD: table offset = " + tableOffset);
        offset = tableOffset;
        var numOfWave = this._readU16(offset);
        Log.getLog().info("TSD: found " + numOfWave + " wave table(s)");
        offset += 2;
        for (i = 0; i < numOfWave; i++) {
            // Wave table data for a SCC-like sound.
            if (32 != this.input[offset + 1]) {
                Log.getLog().error("TSD: invalid WAVE size");
                return false;
            }
            this.device.setWave(this.input[offset],
                    new Int8Array(newInput, offset + 2, 32));
            offset += 2 + 32;
        }
        var numOfTable = this._readU16(offset);
        Log.getLog().info("TSD: found " + numOfTable + " envelope table(s)");
        offset += 2;
        for (i = 0; i < numOfTable; i++) {
            // Table data for envelope.
            var tableSize = this.input[offset + 1];
            this._setTable(this.input[offset],
                    new Int8Array(newInput, offset + 2, tableSize));
            offset += 2 + tableSize;
        }

        // Set timer callbacks
        this.device.setTimerCallback(TsdPlayer._TIMER_AUTOMATION,
                TsdPlayer._DEFAULT_TIMER_COUNT, this, this._performAutomation);
        this.device.setTimerCallback(TsdPlayer._TIMER_SEQUENCER,
                TsdPlayer._DEFAULT_TIMER_COUNT, this, this._performSequencer);
    } catch (e) {
        Log.getLog().error("TSD: " + e);
        return false;
    }
    return true;
};

/**
 * Perform device automation, e.g., sastain, portament, envelope, modulation.
 */
TsdPlayer.prototype._performAutomation = function () {
    for (var i = 0; i < this.header.numOfChannel; i++) {
        var ch = this.channel[i];
        if (!ch.keyOn) {
            // Key off processings.
            if (0 != ch.sustain)
                this._performSustain(ch);
            if (0 != ch.portament)
                this._performPortament(ch);
        }
        // TODO: note envelope

        if (ch.pitchModulation.enable)
            this._performPitchModulation(ch);
        if (ch.ampEnvelope.enable)
            this._performAmpEnvelope(ch);
    }
};

/**
 * Perform sustain.
 * @param ch channel oject to control
 */
TsdPlayer.prototype._performSustain = function (ch) {
    if (ch.ampEnvelope.volume.l > ch.sustain)
        ch.ampEnvelope.volume.l -= ch.sustain;
    else
        ch.ampEnvelope.volume.l = 0;
    if (ch.ampEnvelope.volume.r > ch.sustain)
        ch.ampEnvelope.volume.r -= ch.sustain;
    else
        ch.ampEnvelope.volume.r = 0;
    // Reproduce a bug that sustain could not reflect panpot correctly.
    // Reproduce a bug that sustain could not reflect panpot correctly.
    var pan = ch.pan;
    ch.pan = TsdPlayer._PAN_C;
    this._setVolume(ch, TsdPlayer._CH_L, ch.ampEnvelope.volume.l);
    this._setVolume(ch, TsdPlayer._CH_R, ch.ampEnvelope.volume.r);
    ch.pan = pan;
};

/**
 * Perform portament.
 * @param ch channel object to contol
 */
TsdPlayer.prototype._performPortament = function (ch) {
    var frequency = ch.frequency.hz;
    switch (ch.frequency.type) {
        case TsdPlayer._FREQUENCY_TYPE_NORMAL:
            if (ch.frequency.param + ch.portament < 1)
                ch.frequency.param = 1;
            else if (ch.frequency.param + ch.portament > 0xffff)
                ch.frequency.param = 0xffff;
            else
                ch.frequency.param += ch.portament;
            frequency = ch.frequency.param;
            break;
        case TsdPlayer._FREQUENCY_TYPE_MSX:
            if (ch.frequency.param - ch.portament < 0)
                ch.frequency.param = 0;
            else if ((ch.frequency.param - ch.portament) > 0x0fff)
                ch.frequency.param = 0x0fff;
            else
                ch.frequency.param -= ch.portament;
            frequency = TsdPlayer._PARAMETER_FREQUENCY_TABLE[
                    TsdPlayer._FREQUENCY_TYPE_MSX][ch.frequency.param];
            break;
        case TsdPlayer._FREQUENCY_TYPE_FM:
            if (ch.frequency.param + ch.portament < 0)
                ch.frequency.param = 0;
            else if ((ch.frequency.param + ch.portament) > 0x1fff)
                ch.frequency.param = 0x1fff;
            else
                ch.frequency.param += ch.portament;
            frequency = TsdPlayer._PARAMETER_FREQUENCY_TABLE[
                TsdPlayer._FREQUENCY_TYPE_FM][ch.frequency.param];
            break;
        case TsdPlayer._FREQUENCY_TYPE_GB_SQUARE:
            // TODO: not supported originally.
            break;
    }
    this.device.setModuleFrequency(ch.id, frequency);
};

/**
 * Perform pitch modulation.
 *                __            _ _ _ _ _ _ _ _
 *             __|  |__
 *          __|        |__             depth
 * ________|  :           |__   _ _ _ _ _ _ _ _
 * :       :  :              |__  _ _ heighgt _
 * : delay :  :                 |__
 *         width
 * @param ch channel object to control
 */
TsdPlayer.prototype._performPitchModulation = function (ch) {
    var pm = ch.pitchModulation;
    if (pm.delayCount < pm.delay) {
        // Wait for counting up to delay parameter.
        pm.delayCount++;
        return;
    } else if (pm.delayCount == pm.delay) {
        // Initialize pitch modulation parameters.
        switch (ch.frequency.type) {
            case TsdPlayer._FREQUENCY_TYPE_NORMAL:
                pm.base = ch.frequency.hz;
                break;
            case TsdPlayer._FREQUENCY_TYPE_MSX:
                pm.base = ch.frequency.param;
                break;
            case TsdPlayer._FREQUENCY_TYPE_FM:
                pm.base = ch.frequency.param;
                break;
            case TsdPlayer._FREQUENCY_TYPE_GB_SQUARE:
                // TODO: not supported originally.
                break;
        }
        pm.currentDepth = pm.depth;
        pm.currentHeight = pm.height;
        pm.currentDiff = 0;
        pm.widthCount = 0;
        pm.deltaCount = 0;
        pm.delayCount++;
        return;
    } else {
        // Perform pitch modulation.
        if (++pm.widthCount != pm.width)
            return;
        pm.widthCount = 0;
        pm.currentDiff += pm.currentHeight;
        if ((pm.currentDiff >= pm.currentDepth) ||
                (pm.currentDiff <= -pm.currentDepth)) {
            // Change direction.
            pm.currentHeight = -pm.currentHeight;
            // Modulation depth control.
            // Old implementation was 'pm.currentDepth += pm.delta'
            // I'm not sure when this implementation was changed.
            // TODO: Check revision history.
            pm.deltaCount++;
            if (pm.deltaCount == pm.delta) {
                pm.deltaCount = 0;
                pm.currentDepth++;
            }
        }
        var frequency = ch.frequency.hz;
        var param;
        switch (ch.frequency.type) {
            case TsdPlayer._FREQUENCY_TYPE_NORMAL:
                frequency = pm.base + pm.currentDiff;
                break;
            case TsdPlayer._FREQUENCY_TYPE_MSX:
                param = pm.base + pm.currentDiff;
                if (param < 0)
                    param = 0;
                else if (param > 0x0fff)
                    param = 0x0fff;
                frequency = TsdPlayer._PARAMETER_FREQUENCY_TABLE[
                        TsdPlayer._FREQUENCY_TYPE_MSX][param];
                break;
            case TsdPlayer._FREQUENCY_TYPE_FM:
                param = pm.base + pm.currentDiff;
                if (param < 0)
                    param = 0;
                else if (param > 0x1fff)
                    param = 0x1fff;
                frequency = TsdPlayer._PARAMETER_FREQUENCY_TABLE[
                        TsdPlayer._FREQUENCY_TYPE_FM][param];
                break;
            case TsdPlayer._FREQUENCY_TYPE_GB_SQUARE:
                // TODO: not supported originally.
                break;
        }
        this.device.setModuleFrequency(ch.id, frequency);
    }
};

/**
 * Perform amplifier envelope.
 * @param ch channel object to control
 */
TsdPlayer.prototype._performAmpEnvelope = function (ch) {
    var ae = ch.ampEnvelope;
    if (++ae.count != ae.wait)
        return;
    ae.count = 0;

    var diff = this.table[ae.id][ae.state];
    ae.state++;
    if (ae.state == this.table[ae.id].length)
        ae.state--;

    var volumeL = ae.volume.l + diff;
    var volumeR = ae.volume.r + diff;
    if (0 != (ch.pan & TsdPlayer._PAN_L))
        volumeL = this._clamp(volumeL, 0, 255);
    else
        volumeL = 0;
    if (0 != (ch.pan & TsdPlayer._PAN_R))
        volumeR = this._clamp(volumeR, 0, 255);
    else
        volumeR = 0;

    this._setVolume(ch, TsdPlayer._CH_L, volumeL);
    this._setVolume(ch, TsdPlayer._CH_R, volumeR);
};

/**
 * Perform sequencer.
 */
TsdPlayer.prototype._performSequencer = function () {
    for (var i = 0; i < this.header.numOfChannel; i++) {
        var ch = this.channel[i];
        if (0 == ch.wait)
            continue;
        if (0 != --ch.wait)
            continue;
        for (;;) {
            var cmd = this.input[ch.baseOffset + ch.offset++];
            var dt;
            if (cmd <= TsdPlayer.CMD_LAST_NOTE) {
                // Note on.
                this._noteOn(ch, cmd);
                ch.wait = this.input[ch.baseOffset + ch.offset++];
                if (0xff == ch.wait) {
                    ch.wait = this._readU16(ch.baseOffset + ch.offset);
                    ch.offset += 2;
                }
                if (0 != ch.wait)
                    break;
            } else if (cmd == TsdPlayer.CMD_NOTE_OFF) {
                // Note off.
                this._noteOff(ch);
                ch.wait = this.input[ch.baseOffset + ch.offset++];
                if (0xff == ch.wait) {
                    ch.wait = this._readU16(ch.baseOffset + ch.offset);
                    ch.offset += 2;
                }
                if (0 != ch.wait)
                    break;
            } else if (cmd == TsdPlayer.CMD_VOLUME_MONO) {
                // Set volume by monaural with the panpot setting.
                dt = this.input[ch.baseOffset + ch.offset++];
                if (ch.pan & TsdPlayer._PAN_L)
                    ch.volume.l = dt;
                if (ch.pan & TsdPlayer._PAN_R)
                    ch.volume.r = dt;
            } else if (cmd == TsdPlayer.CMD_SUSTAIN_MODE) {
                // Set sustain setting.
                ch.sustain = this.input[ch.baseOffset + ch.offset++];
            } else if (cmd == TsdPlayer.CMD_DETUNE) {
                // Set detune setting.
                ch.detune = this._readI8(ch.baseOffset + ch.offset);
                ch.offset++;
            } else if (cmd == TsdPlayer.CMD_PORTAMENT) {
                // Set portament setting.
                ch.portament = this._readI8(ch.baseOffset + ch.offset);
                ch.offset++;
                // Pitch modulation is disabled when portament is set.
                ch.pitchModulation.enable = false;
            } else if (cmd == TsdPlayer.CMD_VOLUME_LEFT) {
                ch.offset++;
                Log.getLog().info("TSD: volume left");
                // TODO
            } else if (cmd == TsdPlayer.CMD_VOLUME_RIGHT) {
                ch.offset++;
                Log.getLog().info("TSD: volume right");
                // TODO
            } else if (cmd == TsdPlayer.CMD_PANPOT) {
                ch.pan = this.input[ch.baseOffset + ch.offset++];
            } else if (cmd == TsdPlayer.CMD_RELATIVE_VOLUME_UP) {
                ch.offset++;
                Log.getLog().info("TSD: volume up");
                // TODO
            } else if (cmd == TsdPlayer.CMD_RELATIVE_VOLUME_DOWN) {
                ch.offset++;
                Log.getLog().info("TSD: volume down");
                // TODO
            } else if (cmd == TsdPlayer.CMD_TEMPO) {
                // Set musical tempo.
                dt = this._readU16(ch.baseOffset + ch.offset);
                ch.offset += 2;
                this._setSequencerFineness(dt);
            } else if (cmd == TsdPlayer.CMD_FINENESS) {
                // Set automation speed.
                dt = this._readU16(ch.baseOffset + ch.offset);
                ch.offset += 2;
                this._setAutomationFineness(dt);
            } else if (cmd == TsdPlayer.CMD_KEY_ON_PHASE) {
                ch.offset++;
                Log.getLog().info("TSD: key on phase");
                // TODO
            } else if (cmd == TsdPlayer.CMD_MULTIPLE) {
                ch.offset++;
                Log.getLog().info("TSD: multiple");
                // TODO
            } else if (cmd == TsdPlayer.CMD_PITCH_MODULATION_DELAY) {
                dt = this._readU16(ch.baseOffset + ch.offset);
                ch.offset += 2;
                ch.pitchModulation.delay = dt;
                ch.pitchModulation.enable = 0 != dt;
                // Portament is disabled when pitch modulation is set.
                ch.portament = 0;
            } else if (cmd == TsdPlayer.CMD_PITCH_MODULATION_DEPTH) {
                dt = this.input[ch.baseOffset + ch.offset++];
                ch.pitchModulation.depth = dt;
            } else if (cmd == TsdPlayer.CMD_PITCH_MODULATION_WIDTH) {
                dt = this.input[ch.baseOffset + ch.offset++];
                ch.pitchModulation.width = dt;
            } else if (cmd == TsdPlayer.CMD_PITCH_MODULATION_HEIGHT) {
                dt = this._readI8(ch.baseOffset + ch.offset);
                ch.offset++;
                ch.pitchModulation.height = dt;
            } else if (cmd == TsdPlayer.CMD_PITCH_MODULATION_DELTA) {
                dt = this.input[ch.baseOffset + ch.offset++];
                ch.pitchModulation.delta = dt;
            } else if (cmd == TsdPlayer.CMD_AMP_EMVELOPE) {
                // Set amp emvelope
                dt = this.input[ch.baseOffset + ch.offset++];
                ch.ampEnvelope.id = dt;
                dt = this.input[ch.baseOffset + ch.offset++];
                ch.ampEnvelope.wait = dt;
                ch.ampEnvelope.enable = 0 != dt;
            } else if (cmd == TsdPlayer.CMD_ENDLESS_LOOP_POINT) {
                // Set endless loop point here.
                ch.loop.offset = ch.offset;
            } else if (cmd == TsdPlayer.CMD_LOCAL_LOOP_START) {
                // Set local loop start point here.
                dt = this.input[ch.baseOffset + ch.offset++];
                ch.localLoop[dt].count =
                    this.input[ch.baseOffset + ch.offset++];
                ch.localLoop[dt].offset = ch.offset;
            } else if (cmd == TsdPlayer.CMD_LOCAL_LOOP_BREAK) {
                // Quit local loop if current loop is the last one.
                dt = this.input[ch.baseOffset + ch.offset++];
                if (ch.localLoop[dt].count == 1)
                    ch.offset = ch.localLoop[dt].end;
            } else if (cmd == TsdPlayer.CMD_LOCAL_LOOP_END) {
                // Do local loop unless current loop is the last one.
                dt = this.input[ch.baseOffset + ch.offset++];
                ch.localLoop[dt].end = ch.offset;
                if (0 != --ch.localLoop[dt].count)
                    ch.offset = ch.localLoop[dt].offset;
            } else if (cmd == TsdPlayer.CMD_FREQUENCY_MODE_CHANGE) {
                // Set frequency mode.
                ch.frequency.type = this.input[ch.baseOffset + ch.offset++];
            } else if (cmd == TsdPlayer.CMD_VOLUME_MODE_CHANGE) {
                // Set volume mode.
                ch.volume.type = this.input[ch.baseOffset + ch.offset++];
            } else if (cmd == TsdPlayer.CMD_FM_IN) {
                // Set fm input pipe.
                dt = this.input[ch.baseOffset + ch.offset++];
                this._setFmInPipe(ch, dt >> 4, dt & 0x0f);
            } else if (cmd == TsdPlayer.CMD_FM_OUT) {
                // Set fm output pipe.
                dt = this.input[ch.baseOffset + ch.offset++];
                this._setFmOutPipe(ch, dt >> 4, dt & 0x0f);
            } else if (cmd == TsdPlayer.CMD_VOICE_CHANGE) {
                // Set voice number with fm mode.
                dt = this.input[ch.baseOffset + ch.offset++];
                this._setVoice(ch, dt)
            } else if (cmd == TsdPlayer.CMD_MODULE_CHANGE) {
                // Set module type with frequency mode.
                dt = this.input[ch.baseOffset + ch.offset++];
                this._setModule(ch, dt)
            } else if (cmd == TsdPlayer.CMD_END) {
                if (0 != ch.loop.offset) {
                    // Perform endless loop
                    ch.offset = ch.loop.offset;
                    ch.loop.count++;
                } else {
                    // Stop
                    this._noteOff(ch);
                    this.activeChannel--;
                    break;
                }
            } else {
                Log.getLog().error("TSD: unsupported cmd " + cmd.toString(16));
                Log.getLog().info(this);
                break;
            }
        }
    }
};

/**
 * Perform note on.
 * @param ch channel object to control
 * @param note note number
 */
TsdPlayer.prototype._noteOn = function (ch, note) {
    // Set tone frequency.
    var type = ch.frequency.type;
    var param;
    var hz;
    switch (type) {
        case TsdPlayer._FREQUENCY_TYPE_NORMAL:
            param = ch.detune + TsdPlayer._NOTE_FREQUENCY_TABLE[type][note];
            hz = param;
            break;
        case TsdPlayer._FREQUENCY_TYPE_MSX:
            param = ch.detune + TsdPlayer._NOTE_PARAMETER_TABLE[type][note];
            hz = TsdPlayer._PARAMETER_FREQUENCY_TABLE[type][param];
            break;
        case TsdPlayer._FREQUENCY_TYPE_FM:
            param = ch.detune + note << 6;
            hz = TsdPlayer._PARAMETER_FREQUENCY_TABLE[type][param];
            break;
        case TsdPlayer._FREQUENCY_TYPE_GB_SQUARE:
            param = ch.detune + TsdPlayer._NOTE_FREQUENCY_TABLE[type][note];
            hz = param;
            break;
    }
    this.device.setModuleFrequency(ch.id, hz);
    ch.frequency.note = note;
    ch.frequency.param = param;
    ch.frequency.hz = hz;

    // Set volume
    this._setVolume(ch, TsdPlayer._CH_L, ch.volume.l);
    this._setVolume(ch, TsdPlayer._CH_R, ch.volume.r);

    // Key on
    ch.keyOn = true;
    this.device.setModulePhase(ch.id, ch.phase);

    // Reset sustain, pitch modulation, and amplifier envelope parameters.
    ch.ampEnvelope.volume.l = ch.volume.l;
    ch.ampEnvelope.volume.r = ch.volume.r;
    ch.ampEnvelope.state = 0;
    ch.ampEnvelope.count = 0;
    ch.pitchModulation.delayCount = 0;
};

/**
 * Perform note off.
 * @param ch channel object to control
 */
TsdPlayer.prototype._noteOff = function (ch) {
    if (0 == ch.sustain) {
        // When sustain is disabled,
        if (!ch.ampEnvelope.enable) {
            // and amplifier envelope is also disabled.
            this.device.setModuleVolume(ch.id, TsdPlayer._CH_L, 0);
            this.device.setModuleVolume(ch.id, TsdPlayer._CH_R, 0);
        } else {
            // and amplifier envelope is enabled.
            ch.ampEnvelope.volume.l =
                    this.device.getModuleVolume(ch.id, TsdPlayer._CH_L);
            ch.ampEnvelope.volume.r =
                    this.device.getModuleVolume(ch.id, TsdPlayer._CH_R);
        }
    }
    ch.keyOn = false;
};

/**
 * Set channel base volume in current volume mode with panpot setting.
 * @param ch channel object to control
 * @param lr L/R channel to set
 * @param volume volume to set
 */
TsdPlayer.prototype._setVolume = function (ch, lr, volume) {
    var data = volume;
    if ((TsdPlayer._CH_L == lr) && (0 == (ch.pan & TsdPlayer._PAN_L)))
        data = 0;
    else if ((TsdPlayer._CH_R == lr) && (0 == (ch.pan & TsdPlayer._PAN_R)))
        data = 0;
    else if (TsdPlayer._VOLUME_TYPE_FM == ch.volume.type)
        data = TsdPlayer._FM_VOLUME_TABLE[data];
    this.device.setModuleVolume(ch.id, lr, data);
};

/**
 * Set sequencer timer fineness.
 * @param fineness timer count
 */
TsdPlayer.prototype._setSequencerFineness = function (fineness) {
    this.device.setTimerCallback(
            TsdPlayer._TIMER_SEQUENCER, fineness, this,
            this._performSequencer);
};

/**
 * Set automation timer fineness.
 * @param fineness timer count
 */
TsdPlayer.prototype._setAutomationFineness = function (fineness) {
    this.device.setTimerCallback(
            TsdPlayer._TIMER_AUTOMATION, fineness, this,
            this._performAutomation);
};

/**
 * Set frequency modulation input pipe connection.
 * @see TssChannel.Module.setFmInPipe
 * @param ch channel object to control
 * @param rate input rate
 * @param pipe pipe id
 */
TsdPlayer.prototype._setFmInPipe = function (ch, rate, pipe) {
    var param = rate;
    if (0 != param)
        param = 9 - param;
    this.device.setModuleFmInPipe(ch.id, param, pipe);
};

/**
 * Set frequency modulation output pipe connection.
 * @see TssChannel.Module.setFmOutPipe
 * @param ch channel object to control
 * @param mode connection mode
 * @param pipe pipe id
 */
TsdPlayer.prototype._setFmOutPipe = function (ch, mode, pipe) {
    this.device.setModuleFmOutPipe(ch.id, mode, pipe);
};

/**
 * Set voice of module.
 * @param ch channel object to control
 * @param voice voice id
 */
TsdPlayer.prototype._setVoice = function (ch, voice) {
    this.device.setModuleVoice(ch.id, voice);
    if (TssChannel.Module.TYPE_SIN != this.device.getModuleType(ch.id))
        return;
    // Old style FM pipe setting for compatibility.
    var fmIn = voice >> 4;
    var fmOut = voice & 0x0f;
    if (0 != fmIn)
        this._setFmInPipe(ch, 5, (fmIn % 5) - 1);
    else
        this._setFmInPipe(ch, 0, 0);
    if (0 != fmOut)
        this._setFmOutPipe(ch, 1, (fmOut % 5) - 1);
    else
        this._setFmOutPipe(ch, 0, 0);
};

/**
 * Set module device type.
 * @param ch channel object to control
 * @param module module type with frequency mode
 */
TsdPlayer.prototype._setModule = function (ch, module) {
    this.device.setModuleType(ch.id, module &0x0f);
    if (0 != (module & 0x80))
        ch.frequency.type = module >> 7;
    else
        ch.frequency.type = module >> 4;
};
/**
 * T'SoundSystem for JavaScript
 */

/**
 * TssCompiler prototype
 *
 * This prototype implements TSS compiler which compile TSS source file and
 * generate TSD data file. TsdPlayer prototype can play the TSD data file.
 * @author Takashi Toyoshima <toyoshim@gmail.com>
 *
 * @constructor
 */
function TssCompiler () {
    this.logMmlCompile = false;
    this.source = null;
    this.directives = [];
    this.channels = [];
    this.validWaves = 0;
    this.waves = [];
    this.validTables = 0;
    this.tables = [];
    this.tags = {
        title: null,
        channels: 0,
        fineness: TssCompiler._DEFAULT_FINENESS
    };
    this.modes = {
        hardware: TssCompiler.HARDWARE_MODE_NORMAL,
        octave: TssCompiler.OCTAVE_MODE_NORMAL,
        volumeRelative: TssCompiler.VOLUME_RELATIVE_MODE_NORMAL
    };
    this.channelData = [];
}

TssCompiler.VERSION = 0.93;
TssCompiler.HARDWARE_MODE_NORMAL = 0;
TssCompiler.HARDWARE_MODE_FAMICOM = 1;
TssCompiler.HARDWARE_MODE_GAMEBOY = 2;
TssCompiler.VOLUME_RANGE_MODE_NORMAL = 0;
TssCompiler.VOLUME_RANGE_MODE_UPPER = 1;
TssCompiler.VOLUME_RELATIVE_MODE_NORMAL = 0;
TssCompiler.VOLUME_RELATIVE_MODE_REVERSE = 1;
TssCompiler.OCTAVE_MODE_NORMAL = 0;
TssCompiler.OCTAVE_MODE_REVERSE = 1;
TssCompiler._DEFAULT_FINENESS = 368;
TssCompiler._ALPHABET_COUNT = 'z'.charCodeAt(0) - 'a'.charCodeAt(0) + 1;
TssCompiler._CODE_ESCAPE = '\\'.charCodeAt(0);
TssCompiler._CODE_SHARP = '#'.charCodeAt(0);
TssCompiler._CODE_GT = '>'.charCodeAt(0);
TssCompiler._TONE_TABLE = {
    'c': 0,
    'd': 2,
    'e': 4,
    'f': 5,
    'g': 7,
    'a': 9,
    'b': 11
};
TssCompiler._TRIANGLE_TABLE = [
       0,   16,   32,   48,   64,   80,   96,  112,
     127,  112 ,  96,   80,   64,   48,   32,   16,
       0,  -16,  -32,  -48,  -64,  -80,  -96, -112,
    -128, -112,  -96,  -80,  -64,  -48,  -32,  -16
];

/**
 * CompileError prototype
 *
 * This prototype contains compile error information.
 * @constructor
 * @param line line object
 *      line: line number
 *      data: source of TString
 * @param offset offset in line
 * @param message error message
 */
TssCompiler.CompileError = function (line, offset, message) {
    this.line = line;
    this.offset = offset;
    this.message = message;
};

/**
 * Create string object shows error information.
 */
TssCompiler.CompileError.prototype.toString = function () {
    var n = 0;
    var c;
    var i;
    var data = this.line.data;
    for (i = 0; i <= this.offset; i++) {
        c = data.at(i);
        if ((0 == c) || (TssCompiler._CODE_ESCAPE == c))
            continue;
        n++;
    }
    var hintArray = new Uint8Array(n--);
    for (i = 0; i < n; i++)
        hintArray[i] = 0x20;
    hintArray[i] = '^'.charCodeAt(0);
    var hint = TString.createFromUint8Array(hintArray).toString();
    return "TSS: { line: " + this.line.line + ", offset: " + this.offset +
            " } " + this.message + '\n' + data.toString() + '\n' + hint;
};

/**
 * Convert signed number to unsigned 8-bit integer.
 * @param n signed number
 * @return unsigned 8-bit integer
 */
TssCompiler._toUint8 = function (n) {
    if ((n < -128) || (127 < n))
        throw new RangeError("unsupported range");
    if (n < 0)
        n = 0x100 + n;
    return n & 0xff;
};

/**
 * Get a parameter encslosed by a brace like <foo bar>.
 * @param line source data of line object
 * @param offset start offset
 * @return result object
 *      begin: start offset
 *      end: end offset
 *      parameter: parameter of TString oject if success
 */
TssCompiler._getBracedParameter = function (line, offset) {
    var data = line.data;
    var length = data.byteLength();
    var begin = offset + data.countSpaces(offset);
    if ((begin >= length) || ('<' != data.charAt(begin)))
        return { begin: begin, end: begin, parameter: undefined };
    begin++;
    var n = 0;
    var c = 0;
    for (var i = begin; i < length; i++) {
        c = data.at(i);
        if ((0 == c) || (TssCompiler._CODE_ESCAPE == c))
            continue;
        if (TssCompiler._CODE_GT == c)
            break;
        n++;
    }
    var end = begin + n - 1;
    var param = TString.createFromUint8Array(new Uint8Array(n));
    n = 0;
    for (i = begin; i <= end; i++) {
        c = data.at(i);
        if ((0 == c) || (TssCompiler._CODE_ESCAPE == c))
            continue;
        param.setAt(n++, c);
    }
    return {
        begin: begin - 1,
        end: end + 1,
        parameter: param
    }
};

/**
 * Get a number parameter.
 * @param line source data of line object
 * @param offset start offset
 * @throws TssCompiler.CompileError
 * @return result object
 *      begin: start offset
 *      end: end offset
 *      parameter: parameter of number
 */
TssCompiler._getNumberParameter = function (line, offset) {
    var data = line.data;
    var begin = offset + data.countSpaces(offset);
    var length = data.byteLength();
    if (begin >= length)
        return { begin: begin, end: begin, parameter: undefined };
    var sign = 1;
    if ('-' == data.charAt(begin)) {
        begin++;
        begin += data.countSpaces(begin);
        sign = -1;
    }
    var n = data.numberAt(begin);
    if (n < 0)
        return { begin: begin, end: begin, parameter: undefined };
    var c = 0;
    for (var i = begin + 1; i < length; i++) {
        c = data.at(i);
        if ((0 == c) || (TssCompiler._CODE_ESCAPE == c))
            continue;
        var result = data.numberAt(i);
        if (result < 0)
            return { begin: begin, end: i - 1, parameter: sign * n };
        n = n * 10 + result;
    }
    return { begin: begin, end: i - 1, parameter: sign * n};
};

/**
 * Get a string parameter.
 * @param line source data of line object
 * @param offset start offset
 * @return result object
 *      begin: start offset
 *      end: end offset
 *      parameter: parameter of TString oject if success
 */
TssCompiler._getStringParameter = function (line, offset) {
    var data = line.data;
    var begin = offset + data.countSpaces(offset);
    var length = data.byteLength();
    var n = 0;
    var c = 0;
    for (var i = begin; i < length; i++) {
        c = data.at(i);
        if ((0 == c) || (TssCompiler._CODE_ESCAPE == c))
            continue;
        n++;
    }
    var end = begin + n - 1;
    var param = TString.createFromUint8Array(new Uint8Array(n));
    n = 0;
    for (i = begin; i <= end; i++) {
        c = data.at(i);
        if ((0 == c) || (TssCompiler._CODE_ESCAPE == c))
            continue;
        param.setAt(n++, c);
    }
    return {
        begin: begin,
        end: end,
        parameter: param
    }
};

/**
 * Get a table parameter.
 * @param lines source data array of line object
 * @param offset start offset
 * @return result object
 *      begin: start offset
 *      end: end offset
 *      parameter: parameter
 *          id: table id
 *          table: table array
 */
TssCompiler._getTableParameter = function (_lines, _offset) {
    var work = {
        lines: _lines,
        line: 0,
        offset: _offset
    };
    var table = [];
    var begin = work.offset;
    var directive = work.lines[0].directive;

    // Get ID.
    var n = TssCompiler._getNumberParameter(
            work.lines[work.line], work.offset);
    if (typeof n.parameter == "undefined")
        throw new TssCompiler.CompileError(work.lines[work.line], n.begin,
                "id number not found in #" + directive);
    var id = n.parameter;
    if ((id < 0) || (255 < id))
        throw new TssCompiler.CompileError(work.lines[work.line], n.begin,
                "id " + id + " is out or range 0 to 255 in #" + directive);
    work.offset = n.end + 1;

    // Check comma after ID.
    TssCompiler._checkCharacter(work, ',',
            "',' not found after id number in #" + directive);

    // Check '<'.
    TssCompiler._checkCharacter(work, '<',
            "'<' not found in #" + directive);

    for (;;) {
        var ch = TssCompiler._findNextCharacter(work,
                "incomplete entry in #" + directive);
        if ('(' == ch) {
            // (x,y),n expansion.
            work.offset++;
            var firstNumberNotFound = "number not found after '(' in #" +
                    directive;
            TssCompiler._findNextCharacter(work, firstNumberNotFound);
            n = TssCompiler._getNumberParameter(work.lines[work.line],
                    work.offset);
            if (typeof n.parameter == "undefined")
                throw new TssCompiler.CompileError(work.lines[work.line],
                        n.begin, firstNumberNotFound);
            var x = n.parameter;
            var numberOutOfRange = "number is out of range -128 to 127 in #" +
                    directive;
            if ((x < -128) || (127 < x))
                throw new TssCompiler.CompileError(work.lines[work.line],
                        n.begin, numberOutOfRange);
            work.offset = n.end + 1;

            TssCompiler._checkCharacter(work, ',',
                    "',' not found after the first number after '(' in #" +
                    directive);

            var secondNumberNotFound = "the second number not found after " +
                    "'(' in #" + directive;
            TssCompiler._findNextCharacter(work, secondNumberNotFound);
            n = TssCompiler._getNumberParameter(work.lines[work.line],
                work.offset);
            if (typeof n.parameter == "undefined")
                throw new TssCompiler.CompileError(work.lines[work.line],
                    n.begin, secondNumberNotFound);
            var y = n.parameter;
            if ((y < -128) || (127 < y))
                throw new TssCompiler.CompileError(work.lines[work.line],
                    n.begin, numberOutOfRange);
            work.offset = n.end + 1;

            TssCompiler._checkCharacter(work, ')',
                    "')' not found after the second number in #" + directive);

            TssCompiler._checkCharacter(work, ',',
                    "',' not found after '(x,y)' syntax in #" + directive);

            var lastNumberNotFound = "number not found after '(x,y),' " +
                    "syntax in #" + directive;
            TssCompiler._findNextCharacter(work, lastNumberNotFound);
            n = TssCompiler._getNumberParameter(work.lines[work.line],
                    work.offset);
            if (typeof n.parameter == "undefined")
                throw new TssCompiler.CompileError(work.lines[work.line],
                    n.begin, lastNumberNotFound);
            var count = n.parameter;
            work.offset = n.end + 1;

            var expand = [];
            for (var i = 0; i < count; i++) {
                var element = ~~(x + (y - x) * i / (count - 1));
                expand.push(element);
                table.push(element);
            }

            Log.getLog().info("TSS: expanding (" + x + "," + y + ")," + count +
                    " to " + expand);
        } else {
            // Single element.
            var numberNotFound = "number not found in #" + directive;
            TssCompiler._findNextCharacter(work, numberNotFound);
            n = TssCompiler._getNumberParameter(work.lines[work.line],
                    work.offset);
            if (typeof n.parameter == "undefined")
                throw new TssCompiler.CompileError(work.lines[work.line],
                        n.begin, numberNotFound);
            if ((n.parameter < -128) || (127 < n.parameter))
                throw new TssCompiler.CompileError(work.lines[work.line],
                    n.begin, numberOutOfRange);
            work.offset = n.end + 1;
            table.push(n.parameter);
        }
        var delimiterNotFound = "',' or '>' not found in #" + directive;
        ch = TssCompiler._findNextCharacter(work, delimiterNotFound);
        if (',' == ch) {
            work.offset++;
        } else if ('>' == ch) {
            work.offset++;
            break;
        } else {
            throw new TssCompiler.CompileError(work.lines[work.line],
                    work.offset, delimiterNotFound);
        }
    }
    try {
        TssCompiler._findNextCharacter(work, "");
    } catch (e) {
        Log.getLog().info("TSS: table complete " + table);
        return {
            begin: begin,
            end: work.offset,
            parameter: {
                id: id,
                table: table
            }
        };
    }
    throw new TssCompiler.CompileError(work.lines[work.line],
            work.offset, "unknown data after table in #" + directive);
};

/**
 * Get a character.
 * @param line source data of line object
 * @param offset offset start offset
 * @param character charactet string to find
 * @return -1 if the next non-space character is not comma, otherwise offset
 */
TssCompiler._getCharacter = function (line, offset, character) {
    var data = line.data;
    var position = offset + data.countSpaces(offset);
    if (position >= data.byteLength())
        return -1;
    if (character != data.charAt(position))
        return -1;
    return position;
};

/**
 * Find the next character in plural lines.
 * @param work object which will be updated after the function call
 *      lines an array of line objects
 *      line line number of the array
 *      offset offset in the line
 * @param message error message
 * @return the next character
 * @throws TssCompiler.CompileError if search reach to the end of lines
 */
TssCompiler._findNextCharacter = function (work, message) {
    var length = work.lines.length;
    if (TssCompiler._checkEnd(work.lines[work.line], work.offset) &&
        ((work.line + 1) < length)) {
        work.line++;
        work.offset = 0;
    }
    work.offset += work.lines[work.line].data.countSpaces(work.offset);
    if (work.offset == work.lines[work.line].data.byteLength())
        throw new TssCompiler.CompileError(work.lines[work.line], work.offset,
                message);
    return work.lines[work.line].data.charAt(work.offset);
};

/**
 * Check if the specified character is found.
 * @param work object which will be updated after the function call
 *      lines an array of line objects
 *      line line number of the array
 *      offset offset in the line
 * @param ch character to check
 * @param message error message
 * @throws TssCompiler.CompileError if the specified character is not found
 */
TssCompiler._checkCharacter = function (work, ch, message) {
    TssCompiler._findNextCharacter(work, message);
    var result = TssCompiler._getCharacter(work.lines[work.line], work.offset,
            ch);
    if (result < 0)
        throw new TssCompiler.CompileError(work.lines[work.line], work.offset,
                message);
    work.offset = result + 1;
}

/**
 * Check if the rest part of specified line has no data.
 * @param line line object to be checked
 * @param offset start offset
 */
TssCompiler._checkEnd = function (line, offset) {
    var data = line.data;
    offset += data.countSpaces(offset);
    return offset == data.byteLength();
};

/**
 * Check line.directive is channel directive (e.g. "#A", "#zx") then rewrite
 * line.directive with channel number.
 * @param line line object to check
 */
TssCompiler._checkChannelDirective = function (line) {
    if ((2 < line.directive.length) || (0 == line.directive.length))
        return;
    var n = TString.createFromString(line.directive);
    var channel = 0;
    var offset = 0;
    var index;
    if (2 == n.byteLength()) {
        index = n.alphabetIndex(offset++);
        if (index < 0)
            return;
        channel = index * TssCompiler._ALPHABET_COUNT;
    }
    index = n.alphabetIndex(offset);
    if (index < 0)
        return;
    channel += index;
    line.directive = channel;
};

/**
 * Check line object, parse directive in line.buffer to set line.directive,
 * and retrieve the directive (e.g. "#TITLE") from buffer.
 * @param line line object
 */
TssCompiler._checkDirective = function (line) {
    var data = line.data;
    var length = data.byteLength();
    var c = 0;
    for (var i = 0; i < length; i++) {
        c = data.at(i);
        if (0 == c)
            continue;
        if (TssCompiler._CODE_SHARP == c) {
            data.setAt(i++, 0);
            break;
        }
        line.directive = null;
        return;
    }
    for (var start = i; i < length; i++)
        if (0x20 == data.at(i))
            break;
    // TODO: Currently primitives doesn't allow comments inside.
    // e.g. "#TI{ comments }TLE" doesn't work.
    line.directive = data.slice(start, i).toString();
    for (var offset = start; offset < i; offset++)
        data.setAt(offset, 0);
    TssCompiler._checkChannelDirective(line);
};

/**
 * Set wave table data.
 * @param id id
 * @param wave wave table
 */
TssCompiler.prototype._setWave = function (id, wave) {
    Log.getLog().info("TSC: set wave " + id);
    if (!this.waves[id])
        this.validWaves++;
    this.waves[id] = wave;
};

/**
 * Set enverope table data.
 * @param id id
 * @param table enverope table
 */
TssCompiler.prototype._setTable = function (id, table) {
    Log.getLog().info("TSC: set table " + id + "; size = " + table.length);
    if (!this.tables[id])
        this.validTables++;
    this.tables[id] = table;
};

/**
 * Parse a line with count information, generate line object.
 * @param context parser context containing line and comment information
 * @param offset line start offset
 * @param count line size in bytes
 * @return line object
 *      line: original source line
 *      offset: original source line start offset
 *      count: original source line size in bytes
 *      data: comment stripped TString object
 *      empty: true if this line contains no data, otherwise false
 *      directive: directive (e.g. "TITLE" in string, or "9" in number)
 *      error: error object if parse fails, otherwise null
 *          offset: offset where parse fails
 *          message: reason
 */
TssCompiler.prototype._preprocessLine = function (context, offset, count) {
    var result = {
        line: context.line,
        offset: offset,
        count: count,
        data: null,
        empty: true,
        directive: null,
        continuation: false
    };
    var line = this.source.slice(offset, offset + count);
    result.data = line;
    for (var i = 0; i < count; i++) {
        var c = line.charAt(i);
        if (context.commentNest > 0) {
            // In comment.
            if ('\\' == c)
                line.setAt(i++, 0);
            else if ('{' == c)
                context.commentNest++;
            else if ('}' == c)
                context.commentNest--;
            line.setAt(i, 0);
        } else {
            if ('\\' == c) {
                line.setAt(i++, 0);
                result.empty = false;
            } else if ('{' == c) {
                context.commentNest++;
                line.setAt(i, 0);
            } else if ('}' == c) {
                context.commentNest--;
                line.setAt(i, 0);
                if (context.commentNest < 0)
                    throw new TssCompiler.CompileError(result, i,
                            "'}' appears without '{'");
            } else {
                if ('\t' == c)
                    line.setAt(i, 0x20);
                result.empty = false;
            }
        }
    }
    if (!result.empty)
        TssCompiler._checkDirective(result);
    return result;
};

/**
 * Parse TSS source lines and classify into directive or channels.
 * @throws TssCompiler.CompileError
 */
TssCompiler.prototype._parseLines = function () {
    var context = {
        line: 1,
        commentNest: 0
    };
    var channel = null;
    var length = this.source.byteLength();
    for (var offset = 0; offset < length; context.line++) {
        var count = this.source.countLine(offset);
        var line = this._preprocessLine(context, offset, count);
        if (!line.empty) {
            if (null == line.directive) {
                if (null == channel)
                    throw new TssCompiler.CompileError(line, 0,
                            "invalid line without any directive");
                line.directive = channel;
                line.continuation = true;
            } else {
                channel = line.directive;
            }
            if (typeof line.directive == "number") {
                if (undefined == this.channels[line.directive])
                    this.channels[line.directive] = [];
                this.channels[line.directive].push(line);
            } else {
                if ("END" == line.directive)
                    break;
                this.directives.push(line);
            }
        }
        offset += count;
        offset += this.source.countLineDelimiter(offset);
    }
    Log.getLog().info("TSS: found " + this.directives.length +
            " directive(s)");
    Log.getLog().info("TSS: found " + this.channels.length + " channel(s)");
    for (var i = 0; i < this.channels.length; i++) {
        var n = 0;
        if (undefined != this.channels[i])
            n = this.channels[i].length;
        Log.getLog().info("TSS: channel " + (i + 1) + " has " + n +
                " line(s)");
    }
};

/**
 * Parse directives.
 * @throws TssCompiler.CompileError
 */
TssCompiler.prototype._parseDirectives = function () {
    // TODO: Check mandatory directives.
    for (var i = 0; i < this.directives.length; i++) {
        var directive = this.directives[i].directive;
        var offset = 0;
        var result;
        if ("CHANNEL" == directive) {
            result = TssCompiler._getNumberParameter(this.directives[i], 0);
            if (typeof result.parameter == "undefined")
                throw new TssCompiler.CompileError(this.directives[i],
                        result.begin, "number not found in #CHANNEL");
            this.tags.channels = result.parameter;
            offset = result.end + 1;
            Log.getLog().info("TSS: CHANNEL> " + this.tags.channels);
        } else if ("FINENESS" == directive) {
            result = TssCompiler._getNumberParameter(this.directives[i], 0);
            if (typeof result.parameter == "undefined")
                throw new TssCompiler.CompileError(this.directives[i],
                    result.begin, "number not found in #FINENESS");
            this.tags.fineness = result.parameter;
            offset = result.end + 1;
            Log.getLog().info("TSS: FINENESS> " + this.tags.fineness);
        } else if ("OCTAVE" == directive) {
            result = TssCompiler._getStringParameter(this.directives[i], 0);
            if (!result.parameter)
                throw new TssCompiler.CompileError(this.directives[i],
                        result.begin, "syntax error in #PRAGMA");
            var octave = result.parameter.toString();
            if (octave == "NORMAL")
                this.tags.octaveMode = TssCompiler.OCTAVE_MODE_NORMAL;
            else if (octave == "REVERSE")
                this.tags.octaveMode = TssCompiler.OCTAVE_MODE_REVERSE;
            else
                throw new TssCompiler.CompileError(this.directive[i],
                        result.begin, "invalid argument in #OCTAVE");
            offset = result.end + 1;
        } else if ("PRAGMA" == directive) {
            result = TssCompiler._getStringParameter(this.directives[i], 0);
            if (!result.parameter)
                throw new TssCompiler.CompileError(this.directives[i],
                        result.begin, "syntax error in #PRAGMA");
            var pragma = result.parameter.toString();
            if (pragma == "FAMICOM") {
                this.modes.hardware = TssCompiler.HARDWARE_MODE_FAMICOM;
                this._setWave(0, TssCompiler._TRIANGLE_TABLE);
            } else if (pragma == "GAMEBOY") {
                this.modes.hardware = TssCompiler.HARDWARE_MODE_GAMEBOY;
            } else {
                throw new TssCompiler.CompileError(this.directives[i],
                        result.begin, "unknown pragma parameter " + pragma);
            }
            offset = result.end + 1;
            Log.getLog().info("TSS: PRAGMA> " + pragma);
        } else if ("TABLE" == directive) {
            var lines = [];
            for (;; i++) {
                lines.push(this.directives[i]);
                if ((i + 1) == this.directives.length)
                    break;
                if (!this.directives[i + 1].continuation)
                    break;
            }
            result = TssCompiler._getTableParameter(lines, 0);
            this._setTable(result.parameter.id, result.parameter.table);
            offset = result.end;
        } else if ("TITLE" == directive) {
            result = TssCompiler._getBracedParameter(this.directives[i], 0);
            if (!result.parameter)
                throw new TssCompiler.CompileError(this.directives[i],
                        result.begin, "syntax error in #TITLE");
            this.tags.title = result.parameter;
            offset = result.end + 1;
            Log.getLog().info("TSS: TITLE> " + this.tags.title.toString());
        } else if ("VOLUME" == directive) {
            result = TssCompiler._getStringParameter(this.directives[i], 0);
            if (!result.parameter)
                throw new TssCompiler.CompileError(this.directives[i],
                    result.begin, "syntax error in #VOLUME");
            var volume = result.parameter.toString();
            if (volume == "NORMAL")
                this.tags.octaveMode = TssCompiler.VOLUME_RELATIVE_MODE_NORMAL;
            else if (volume == "REVERSE")
                this.tags.octaveMode =
                        TssCompiler.VOLUME_RELATIVE_MODE_REVERSE;
            else
                throw new TssCompiler.CompileError(this.directive[i],
                        result.begin, "invalid argument in #VOLUME");
            offset = result.end + 1;
        } else if ("WAV" == directive) {
            var lines = [];
            for (;; i++) {
                lines.push(this.directives[i]);
                if ((i + 1) == this.directives.length)
                    break;
                if (!this.directives[i + 1].continuation)
                    break;
            }
            result = TssCompiler._getTableParameter(lines, 0);
            if (32 != result.parameter.table.length)
                throw new TssCompiler.CompileError(this.directive[i],
                        result.begin, "invalid wave table size " +
                        result.parameter.table.length);
            this._setWave(result.parameter.id, result.parameter.table);
            offset = result.end;
        } else {
            throw new TssCompiler.CompileError(this.directives[i], 0,
                    "unknown directive: " + directive);
        }
        if (!TssCompiler._checkEnd(this.directives[i], offset))
            throw new TssCompiler.CompileError(this.directives[i], offset,
                    "syntax error after #" + directive);
    }
};

/**
 * Parse channel data.
 */
TssCompiler.prototype._parseChannels = function () {
    var maxGate = 16;  // TODO: #GATE
    // Syntax information except for note premitives (cdefgabr).
    var notImplemented = function (self, work, command, args) {
        throw new TssCompiler.CompileError(work.lineObject, work.offset,
                "command '" + command + "' not implemented");
    };
    // TODO: Check again if each argument is mandatory.
    var syntax = {
        '$': {  // loop
            args: [],
            callback: function (self, work, command, args) {
                work.data.push(TsdPlayer.CMD_ENDLESS_LOOP_POINT);
            }
        },
        '%': {  // module
            args: [ { def: 0, min: 0, max: 255 } ],
            callback: function (self, work, command, args) {
                if (TssCompiler.HARDWARE_MODE_FAMICOM == work.mode)
                    throw new TssCompiler.CompileError(work.lineObject,
                            work.offset,
                            "'%' is not supported in famicom mode");
                work.data.push(TsdPlayer.CMD_MODULE_CHANGE);
                work.data.push(args[0]);
            }
        },
        '(': {  // volume relative up (down)
            args: [],  // TODO
            callback: notImplemented
        },
        ')': {  // volume relative down (up)
            args: [],  // TODO
            callback: notImplemented
        },
        '/': {  // local loop break
            sequence: ":",
            args: [],
            callback: function (self, work, command, args) {
                if (work.localLoopId == 0)
                    throw new TssCompiler.CompileError(work.lineObject,
                        work.offset, "'/' found without '/:'");
                work.data.push(TsdPlayer.CMD_LOCAL_LOOP_BREAK);
                work.data.push(work.localLoopId - 1);
            }
        },
        '/:': {  // local loop begin
            args: [ { def: 2, min: 2, max: 255 } ],
            callback: function (self, work, command, args) {
                if (work.localLoopId > 15)
                    throw new TssCompiler.CompileError(work.lineObject,
                            work.offset, "local loop is too deep (>16)");
                work.data.push(TsdPlayer.CMD_LOCAL_LOOP_START);
                work.data.push(work.localLoopId++);
                work.data.push(args[0]);
            }
        },
        ':': {  // n/a
            sequence: "/"
        },
        ':/': {  // local loop end
            args: [],
            callback: function (self, work, command, args) {
                if (work.localLoopId == 0)
                    throw new TssCompiler.CompileError(work.lineObject,
                        work.offset, "':/' found without '/:'");
                work.data.push(TsdPlayer.CMD_LOCAL_LOOP_END);
                work.data.push(--work.localLoopId);
            }
        },
        '<': {  // octave up (down)
            args: [],
            callback: function (self, work, command, args) {
                if (TssCompiler.OCTAVE_MODE_NORMAL == work.octaveMode)
                    work.currentOctave++;
                else
                    work.currentOctave--;
            }
        },
        '>': {  // octave down (up)
            args: [],
            callback: function (self, work, command, args) {
                if (TssCompiler.OCTAVE_MODE_NORMAL == work.octaveMode)
                    work.currentOctave--;
                else
                    work.currentOctave++;
            }
        },
        '@': {  // voice
            sequence: "iov",
            args: [ { def: 0, min: 0, max: 255 } ],
            callback: function (self, work, command, args) {
                if (TssCompiler.HARDWARE_MODE_FAMICOM == work.mode) {
                    if (work.lineObject.directive == 2)
                        throw new TssCompiler.CompileError(work.lineObject,
                                work.offset,
                                "'@' is not supported in famicom mode " +
                                        "channel 3");
                    else if ((2 != args[0]) && (4 != args[0]) &&
                            (6 != args[0]) && (7 != args[0]))
                        throw new TssCompiler.CompileError(work.lineObject,
                                work.offset,
                                "voice id " + args[0] +
                                        " is invalid in famicom mode");
                }
                work.data.push(TsdPlayer.CMD_VOICE_CHANGE);
                work.data.push(args[0]);
            }
        },
        '@i': {  // input pipe
            args: [
                { def: 0, min: 0, max: 8 },
                { def: 0, min: 0, max: 3 }
            ],
            callback: function (self, work, command, args) {
                work.data.push(TsdPlayer.CMD_FM_IN);
                work.data.push((args[0] << 4) | args[1]);
            }
        },
        '@o': {  // output pipe
            args: [
                { def: 0, min: 0, max: 2 },
                { def: 0, min: 0, max: 3 }
            ],
            callback: function (self, work, command, args) {
                work.data.push(TsdPlayer.CMD_FM_OUT);
                work.data.push((args[0] << 4) | args[1]);
            }
        },
        '@v': {  // fine volume
            args: [
                { def: 10, min: 0, max: 255 },
                { def: 0, min: 0, max: 255 }
            ],
            callback: function (self, work, command, args) {
                if (1 == args.length) {
                    work.data.push(TsdPlayer.CMD_VOLUME_MONO);
                    work.data.push(args[0]);
                } else {
                    work.data.push(TsdPlayer.CMD_VOLUME_LEFT);
                    work.data.push(args[0]);
                    work.data.push(TsdPlayer.CMD_VOLUME_RIGHT);
                    work.data.push(args[1]);
                }
            }
        },
        ']': {  // loop end
            args: [],
            callback: function (self, work, command, args) {
                if (0 == work.loop.count)
                    throw new TssCompiler.CompileError(work.lineObject,
                            work.offset, "']' found without '['");
                if (--work.loop.count == 0)
                    return;
                work.loop.end.line = work.line;
                work.loop.end.offset = work.offset;
                work.line = work.loop.line;
                work.offset = work.loop.offset;
                work.lineObject =
                        self.channels[work.lineObject.directive][work.line];
            }
        },
        '[': {  // loop start
            args: [ { def: 2, min: 2, max: 65535 } ],
            callback: function (self, work, command, args) {
                work.loop.count = args[0];
                work.loop.line = work.line;
                work.loop.offset = work.offset;
            }
        },
        '_': {  // relative volume up
            args: [],  // TODO
            callback: notImplemented
        },
        '|': {  // loop break
            args: [],
            callback: function (self, work, command, args) {
                if (work.loop.count > 1)
                    return;
                work.line = work.loop.end.line;
                work.offset = work.loop.end.offset;
                work.lineObject =
                        self.channels[work.lineObject.directive][work.line];
            }
        },
        '~': {  // relative volume down
            args: [],  // TODO
            callback: notImplemented
        },
        'k': {  // detune
            args: [ { def: 0, min: -128, max: 127 } ],
            callback: function (self, work, command, args) {
                work.data.push(TsdPlayer.CMD_DETUNE);
                work.data.push(TssCompiler._toUint8(args[0]));
            }
        },
        'l': {  // default note length
            args: [ { def: 4, min: 1, max: 1024 } ],
            callback: function (self, work, command, args) {
                work.defaultLength = args[0];
                work.defaultDot = 0;
                for (;;) {
                    var position = TssCompiler._getCharacter(
                        work.lineObject, work.offset, '.');
                    if (position < 0)
                        break;
                    work.offset = position + 1;
                    work.defaultDot++;
                }
            }
        },
        'm': {  // multiple
            sequence: "p",
            args: [],  // TODO
            callback: notImplemented
        },
        'mp': {  // pitch modulation
            args: [
                { def: undefined, min: 0, max: 65535 },  // delay
                { def: undefined, min: 0, max: 255 },  // depth
                { def: undefined, min: 0, max: 255 },  // width
                { def: undefined, min: -128, max: 127 },  // height
                { def: undefined, min: 0, max: 255 }  // delta
            ],
            callback: function (self, work, command, args) {
                if (typeof args[0] != "undefined") {
                    work.data.push(TsdPlayer.CMD_PITCH_MODULATION_DELAY);
                    work.data.push(args[0] >> 8);
                    work.data.push(args[0]& 0xff);
                }
                if (args.length < 2)
                    return;
                if (typeof args[1] != "undefined") {
                    work.data.push(TsdPlayer.CMD_PITCH_MODULATION_DEPTH);
                    work.data.push(args[1]);
                }
                if (args.length < 3)
                    return;
                if (typeof args[2] != "undefined") {
                    work.data.push(TsdPlayer.CMD_PITCH_MODULATION_WIDTH);
                    work.data.push(args[2]);
                }
                if (args.length < 4)
                    return;
                if (typeof args[3] != "undefined") {
                    work.data.push(TsdPlayer.CMD_PITCH_MODULATION_HEIGHT);
                    work.data.push(TssCompiler._toUint8(args[3]));
                }
                if (args.length < 5)
                    return;
                if (typeof args[4] != "undefined") {
                    work.data.push(TsdPlayer.CMD_PITCH_MODULATION_DELTA);
                    work.data.push(args[4]);
                }
            }
        },
        'n': {  // n/a
            sequence: "ast"
        },
        'na': {  // amp envelope
            args: [
                { def: 0, min: 0, max: 255 },
                { def: 0, min: 0, max: 255 }
            ],
            callback: function (self, work, command, args) {
                work.data.push(TsdPlayer.CMD_AMP_EMVELOPE);
                work.data.push(args[0]);
                work.data.push(args[1]);
            }
        },
        'ns': {  // note emvelope
            args: [],  // TODO
            callback: notImplemented
        },
        'nt': {  // note shift
            args: [],  // TODO
            callback: notImplemented
        },
        'o': {  // octave
            args: [ { def: 4, min: 1, max: 8 } ],
            callback: function (self, work, command, args) {
                work.currentOctave = args[0];
            }
        },
        'p': {  // panpot
            sequence: "h",
            args: [ { def: 0, min: 0, max: 3 } ],
            callback: function (self, work, command, args) {
                work.data.push(TsdPlayer.CMD_PANPOT);
                work.data.push(args[0]);
            }
        },
        'ph': {  // key-on phase
            args: [],  // TODO
            callback: notImplemented
        },
        'q': {  // gate time
            args: [ { def: maxGate, min: 0, max: maxGate } ],
            callback: function (self, work, command, args) {
                work.currentGate = args[0];
            }
        },
        'r': {  // note on/off
            args:[],
            callback: function (self, work, command, args) {
                if ('r' != command) {
                    if ((work.currentOctave < 1) || (8 < work.currentOctave))
                        throw new TssCompiler.CompileError(work.lineObject,
                                work.offset, "current octave is out of range");
                }
                work.offset +=
                    work.lineObject.data.countSpaces(work.offset);
                var fine = 0;
                if (work.offset < work.lineObject.data.byteLength()) {
                    var c = work.lineObject.data.charAt(work.offset);
                    if (('-' == c) || ('+' == c) || ('#' == c)) {
                        work.offset++;
                        if ('-' == c)
                            fine = -1;
                        else
                            fine = 1;
                    }
                }
                var totalCount = 0;
                for (;;) {
                    var result = TssCompiler._getNumberParameter(
                            work.lineObject, work.offset);
                    var length = 0;
                    var dot = 0;
                    if (typeof result.parameter == "undefined") {
                        length = work.defaultLength;
                        dot = work.defaultDot;
                    } else {
                        length = result.parameter;
                        work.offset = result.end + 1;
                    }
                    for (;;) {
                        var position = TssCompiler._getCharacter(
                                work.lineObject, work.offset, '.');
                        if (position < 0)
                            break;
                        work.offset = position + 1;
                        dot++;
                    }
                    if (0 != (work.clock % length))
                        Log.getLog().warn("TSS: time resolution is not " +
                                "enough for length " + length);
                    var count = ~~(work.clock / length);
                    totalCount += count;
                    while (dot-- > 0) {
                        if (0 != (count % 2))
                            throw new TssCompiler.CompileError(work.lineObject,
                                    work.offset, "too many '.' against time" +
                                            " resolution");
                        count /= 2;
                        totalCount += count;
                    }
                    position = TssCompiler._getCharacter(work.lineObject,
                        work.offset, '^');
                    if (position < 0)
                        break;
                    work.offset = position + 1;
                }
                // TODO: Handle '&'.
                var restCount = 0;
                work.count += totalCount;
                if ('r' == command) {
                    work.data.push(TsdPlayer.CMD_NOTE_OFF);
                } else {
                    // TODO: Handle note shift.
                    fine += work.currentOctave * 12 +
                            TssCompiler._TONE_TABLE[command];
                    if (fine < 0) {
                        Log.getLog().warn("TSS: too low tone (clamped)");
                        fine = 0;
                    } else if (fine > 127) {
                        Log.getLog().warn("TSS: too high tone (clamped)");
                        fine = 127;
                    }
                    work.data.push(fine);
                    // TODO: Handle '&'.
                    restCount = totalCount;
                    totalCount = ~~(totalCount * work.currentGate /
                            work.maxGate);
                    restCount -= totalCount;
                }
                if (self.logMmlCompile)
                    Log.getLog().info(totalCount + "," + restCount);
                if (totalCount < 255) {
                    work.data.push(totalCount);
                } else if (totalCount < 65535) {
                    work.data.push(255);
                    work.data.push(totalCount >> 8);
                    work.data.push(totalCount & 0xff);
                } else {
                    throw new TssCompiler.CompileError(work.lineObject,
                            work.offset, "note length is too long");
                }
                if (restCount > 0) {
                    work.data.push(TsdPlayer.CMD_NOTE_OFF)
                    if (restCount < 255) {
                        work.data.push(restCount);
                    } else if (restCount < 65535) {
                        work.data.push(255);
                        work.data.push(restCount >> 8);
                        work.data.push(restCount & 0xff);
                    } else {
                        throw new TssCompiler.CompileError(work.lineObject,
                            work.offset, "rest length is too long");
                    }
                }
            }
        },
        's': {  // sustain
            args: [
                { def: undefined, min: 0, max: 255 },
                { def: undefined, min: -128, max: 127 }
            ],
            callback: function (self, work, command, args) {
                if (typeof args[0] != "undefined") {
                    work.data.push(TsdPlayer.CMD_SUSTAIN_MODE);
                    work.data.push(args[0]);
                }
                if ((2 == args.length) && (typeof args[1] != "undefined")) {
                    work.data.push(TsdPlayer.CMD_PORTAMENT);
                    work.data.push(TssCompiler._toUint8(args[1]));
                }
            }
        },
        't': {  // tempo
            args: [ { def: 120, min: 1, max: 512 } ],
            callback: function (self, work, command, args) {
                var n = ~~(22050 * 4 * 60 / 192 / args[0]);
                work.data.push(TsdPlayer.CMD_TEMPO);
                work.data.push(n >> 8);
                work.data.push(n & 0xff);
            }
        },
        'v': {  // volume
            args: [
                { def: 10, min: 0, max: 15 },
                { def: 0, min: 0, max: 15 }
            ],
            callback: function (self, work, command, args) {
                if ((TsdPlayer.HARDWARE_MODE_GAMEBOY == work.mode) &&
                        (2 == work.lineObject.directive))
                    for (var i = 0; i < args.length; i++)
                        if (args[i] > 3)
                            throw new TssCompiler.CompileError(work.lineObject,
                                    work.offset, "volume must be less than 4" +
                                            " for channel 2 in gameboy mode");
                var base = 0;
                var shift = 3;
                if (TsdPlayer.HARDWARE_MODE_GAMEBOY == work.mode)
                    shift = 0;
                else if (TssCompiler.VOLUME_RANGE_MODE_NORMAL ==
                        work.volumeRangeMode)
                    shift = 4;
                else
                    base = 128;
                if (1 == args.length) {
                    // mono
                    work.currentVolume.l = base + (args[0] << shift);
                    work.data.push(TsdPlayer.CMD_VOLUME_MONO);
                    work.data.push(work.currentVolume.l);
                } else {
                    // stereo
                    work.currentVolume.l = base + (args[0] << shift);
                    work.currentVolume.r = base + (args[1] << shift);
                    work.data.push(TsdPlayer.CMD_VOLUME_LEFT);
                    work.data.push(work.currentVolume.l);
                    work.data.push(TsdPlayer.CMD_VOLUME_RIGHT);
                    work.data.push(work.currentVolume.r);
                }
            }
        },
        'x': {  // volume and pitch mode
            args: [
                { def: undefined, min: 0, max: 17 },
                { def: undefined, min: 0, max: 3 }
            ],
            callback: function (self, work, command, args) {
                if (args[0] != undefined) {
                    if ((args[0] & 0x0f) > 1)
                        throw new TssCompiler.CompileError(work.lineObject,
                                work.offset, "invalid volume mode " +
                                args[0] + " for 'x'");
                    if ((args[0] & 0x10) == 0)
                        work.volumeRangeMode =
                                TssCompiler.VOLUME_RANGE_MODE_NORMAL;
                    else
                        work.volumeRangeMode =
                                TssCompiler.VOLUME_RANGE_MODE_UPPER;
                    work.data.push(TsdPlayer.CMD_VOLUME_MODE_CHANGE);
                    work.data.push(args[0] & 0x0f);
                }
                if (args[1] != undefined) {
                    work.data.push(TsdPlayer.CMD_FREQUENCY_MODE_CHANGE);
                    work.data.push(args[1]);
                }
            }
        }
    };
    for (var ch = 0; ch < this.tags.channels; ch++) {
        var work = {
            offset: 0,
            line: 0,
            lineObject: null,
            clock: 192, // TODO #CLOCK
            maxGate: maxGate,
            mode: this.modes.hardware,
            volumeRangeMode: TssCompiler.VOLUME_RANGE_MODE_NORMAL,
            volumeRelativeMode: this.modes.volumeRelative,
            octaveMode: this.modes.octave,
            currentVolume: { l: 0, r: 0 },
            currentOctave: 4,
            currentGate: maxGate,
            defaultDot: 0,
            defaultLength: 4,
            loop: {
                offset: 0,
                line: 0,
                count: 0,
                end: {
                    offset: 0,
                    line: 0
                }
            },
            localLoopId: 0,
            count: 0,
            data: [],
            dataLength: 0
        };
        if (0 == ch) {
            work.data.push(TsdPlayer.CMD_FINENESS);
            work.data.push(this.tags.fineness >> 8);
            work.data.push(this.tags.fineness & 0xff);
        }
        if (TssCompiler.HARDWARE_MODE_FAMICOM == work.mode) {
            work.data.push(TsdPlayer.CMD_MODULE_CHANGE);
            if (2 != ch)
                work.data.push(1);
            else
                work.data.push(4);
        } else if (TssCompiler.HARDWARE_MODE_GAMEBOY == work.mode) {
            work.data.push(TsdPlayer.CMD_MODULE_CHANGE);
            if (3 == ch)
                work.data.push(15);
            else if (2 == ch)
                work.data.push(14);
            else
                work.data.push(13);
            work.data.push(TsdPlayer.CMD_FREQUENCY_MODE_CHANGE);
            if (2 == ch)
                work.data.push(3);
        }
        for (work.line = 0; work.line < this.channels[ch].length;
                work.line++) {
            work.lineObject = this.channels[ch][work.line];
            for (work.offset = 0;
                    work.offset < work.lineObject.data.byteLength(); ) {
                work.offset += work.lineObject.data.countSpaces(work.offset);
                if (work.offset >= work.lineObject.data.byteLength())
                    break;
                var c = work.lineObject.data.lowerCharAt(work.offset);
                var command = c;
                var args = [];
                if (('a' <= c) && (c <= 'g'))
                    c = 'r';
                if (!syntax[c])
                    throw new TssCompiler.CompileError(work.lineObject,
                        work.offset,
                        "unknown command '" + c + "'");
                work.offset++;
                if (syntax[c].sequence) {
                    work.offset +=
                            work.lineObject.data.countSpaces(work.offset);
                    if (work.offset >= work.lineObject.data.byteLength())
                        break;
                    var next = work.lineObject.data.lowerCharAt(work.offset);
                    if (syntax[c].sequence.indexOf(next) >= 0) {
                        c += next;
                        command = c;
                        work.offset++;
                    }
                }
                if (this.logMmlCompile)
                    Log.getLog().info("command " + command +
                            " with parameters as follows");
                for (var i = 0; i < syntax[c].args.length; i++) {
                    if (0 != i) {
                        var position = TssCompiler._getCharacter(
                                work.lineObject, work.offset, ',');
                        if (position < 0)
                            break;
                        work.offset = position + 1;
                    }
                    var result = TssCompiler._getNumberParameter(
                            work.lineObject, work.offset);
                    if (typeof result.parameter == "undefined") {
                        if ((typeof syntax[c].args[i].def == "undefined") &&
                                (syntax[c].args[i].mandatory))
                            throw new TssCompiler.CompileError(work.lineObject,
                                    work.offset,
                                    "missing argument for '" + c + "'");
                        args.push(syntax[c].args[i].def);
                    } else {
                        args.push(result.parameter);
                        work.offset = result.end + 1;
                    }
                }
                if (this.logMmlCompile)
                    Log.getLog().info(args);
                work.dataLength = work.data.length;
                if (syntax[c].callback)
                    syntax[c].callback(this, work, command, args);
                if (this.logMmlCompile) {
                    var message = "> " + work.dataLength.toString(16) + ": ";
                    for (i = work.dataLength; i < work.data.length; i++) {
                        if (i != work.dataLength)
                            message += ", ";
                        message += work.data[i].toString(16);
                    }
                    Log.getLog().info(message);
                }
                work.dataLength = work.data.length;
            }
        }
        work.data.push(TsdPlayer.CMD_END);
        this.channelData[ch] = work.data;
        Log.getLog().info("TSS: DATA " + (ch + 1) + "> " + work.data.length +
                " Byte(s) / " + work.count + " Tick(s)");
    }
};

/**
 * Generate TSD data.
 */
TssCompiler.prototype._generateTsd = function () {
    // Header size.
    var titleSize = this.tags.title.byteLength();
    if (0 != (titleSize % 2))
        titleSize++;
    var headerSize =
            14 +  // "T'SoundSystem", 0x00
            2 +  // Version.Release
            2 +  // Title length
            titleSize +  // title
            2 +  // number of channels
            8 * this.tags.channels +  // channel headers
            4;  // voice data offset
    var dataSize = headerSize;
    Log.getLog().info("TSS: HEADER SIZE> " + dataSize);

    // Data size.
    var i;
    for (i = 0; i < this.tags.channels; i++)
        dataSize += this.channelData[i].length;
    var voiceOffset = dataSize;

    // Wave data size
    dataSize += 2;  // number of waves
    Log.getLog().info("TSS: WAVE> " + this.validWaves);
    for (i = 0; i < this.waves.length; i++) {
        if (!this.waves[i])
            continue;
        Log.getLog().info("TSS:  " + i + "> " + this.waves[i].length);
        dataSize += 2 + this.waves[i].length;  // id, size, wave
    }

    // Table data size
    dataSize += 2;  // number of tables
    Log.getLog().info("TSS: TABLE> " + this.validTables);
    for (i = 0; i < this.tables.length; i++) {
        if (!this.tables[i])
            continue;
        Log.getLog().info("TSS:  " + i + "> " + this.tables[i].length);
        dataSize += 2 + this.tables[i].length;  // id, size, table
    }

    // Create data.
    var tsd = new Uint8Array(dataSize);
    Log.getLog().info("TSS: TOTAL SIZE> " + dataSize);
    var tsdWriter = TString.createFromUint8Array(tsd);
    // Magic: "T'SoundSystem", 0x00
    var offset = tsdWriter.setASCII(0, "T'SoundSystem");
    // Version.Release
    tsdWriter.setAt(offset++, Math.floor(TssCompiler.VERSION));
    tsdWriter.setAt(offset++, Math.floor(TssCompiler.VERSION * 100) % 100);
    // Title length, UTF-8 string, and padding.
    offset = tsdWriter.setUint16(offset, this.tags.title.byteLength());
    offset = tsdWriter.setTString(offset, this.tags.title);
    if (0 == (this.tags.title.byteLength() % 2))
        offset--;
    // Number of channels.
    offset = tsdWriter.setUint16(offset, this.tags.channels);
    // Channel headers.
    var channelOffset = headerSize;
    for (i = 0; i < this.tags.channels; i++) {
        var channelSize = this.channelData[i].length;
        offset = tsdWriter.setUint32(offset, channelOffset);
        offset = tsdWriter.setUint32(offset, channelSize);
        // Channel data.
        for (var n = 0; n < channelSize; n++)
            tsdWriter.setAt(channelOffset + n, this.channelData[i][n]);
        channelOffset += channelSize;
    }
    // Voice data offset.
    offset = tsdWriter.setUint32(offset, voiceOffset);

    // Wave data
    offset = tsdWriter.setUint16(voiceOffset, this.validWaves);
    for (i = 0; i < this.validWaves; i++) {
        if (!this.waves[i])
            continue;
        tsdWriter.setAt(offset++, i);
        var dataLength = this.waves[i].length;
        tsdWriter.setAt(offset++, dataLength);
        for (var dataOffset = 0; dataOffset < dataLength; dataOffset++)
            tsdWriter.setAt(offset++,
                    TssCompiler._toUint8(this.waves[i][dataOffset]));
    }

    // Table data
    offset = tsdWriter.setUint16(offset, this.validTables);
    for (i = 0; i < this.validTables; i++) {
        if (!this.tables[i])
            continue;
        tsdWriter.setAt(offset++, i);
        dataLength = this.tables[i].length;
        tsdWriter.setAt(offset++, dataLength);
        for (dataOffset = 0; dataOffset < dataLength; dataOffset++)
            tsdWriter.setAt(offset++,
                TssCompiler._toUint8(this.tables[i][dataOffset]));
    }

    return tsd.buffer;
};

/**
 * Compile TSS source internally.
 */
TssCompiler.prototype._compile = function () {
    try {
        this._parseLines();
        this._parseDirectives();
        this._parseChannels();
        return this._generateTsd();
    } catch (e) {
        Log.getLog().error(e.toString());
        return null;
    }
};

/**
 * Compile TSS source data.
 * @param source string or ArrayBuffer object containing TSS source data
 */
TssCompiler.prototype.compile = function (source) {
    if (typeof source == "string")
        this.source = TString.createFromString(source);
    else
        this.source = TString.createFromUint8Array(new Uint8Array(source));
    return this._compile();
};
/**
 * @constructor
 */
window['chime'] = new (function chime() {
  this.looper = new AudioLooper();
  this.master = new MasterChannel();
  this.master.setVolume(1.0);
  this.looper.setChannel(this.master);
  this.player = [];
  this.effects = 1;
  this.effectId = 0;
  this.setupChannel = function (n) {
    this.player[n] = new TsdPlayer();
    this.player[n].device = new TssChannel();
    this.player[n].device.setPlayer(this.player[n]);
    this.master.addChannel(this.player[n].device);
  }
  for (var i = 0; i <= this.effects; ++i) this.setupChannel(i); })(); window['chime']['setMaxEffect'] = function(n) {
  if (window['chime'].effects < n) {
    for (var i = window['chime'].effects + 1; i <= n; ++i) {
      window['chime'].setupChannel(i);
    }
  } else {
    for (var i = n + 1; i <= window['chime'].effects; ++i) {
      window['chime'].master.removeChannel(window['chime'].player[i].device);
      window['chime'].player[i] = null;
    }
  }
  window['chime'].effects = n;
}

window['chime']['maxEffect'] = function() {
  return window['chime'].effects;
}

window['chime']['bgm'] = function(data) {
  return window['chime']['play'](0, data);
}

window['chime']['effect'] = function(data) {
  return window['chime']['play'](-1, data);
}

window['chime']['play'] = function(id, data) {
  if (id > window['chime'].effects)
    return false;
  if (!data) {
    // TODO: Implement stop
  } else if (data.loading) {
    data.willPlay = true;
    data.playerId = id;
  }
  if (id < 0) {
    window['chime'].effectId =
        (window['chime'].effectId + 1) % window['chime'].effects;
    id = window['chime'].effectId + 1;
  }
  window['chime'].player[id].play(data['tsd']);
  return true;
}

/**
 * @constructor
 */
window['chime']['Sound'] = function(data) {
  this.loading = true;
  this.willPlay = false;
  this.playerId = -1;
  this.log = '';
  this.success = false;

  if (typeof data === 'string' && data.indexOf('http') == 0) {
    // URL fetch.
    var xhr = new XMLHttpRequest();
    xhr.owner = this;
    xhr.open('get', data, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function() {
      this.owner.set(this.response);
    }
    xhr.send();
    return;
  }
  if (data.constructor == Array) {
    // MML generation.
    var mml = [
      '#TITLE <>',
      '#CHANNEL ' + data.length
    ];
    var atoz = 'Z'.charCodeAt(0) - 'A'.charCodeAt(0);
    var unit = atoz + 1;
    var maxChannel = unit * unit + atoz;
    if (data.length > maxChannel) {
      this.log('too many channels: ' + data.length);
      return;
    }
    for (var i = 0; i < data.length; ++i) {
      var ch;
      if (i < unit) {
        ch = String.fromCharCode('A'.charCodeAt(0) + i);
      } else {
        var prefix = ~~(i / unit) - 1;
        ch = String.fromCharCode('A'.charCodeAt(0) + prefix) +
            String.fromCharCode('A'.charCodeAt(0) + (i % unit));
      }
      mml.push('#' + ch + ' ' + data[i]);
    }
    this.set(mml.join('\n'));
  }

  // Data.
  this.set(data);
}

window['chime']['Sound'].prototype.set = function(data) {
  this.loading = false;

  if (typeof data === 'string') {
    // Handle data as TSS.
    var compiler = new TssCompiler();
    Log.on();
    this['tsd'] = compiler.compile(data);
    Log.off();
    this.log = Log.flush();
    this.success = this['tsd'] != null;
  } else if (data.constructor == ArrayBuffer) {
    var view = new DataView(data);
    if (view.getUint8(0) == 'T'.charCodeAt(0)) {
      // Handle data as TSD.
      this['tsd'] = data;
      this.success = true;  // TODO: Should be checked.
    } else {
      // Handle data as TSS.
      var compiler = new TssCompiler();
      Log.on();
      this['tsd'] = compiler.compile(data);
      Log.off();
      this.log = Log.flush();
      this.success = this['tsd'] != null;
    }
  } else {
    // TODO: Support other cases.
    return;
  }
  if (this.willPlay)
    window['chime']['play'](this.playerId, this);
}

window['chime']['createSound'] = function(data) {
  return new window['chime']['Sound'](data);
}
