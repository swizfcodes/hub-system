/**
 * GroupInfoModal — WhatsApp-style group settings: rename, description,
 * member list with add / remove / role changes, leave group.
 * Non-admins get a read-only view plus "Leave group".
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Crown, LogOut, Trash2, UserPlus } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import {
  updateChannel,
  addChannelMember,
  removeChannelMember,
  changeMemberRole,
} from "@services/messaging";
import { StaffSearchCombobox } from "./StaffSearchCombobox";
import type { StaffOption } from "./StaffSearchCombobox";
import {
  getAvatarColour,
  getInitials,
} from "@lib/constants/messagingConstants";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { Channel } from "@typedefs/messaging";

interface Props {
  channel: Channel | null;
  open: boolean;
  onClose: () => void;
  userId?: string;
  /** Called after the user leaves the group. */
  onLeft?: () => void;
}

export function GroupInfoModal({
  channel,
  open,
  onClose,
  userId,
  onLeft,
}: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [newMembers, setNewMembers] = useState<StaffOption[]>([]);

  const channelId = channel?.channel_id;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["channels"] });
    qc.invalidateQueries({ queryKey: ["channel", channelId] });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      updateChannel(channelId as string, {
        name: name ?? undefined,
        description: description ?? undefined,
      }),
    onSuccess: () => {
      showToast.success("Group updated");
      refresh();
    },
    onError: (e) => showToast.error("Could not update group", errMsg(e)),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      for (const m of newMembers) {
        if (m.user_id) {
          await addChannelMember(channelId as string, { user_id: m.user_id });
        }
      }
    },
    onSuccess: () => {
      setNewMembers([]);
      refresh();
    },
    onError: (e) => showToast.error("Could not add member", errMsg(e)),
  });

  const removeMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      removeChannelMember(channelId as string, targetUserId),
    onSuccess: (_res, targetUserId) => {
      if (targetUserId === userId) {
        onClose();
        onLeft?.();
      }
      refresh();
    },
    onError: (e) => showToast.error("Could not remove member", errMsg(e)),
  });

  const roleMutation = useMutation({
    mutationFn: (input: { user_id: string; role: "member" | "admin" }) =>
      changeMemberRole(channelId as string, input),
    onSuccess: refresh,
    onError: (e) => showToast.error("Could not change role", errMsg(e)),
  });

  if (!channel) return null;

  const members = (channel.members ?? []).filter((m) => m.user_id);
  const myMembership = members.find((m) => m.user_id === userId);
  const isAdmin = myMembership?.role === "admin";

  const dirty =
    (name !== null && name !== (channel.name ?? "")) ||
    (description !== null && description !== (channel.description ?? ""));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Group info"
      size="sm"
      surface="light"
    >
      <div className="space-y-4">
        {isAdmin ? (
          <>
            <Input
              label="Group name"
              surface="light"
              value={name ?? channel.name ?? ""}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Description"
              surface="light"
              value={description ?? channel.description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group about?"
            />
            {dirty && (
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                loading={saveMutation.isPending}
              >
                Save changes
              </Button>
            )}
          </>
        ) : (
          <div>
            <p className="text-sm font-medium text-brand-black">
              {channel.name ?? "Group"}
            </p>
            {channel.description && (
              <p className="mt-1 text-xs text-brand-black/60">
                {channel.description}
              </p>
            )}
          </div>
        )}

        {/* Members */}
        <div>
          <p className="mb-2 text-xs font-medium text-brand-black/70">
            {members.length} member{members.length === 1 ? "" : "s"}
          </p>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {members.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-black/5"
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ backgroundColor: getAvatarColour(m.display_name) }}
                >
                  {getInitials(m.display_name)}
                </div>
                <span className="flex-1 truncate text-sm text-brand-black">
                  {m.display_name ?? "Unknown"}
                  {m.user_id === userId && (
                    <span className="text-brand-black/40"> (you)</span>
                  )}
                </span>
                {m.role === "admin" && (
                  <span className="flex items-center gap-1 rounded-full bg-brand-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-brand-accent">
                    <Crown className="h-2.5 w-2.5" />
                    Admin
                  </span>
                )}
                {isAdmin && m.user_id !== userId && (
                  <>
                    <button
                      type="button"
                      title={m.role === "admin" ? "Make member" : "Make admin"}
                      onClick={() =>
                        roleMutation.mutate({
                          user_id: m.user_id as string,
                          role: m.role === "admin" ? "member" : "admin",
                        })
                      }
                      className="text-brand-black/30 hover:text-brand-accent"
                    >
                      <Crown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Remove from group"
                      onClick={() =>
                        removeMutation.mutate(m.user_id as string)
                      }
                      className="text-brand-black/30 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Add members (admins only) */}
        {isAdmin && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-brand-black/70">
              Add members
            </p>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <StaffSearchCombobox
                  selected={newMembers}
                  onChange={setNewMembers}
                  placeholder="Search team members…"
                  surface="light"
                />
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={newMembers.filter((m) => m.user_id).length === 0}
                loading={addMutation.isPending}
                onClick={() => addMutation.mutate()}
              >
                <UserPlus className="h-4 w-4" />
                Add
              </Button>
            </div>
          </div>
        )}

        {/* Leave group */}
        {myMembership && (
          <button
            type="button"
            onClick={() => removeMutation.mutate(userId as string)}
            className="flex items-center gap-2 text-xs font-medium text-red-500 hover:text-red-600"
          >
            <LogOut className="h-3.5 w-3.5" />
            Leave group
          </button>
        )}
      </div>
    </Modal>
  );
}
