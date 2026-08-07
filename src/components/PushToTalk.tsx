"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type State = "idle" | "recording" | "transcribing" | "denied";

/**
 * Hold to speak into the debate.
 *
 * Holding pauses the debate (and its timer) so a long question doesn't eat the
 * one-minute budget; releasing transcribes and hands the text to the next agent.
 */
export function PushToTalk({
  disabled,
  onHoldStart,
  onHoldEnd,
  onTranscript,
}: {
  disabled?: boolean;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onTranscript: (text: string) => void;
}) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => stopTracks, []);

  const startRecording = useCallback(async () => {
    if (disabled || state !== "idle") return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        stopTracks();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });

        // Nothing useful in a tap — skip the API call and resume immediately.
        if (blob.size < 1200) {
          setState("idle");
          onHoldEnd();
          return;
        }

        setState("transcribing");
        try {
          const formData = new FormData();
          formData.append("audio", blob, "interjection.webm");

          const response = await fetch("/api/transcribe", { method: "POST", body: formData });
          const data = await response.json();

          if (!response.ok) throw new Error(data.message ?? "Could not transcribe.");
          onTranscript(data.text as string);
          setMessage(null);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not transcribe.");
        } finally {
          setState("idle");
          onHoldEnd();
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setState("recording");
      setMessage(null);
      onHoldStart();
    } catch {
      setState("denied");
      setMessage("Microphone access denied. Allow it in your browser to speak to the panel.");
    }
  }, [disabled, state, onHoldStart, onHoldEnd, onTranscript]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      recorderRef.current = null;
    }
  }, []);

  // Spacebar mirrors the button, as long as focus isn't in a text field.
  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || isTyping(event.target)) return;
      event.preventDefault();
      void startRecording();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isTyping(event.target)) return;
      event.preventDefault();
      stopRecording();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [startRecording, stopRecording]);

  const label =
    state === "recording"
      ? "Listening — release to send"
      : state === "transcribing"
        ? "Transcribing…"
        : "Hold to speak (or hold Space)";

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled || state === "transcribing"}
        onPointerDown={startRecording}
        onPointerUp={stopRecording}
        onPointerLeave={stopRecording}
        className={`w-full rounded-md px-4 py-3 text-sm font-medium transition select-none ${
          state === "recording"
            ? "bg-red-600 text-white"
            : "border border-black/15 hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10"
        }`}
      >
        {label}
      </button>
      {message && <p className="text-xs text-red-600 dark:text-red-400">{message}</p>}
    </div>
  );
}
