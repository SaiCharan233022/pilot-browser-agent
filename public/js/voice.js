/**
 * Pilot Voice & Speech Recognition / Synthesis Layer
 * Provides microphone speech-to-text input and natural text-to-speech voice output.
 */

class VoiceController {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.ttsEnabled = true;
    this.onResultCallback = null;
    this.onStatusCallback = null;
    this.initRecognition();
  }

  initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('⚠️ Web Speech Recognition is not supported in this browser.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isListening = true;
      this.onStatusCallback?.('listening');
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const text = finalTranscript || interimTranscript;
      if (text && this.onResultCallback) {
        this.onResultCallback(text, !!finalTranscript);
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      this.isListening = false;
      this.onStatusCallback?.('idle');
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.onStatusCallback?.('idle');
    };
  }

  toggleListening(onResult, onStatus) {
    this.onResultCallback = onResult;
    this.onStatusCallback = onStatus;

    if (!this.recognition) {
      alert('Speech Recognition is not available in your browser.');
      return;
    }

    if (this.isListening) {
      this.recognition.stop();
    } else {
      try {
        this.recognition.start();
      } catch (err) {
        console.warn('Could not start recognition:', err);
      }
    }
  }

  speak(text) {
    if (!this.ttsEnabled || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/```[\s\S]*?```/g, 'Code block output.').replace(/[#*`_~]/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanText.slice(0, 350));
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {}
  }

  toggleTTS() {
    this.ttsEnabled = !this.ttsEnabled;
    if (!this.ttsEnabled && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    return this.ttsEnabled;
  }
}

export const voice = new VoiceController();
