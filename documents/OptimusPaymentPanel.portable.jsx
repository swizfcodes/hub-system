/**
 * OptimusPaymentPanel — portable drop-in for the Orika Living store site.
 *
 * Shows the dedicated Optimus virtual account for an order with a live
 * countdown (the account is amount-bound and time-boxed, default 30 min),
 * and polls the Hub's read-only verify endpoint until the webhook confirms
 * payment server-side. The customer never uploads a receipt.
 *
 * ZERO dependencies beyond React. Inline styles only — drops into any
 * codebase regardless of CSS framework. Adjust the `C` palette to match
 * the store's theme.
 *
 * Usage (after POST /api/store/checkout returns an optimus_pay result):
 *
 *   <OptimusPaymentPanel
 *     accountNumber={res.optimus_virtual_account}
 *     bankName={res.optimus_bank_name}
 *     transactionRef={res.optimus_transaction_ref}
 *     amountKobo={res.amount_kobo}
 *     expiresInMinutes={res.optimus_expires_in_minutes ?? 30}
 *     apiBase="https://app.orikaliving.com"
 *     onConfirmed={(status) => router.push(`/order-confirmed?ref=${res.optimus_transaction_ref}`)}
 *   />
 *
 * The verify endpoint is GET {apiBase}/api/store/optimus/verify?transaction_ref=...
 * It returns { ok: boolean, status: string, order_id } and NEVER fulfils —
 * fulfilment only happens via the bank's server-to-server webhook.
 */

import { useState, useEffect, useRef } from "react";

const C = {
  text: "#111827",
  subtext: "#6b7280",
  faint: "#9ca3af",
  border: "#e5e7eb",
  card: "#f9fafb",
  accent: "#C9A86C",
  accentSoft: "rgba(201,168,108,0.12)",
  danger: "#dc2626",
  dangerSoft: "rgba(220,38,38,0.08)",
  warn: "#d97706",
  warnSoft: "rgba(217,119,6,0.08)",
};

const fmtNaira = (kobo) =>
  "₦" +
  (kobo / 100).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function OptimusPaymentPanel({
  accountNumber,
  bankName = "Optimus Bank",
  transactionRef,
  amountKobo,
  expiresInMinutes = 30,
  apiBase = "",
  pollIntervalMs = 8000,
  onConfirmed,
}) {
  // Deadline fixed at mount — the account was provisioned seconds earlier.
  const deadlineRef = useRef(Date.now() + expiresInMinutes * 60_000);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const remainingMs = Math.max(0, deadlineRef.current - now);
  const expired = remainingMs <= 0;
  const urgent = !expired && remainingMs < 5 * 60_000;
  const mm = String(Math.floor(remainingMs / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, "0");

  // 1-second countdown tick
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll the read-only verify endpoint. Keep polling past expiry — a late
  // transfer may still be honoured by the bank.
  useEffect(() => {
    if (confirmed || !transactionRef) return undefined;
    let stopped = false;
    const t = setInterval(async () => {
      try {
        const r = await fetch(
          `${apiBase}/api/store/optimus/verify?transaction_ref=${encodeURIComponent(transactionRef)}`,
        );
        if (!r.ok) return;
        const data = await r.json();
        if (!stopped && data.ok) {
          setConfirmed(true);
          onConfirmed?.(data.status);
        }
      } catch {
        /* transient network error — next poll will retry */
      }
    }, pollIntervalMs);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [apiBase, transactionRef, pollIntervalMs, confirmed, onConfirmed]);

  function copyAccount() {
    if (!accountNumber || !navigator.clipboard) return;
    navigator.clipboard.writeText(accountNumber).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const box = {
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    padding: 20,
    background: C.card,
  };

  if (confirmed) {
    return (
      <div style={{ ...box, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
        <p style={{ fontWeight: 700, color: C.text, margin: 0 }}>
          Payment confirmed!
        </p>
        <p style={{ fontSize: 13, color: C.subtext, marginTop: 4 }}>
          We received your transfer. Your order is being prepared.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 480 }}>
      {/* Countdown */}
      <div
        style={{
          ...box,
          textAlign: "center",
          background: expired ? C.dangerSoft : urgent ? C.warnSoft : C.card,
          borderColor: expired ? C.danger : urgent ? C.warn : C.border,
        }}
      >
        {expired ? (
          <>
            <p style={{ fontWeight: 700, color: C.danger, margin: 0, fontSize: 14 }}>
              Payment window expired
            </p>
            <p style={{ fontSize: 12, color: C.danger, opacity: 0.85, marginTop: 4 }}>
              This account number may no longer accept transfers. If you
              already sent the money, keep this page open — we're still
              watching for it. Otherwise, please place your order again.
            </p>
          </>
        ) : (
          <>
            <p
              style={{
                fontSize: 11,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: C.subtext,
                margin: 0,
              }}
            >
              Time remaining to transfer
            </p>
            <p
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 40,
                fontWeight: 900,
                fontVariantNumeric: "tabular-nums",
                color: urgent ? C.warn : C.text,
                margin: "4px 0 0",
              }}
            >
              {mm}:{ss}
            </p>
            <p style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>
              This account is reserved for your order for {expiresInMinutes}{" "}
              minutes
            </p>
          </>
        )}
      </div>

      {/* Account details */}
      <div style={box}>
        <p
          style={{
            fontSize: 11,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: C.subtext,
            margin: "0 0 12px",
          }}
        >
          Transfer to this account
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "6px 0",
            borderBottom: `1px solid ${C.border}`,
            fontSize: 14,
          }}
        >
          <span style={{ color: C.subtext }}>Bank</span>
          <span style={{ color: C.text, fontWeight: 600 }}>{bankName}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 12,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: "10px 14px",
            background: "#fff",
          }}
        >
          <div>
            <p style={{ fontSize: 11, color: C.subtext, margin: 0 }}>
              Account number
            </p>
            <p
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 20,
                fontWeight: 800,
                color: C.text,
                margin: 0,
              }}
            >
              {accountNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={copyAccount}
            style={{
              border: "none",
              background: "transparent",
              color: C.accent,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 12,
            background: C.accentSoft,
            border: `1px solid ${C.accent}`,
            borderRadius: 12,
            padding: "10px 14px",
          }}
        >
          <span style={{ fontSize: 12, color: C.accent }}>
            Transfer exactly
          </span>
          <span style={{ fontSize: 20, fontWeight: 900, color: C.accent }}>
            {fmtNaira(amountKobo)}
          </span>
        </div>
      </div>

      {/* Live status */}
      {!expired && (
        <div
          style={{
            ...box,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
          }}
        >
          <span
            style={{
              height: 10,
              width: 10,
              borderRadius: "50%",
              background: C.accent,
              flexShrink: 0,
              animation: "optimusPulse 1.5s ease-in-out infinite",
            }}
          />
          <style>{`@keyframes optimusPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
          <p style={{ fontSize: 13, color: C.subtext, margin: 0 }}>
            Waiting for your transfer… this page updates by itself — no
            receipt upload needed.
          </p>
        </div>
      )}
    </div>
  );
}
