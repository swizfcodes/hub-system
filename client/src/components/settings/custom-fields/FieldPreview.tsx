import type { CustomField } from "@typedefs/settings";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Textarea } from "@components/ui/Textarea";
import { Switch } from "@components/ui/Switch";
import { Card } from "@components/ui/Card";

interface Props {
  fields: CustomField[];
  entityLabel: string;
}

/**
 * Live render of the form a staff member will see when creating a
 * record of this entity type, given the current custom_field_defs.
 * Read-only — pure preview.
 */
export function FieldPreview({ fields, entityLabel }: Props) {
  if (fields.length === 0) {
    return (
      <Card surface="light" className="p-8 text-center">
        <p className="text-sm text-text-on-light-muted">
          No custom fields yet. Add fields on the left to see how the{" "}
          {entityLabel} form will look.
        </p>
      </Card>
    );
  }
  return (
    <Card surface="light" className="p-6 sm:p-7 space-y-5">
      <div>
        <div className="text-[0.7rem] tracking-widest uppercase text-text-on-light-muted">
          Live preview
        </div>
        <h3 className="font-display text-2xl text-brand-black mt-1">
          {entityLabel} form
        </h3>
      </div>

      {fields.map((f) => {
        const label = `${f.field_label}${f.is_required ? " *" : ""}`;
        if (f.field_type === "boolean") {
          return (
            <div
              key={f.field_id}
              className="p-3 rounded-xl bg-white/60 border border-brand-cloud/40"
            >
              <Switch
                surface="light"
                checked={false}
                onChange={() => {}}
                label={label}
              />
            </div>
          );
        }
        if (f.field_type === "select" || f.field_type === "multi_select") {
          return (
            <Select
              key={f.field_id}
              label={label}
              options={f.options.map((o) => ({ value: o, label: o }))}
              placeholder={`Pick ${f.field_type === "multi_select" ? "options" : "one"}…`}
              disabled
            />
          );
        }
        if (f.field_type === "date") {
          return <Input key={f.field_id} label={label} type="date" disabled />;
        }
        if (f.field_type === "number" || f.field_type === "decimal") {
          return (
            <Input
              key={f.field_id}
              label={label}
              type="number"
              placeholder="0"
              disabled
            />
          );
        }
        if (
          f.field_key === "description" ||
          f.field_label.toLowerCase().includes("note")
        ) {
          return <Textarea key={f.field_id} label={label} disabled />;
        }
        return <Input key={f.field_id} label={label} disabled />;
      })}
    </Card>
  );
}
