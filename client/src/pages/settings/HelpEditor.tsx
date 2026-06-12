import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  BookOpen,
  HelpCircle,
  Save,
  X,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { Select } from "@components/ui/Select";
import { Textarea } from "@components/ui/Textarea";
import { Badge } from "@components/ui/Badge";
import { Card } from "@components/ui/Card";
import { Modal } from "@components/ui/Modal";
import { ConfirmationModal } from "@components/ui/ConfirmationModal";
import { Skeleton } from "@components/ui/Skeleton";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import {
  listArticles,
  createArticle,
  updateArticle,
  deleteArticle,
  type HelpArticle,
} from "@services/help";
import { HUB_MODULES } from "@lib/constants/modules";

const MODULE_OPTIONS = [
  { value: "general", label: "Getting Started" },
  ...HUB_MODULES.map((m) => ({ value: m.key, label: m.label })),
];

const TYPE_OPTIONS = [
  { value: "guide", label: "Guide" },
  { value: "faq", label: "FAQ" },
  { value: "workflow", label: "Workflow" },
];

export default function HelpEditor() {
  const qc = useQueryClient();
  const [filterModule, setFilterModule] = useState("");
  const [editing, setEditing] = useState<HelpArticle | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<HelpArticle | null>(null);

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["help", "articles", "admin"],
    queryFn: () => listArticles({ include_drafts: true }),
  });

  const filtered = filterModule
    ? articles.filter((a) => a.module === filterModule)
    : articles;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteArticle(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["help"] });
      showToast.success("Article deleted");
      setDeleting(null);
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <>
      <Topbar
        title="Help Center Editor"
        subtitle="Manage guides and FAQs"
      />
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-6xl mx-auto">
        <PageHeader
          title="Help Center Editor"
          subtitle="Create, edit, and organize guides and FAQs for every module."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Settings", to: "/settings" },
            { label: "Help Editor" },
          ]}
          actions={
            <Button
              variant="gold"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setCreating(true)}
            >
              New article
            </Button>
          }
        />

        {/* Filter */}
        <div className="mb-6 max-w-xs">
          <Select
            label="Filter by module"
            value={filterModule}
            onChange={(e) => setFilterModule(e.target.value)}
            placeholder="All modules"
            options={MODULE_OPTIONS}
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((a) => (
              <Card key={a.article_id} className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-accent/10 flex items-center justify-center shrink-0">
                  {a.article_type === "faq" ? (
                    <HelpCircle className="w-4 h-4 text-brand-accent" />
                  ) : (
                    <BookOpen className="w-4 h-4 text-brand-accent" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-brand-cream truncate">
                      {a.title}
                    </span>
                    <Badge tone="gold" size="xs">
                      {a.module}
                    </Badge>
                    <Badge tone="sage" size="xs">
                      {a.article_type}
                    </Badge>
                    {!a.is_published && (
                      <Badge tone="warn" size="xs">
                        Draft
                      </Badge>
                    )}
                  </div>
                  <p className="text-[0.65rem] text-brand-smoke mt-0.5">
                    Order: {a.display_order}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Pencil className="w-3.5 h-3.5" />}
                    onClick={() => setEditing(a)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={() => setDeleting(a)}
                  />
                </div>
              </Card>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-brand-smoke text-center py-8">
                No articles{filterModule ? ` for ${filterModule}` : ""}.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <ArticleModal
          article={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["help"] });
          }}
        />
      )}

      {/* Create modal */}
      {creating && (
        <ArticleModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ["help"] });
          }}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmationModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => { if (deleting) await deleteMutation.mutateAsync(deleting.article_id); }}
        title={`Delete "${deleting?.title}"?`}
        message={
          <p>This article will be permanently removed from the Help Center.</p>
        }
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
      />
    </>
  );
}

function ArticleModal({
  article,
  onClose,
  onSaved,
}: {
  article?: HelpArticle;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!article;
  const [module, setModule] = useState(article?.module || "general");
  const [title, setTitle] = useState(article?.title || "");
  const [content, setContent] = useState(article?.content || "");
  const [articleType, setArticleType] = useState<"guide" | "faq" | "workflow">(
    article?.article_type || "guide",
  );
  const [displayOrder, setDisplayOrder] = useState(
    article?.display_order ?? 0,
  );
  const [isPublished, setIsPublished] = useState(
    article?.is_published !== false,
  );

  const mutation = useMutation({
    mutationFn: () =>
      isEdit
        ? updateArticle(article!.article_id, {
            module,
            title,
            content,
            article_type: articleType as HelpArticle["article_type"],
            display_order: displayOrder,
            is_published: isPublished,
          })
        : createArticle({
            module,
            title,
            content,
            article_type: articleType as HelpArticle["article_type"],
            display_order: displayOrder,
            is_published: isPublished,
          }),
    onSuccess: () => {
      showToast.success(isEdit ? "Article updated" : "Article created");
      onSaved();
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      surface="light"
      size="lg"
      title={isEdit ? "Edit article" : "New article"}
      footer={
        <>
          <Button variant="outline-light" onClick={onClose} leftIcon={<X className="w-3.5 h-3.5" />}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            disabled={!title.trim() || !module}
            onClick={() => mutation.mutate()}
            leftIcon={<Save className="w-3.5 h-3.5" />}
          >
            {isEdit ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Module"
            value={module}
            onChange={(e) => setModule(e.target.value)}
            options={MODULE_OPTIONS}
          />
          <Select
            label="Type"
            value={articleType}
            onChange={(e) => setArticleType(e.target.value as "guide" | "faq" | "workflow")}
            options={TYPE_OPTIONS}
          />
        </div>
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. How to create a sales order"
        />
        <Textarea
          label="Content (HTML)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          hint="Write HTML content. Use <h3>, <p>, <ol>, <ul>, <strong> tags."
          placeholder="<h3>Title</h3><p>Explanation here...</p>"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Display order"
            placeholder="0"
            value={displayOrder}
            onValueChange={(v) => setDisplayOrder(v ?? 0)}
          />
          <div className="flex items-end pb-1">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="rounded border-brand-graphite"
              />
              <span className="text-sm text-text-on-light">Published</span>
            </label>
          </div>
        </div>
      </div>
    </Modal>
  );
}
