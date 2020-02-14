import {EventBus} from './event-bus.js';
import {ListManager} from './list-manager.js';

class AudioManager {
  
  constructor() {
    if (!AudioManager.instance) {
      AudioManager.instance = this;
    }
    return AudioManager.instance;
  }
  
  get eventBus() {
    if (!this._eventBus) {
      this._eventBus = new EventBus(); 
    }
    return this._eventBus;
  }
  
  get listManager() {
    if (!this._listManager) {
      this._listManager = new ListManager(); 
    }
    return this._listManager;
  }
  
  get audio() {
    return this._audio;
  }
  
  set audio(_audio) {
    this._audio = _audio;
    this.addAudioListeners();
  }
  
  get listenersAdded() {
    return this._listenersAdded || false;
  }
  
  set listenersAdded(bool) {
    this._listenersAdded = bool;
  }
  
  get paused() {
    if (this.audio !== undefined) {
      return this.audio.paused;
    }
    return false;
  }
    
  get shouldNotifyBeforeEnd() {
    return this._shouldNotifyBeforeEnd || false;
  }
  
  set shouldNotifyBeforeEnd(bool) {
    this._shouldNotifyBeforeEnd = bool;
  }
  
  // Boolean if we already fired the fake 'ended' event
  get beforeEndNotified() {
    return this._beforeEndNotified || false;
  }
  
  set beforeEndNotified(bool) {
    this._beforeEndNotified = bool;
  }
  
  get loadTimeout() {
    return this._loadTimeout || 15000; 
  } 
  
  set loadTimeout(num) {
    this._loadTimeout = num; 
  }
  
  get progressEvents() {
    return this._progressEvents || true; 
  } 
  
  set progressEvents(bool) {
    this._progressEvents = bool; 
  }
  
  get minuteEvents() {
    return this._minuteEvents || true; 
  } 
  
  set minuteEvents(bool) {
    this._minuteEvents = bool; 
  }
  
  get heartbeat() {
    return this._heartbeat || 0; 
  } 
  
  set heartbeat(n) {
    this._heartbeat = n; 
  }
  
  get lastHeartBeat() {
    return this._lastHeartBeat || 0;
  }
  
  set lastHeartBeat(secs) {
    this._lastHeartBeat = secs;
  }
  
  get isStopped() {
    if (this._isStopped !== undefined) {
      return this._isStopped;
    }
    return true;
  }
  
  set isStopped(bool) {
    this._isStopped = bool;
  }
  
  get validatePlayFunction() {
    return this._validatePlayFunction;
  }
  
  set validatePlayFunction(fn) {
    this._validatePlayFunction = fn;
  }
  
  get progressRemainder() {
    return this._progressRemainder || 0;
  }
  
  set progressRemainder(n) {
    this._progressRemainder = n;
  }
  
  // todo do we need removeEventListeners?
  addAudioListeners() {
    if (this.audio && this.listenersAdded === false) {
      this.audio.addEventListener('canplay', this.audioOnCanPlay.bind(this));
      this.audio.addEventListener('error', this.audioOnError.bind(this));
      this.audio.addEventListener('play', this.audioOnPlay.bind(this));
      this.audio.addEventListener('pause', this.audioOnPause.bind(this));
      if (this.shouldNotifyBeforeEnd === true || this.progressEvents === true 
        || this.minuteEvents === true || this.heartbeat > 0) {
        this.audio.addEventListener('timeupdate', this.timeUpdate.bind(this));
      }
      if (this.shouldNotifyBeforeEnd === false) {
        this.audio.addEventListener('ended', this.next.bind(this));
      }
      this.audio.addEventListener('remoteprevious', this.previous.bind(this));
      this.audio.addEventListener('remotenext', this.next.bind(this));
    }
    try {
        navigator.mediaSession.setActionHandler('play', this.resume.bind(this));
        navigator.mediaSession.setActionHandler('pause', this.pause.bind(this));
        navigator.mediaSession.setActionHandler('previoustrack', this.previous.bind(this));
        navigator.mediaSession.setActionHandler('nexttrack', this.next.bind(this));
      } catch (err) {}
  }
  
  //todo why do "playing" here vs. "canplay"?
  audioOnCanPlay() {
    if (this.canPlayCalled === false) {
      this.triggerEvent('trackStart');
    }
    this.canPlayCalled = true;
    this.audio.play();
    this.triggerEvent('playing');
  }
  
