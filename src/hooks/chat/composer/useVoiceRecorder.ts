'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Record one voice note from the microphone. `stop(false)` finishes and
 * hands the file to `onRecorded`; `stop(true)` discards it. Unmounting
 * mid-recording discards and releases the microphone. `elapsed` ticks in
 * whole seconds while recording.
 */
export function useVoiceRecorder(onRecorded: (file: File, durationSeconds: number) => void) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const discardedRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      discardedRecorderRef.current = recorder;
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);
  useEffect(() => {
    if (!recording) return;
    const update = () => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  const stop = (discard = false) => {
    const recorder = recorderRef.current;
    if (recorder?.state !== "recording") return;
    if (discard) discardedRecorderRef.current = recorder;
    recorder.stop();
    setRecording(false);
  };

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (streamRef.current === stream) streamRef.current = null;
      if (recorderRef.current === recorder) recorderRef.current = null;
      if (discardedRecorderRef.current === recorder) {
        discardedRecorderRef.current = null;
        return;
      }
      const durationSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      onRecorded(
        new File(chunks, "voice-" + Date.now() + ".weba", { type: recorder.mimeType || "audio/webm" }),
        durationSeconds,
      );
    };
    streamRef.current = stream;
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setElapsed(0);
    recorder.start();
    setRecording(true);
  };

  return { recording, elapsed, start, stop };
}
