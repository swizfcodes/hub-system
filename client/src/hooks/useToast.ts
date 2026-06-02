import { toast } from "sonner";

// Thin on-brand wrapper around sonner so component files don't import sonner directly.
export const showToast = {
  success: (msg: string, description?: string) =>
    toast.success(msg, { description }),
  error: (msg: string, description?: string) =>
    toast.error(msg, { description }),
  info: (msg: string, description?: string) => toast(msg, { description }),
  warn: (msg: string, description?: string) =>
    toast.warning(msg, { description }),
  promise: <T>(
    p: Promise<T>,
    opts: { loading: string; success: string; error: string },
  ) => toast.promise(p, opts),
};
