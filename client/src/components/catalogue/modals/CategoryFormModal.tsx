import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Textarea } from "@components/ui/Textarea";
import { categorySchema, type CategoryValues } from "@lib/schemas/catalogue";
import {
  createCategory,
  updateCategory,
  listCategories,
} from "@services/catalogue/categories";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { ProductCategory } from "@typedefs/catalogue";

export function CategoryFormModal({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: ProductCategory | null;
}) {
  const qc = useQueryClient();
  const { data: cats = [] } = useQuery({
    queryKey: ["catalogue", "categories"],
    queryFn: () => listCategories(true),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: editing
      ? {
          name: editing.name,
          parent_category_id: editing.parent_category_id ?? "",
          description: editing.description ?? "",
          display_order: editing.display_order,
        }
      : { name: "", parent_category_id: "", description: "", display_order: 0 },
  });

  const mutation = useMutation({
    mutationFn: (v: CategoryValues) =>
      editing ? updateCategory(editing.category_id, v) : createCategory(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalogue", "categories"] });
      showToast.success(editing ? "Category saved" : "Category added");
      reset();
      onClose();
    },
    onError: (e) => showToast.error("Could not save", errMsg(e)),
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      surface="light"
      size="md"
      title={editing ? "Edit category" : "New category"}
      footer={
        <>
          <Button
            variant="outline-light"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={isSubmitting || mutation.isPending}
            onClick={handleSubmit(
              (v) => mutation.mutate(v),
              (errs) => {
                const first = Object.values(errs)[0];
                showToast.error(
                  "Validation error",
                  (first as { message?: string })?.message ??
                    "Please check the form",
                );
              },
            )}
          >
            Save
          </Button>
        </>
      }
    >
      <form className="space-y-4">
        <Input
          {...register("name")}
          label="Name"
          error={errors.name?.message}
        />
        <Select
          {...register("parent_category_id")}
          label="Parent category (optional)"
          options={[
            { value: "", label: "— Top-level —" },
            ...cats
              .filter((c) => c.category_id !== editing?.category_id)
              .map((c) => ({ value: c.category_id, label: c.name })),
          ]}
        />
        <Textarea {...register("description")} label="Description" rows={3} />
        <Input
          {...register("display_order", { valueAsNumber: true })}
          type="number"
          label="Display order"
          hint="Lower = first"
        />
      </form>
    </Modal>
  );
}
