import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("marketing:LeadMagnetForm");

type Intent = "starter_kit" | "bootcamp_waitlist" | "track_waitlist" | string;

export interface LeadMagnetFormProps {
  defaultIntent?: Intent;
  defaultSource?: string;
  bootcampProgramId?: string;
  cohortId?: string;
  defaultTrackLabel?: string;
  compact?: boolean;
  onSuccess?: () => void;
}

export const LeadMagnetForm: React.FC<LeadMagnetFormProps> = ({
  defaultIntent = "starter_kit",
  defaultSource,
  bootcampProgramId,
  cohortId,
  defaultTrackLabel,
  compact = false,
  onSuccess,
}) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [track, setTrack] = useState(defaultTrackLabel || "");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const submitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!email) {
      setError("Please enter an email");
      return;
    }
    setStatus("loading");
    setError(null);

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          bootcampProgramId,
          cohortId,
          trackLabel: track || defaultTrackLabel,
          intent: defaultIntent,
          source: defaultSource,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to submit");
      }

      setStatus("success");
      onSuccess?.();
    } catch (err: any) {
      log.error("Lead capture failed", { err });
      setError(err?.message || "Something went wrong");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="rounded-xl border border-border/60 bg-card/60 p-4 text-center">
        <p className="text-sm text-white font-semibold">You’re in!</p>
        <p className="text-xs text-faded-grey mt-1">
          Check your inbox for the Starter Kit.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submitLead}
      className={`space-y-3 ${compact ? "" : "p-4 rounded-xl border border-border/60 bg-card/60"}`}
    >
      <div className="space-y-2">
        {!compact && <Label className="text-sm">Name</Label>}
        <Input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          className="bg-background/40 border-border/70 text-white"
        />
      </div>

      <div className="space-y-2">
        {!compact && <Label className="text-sm">Email</Label>}
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="bg-background/40 border-border/70 text-white"
        />
      </div>

      {!defaultTrackLabel && !compact && (
        <div className="space-y-2">
          <Label className="text-sm">Which path interests you?</Label>
          <Input
            type="text"
            value={track}
            onChange={(e) => setTrack(e.target.value)}
            placeholder="Beginner, Creator, Developer, etc."
            className="bg-background/40 border-border/70 text-white"
          />
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <Button
        type="submit"
        disabled={status === "loading"}
        className="w-full bg-flame-yellow text-black hover:bg-flame-yellow/90 font-bold"
      >
        {status === "loading" ? "Submitting..." : "Send it to me"}
      </Button>
    </form>
  );
};
