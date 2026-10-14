"use client";

import { QRCodeSVG } from "qrcode.react";
import { QrCode } from "lucide-react";
import { useI18n, interpolate } from "@/lib/i18n/context";

/**
 * Persistent join line on the projector while a tournament runs — the
 * Slido / Kahoot pattern of keeping "join at … with code …" on every
 * screen, so latecomers and players who lost their connection can get
 * (back) in without asking the host.
 */
export function JoinStrip({
  joinHost,
  tournamentCode,
  onShowQr,
}: {
  joinHost: string;
  tournamentCode: string;
  onShowQr: () => void;
}) {
  const { dict } = useI18n();
  return (
    <div className="bg-pb-surface/70 relative z-10 flex items-center justify-center gap-6 border-b border-white/10 px-8 py-2.5 backdrop-blur">
      <p className="flex items-baseline gap-2.5 text-xl text-white/70">
        {dict.stage.joinAt}
        <span className="font-semibold text-white">{joinHost || "…"}</span>
      </p>
      <span className="h-6 w-px bg-white/15" aria-hidden />
      <p className="flex items-baseline gap-2.5 text-xl text-white/70">
        {dict.stage.codeLabel}
        <span className="font-display text-pb-green text-3xl font-black tracking-[0.12em]">
          {tournamentCode}
        </span>
      </p>
      <button
        type="button"
        onClick={onShowQr}
        className="absolute end-6 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-white/55 transition-colors hover:bg-white/10 hover:text-white"
      >
        <QrCode className="size-4" aria-hidden />
        {dict.stage.showQr}
      </button>
    </div>
  );
}

/** Full-screen join card: big QR code, URL and code. Click anywhere to close. */
export function JoinOverlay({
  joinUrl,
  joinHost,
  tournamentCode,
  onClose,
}: {
  joinUrl: string;
  joinHost: string;
  tournamentCode: string;
  onClose: () => void;
}) {
  const { dict } = useI18n();
  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      className="bg-pb-canvas/95 fixed inset-0 z-40 flex cursor-pointer flex-col items-center justify-center gap-8 p-12 text-center backdrop-blur duration-300 animate-in fade-in"
    >
      <h2 className="font-display text-6xl font-black tracking-tight text-white uppercase">
        {dict.stage.rejoinTitle}
      </h2>
      <div className="ring-pb-violet/60 rounded-[40px] bg-white p-7 shadow-[0_0_80px_rgba(123,92,255,0.45)] ring-8">
        {joinUrl ? (
          <QRCodeSVG value={joinUrl} size={340} level="M" marginSize={0} />
        ) : (
          <div className="h-[340px] w-[340px]" />
        )}
      </div>
      <div className="space-y-3">
        <p className="text-2xl text-white/70">
          {dict.stage.joinAt} <span className="font-semibold text-white">{joinHost}</span>
          {" · "}
          {dict.stage.codeLabel}{" "}
          <span className="font-display text-pb-green text-5xl font-black tracking-[0.12em]">
            {tournamentCode}
          </span>
        </p>
        <p className="mx-auto max-w-3xl text-xl text-white/60">
          {interpolate(dict.stage.rejoinText, { url: joinHost })}
        </p>
      </div>
      <p className="text-sm text-white/35">{dict.stage.closeHint}</p>
    </div>
  );
}
