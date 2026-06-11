import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LogOut,
  KeyRound,
  Camera,
  User,
  ChevronUp,
  X,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuthStore } from "@stores/useAuthStore";
import { changePassword, storeUser } from "@services/auth";
import { uploadAvatar } from "@services/uploads";
import { initialsOf } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";

interface Props {
  collapsed: boolean;
}

export function AccountMenu({ collapsed }: Props) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const signOut = useAuthStore((s) => s.signOut);
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { url } = await uploadAvatar(file);
      // Update local user state with new avatar
      if (user) {
        const updated = { ...user, avatar_url: url };
        setUser(updated);
        storeUser(updated);
      }
      showToast.success("Profile photo updated");
      setOpen(false);
    } catch (err) {
      showToast.error("Upload failed", errMsg(err));
    }
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  return (
    <div ref={menuRef} className="relative">
      {/* Avatar trigger */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-3 px-2 py-2 rounded-lg w-full hover:bg-brand-graphite/40 transition-colors",
          collapsed && "justify-center",
        )}
      >
        <div className="w-9 h-9 rounded-full bg-brand-accent text-brand-black font-bold flex items-center justify-center text-xs shrink-0 overflow-hidden">
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            initialsOf(user?.display_name || user?.email || "User")
          )}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left leading-tight">
              <div className="text-sm font-medium text-brand-cream truncate">
                {user?.display_name || user?.email || "Account"}
              </div>
              <div className="text-[0.65rem] text-brand-smoke">
                {user?.email || "Signed in"}
              </div>
            </div>
            <ChevronUp
              className={cn(
                "w-3.5 h-3.5 text-brand-smoke transition-transform shrink-0",
                !open && "rotate-180",
              )}
            />
          </>
        )}
      </button>

      {/* Popover menu */}
      {open && (
        <div
          className={cn(
            "absolute bottom-full mb-2 rounded-xl border border-brand-graphite bg-brand-black shadow-2xl overflow-hidden z-50",
            collapsed ? "left-0 w-56" : "left-0 right-0",
          )}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-brand-graphite/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-accent text-brand-black font-bold flex items-center justify-center text-sm overflow-hidden shrink-0">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  initialsOf(user?.display_name || user?.email || "U")
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-brand-cream truncate">
                  {user?.display_name || "Account"}
                </p>
                <p className="text-[0.6rem] text-brand-smoke truncate">
                  {user?.email}
                </p>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <MenuItem
              icon={<Camera className="w-3.5 h-3.5" />}
              label="Change photo"
              onClick={() => fileRef.current?.click()}
            />
            <MenuItem
              icon={<KeyRound className="w-3.5 h-3.5" />}
              label="Change password"
              onClick={() => {
                setOpen(false);
                setShowPwModal(true);
              }}
            />
            <MenuItem
              icon={<User className="w-3.5 h-3.5" />}
              label="My profile"
              onClick={() => {
                setOpen(false);
                navigate("/contacts?tab=staff");
              }}
            />
            <div className="border-t border-brand-graphite/50 my-1" />
            <MenuItem
              icon={<LogOut className="w-3.5 h-3.5" />}
              label="Sign out"
              danger
              onClick={signOut}
            />
          </div>
        </div>
      )}

      {/* Hidden file input for avatar */}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      {/* Change password modal */}
      {showPwModal && (
        <ChangePasswordModal onClose={() => setShowPwModal(false)} />
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
        danger
          ? "text-state-danger hover:bg-state-danger/10"
          : "text-brand-cream hover:bg-brand-graphite/40",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const mismatch = confirm.length > 0 && newPw !== confirm;
  const tooShort = newPw.length > 0 && newPw.length < 12;
  const canSubmit = current && newPw.length >= 12 && newPw === confirm && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      await changePassword(current, newPw);
      showToast.success("Password changed", "You may need to sign in again on other devices.");
      onClose();
    } catch (err) {
      showToast.error("Failed", errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/70 backdrop-blur-sm animate-fade-in">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md mx-4 bg-brand-charcoal border border-brand-graphite rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-brand-graphite/50">
          <h2 className="font-display text-xl text-brand-cream">
            Change password
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-brand-smoke hover:text-brand-cream transition-colors rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Current password */}
          <div>
            <label className="block text-[0.7rem] tracking-widest uppercase text-brand-smoke mb-1.5 ml-0.5">
              Current password
            </label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-brand-graphite bg-brand-black text-brand-cream text-sm placeholder-brand-smoke/40 focus:outline-none focus:ring-2 focus:ring-brand-accent/40 pr-10"
                placeholder="Enter current password"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-smoke hover:text-brand-cream"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div>
            <label className="block text-[0.7rem] tracking-widest uppercase text-brand-smoke mb-1.5 ml-0.5">
              New password
            </label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-brand-graphite bg-brand-black text-brand-cream text-sm placeholder-brand-smoke/40 focus:outline-none focus:ring-2 focus:ring-brand-accent/40 pr-10"
                placeholder="Minimum 12 characters"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-smoke hover:text-brand-cream"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {tooShort && (
              <p className="text-xs text-state-danger mt-1 ml-0.5">
                Must be at least 12 characters
              </p>
            )}
          </div>

          {/* Confirm */}
          <div>
            <label className="block text-[0.7rem] tracking-widest uppercase text-brand-smoke mb-1.5 ml-0.5">
              Confirm new password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-brand-graphite bg-brand-black text-brand-cream text-sm placeholder-brand-smoke/40 focus:outline-none focus:ring-2 focus:ring-brand-accent/40"
              placeholder="Re-enter new password"
            />
            {mismatch && (
              <p className="text-xs text-state-danger mt-1 ml-0.5">
                Passwords do not match
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-brand-graphite/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-brand-smoke hover:text-brand-cream transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              "px-5 py-2 rounded-xl text-sm font-semibold transition-all",
              canSubmit
                ? "bg-brand-accent text-brand-black hover:brightness-110"
                : "bg-brand-graphite text-brand-smoke cursor-not-allowed",
            )}
          >
            {loading ? "Changing…" : "Change password"}
          </button>
        </div>
      </form>
    </div>
  );
}
