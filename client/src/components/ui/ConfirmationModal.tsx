import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Input } from "./Input";

export interface ConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  message: React.ReactNode;
  /** When set, requires the user to type this exact phrase to enable Confirm. */
  confirmPhrase?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warn";
  loading?: boolean;
}

export function ConfirmationModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmPhrase,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  loading,
}: ConfirmationModalProps) {
  const [typed, setTyped] = useState("");
  const phraseOk = !confirmPhrase || typed.trim() === confirmPhrase;

  const handleConfirm = async () => {
    await onConfirm();
    setTyped("");
  };

  const handleClose = () => {
    setTyped("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      surface="light"
      size="sm"
      title={
        <span className="flex items-center gap-3">
          <span
            className={`w-9 h-9 rounded-full flex items-center justify-center ${tone === "danger" ? "bg-state-danger/15 text-state-danger" : "bg-state-warn/15 text-state-warn"}`}
          >
            <AlertTriangle className="w-4 h-4" />
          </span>
          {title}
        </span>
      }
      footer={
        <>
          <Button
            variant="outline-light"
            onClick={handleClose}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            disabled={!phraseOk}
            loading={loading}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-brand-black/80 leading-relaxed">
        {message}
      </div>
      {confirmPhrase && (
        <div className="mt-5">
          <Input
            label={`Type "${confirmPhrase}" to continue`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmPhrase}
            autoFocus
          />
        </div>
      )}
    </Modal>
  );
}