  // Listener on audio timeupdate
  // Handles shouldNotifyBeforeEnd, progressEvents, minuteEvents and heartbeat
  timeUpdate() {
    if (this.shouldNotifyBeforeEnd === true 
      && this.audio.duration > 0 
      && this.audio.duration - this.audio.currentTime < .5
      && this.beforeEndNotified === false
    ){
      this.beforeEndNotified = true;
      this.next({'type': 'ended'});
    }
    if (this.progressEvents === true){
      this.progressPercentage = Math.floor((this.audio.currentTime / this.audio.duration) * 100);
      let progressRemainder = this.progressPercentage % 5;
      if (progressRemainder === 0 && progressRemainder !== this.progressRemainder) {
        this.triggerEvent('progress');
      }
      this.progressRemainder = progressRemainder;
    }
    if (this.minuteEvents === true){
      this.minuteTimer = Math.floor(this.audio.currentTime / 60);
      let minuteRemainder = Math.floor(this.audio.currentTime % 60);
      if (minuteRemainder === 0 && minuteRemainder !== this.minuteRemainder) {
        if (this.minuteTimer !== 0) {
          this.triggerEvent('minutes');
        }
      }
      this.minuteRemainder = minuteRemainder;
    }
    if (this.heartbeat > 0) {
      let now = new Date();
      let secs = Math.floor(now.getTime() / 1000);
      if (this.lastHeartBeat === 0) {
        this.lastHeartBeat = secs;
      }
      if (secs - this.lastHeartBeat > this.heartbeat) {
        this.lastHeartBeat = secs;
        this.triggerEvent('heartbeat');
      }
    }
  }
  
  // Trigger play event when audio play is triggered adding some useful data
  audioOnPlay(e) {
    this.triggerEvent('play');
  }
  
  // Trigger pause event when audio pause is triggered adding some useful data
  audioOnPause(e) {
    this.triggerEvent('pause');
  }
  
  // Fires 'error' event song cannot load or has timed out 
  // Then calls next
  audioOnError() {
    clearTimeout(this.loadTimeoutFn);
    this.triggerEvent('error');
    this.next({'type': 'ended'});
  }
  
  // play a song at a given index
  async play(n) {
    this.canPlayCalled = false;
    const proposedSong = this.listManager.list[n];
    if (proposedSong) {
      this.eventBus.trigger('preloading', {'song': proposedSong});
      if (this.validatePlayFunction) {
        try {
          const song = await this.validatePlayFunction(proposedSong);
          this._play(song, n);
        } catch (err) {
          console.error(err);
        }      
      } else{
          this._play(proposedSong, n);
      }
    } else {
      throw new RangeError(
        `Index out of bounds. 
        Got: ${n}. List length: ${this.listManager.length}
      `);
    }
  }
  
  
  // play the song
  _play(song, n) {
    clearTimeout(this.loadTimeoutFn);
    this.isStopped = false;
    this.beforeEndNotified = false;
    this.progressPercentage = 0;
    this.minuteTimer = 0;
    this.listManager.position = n;
    this.audio.src = song.url;
    this.audio.load();
    this.triggerEvent('loading');
    if (this.loadTimeout !== -1) {
      this.loadTimeoutFn = setTimeout(this.timeoutLoading.bind(this), this.loadTimeout);
    }
  }
  
  // This is called when loadTimeout is reached
  // If song has not started, next is called
  timeoutLoading() {
    if (this.canPlayCalled === false) {
      this.audioOnError();
    }
  }
  
  // This will toggle paused state of audio. 
  // If stopped, will start playing first song
  togglePlay() {
    if (this.isStopped === true) {
      this.play(this.listManager.position);
    } else {
      if (this.audio.paused) {
        this.audio.play();
      } else {
        this.audio.pause();
      }
    }
    return this.audio.paused;
  }
  
  // This will pause the current audio
  pause() {
    this.audio.pause();
  }
  
  // This will resume the current audio
  resume() {
    this.audio.play();
  }
  
  // Return current audio properties plus some useful data
  get audioProperties() {
    return {
      'paused': this.audio.paused,
      'isStopped': this.isStopped,
      'currentTime': this.audio.currentTime,
      'duration': this.audio.duration,
      'src': this.audio.src,
      'volume': this.audio.volume
    }
  }
  
  // Seek audio by percentage of song
  // Percentage range = 0-1
  seek(percentage) {
    if (!isNaN(this.audio.duration)){
      this.audio.currentTime = Math.floor(percentage * this.audio.duration);
    }
  }
  
  // This is called to skip to the next song in the list
  // Called automatically when a song ends
  // If there are no more songs in the list, calles stop
  //todo - pass in forceStop to override userCanStop
  next(e) {
    // not user initiated
    if (e && e.type === 'ended') {
      if (this.listManager.position < this.listManager.length - 1 && this.listManager.autoNext === true) {
        this._next();
      } else {
        this.stop();
      } 
    } else {
      // user initiated
      if (this.listManager.position < this.listManager.length - 1) {
        this._next();
      } else {
        if (this.userCanStop === true) {
          this.stop();
        } 
      }
    }
  }
  
