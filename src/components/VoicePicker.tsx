"use client";

import { useEffect, useRef, useState } from "react";
import type { VoiceOption } from "@/app/api/voices/route";

let voicesPromise: Promise<VoiceOption[]> | null = null;

/** Fetch once per page load and share across every picker instance. */
function loadVoices(): Promise<VoiceOption[]> {
  if (!voicesPromise) {
    voicesPromise = fetch("/api/voices")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Could not load voices.");
        return data.voices as VoiceOption[];
      })
      .catch((error) => {
        voicesPromise = null; // allow a retry on the next render
        throw error;
      });
  }
  return voicesPromise;
}

export function VoicePicker({
  value,
  onChange,
  takenVoiceIds,
}: {
  value: string;
  onChange: (voiceId: string) => void;
  /** Voices already assigned to other agents — two agents sharing one is unlistenable. */
  takenVoiceIds: string[];
}) {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    loadVoices()
      .then((loaded) => active && setVoices(loaded))
      .catch((error: Error) => active && setLoadError(error.message));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const preview = async () => {
    if (!value || previewing) return;
    setPreviewing(true);
    try {
      const response = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: value }),
      });
      if (!response.ok) throw new Error("Preview failed.");

      const blob = await response.blob();
      audioRef.current?.pause();
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => setPreviewing(false);
      await audio.play();
    } catch {
      setPreviewing(false);
    }
  };

  if (loadError) {
    return <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>;
  }

  return (
    <div className="flex gap-2">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="flex-1 rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
      >
        <option value="">Choose a voice…</option>
        {voices.map((voice) => {
          const taken = takenVoiceIds.includes(voice.voiceId) && voice.voiceId !== value;
          return (
            <option key={voice.voiceId} value={voice.voiceId} disabled={taken}>
              {voice.name}
              {voice.description ? ` — ${voice.description}` : ""}
              {taken ? " (taken)" : ""}
            </option>
          );
        })}
      </select>

      <button
        type="button"
        onClick={preview}
        disabled={!value || previewing}
        className="rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/20"
      >
        {previewing ? "Playing…" : "Preview"}
      </button>
    </div>
  );
}