  // actually skip to the next song
  _next(e) {
    this.listManager.position = this.listManager.position + 1;
    this.play(this.listManager.position);
    this.triggerEvent('nextTrack');
  }
  
  // This is called to go to the previous song in the list
  // If smart_previous is true, it will go back to current song
  // when it is over 10 seconds in. Or else it will go to previous song
  previous() {
    if (this.listManager.smartPrevious === true) {
      if (this.audio.currentTime > 10) {
        this.audio.currentTime = 0;
      } else if (this.listManager.position > 0) {
        this._previous();
      }
    } else if (this.listManager.position > 0) {
      this._previous();
    }
  }
  
  // actually go to the previous song
  _previous() {
    this.listManager.position = this.listManager.position - 1;
    this.play(this.listManager.position);
    this.triggerEvent('previousTrack');
  }
  
  // This is called when we reach the end of the list
  // Reset position
  stop() {
    this.isStopped = true;
    this.listManager.position = 0;
    this.eventBus.trigger('stop', {
      'audio': this.audioProperties
    });
  }
  
  triggerEvent(type) {
    this.eventBus.trigger(type, {
      'song': this.listManager.song,
      'position': this.listManager.position,
      'audio': this.audioProperties,
      'progress': this.progressPercentage,
      'minute': this.minuteTimer
    });
  }

  
}

export {AudioManager};

/**
 * @event PlayQueue~preloading
 * @description Fires when there an attempt to play a new song.
 * @type {object}
 * @property {PlayQueue~Song} song - The attempted song.
 */
 
 /**
 * @event PlayQueue~loading
 * @description Fires when a new song is loading.
 * @type {object}
 * @property {PlayQueue~Song} song - The loading song.
 */
 
/**
 * @event PlayQueue~play
 * @description Fires when a song resumes.
 * @type {object}
 * @property {PlayQueue~Song} song - The playing song.
 * @property {number} position - Current position.
 * @property {PlayQueue~audioProperties} audio - various audio properties.
 */
 
/**
 * @event PlayQueue~playing
 * @description Fires when a new track starts playing, when recovering from being stalled or after it was seeked.
 * @type {object}
 * @property {PlayQueue~Song} song - The playing song.
 * @property {number} position - Current position.
 * @property {PlayQueue~audioProperties} audio - various audio properties.
 */
 
/**
 * @event PlayQueue~pause
 * @description Fires when a song pauses.
 * @type {object}
 * @property {PlayQueue~Song} song - The playing song.
 * @property {number} position - Current position.
 * @property {PlayQueue~audioProperties} audio - various audio properties.
 */
 
/**
 * @event PlayQueue~error
 * @description Fires when a song fails to load.
 * @type {object}
 * @property {PlayQueue~Song} song - The playing song.
 * @property {number} position - Current position.
 * @property {PlayQueue~audioProperties} audio - various audio properties.
 */
 
/**
 * @event PlayQueue~progressEvents
 * @description Fires every 5% progress of a song
 * @type {object}
 * @property {PlayQueue~Song} song - The playing song.
 * @property {number} position - Current position.
 * @property {PlayQueue~audioProperties} audio - various audio properties.
 */
 
/**
 * @event PlayQueue~minuteEvents
 * @description Fires every min of a song
 * @type {object}
 * @property {PlayQueue~Song} song - The playing song.
 * @property {number} position - Current position.
 * @property {PlayQueue~audioProperties} audio - various audio properties.
 */
 
/**
 * @event PlayQueue~nextTrack
 * @description Fires when the next method is called. 
 * @type {object}
 * @property {PlayQueue~Song} song - The playing song.
 * @property {number} position - Current position.
 * @property {PlayQueue~audioProperties} audio - various audio properties.
 */
 
/**
 * @event PlayQueue~previousTrack
 * @description Fires when the previous method is called. 
 * @type {object}
 * @property {PlayQueue~Song} song - The playing song.
 * @property {number} position - Current position.
 * @property {PlayQueue~audioProperties} audio - various audio properties.
 */
 
 /**
 * @event PlayQueue~stop
 * @description Fires when the last song in the list ends. 
 * @type {object}
 * @property {PlayQueue~Song} song - The playing song.
 * @property {number} position - Current position.
 * @property {PlayQueue~audioProperties} audio - various audio properties.
 */
 
  /**
 * @event PlayQueue~trackStart
 * @description Fires when a new track begins 
 * @type {object}
 * @property {PlayQueue~Song} song - The playing song.
 * @property {number} position - Current position.
 * @property {PlayQueue~audioProperties} audio - various audio properties.
 */
 
 // todo - create a state object with song, audio, isStopped, position, shuffle, etc